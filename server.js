const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
require("dotenv").config();
const { OAuth2Client } = require("google-auth-library");
const initSqlJs = require("sql.js");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
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
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

fs.mkdirSync(DATA_DIR, { recursive: true });

let db;
let statements;

function persistDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function execSql(sql, shouldPersist = false) {
  db.exec(sql);
  if (shouldPersist) persistDb();
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
  `, true);

  const count = prepare("SELECT COUNT(*) AS count FROM infraction_types").get().count;
  if (count === 0) {
    const insert = prepare(`
      INSERT INTO infraction_types (severity, category, label, description)
      VALUES (?, ?, ?, ?)
    `);

    const minorTypes = [
      ["Respectful Use", "Forgot the human", "Interacting online without regard for the person behind the screen."],
      ["Respectful Use", "Crossed boundaries", "Recording or sharing someone's picture without permission."],
      ["Respectful Use", "Plagiarism", "Using a creator's images or ideas without proper credit."],
      ["Responsible Use", "Poor balance", "Failing to maintain a healthy balance between online and offline activities."],
      ["Responsible Use", "Missed interaction", "Not closing or locking the screen during face-to-face time."],
      ["Responsible Use", "Safety risk", "Not protecting personal information or passwords."],
      ["Responsible Use", "Reckless care or abandonment", "Damage, careless handling, or leaving a device unsecured."],
      ["Responsible Use", "Careless footprint", "Ignoring school guidelines or permanent digital footprint expectations."],
      ["Resourceful Use", "Entertainment only", "Using school technology strictly for entertainment."],
      ["Resourceful Use", "Off-task", "Using the device for things unrelated to school topics or learning."],
      ["Resourceful Use", "Unreported issue", "Not informing staff about a technical problem or blocked resource."],
      ["Resourceful Use", "Disorganized", "Not using digital tools to manage time or organize work."]
    ];

    const majorTypes = [
      ["Major Conduct", "Purposeful misuse", "Device use that substantially disrupts class or intentionally bypasses expectations."],
      ["Major Conduct", "Digital disrespect", "Harassment, threats, serious cyberbullying, or harmful communication."],
      ["Major Conduct", "Privacy or recording breach", "Unauthorized recording, sharing, account access, or exposure of private information."],
      ["Major Conduct", "Device damage or loss", "Intentional damage, theft, repeated unsafe handling, or abandonment of school equipment."],
      ["Major Conduct", "Academic integrity", "Serious plagiarism, unauthorized AI/tool use, cheating, or impersonation."]
    ];

    for (const [category, label, description] of minorTypes) {
      insert.run("minor", category, label, description);
    }
    for (const [category, label, description] of majorTypes) {
      insert.run("major", category, label, description);
    }
  }
}

function prepareStatements() {
  return {
  listStudents: prepare(`
    SELECT s.*,
      COUNT(i.id) AS violation_count,
      SUM(CASE WHEN i.severity = 'minor' THEN 1 ELSE 0 END) AS minor_count,
      SUM(CASE WHEN i.severity = 'major' THEN 1 ELSE 0 END) AS major_count,
      MAX(i.occurred_on) AS last_incident_on
    FROM students s
    LEFT JOIN incidents i ON i.student_id = s.id
    WHERE s.active = 1
      AND (? = '' OR LOWER(s.first_name || ' ' || s.last_name || ' ' || COALESCE(s.student_number, '')) LIKE ?)
    GROUP BY s.id
    ORDER BY s.last_name, s.first_name
  `),
  getStudent: prepare("SELECT * FROM students WHERE id = ?"),
  createStudent: prepare(`
    INSERT INTO students (student_number, first_name, last_name, grade, team, guardian_name, guardian_contact, device_asset_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    SELECT * FROM infraction_types WHERE active = 1 ORDER BY severity, category, label
  `),
  createIncident: prepare(`
    INSERT INTO incidents (student_id, occurred_on, reported_by, class_period, severity, infraction_type_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  incidentsForStudent: prepare(`
    SELECT i.*, t.category, t.label AS infraction_label
    FROM incidents i
    LEFT JOIN infraction_types t ON t.id = i.infraction_type_id
    WHERE i.student_id = ?
    ORDER BY i.occurred_on DESC, i.id DESC
  `),
  actionsForStudent: prepare(`
    SELECT * FROM actions WHERE student_id = ? ORDER BY status, due_on IS NULL, due_on, created_at DESC
  `),
  openActions: prepare(`
    SELECT a.*, s.first_name, s.last_name, s.grade
    FROM actions a
    JOIN students s ON s.id = a.student_id
    WHERE a.status = 'open' AND s.active = 1
    ORDER BY a.due_on IS NULL, a.due_on, a.created_at DESC
  `),
  completeAction: prepare(`
    UPDATE actions
    SET status = ?, completed_on = ?, notes = COALESCE(?, notes)
    WHERE id = ?
  `),
  insertAction: prepare(`
    INSERT OR IGNORE INTO actions (student_id, incident_id, action_type, title, due_on, owner, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
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
    WHERE student_id = ?
  `)
};
}

function statusFromCounts(counts) {
  const total = Number(counts.total_count || 0);
  const minor = Number(counts.minor_count || 0);
  const major = Number(counts.major_count || 0);

  if (total >= 5) {
    return {
      key: "admin_review",
      label: "Admin review",
      level: 5,
      description: "Chromebook held by admin until next steps are determined."
    };
  }
  if (total >= 4) {
    return {
      key: "device_restriction",
      label: "5 school-day restriction",
      level: 4,
      description: "Device held by library/tech staff except when digital access is essential."
    };
  }
  if (major >= 1 || minor >= 3) {
    return {
      key: "success_contract",
      label: "Technology Success Contract",
      level: 3,
      description: "Student keeps Chromebook with class check-ins and parent contact."
    };
  }
  if (minor >= 2) {
    return {
      key: "reflection",
      label: "Digital Impact Reflection",
      level: 2,
      description: "Student completes reflection and information is sent home."
    };
  }
  return {
    key: "monitor",
    label: "Monitor",
    level: 1,
    description: "No formal technology intervention is currently due."
  };
}

function toStudentView(row) {
  const counts = {
    total_count: row.violation_count,
    minor_count: row.minor_count,
    major_count: row.major_count,
    last_incident_on: row.last_incident_on
  };
  return {
    ...row,
    violation_count: Number(row.violation_count || 0),
    minor_count: Number(row.minor_count || 0),
    major_count: Number(row.major_count || 0),
    status: statusFromCounts(counts)
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

function ensureWorkflowActions(studentId, incidentId, occurredOn) {
  const counts = statements.incidentCounts.get(studentId);
  const total = Number(counts.total_count || 0);
  const minor = Number(counts.minor_count || 0);
  const major = Number(counts.major_count || 0);

  if (minor === 2 && major === 0) {
    queueAction(studentId, incidentId, "digital_reflection", "Digital Impact Reflection due", occurredOn, "Teacher", "Upload or send completed reflection through ParentSquare.");
    queueAction(studentId, incidentId, "parent_contact_reflection", "Parent contact: reflection", occurredOn, "Teacher", "Notify parent/guardian that the reflection step was assigned.");
  }

  if (minor === 3 || major === 1) {
    queueAction(studentId, incidentId, "success_contract", "Technology Success Contract due", occurredOn, "Teacher", "Review contract expectations with student and send home.");
    queueAction(studentId, incidentId, "parent_contact_contract", "Parent contact: success contract", occurredOn, "Teacher", "Share the contract and current violation history.");
  }

  if (total === 4) {
    const returnDate = addSchoolDays(occurredOn, 5);
    queueAction(studentId, incidentId, "device_restriction", "Start 5 school-day device restriction", returnDate, "Library/Tech", "Hold Chromebook except when a digital component is essential.");
    queueAction(studentId, incidentId, "reentry_check", "Schedule re-entry check", returnDate, "Teacher/Admin", "Confirm student can resume regular device access after the restriction.");
  }

  if (total >= 5) {
    queueAction(studentId, incidentId, "admin_review", "Admin review needed", occurredOn, "Admin", "Determine next steps, including possible parent conversation or re-entry meeting.");
    queueAction(studentId, incidentId, "parent_contact_admin", "Parent contact: admin review", occurredOn, "Admin", "Document parent/guardian communication for the additional violation.");
  }
}

function queueAction(studentId, incidentId, actionType, title, dueOn, owner, notes) {
  statements.insertAction.run(studentId, incidentId, actionType, title, dueOn, owner, notes);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(payload);
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
      if (body.length > 1_000_000) {
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

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const search = "";
    const students = statements.listStudents.all(search, "%%").map(toStudentView);
    return sendJson(res, 200, {
      students,
      infractionTypes: statements.listInfractions.all(),
      openActions: statements.openActions.all().map(action => ({
        ...action,
        student_name: `${action.first_name} ${action.last_name}`
      }))
    });
  }

  if (req.method === "GET" && url.pathname === "/api/students") {
    const search = (url.searchParams.get("q") || "").trim().toLowerCase();
    const like = `%${search}%`;
    return sendJson(res, 200, statements.listStudents.all(search, like).map(toStudentView));
  }

  if (req.method === "POST" && url.pathname === "/api/students") {
    const body = await readBody(req);
    const firstName = required(body.first_name, "First name");
    const lastName = required(body.last_name, "Last name");
    const result = statements.createStudent.run(
      nullable(body.student_number),
      firstName,
      lastName,
      nullable(body.grade),
      nullable(body.team),
      nullable(body.guardian_name),
      nullable(body.guardian_contact),
      nullable(body.device_asset_tag)
    );
    statements.addAudit.run("student", result.lastInsertRowid, `Student ${firstName} ${lastName} was added.`);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid) });
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
    const counts = statements.incidentCounts.get(id);
    return sendJson(res, 200, {
      ...student,
      counts,
      status: statusFromCounts(counts),
      incidents: statements.incidentsForStudent.all(id),
      actions: statements.actionsForStudent.all(id)
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
    const result = statements.createIncident.run(
      studentId,
      occurredOn,
      reportedBy,
      nullable(body.class_period),
      severity,
      body.infraction_type_id ? Number(body.infraction_type_id) : null,
      nullable(body.notes)
    );
    ensureWorkflowActions(studentId, Number(result.lastInsertRowid), occurredOn);
    statements.addAudit.run("incident", result.lastInsertRowid, `${severity} violation entered.`);
    return sendJson(res, 201, { id: Number(result.lastInsertRowid) });
  }

  const actionMatch = url.pathname.match(/^\/api\/actions\/(\d+)$/);
  if (req.method === "PATCH" && actionMatch) {
    const body = await readBody(req);
    const status = body.status === "complete" ? "complete" : "open";
    const completedOn = status === "complete" ? new Date().toISOString().slice(0, 10) : null;
    statements.completeAction.run(status, completedOn, nullable(body.notes), Number(actionMatch[1]));
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
    res.writeHead(200, { "content-type": contentType(filePath) });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
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
