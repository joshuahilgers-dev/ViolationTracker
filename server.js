const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
require("dotenv").config();
const { OAuth2Client } = require("google-auth-library");
const initSqlJs = require("sql.js");
const nodemailer = require("nodemailer");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const TEMPLATE_DIR = path.join(DATA_DIR, "templates");
const DOCUMENT_DIR = path.join(DATA_DIR, "documents");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "technology-tracker.sqlite");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const AUTH_DISABLED = process.env.AUTH_DISABLED === "1";
const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "wrps.net").toLowerCase();
const BLOCKED_EMAIL_DOMAINS = (process.env.BLOCKED_EMAIL_DOMAINS || "stu.wrps.net")
  .split(",")
  .map(domain => domain.trim().toLowerCase())
  .filter(Boolean);
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 8);
const SESSION_COOKIE = "tvt_session";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const CURRENT_TERM_SETTING = "current_term_id";
const TEAM_NOTIFICATION_EMAILS_SETTING = "team_notification_emails";
const APP_BASE_URL = (process.env.APP_BASE_URL || "http://vtrack.wrps.org:4173").replace(/\/$/, "");
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "1" || process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_HELLO = process.env.SMTP_HELLO || "";
const EMAIL_FROM = process.env.EMAIL_FROM || process.env.SMTP_FROM || SMTP_USER || `Technology Violation Tracker <no-reply@${ALLOWED_EMAIL_DOMAIN}>`;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
let mailTransporter;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
fs.mkdirSync(DOCUMENT_DIR, { recursive: true });

let db;
let statements;

function persistDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function execSql(sql, shouldPersist = false) {
  db.exec(sql);
  if (shouldPersist) persistDb();
}

function tableColumns(tableName) {
  const rows = db.exec(`PRAGMA table_info(${tableName})`);
  if (!rows.length) return [];
  return rows[0].values.map(row => row[1]);
}

function ensureColumn(tableName, columnName, definition) {
  if (!tableColumns(tableName).includes(columnName)) {
    execSql(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`, true);
  }
}

function prepare(sql) {
  return {
    get(...params) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        if (!stmt.step()) return undefined;
        return stmt.getAsObject();
      } finally {
        stmt.free();
      }
    },
    all(...params) {
      const stmt = db.prepare(sql);
      const rows = [];
      try {
        stmt.bind(params);
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    run(...params) {
      const stmt = db.prepare(sql);
      try {
        stmt.run(params);
        const row = db.exec("SELECT last_insert_rowid() AS id")[0]?.values?.[0];
        persistDb();
        return { lastInsertRowid: row ? row[0] : 0 };
      } finally {
        stmt.free();
      }
    }
  };
}

const INFRACTION_TYPES = [
  {
    severity: "minor",
    category: "Minor Violations",
    label: "Off-Task Use",
    description: "Playing games, watching non-educational media, web-browsing during instruction."
  },
  {
    severity: "minor",
    category: "Minor Violations",
    label: "Inappropriate Communication",
    description: "Using Google Workspace tools for non-school related messaging or communication."
  },
  {
    severity: "minor",
    category: "Minor Violations",
    label: "Unauthorized Audio",
    description: "Using speakers without permissions (deliberate interruption)."
  },
  {
    severity: "minor",
    category: "Minor Violations",
    label: "Device Distraction",
    description: "Having the screen open when directed to have \"screens down\"."
  },
  {
    severity: "minor",
    category: "Minor Violations",
    label: "Minor Negligence",
    description: "Leaving the Chromebook on the floor or left unattended, carrying it by the screen/case open."
  },
  {
    severity: "minor",
    category: "Minor Violations",
    label: "Unauthorized Use",
    description: "Mishandling or tampering with another student's device."
  },
  {
    severity: "minor",
    category: "Minor Violations",
    label: "Other",
    description: "Please provide details."
  },
  {
    severity: "major",
    category: "Major Violations",
    label: "Bypassing Security",
    description: "Using VPS, proxy sites, or unauthorized means, including logging into another student's account."
  },
  {
    severity: "major",
    category: "Major Violations",
    label: "Cyberbullying/Harassment",
    description: "Using the device to send threatening messages or create harmful content about others."
  },
  {
    severity: "major",
    category: "Major Violations",
    label: "Deliberate Damage",
    description: "Picking off keys, hitting/pounding Chromebook unnecessarily hard, shutting others' Chromebooks while in use causing damage."
  },
  {
    severity: "major",
    category: "Major Violations",
    label: "Privacy Breach",
    description: "Recording others without consent or accessing another student's account."
  },
  {
    severity: "major",
    category: "Major Violations",
    label: "Inappropriate Content",
    description: "Accessing or distributing sexually explicit material or hate speech."
  },
  {
    severity: "major",
    category: "Major Violations",
    label: "Other",
    description: "Please provide details."
  }
];

function infractionKey(type) {
  return `${type.severity}|${type.label.toLowerCase()}`;
}

function syncInfractionTypes() {
  const existing = prepare("SELECT * FROM infraction_types").all();
  const desiredKeys = new Set(INFRACTION_TYPES.map(infractionKey));
  const usedIds = new Set();
  const insert = prepare(`
    INSERT INTO infraction_types (severity, category, label, description, active)
    VALUES (?, ?, ?, ?, 1)
  `);
  const update = prepare(`
    UPDATE infraction_types
    SET category = ?, description = ?, active = 1
    WHERE id = ?
  `);
  const deactivate = prepare("UPDATE infraction_types SET active = 0 WHERE id = ?");

  for (const type of INFRACTION_TYPES) {
    const match = existing.find(item => !usedIds.has(item.id) && infractionKey(item) === infractionKey(type));
    if (match) {
      update.run(type.category, type.description, match.id);
      usedIds.add(match.id);
    } else {
      insert.run(type.severity, type.category, type.label, type.description);
    }
  }

  for (const item of existing) {
    if (!desiredKeys.has(infractionKey(item)) || !usedIds.has(item.id)) {
      deactivate.run(item.id);
    }
  }
}

function migrate() {
  execSql(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_number TEXT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      grade TEXT,
      team TEXT,
      guardian_name TEXT,
      guardian_contact TEXT,
      device_asset_tag TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS infraction_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      severity TEXT NOT NULL CHECK (severity IN ('minor', 'major')),
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      term_id INTEGER,
      occurred_on TEXT NOT NULL,
      reported_by TEXT NOT NULL,
      class_period TEXT,
      severity TEXT NOT NULL CHECK (severity IN ('minor', 'major')),
      infraction_type_id INTEGER REFERENCES infraction_types(id),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete')),
      due_on TEXT,
      completed_on TEXT,
      owner TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, action_type, incident_id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS action_templates (
      action_type TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      action_id INTEGER REFERENCES actions(id) ON DELETE SET NULL,
      incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
      term_id INTEGER,
      action_type TEXT,
      title TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      uploaded_by TEXT,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      started_on TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `, true);

  ensureColumn("incidents", "term_id", "INTEGER");
  ensureCurrentTerm();
  syncInfractionTypes();
}

function ensureCurrentTerm() {
  const existingSetting = prepare("SELECT value FROM app_settings WHERE key = ?").get(CURRENT_TERM_SETTING);
  const settingTermId = Number(existingSetting?.value || 0);
  const settingTerm = settingTermId ? prepare("SELECT * FROM terms WHERE id = ?").get(settingTermId) : null;
  if (settingTerm) {
    prepare("UPDATE incidents SET term_id = ? WHERE term_id IS NULL").run(settingTerm.id);
    return settingTerm.id;
  }

  let term = prepare("SELECT * FROM terms ORDER BY id DESC LIMIT 1").get();
  if (!term) {
    const todayText = new Date().toISOString().slice(0, 10);
    const result = prepare("INSERT INTO terms (name, started_on) VALUES (?, ?)").run("Current Term", todayText);
    term = { id: Number(result.lastInsertRowid), name: "Current Term", started_on: todayText };
  }
  prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run(CURRENT_TERM_SETTING, String(term.id));
  prepare("UPDATE incidents SET term_id = ? WHERE term_id IS NULL").run(term.id);
  return term.id;
}

function prepareStatements() {
  return {
  listStudents: prepare(`
    SELECT s.*,
      COUNT(i.id) AS violation_count,
      SUM(CASE WHEN i.severity = 'minor' THEN 1 ELSE 0 END) AS minor_count,
      SUM(CASE WHEN i.severity = 'major' THEN 1 ELSE 0 END) AS major_count,
      MAX(i.id) AS last_incident_id,
      MAX(i.occurred_on) AS last_incident_on
    FROM students s
    LEFT JOIN incidents i ON i.student_id = s.id AND i.term_id = ?
    WHERE s.active = 1
      AND (? = '' OR LOWER(s.first_name || ' ' || s.last_name || ' ' || COALESCE(s.student_number, '')) LIKE ?)
    GROUP BY s.id
    ORDER BY s.last_name, s.first_name
  `),
  getStudent: prepare("SELECT * FROM students WHERE id = ?"),
  getStudentByNumber: prepare(`
    SELECT * FROM students WHERE student_number = ? AND student_number IS NOT NULL AND student_number != '' LIMIT 1
  `),
  createStudent: prepare(`
    INSERT INTO students (student_number, first_name, last_name, grade, team, guardian_name, guardian_contact, device_asset_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateStudentByNumber: prepare(`
    UPDATE students
    SET first_name = ?,
        last_name = ?,
        grade = COALESCE(?, grade),
        team = COALESCE(?, team),
        guardian_name = COALESCE(?, guardian_name),
        guardian_contact = COALESCE(?, guardian_contact),
        device_asset_tag = COALESCE(?, device_asset_tag),
        active = 1
    WHERE student_number = ?
  `),
  deleteStudent: prepare(`
    DELETE FROM students WHERE id = ?
  `),
  clearStudents: prepare(`
    DELETE FROM students
  `),
  clearOrphanedActions: prepare(`
    DELETE FROM actions WHERE student_id NOT IN (SELECT id FROM students)
  `),
  clearOrphanedIncidents: prepare(`
    DELETE FROM incidents WHERE student_id NOT IN (SELECT id FROM students)
  `),
  listInfractions: prepare(`
    SELECT *
    FROM infraction_types
    WHERE active = 1
    ORDER BY severity, category, CASE WHEN label = 'Other' THEN 1 ELSE 0 END, label
  `),
  createIncident: prepare(`
    INSERT INTO incidents (student_id, term_id, occurred_on, reported_by, class_period, severity, infraction_type_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  incidentsForStudent: prepare(`
    SELECT i.*, t.category, t.label AS infraction_label, terms.name AS term_name, terms.started_on AS term_started_on
    FROM incidents i
    LEFT JOIN infraction_types t ON t.id = i.infraction_type_id
    LEFT JOIN terms ON terms.id = i.term_id
    WHERE i.student_id = ?
    ORDER BY i.occurred_on DESC, i.id DESC
  `),
  incidentsForStatus: prepare(`
    SELECT id, severity, occurred_on
    FROM incidents
    WHERE student_id = ? AND term_id = ?
    ORDER BY occurred_on, id
  `),
  actionsForStudent: prepare(`
    SELECT *
    FROM actions
    WHERE student_id = ?
    ORDER BY status,
      due_on IS NULL,
      due_on,
      CASE action_type
        WHEN 'digital_reflection' THEN 1
        WHEN 'parent_contact_reflection' THEN 2
        WHEN 'success_contract' THEN 3
        WHEN 'parent_contact_contract' THEN 4
        WHEN 'device_restriction' THEN 5
        WHEN 'reentry_check' THEN 6
        WHEN 'return_chromebook' THEN 7
        WHEN 'admin_review' THEN 8
        WHEN 'parent_contact_admin' THEN 9
        ELSE 99
      END,
      id
  `),
  openActions: prepare(`
    SELECT a.*, s.first_name, s.last_name, s.grade
    FROM actions a
    JOIN students s ON s.id = a.student_id
    WHERE a.status = 'open' AND s.active = 1
      AND (a.action_type != 'return_chromebook' OR a.due_on IS NULL OR a.due_on <= date('now', 'localtime'))
    ORDER BY a.due_on IS NULL,
      a.due_on,
      CASE a.action_type
        WHEN 'digital_reflection' THEN 1
        WHEN 'parent_contact_reflection' THEN 2
        WHEN 'success_contract' THEN 3
        WHEN 'parent_contact_contract' THEN 4
        WHEN 'device_restriction' THEN 5
        WHEN 'reentry_check' THEN 6
        WHEN 'return_chromebook' THEN 7
        WHEN 'admin_review' THEN 8
        WHEN 'parent_contact_admin' THEN 9
        ELSE 99
      END,
      a.id
  `),
  getAction: prepare("SELECT * FROM actions WHERE id = ?"),
  nextReturnActionForStudent: prepare(`
    SELECT *
    FROM actions
    WHERE student_id = ?
      AND action_type = 'return_chromebook'
      AND status = 'open'
    ORDER BY due_on IS NULL, due_on, id
    LIMIT 1
  `),
  completeAction: prepare(`
    UPDATE actions
    SET status = ?, completed_on = ?, notes = COALESCE(?, notes)
    WHERE id = ?
  `),
  updateActionDueDate: prepare(`
    UPDATE actions SET due_on = ? WHERE id = ?
  `),
  updateActionDueDateByIncidentType: prepare(`
    UPDATE actions
    SET due_on = ?
    WHERE incident_id = ? AND action_type = ?
  `),
  insertAction: prepare(`
    INSERT OR IGNORE INTO actions (student_id, incident_id, action_type, title, due_on, owner, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  updateStudentAssetTag: prepare(`
    UPDATE students SET device_asset_tag = ? WHERE id = ?
  `),
  addAudit: prepare(`
    INSERT INTO audit_log (entity_type, entity_id, message) VALUES (?, ?, ?)
  `),
  incidentCounts: prepare(`
    SELECT
      COUNT(*) AS total_count,
      SUM(CASE WHEN severity = 'minor' THEN 1 ELSE 0 END) AS minor_count,
      SUM(CASE WHEN severity = 'major' THEN 1 ELSE 0 END) AS major_count,
      MAX(occurred_on) AS last_incident_on
    FROM incidents
    WHERE student_id = ? AND term_id = ?
  `),
  getCurrentTerm: prepare(`
    SELECT terms.*
    FROM app_settings
    JOIN terms ON terms.id = CAST(app_settings.value AS INTEGER)
    WHERE app_settings.key = ?
  `),
  insertTerm: prepare(`
    INSERT INTO terms (name, started_on) VALUES (?, ?)
  `),
  setSetting: prepare(`
    INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
  `),
  getSetting: prepare(`
    SELECT value FROM app_settings WHERE key = ?
  `),
  archiveOpenActions: prepare(`
    UPDATE actions
    SET status = 'complete',
        completed_on = ?,
        notes = COALESCE(notes, 'Archived when a new term was started.')
    WHERE status = 'open'
  `),
  listTemplates: prepare(`
    SELECT * FROM action_templates ORDER BY label
  `),
  getTemplate: prepare(`
    SELECT * FROM action_templates WHERE action_type = ?
  `),
  upsertTemplate: prepare(`
    INSERT INTO action_templates (action_type, label, original_name, stored_name, mime_type, uploaded_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(action_type) DO UPDATE SET
      label = excluded.label,
      original_name = excluded.original_name,
      stored_name = excluded.stored_name,
      mime_type = excluded.mime_type,
      uploaded_at = CURRENT_TIMESTAMP
  `),
  deleteTemplate: prepare(`
    DELETE FROM action_templates WHERE action_type = ?
  `),
  listDocumentsForStudent: prepare(`
    SELECT d.*, a.title AS action_title, terms.name AS term_name
    FROM student_documents d
    LEFT JOIN actions a ON a.id = d.action_id
    LEFT JOIN terms ON terms.id = d.term_id
    WHERE d.student_id = ?
    ORDER BY d.uploaded_at DESC, d.id DESC
  `),
  getDocument: prepare(`
    SELECT * FROM student_documents WHERE id = ?
  `),
  insertDocument: prepare(`
    INSERT INTO student_documents (
      student_id,
      action_id,
      incident_id,
      term_id,
      action_type,
      title,
      original_name,
      stored_name,
      mime_type,
      uploaded_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
};
}

const STATUS_DETAILS = {
  no_violations: {
    key: "no_violations",
    label: "No violations",
    level: 0,
    description: "No technology violations are currently recorded."
  },
  monitor: {
    key: "monitor",
    label: "Monitor",
    level: 1,
    description: "One minor violation is recorded. Continue monitoring."
  },
  reflection: {
    key: "reflection",
    label: "Digital Impact Reflection",
    level: 2,
    description: "Student completes reflection and information is sent home."
  },
  success_contract: {
    key: "success_contract",
    label: "Technology Success Contract",
    level: 3,
    description: "Student keeps Chromebook with class check-ins and parent contact."
  },
  device_restriction: {
    key: "device_restriction",
    label: "5 school-day restriction",
    level: 4,
    description: "Device held by library/tech staff except when digital access is essential."
  },
  admin_review: {
    key: "admin_review",
    label: "Admin review",
    level: 5,
    description: "Chromebook held by admin until next steps are determined."
  }
};

function statusFromIncidentHistory(incidents) {
  let key = "no_violations";
  let minorCount = 0;

  for (const incident of incidents) {
    if (key === "admin_review") continue;
    if (key === "device_restriction") {
      key = "admin_review";
      continue;
    }
    if (key === "success_contract") {
      key = "device_restriction";
      continue;
    }
    if (incident.severity === "major") {
      key = "success_contract";
      continue;
    }

    minorCount += 1;
    if (minorCount === 1) key = "monitor";
    if (minorCount === 2) key = "reflection";
    if (minorCount >= 3) key = "success_contract";
  }

  return STATUS_DETAILS[key];
}

function statusForStudent(studentId) {
  return statusFromIncidentHistory(statements.incidentsForStatus.all(studentId, currentTerm().id));
}

function toStudentView(row) {
  const counts = {
    total_count: row.violation_count,
    minor_count: row.minor_count,
    major_count: row.major_count,
    last_incident_on: row.last_incident_on
  };
  const student = {
    ...row,
    violation_count: Number(row.violation_count || 0),
    minor_count: Number(row.minor_count || 0),
    major_count: Number(row.major_count || 0),
    last_incident_id: Number(row.last_incident_id || 0),
    status: statusForStudent(row.id)
  };
  if (student.status.key === "device_restriction") {
    const returnAction = statements.nextReturnActionForStudent.get(row.id);
    student.chromebook_return_on = returnAction?.due_on || null;
  }
  return student;
}

function currentTerm() {
  return statements.getCurrentTerm.get(CURRENT_TERM_SETTING) || { id: ensureCurrentTerm(), name: "Current Term", started_on: new Date().toISOString().slice(0, 10) };
}

function splitIncidentsByTerm(incidents, currentTermId) {
  return {
    currentIncidents: incidents.filter(incident => Number(incident.term_id) === Number(currentTermId)),
    previousIncidents: incidents.filter(incident => Number(incident.term_id) !== Number(currentTermId))
  };
}

function addSchoolDays(dateText, days) {
  const date = new Date(`${dateText}T12:00:00`);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

function ensureWorkflowActions(studentId, incidentId, occurredOn, previousStatus, currentStatus) {
  if (currentStatus.level <= previousStatus.level) return;

  if (currentStatus.key === "reflection") {
    queueAction(studentId, incidentId, "digital_reflection", "Digital Impact Reflection due", occurredOn, "Teacher", "Upload or send completed reflection through ParentSquare.");
    queueAction(studentId, incidentId, "parent_contact_reflection", "Parent contact: reflection", occurredOn, "Teacher", "Notify parent/guardian that the reflection step was assigned.");
  }

  if (currentStatus.key === "success_contract") {
    queueAction(studentId, incidentId, "success_contract", "Technology Success Contract due", occurredOn, "Teacher", "Review contract expectations with student and send home.");
    queueAction(studentId, incidentId, "parent_contact_contract", "Parent contact: success contract", occurredOn, "Teacher", "Share the contract and current violation history.");
  }

  if (currentStatus.key === "device_restriction") {
    const returnDate = addSchoolDays(occurredOn, 5);
    queueAction(studentId, incidentId, "device_restriction", "Start 5 school-day device restriction", returnDate, "Library/Tech", "Hold Chromebook except when a digital component is essential.");
    queueAction(studentId, incidentId, "reentry_check", "Schedule re-entry check", returnDate, "Teacher/Admin", "Confirm student can resume regular device access after the restriction.");
  }

  if (currentStatus.key === "admin_review") {
    queueAction(studentId, incidentId, "admin_review", "Admin review needed", occurredOn, "Admin", "Determine next steps, including possible parent conversation or re-entry meeting.");
    queueAction(studentId, incidentId, "parent_contact_admin", "Parent contact: admin review", occurredOn, "Admin", "Document parent/guardian communication for the additional violation.");
  }
}

function queueAction(studentId, incidentId, actionType, title, dueOn, owner, notes) {
  statements.insertAction.run(studentId, incidentId, actionType, title, dueOn, owner, notes);
}

function parseEmailList(value) {
  return String(value || "")
    .split(/[\s,;]+/)
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
    .filter((email, index, list) => list.indexOf(email) === index);
}

function invalidEmails(emails) {
  return emails.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function getTeamNotificationEmails() {
  const setting = statements.getSetting.get(TEAM_NOTIFICATION_EMAILS_SETTING);
  if (!setting?.value) return [];
  try {
    const parsed = JSON.parse(setting.value);
    return Array.isArray(parsed) ? parsed : parseEmailList(setting.value);
  } catch {
    return parseEmailList(setting.value);
  }
}

function setTeamNotificationEmails(emails) {
  statements.setSetting.run(TEAM_NOTIFICATION_EMAILS_SETTING, JSON.stringify(emails));
}

function mailIsConfigured() {
  return Boolean(SMTP_HOST && EMAIL_FROM);
}

function mailer() {
  if (!mailIsConfigured()) {
    throw Object.assign(new Error("Email is not configured on the server."), { status: 503 });
  }
  if (!mailTransporter) {
    const config = {
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE
    };
    if (SMTP_HELLO) {
      config.name = SMTP_HELLO;
    }
    if (SMTP_USER || SMTP_PASS) {
      config.auth = { user: SMTP_USER, pass: SMTP_PASS };
    }
    mailTransporter = nodemailer.createTransport(config);
  }
  return mailTransporter;
}

async function sendEmail({ to, subject, text }) {
  const recipients = Array.isArray(to) ? to : parseEmailList(to);
  if (!recipients.length) return { skipped: true };
  const transport = mailer();
  for (const recipient of recipients) {
    await transport.sendMail({
      from: EMAIL_FROM,
      to: recipient,
      subject,
      text
    });
  }
  return { sent: true, recipients };
}

function studentDisplayName(student) {
  return `${student.first_name} ${student.last_name}`.trim();
}

async function notifyTeamOfViolation(studentId) {
  const recipients = getTeamNotificationEmails();
  if (!recipients.length || !mailIsConfigured()) return;
  const student = statements.getStudent.get(studentId);
  if (!student) return;
  const name = studentDisplayName(student);
  await sendEmail({
    to: recipients,
    subject: `Technology violation entered for ${name}`,
    text: [
      `A technology violation was entered for ${name}. Please review the dashboard.`,
      "",
      APP_BASE_URL
    ].join("\n")
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(payload);
}

function documentUrl(document) {
  if (!document) return null;
  return `/documents/${document.id}/file`;
}

function documentView(document) {
  return {
    id: document.id,
    student_id: document.student_id,
    action_id: document.action_id,
    incident_id: document.incident_id,
    term_id: document.term_id,
    term_name: document.term_name,
    action_type: document.action_type,
    title: document.title,
    action_title: document.action_title,
    original_name: document.original_name,
    mime_type: document.mime_type,
    uploaded_by: document.uploaded_by,
    uploaded_at: document.uploaded_at,
    url: documentUrl(document)
  };
}

function sendFile(res, filePath, mimeType) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {
      "content-type": mimeType || "application/octet-stream",
      "cache-control": "private, max-age=300"
    });
    res.end(data);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";").map(part => {
    const index = part.indexOf("=");
    if (index === -1) return ["", ""];
    return [
      decodeURIComponent(part.slice(0, index).trim()),
      decodeURIComponent(part.slice(index + 1).trim())
    ];
  }).filter(([key]) => key));
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function encodeSession(user) {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ ...user, expiresAt }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(cookieValue) {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const [payload, signature] = cookieValue.split(".");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!session.expiresAt || session.expiresAt < Date.now()) return null;
  return {
    name: session.name,
    email: session.email,
    picture: session.picture || null,
    expiresAt: session.expiresAt
  };
}

function sessionCookie(value) {
  const maxAge = SESSION_HOURS * 60 * 60;
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`
  ].join("; ");
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function getSession(req) {
  if (AUTH_DISABLED) {
    return {
      name: "Development User",
      email: `dev@${ALLOWED_EMAIL_DOMAIN}`,
      picture: null,
      expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000
    };
  }
  try {
    return decodeSession(parseCookies(req)[SESSION_COOKIE]);
  } catch {
    return null;
  }
}

function isAllowedStaffEmail(email, hostedDomain) {
  const normalizedEmail = String(email || "").toLowerCase();
  const domain = normalizedEmail.split("@")[1] || "";
  if (hostedDomain && hostedDomain.toLowerCase() !== ALLOWED_EMAIL_DOMAIN) return false;
  if (BLOCKED_EMAIL_DOMAINS.includes(domain)) return false;
  return domain === ALLOWED_EMAIL_DOMAIN;
}

function requireAuth(req) {
  const session = getSession(req);
  if (!session) {
    throw Object.assign(new Error("Sign in required"), { status: 401 });
  }
  return session;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 16_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function required(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") {
    throw Object.assign(new Error(`${label} is required`), { status: 400 });
  }
  return String(value).trim();
}

function nullable(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return String(value).trim();
}

function optionalDate(value, label) {
  const date = nullable(value);
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw Object.assign(new Error(`${label} must be a valid date.`), { status: 400 });
  }
  return date;
}

function templateUrl(template) {
  if (!template) return null;
  return `/templates/${encodeURIComponent(template.action_type)}/file`;
}

function templateView(template) {
  return {
    action_type: template.action_type,
    label: template.label,
    original_name: template.original_name,
    mime_type: template.mime_type,
    uploaded_at: template.uploaded_at,
    url: templateUrl(template)
  };
}

function safeTemplateFileName(actionType, originalName) {
  const ext = path.extname(originalName || "").toLowerCase().replace(/[^a-z0-9.]/g, "") || ".pdf";
  return `${actionType}-${Date.now()}${ext}`;
}

function safeDocumentFileName(actionId, originalName) {
  const ext = path.extname(originalName || "").toLowerCase().replace(/[^a-z0-9.]/g, "") || ".pdf";
  return `action-${actionId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
}

function createOrUpdateStudent(row) {
  const firstName = required(row.first_name, "First name");
  const lastName = required(row.last_name, "Last name");
  const studentNumber = nullable(row.student_number);
  if (studentNumber && statements.getStudentByNumber.get(studentNumber)) {
    statements.updateStudentByNumber.run(
      firstName,
      lastName,
      nullable(row.grade),
      nullable(row.team),
      nullable(row.guardian_name),
      nullable(row.guardian_contact),
      nullable(row.device_asset_tag),
      studentNumber
    );
    return "updated";
  }
  statements.createStudent.run(
    studentNumber,
    firstName,
    lastName,
    nullable(row.grade),
    nullable(row.team),
    nullable(row.guardian_name),
    nullable(row.guardian_contact),
    nullable(row.device_asset_tag)
  );
  return "created";
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/auth/config") {
    return sendJson(res, 200, {
      authDisabled: AUTH_DISABLED,
      googleClientId: GOOGLE_CLIENT_ID,
      allowedEmailDomain: ALLOWED_EMAIL_DOMAIN,
      blockedEmailDomains: BLOCKED_EMAIL_DOMAINS
    });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const session = getSession(req);
    if (!session) return sendJson(res, 401, { error: "Sign in required" });
    return sendJson(res, 200, { user: session });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/google") {
    if (AUTH_DISABLED) {
      return sendJson(res, 200, { user: getSession(req) });
    }
    if (!GOOGLE_CLIENT_ID) {
      return sendJson(res, 503, { error: "Google sign-in is not configured." });
    }
    const body = await readBody(req);
    const credential = required(body.credential, "Google credential");
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload?.email_verified) {
      return sendJson(res, 403, { error: "Google account email is not verified." });
    }
    if (!isAllowedStaffEmail(payload.email, payload.hd)) {
      return sendJson(res, 403, { error: `Use a staff ${ALLOWED_EMAIL_DOMAIN} Google account to access this tracker.` });
    }
    const user = {
      name: payload.name || payload.email,
      email: payload.email,
      picture: payload.picture || null
    };
    res.setHeader("Set-Cookie", sessionCookie(encodeSession(user)));
    return sendJson(res, 200, { user });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    res.setHeader("Set-Cookie", clearSessionCookie());
    return sendJson(res, 200, { ok: true });
  }

  requireAuth(req);

  const templateFileMatch = url.pathname.match(/^\/templates\/([^/]+)\/file$/);
  if (req.method === "GET" && templateFileMatch) {
    const actionType = decodeURIComponent(templateFileMatch[1]);
    const template = statements.getTemplate.get(actionType);
    if (!template) return sendJson(res, 404, { error: "Template not found" });
    return sendFile(res, path.join(TEMPLATE_DIR, template.stored_name), template.mime_type);
  }

  const documentFileMatch = url.pathname.match(/^\/documents\/(\d+)\/file$/);
  if (req.method === "GET" && documentFileMatch) {
    const document = statements.getDocument.get(Number(documentFileMatch[1]));
    if (!document) return sendJson(res, 404, { error: "Document not found" });
    return sendFile(res, path.join(DOCUMENT_DIR, document.stored_name), document.mime_type);
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const search = "";
    const term = currentTerm();
    const students = statements.listStudents.all(term.id, search, "%%").map(toStudentView);
    const templates = statements.listTemplates.all().map(templateView);
    return sendJson(res, 200, {
      currentTerm: term,
      notificationSettings: {
        teamEmails: getTeamNotificationEmails(),
        emailConfigured: mailIsConfigured(),
        appBaseUrl: APP_BASE_URL
      },
      students,
      infractionTypes: statements.listInfractions.all(),
      templates,
      openActions: statements.openActions.all().map(action => ({
        ...action,
        student_name: `${action.first_name} ${action.last_name}`
      }))
    });
  }

  if (req.method === "GET" && url.pathname === "/api/students") {
    const search = (url.searchParams.get("q") || "").trim().toLowerCase();
    const like = `%${search}%`;
    return sendJson(res, 200, statements.listStudents.all(currentTerm().id, search, like).map(toStudentView));
  }

  if (req.method === "GET" && url.pathname === "/api/settings/notifications") {
    return sendJson(res, 200, {
      teamEmails: getTeamNotificationEmails(),
      emailConfigured: mailIsConfigured(),
      appBaseUrl: APP_BASE_URL
    });
  }

  if (req.method === "PUT" && url.pathname === "/api/settings/notifications") {
    const body = await readBody(req);
    const emails = parseEmailList(Array.isArray(body.teamEmails) ? body.teamEmails.join(",") : body.teamEmails);
    const invalid = invalidEmails(emails);
    if (invalid.length) {
      return sendJson(res, 400, { error: `Check these email addresses: ${invalid.join(", ")}` });
    }
    setTeamNotificationEmails(emails);
    statements.addAudit.run("settings", 0, "Team notification email list was updated.");
    return sendJson(res, 200, {
      teamEmails: emails,
      emailConfigured: mailIsConfigured(),
      appBaseUrl: APP_BASE_URL
    });
  }

  if (req.method === "POST" && url.pathname === "/api/students") {
    const body = await readBody(req);
    const mode = createOrUpdateStudent(body);
    statements.addAudit.run("student", 0, `Student ${body.first_name} ${body.last_name} was ${mode}.`);
    return sendJson(res, 201, { mode });
  }

  if (req.method === "POST" && url.pathname === "/api/students/import") {
    const body = await readBody(req);
    if (!Array.isArray(body.students)) {
      return sendJson(res, 400, { error: "Students array is required." });
    }
    const result = { created: 0, updated: 0, skipped: 0, errors: [] };
    body.students.forEach((student, index) => {
      try {
        const mode = createOrUpdateStudent(student);
        result[mode] += 1;
      } catch (error) {
        result.skipped += 1;
        result.errors.push({ row: index + 2, error: error.message });
      }
    });
    statements.addAudit.run("student", 0, `CSV import completed: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`);
    return sendJson(res, 200, result);
  }

  if (req.method === "DELETE" && url.pathname === "/api/students") {
    const body = await readBody(req);
    if (body.confirmation !== "DELETE ALL STUDENTS") {
      return sendJson(res, 400, { error: "Confirmation phrase is required." });
    }
    statements.clearStudents.run();
    statements.clearOrphanedActions.run();
    statements.clearOrphanedIncidents.run();
    statements.addAudit.run("student", 0, "All student test records were deleted.");
    return sendJson(res, 200, { ok: true });
  }

  const studentMatch = url.pathname.match(/^\/api\/students\/(\d+)$/);
  if (req.method === "GET" && studentMatch) {
    const id = Number(studentMatch[1]);
    const student = statements.getStudent.get(id);
    if (!student) return sendJson(res, 404, { error: "Student not found" });
    const term = currentTerm();
    const counts = statements.incidentCounts.get(id, term.id);
    const incidents = statements.incidentsForStudent.all(id);
    const { currentIncidents, previousIncidents } = splitIncidentsByTerm(incidents, term.id);
    return sendJson(res, 200, {
      ...student,
      counts,
      status: statusForStudent(id),
      incidents,
      currentIncidents,
      previousIncidents,
      actions: statements.actionsForStudent.all(id),
      documents: statements.listDocumentsForStudent.all(id).map(documentView)
    });
  }

  if (req.method === "DELETE" && studentMatch) {
    const id = Number(studentMatch[1]);
    const student = statements.getStudent.get(id);
    if (!student) return sendJson(res, 404, { error: "Student not found" });
    statements.deleteStudent.run(id);
    statements.addAudit.run("student", id, `Student ${student.first_name} ${student.last_name} was deleted.`);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/incidents") {
    const body = await readBody(req);
    const studentId = Number(required(body.student_id, "Student"));
    const occurredOn = required(body.occurred_on, "Date");
    const reportedBy = required(body.reported_by, "Teacher or staff member");
    const severity = required(body.severity, "Severity").toLowerCase();
    if (!["minor", "major"].includes(severity)) {
      throw Object.assign(new Error("Severity must be minor or major"), { status: 400 });
    }
    const term = currentTerm();
    const previousStatus = statusForStudent(studentId);
    const result = statements.createIncident.run(
      studentId,
      term.id,
      occurredOn,
      reportedBy,
      nullable(body.class_period),
      severity,
      body.infraction_type_id ? Number(body.infraction_type_id) : null,
      nullable(body.notes)
    );
    const currentStatus = statusForStudent(studentId);
    ensureWorkflowActions(studentId, Number(result.lastInsertRowid), occurredOn, previousStatus, currentStatus);
    statements.addAudit.run("incident", result.lastInsertRowid, `${severity} violation entered.`);
    notifyTeamOfViolation(studentId).catch(error => {
      statements.addAudit.run("email", result.lastInsertRowid, `Team notification email failed: ${error.message}`);
    });
    return sendJson(res, 201, { id: Number(result.lastInsertRowid) });
  }

  if (req.method === "POST" && url.pathname === "/api/terms/start") {
    const body = await readBody(req);
    if (body.confirmation !== "START NEW TERM") {
      return sendJson(res, 400, { error: "Confirmation phrase is required." });
    }
    const todayText = new Date().toISOString().slice(0, 10);
    const name = nullable(body.name) || `Term starting ${todayText}`;
    const result = statements.insertTerm.run(name, todayText);
    const termId = Number(result.lastInsertRowid);
    statements.setSetting.run(CURRENT_TERM_SETTING, String(termId));
    statements.archiveOpenActions.run(todayText);
    statements.addAudit.run("term", termId, `${name} was started.`);
    return sendJson(res, 200, { currentTerm: currentTerm() });
  }

  const actionMatch = url.pathname.match(/^\/api\/actions\/(\d+)$/);
  if (req.method === "PATCH" && actionMatch) {
    const body = await readBody(req);
    const actionId = Number(actionMatch[1]);
    const action = statements.getAction.get(actionId);
    if (!action) return sendJson(res, 404, { error: "Follow-up not found" });
    const status = body.status === "complete" ? "complete" : "open";
    const completedOn = status === "complete" ? new Date().toISOString().slice(0, 10) : null;
    let notes = nullable(body.notes);

    if (status === "complete" && action.action_type === "device_restriction") {
      const assetTag = required(body.asset_tag, "Asset tag");
      const restrictionEndDate = optionalDate(body.return_date, "Restriction end date");
      if (!restrictionEndDate) {
        return sendJson(res, 400, { error: "Restriction end date is required." });
      }
      statements.updateStudentAssetTag.run(assetTag, action.student_id);
      statements.updateActionDueDate.run(restrictionEndDate, actionId);
      if (action.incident_id) {
        statements.updateActionDueDateByIncidentType.run(restrictionEndDate, action.incident_id, "reentry_check");
      }
      notes = notes || `Asset tag: ${assetTag}; restriction through ${restrictionEndDate}`;
    }

    if (status === "complete" && action.action_type === "reentry_check") {
      const returnDate = optionalDate(body.return_date, "Return date");
      if (!returnDate) {
        return sendJson(res, 400, { error: "Return date is required." });
      }
      statements.updateActionDueDate.run(returnDate, actionId);
      notes = notes || `Chromebook return date: ${returnDate}`;
      queueAction(
        action.student_id,
        action.incident_id,
        "return_chromebook",
        "Return Chromebook to student",
        returnDate,
        "Library/Tech",
        "Return the Chromebook to the student after the restriction period."
      );
    }

    statements.completeAction.run(status, completedOn, notes, actionId);
    return sendJson(res, 200, { ok: true });
  }

  const actionDocumentMatch = url.pathname.match(/^\/api\/actions\/(\d+)\/documents$/);
  if (req.method === "POST" && actionDocumentMatch) {
    const session = requireAuth(req);
    const actionId = Number(actionDocumentMatch[1]);
    const action = statements.getAction.get(actionId);
    if (!action) return sendJson(res, 404, { error: "Follow-up not found" });
    const body = await readBody(req);
    const originalName = required(body.original_name, "File name");
    const mimeType = nullable(body.mime_type) || "application/octet-stream";
    const base64 = required(body.content_base64, "File content");
    const storedName = safeDocumentFileName(actionId, originalName);
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > 10_000_000) {
      return sendJson(res, 400, { error: "Document must be 10 MB or smaller." });
    }
    fs.writeFileSync(path.join(DOCUMENT_DIR, storedName), bytes);
    const title = nullable(body.title) || action.title;
    const result = statements.insertDocument.run(
      action.student_id,
      action.id,
      action.incident_id,
      currentTerm().id,
      action.action_type,
      title,
      originalName,
      storedName,
      mimeType,
      session.email || session.name || null
    );
    statements.addAudit.run("document", Number(result.lastInsertRowid), `${originalName} was uploaded.`);
    const document = statements.getDocument.get(Number(result.lastInsertRowid));
    return sendJson(res, 201, documentView(document));
  }

  if (req.method === "GET" && url.pathname === "/api/templates") {
    return sendJson(res, 200, statements.listTemplates.all().map(templateView));
  }

  if (req.method === "POST" && url.pathname === "/api/templates") {
    const body = await readBody(req);
    const actionType = required(body.action_type, "Action type");
    const label = required(body.label, "Label");
    const originalName = required(body.original_name, "File name");
    const mimeType = nullable(body.mime_type) || "application/octet-stream";
    const base64 = required(body.content_base64, "File content");
    const storedName = safeTemplateFileName(actionType, originalName);
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > 5_000_000) {
      return sendJson(res, 400, { error: "Template file must be 5 MB or smaller." });
    }
    fs.writeFileSync(path.join(TEMPLATE_DIR, storedName), bytes);
    const previous = statements.getTemplate.get(actionType);
    statements.upsertTemplate.run(actionType, label, originalName, storedName, mimeType);
    if (previous?.stored_name && previous.stored_name !== storedName) {
      fs.rmSync(path.join(TEMPLATE_DIR, previous.stored_name), { force: true });
    }
    statements.addAudit.run("template", 0, `${label} template was uploaded.`);
    return sendJson(res, 200, templateView(statements.getTemplate.get(actionType)));
  }

  const templateMatch = url.pathname.match(/^\/api\/templates\/([^/]+)$/);
  if (req.method === "DELETE" && templateMatch) {
    const actionType = decodeURIComponent(templateMatch[1]);
    const template = statements.getTemplate.get(actionType);
    if (!template) return sendJson(res, 404, { error: "Form not found" });
    statements.deleteTemplate.run(actionType);
    if (template.stored_name) {
      fs.rmSync(path.join(TEMPLATE_DIR, template.stored_name), { force: true });
    }
    statements.addAudit.run("template", 0, `${template.label} template was deleted.`);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: "Not found" });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg"
  }[ext] || "application/octet-stream";
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {
      "content-type": contentType(filePath),
      "cache-control": "no-store"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/templates/") || url.pathname.startsWith("/documents/")) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, { error: error.message || "Unexpected server error" });
  }
});

async function main() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(ROOT, "node_modules", "sql.js", "dist", file)
  });
  const fileBuffer = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
  execSql("PRAGMA foreign_keys = ON;");
  migrate();
  statements = prepareStatements();

  server.listen(PORT, () => {
    console.log(`Technology tracker running at http://localhost:${PORT}`);
    console.log(`Database: ${DB_PATH}`);
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
