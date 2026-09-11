const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_REPAIR_TYPES = ["Screen", "Keyboard", "Battery", "Top Cover/Hinges", "Other", "Fine"];
const DEFAULT_FEE_SCHEDULE = [
  { seedKey: "lost_stolen", label: "Lost/Stolen", withoutCare: 27500, withCare: 10000, custom: 0, order: 1 },
  { seedKey: "accidental_replacement", label: "Replace due to accidental damage", withoutCare: 27500, withCare: 5000, custom: 0, order: 2 },
  { seedKey: "screen", label: "Screen", withoutCare: 10000, withCare: 1500, custom: 0, order: 3 },
  { seedKey: "keyboard_touchpad", label: "Keyboard/touchpad", withoutCare: 6000, withCare: 0, custom: 0, order: 4 },
  { seedKey: "charger", label: "Charger", withoutCare: 3000, withCare: 500, custom: 0, order: 5 },
  { seedKey: "transport_case", label: "Transport case", withoutCare: 2000, withCare: 0, custom: 0, order: 6 },
  { seedKey: "other", label: "Other", withoutCare: 0, withCare: 0, custom: 1, order: 99 }
];
const FINE_DEVICE_TYPES = ["Chromebook", "Charger", "Loaner Chromebook", "Loaner Charger", "Transport case", "Other"];
const VALID_STATUSES = new Set(["Open", "In Progress", "Complete"]);
const VALID_RECORD_KINDS = new Set(["Repair", "Fine"]);
const VALID_CHROMECARE_STATUSES = new Set(["Unknown", "Yes", "No"]);
const MAX_REPAIR_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/heic", ".heic"]
]);

function createChromebookRepairs({
  getDb,
  persistDb,
  readBody,
  sendJson,
  sendFile,
  photoDirectory,
  addAudit
}) {
  fs.mkdirSync(photoDirectory, { recursive: true });

  function queryAll(sql, params = []) {
    const stmt = getDb().prepare(sql);
    const rows = [];
    try {
      stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function queryOne(sql, params = []) {
    return queryAll(sql, params)[0];
  }

  function run(sql, params = []) {
    const stmt = getDb().prepare(sql);
    try {
      stmt.run(params);
      return Number(getDb().exec("SELECT last_insert_rowid() AS id")[0]?.values?.[0]?.[0] || 0);
    } finally {
      stmt.free();
    }
  }

  function transaction(work) {
    const database = getDb();
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      database.exec("COMMIT");
      persistDb();
      return result;
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {}
      throw error;
    }
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function integer(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  }

  function requiredText(value, label) {
    const result = text(value);
    if (!result) throw Object.assign(new Error(`${label} is required.`), { status: 400 });
    return result;
  }

  function requirePositiveId(value, label) {
    const result = integer(value);
    if (result < 1) throw Object.assign(new Error(`${label} is invalid.`), { status: 400 });
    return result;
  }

  function friendlyDatabaseError(error) {
    const message = error instanceof Error ? error.message : "Unable to save repair data.";
    if (message.includes("UNIQUE constraint failed: repair_inventory_parts.name")) {
      return Object.assign(new Error("That part is already in inventory."), { status: 409 });
    }
    if (message.includes("UNIQUE constraint failed: repair_types.name")) {
      return Object.assign(new Error("That repair type already exists."), { status: 409 });
    }
    return error;
  }

  function tableColumns(tableName) {
    const result = getDb().exec(`PRAGMA table_info(${tableName})`);
    return result.length ? result[0].values.map(row => row[1]) : [];
  }

  function ensureColumn(tableName, columnName, definition) {
    if (!tableColumns(tableName).includes(columnName)) {
      getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  function migrate() {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS repair_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        is_custom INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS repair_inventory_parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        sku TEXT,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        low_stock_threshold INTEGER NOT NULL DEFAULT 2 CHECK (low_stock_threshold >= 0),
        unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS repair_fee_schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seed_key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL UNIQUE COLLATE NOCASE,
        without_chromecare_cents INTEGER NOT NULL DEFAULT 0 CHECK (without_chromecare_cents >= 0),
        with_chromecare_cents INTEGER NOT NULL DEFAULT 0 CHECK (with_chromecare_cents >= 0),
        custom_amount INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 50,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chromebook_repairs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        asset_tag TEXT NOT NULL DEFAULT '',
        repair_type_id INTEGER NOT NULL REFERENCES repair_types(id),
        other_details TEXT,
        incident_notes TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Complete')),
        damage_fee INTEGER NOT NULL DEFAULT 0,
        fee_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_amount_cents >= 0),
        parent_notified INTEGER NOT NULL DEFAULT 0,
        parent_email TEXT,
        staff_cc TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS repair_part_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repair_id INTEGER NOT NULL REFERENCES chromebook_repairs(id) ON DELETE CASCADE,
        part_id INTEGER NOT NULL REFERENCES repair_inventory_parts(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0)
      );

      CREATE TABLE IF NOT EXISTS repair_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repair_id INTEGER NOT NULL REFERENCES chromebook_repairs(id) ON DELETE CASCADE,
        stored_name TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        uploaded_by TEXT,
        uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS chromebook_repairs_student_idx ON chromebook_repairs (student_id);
      CREATE INDEX IF NOT EXISTS chromebook_repairs_asset_idx ON chromebook_repairs (asset_tag);
      CREATE INDEX IF NOT EXISTS chromebook_repairs_created_idx ON chromebook_repairs (created_at);
      CREATE INDEX IF NOT EXISTS repair_photos_repair_idx ON repair_photos (repair_id);
    `);
    ensureColumn("chromebook_repairs", "record_kind", "TEXT NOT NULL DEFAULT 'Repair'");
    ensureColumn("chromebook_repairs", "device_type", "TEXT");
    ensureColumn("chromebook_repairs", "fee_schedule_id", "INTEGER");
    ensureColumn("chromebook_repairs", "chromecare_status", "TEXT NOT NULL DEFAULT 'Unknown'");
    ensureColumn("chromebook_repairs", "parent_notified_at", "TEXT");
    ensureColumn("chromebook_repairs", "skyward_entered", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("chromebook_repairs", "skyward_entered_at", "TEXT");
    ensureColumn("chromebook_repairs", "skyward_entered_by", "TEXT");
    ensureColumn("chromebook_repairs", "updated_at", "TEXT");
    for (const name of DEFAULT_REPAIR_TYPES) {
      run("INSERT OR IGNORE INTO repair_types (name, is_custom, active) VALUES (?, 0, 1)", [name]);
    }
    for (const item of DEFAULT_FEE_SCHEDULE) {
      run(`
        INSERT OR IGNORE INTO repair_fee_schedule
          (seed_key, label, without_chromecare_cents, with_chromecare_cents, custom_amount, active, sort_order)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `, [item.seedKey, item.label, item.withoutCare, item.withCare, item.custom, item.order]);
    }
    run(`
      UPDATE chromebook_repairs
      SET parent_notified_at = COALESCE(parent_notified_at, created_at)
      WHERE parent_notified = 1 AND parent_notified_at IS NULL
    `);
    getDb().exec("CREATE INDEX IF NOT EXISTS chromebook_repairs_record_kind_idx ON chromebook_repairs (record_kind)");
    getDb().exec("CREATE INDEX IF NOT EXISTS chromebook_repairs_fee_schedule_idx ON chromebook_repairs (fee_schedule_id)");
    getDb().exec("PRAGMA optimize");
    persistDb();
  }

  function snapshot() {
    const students = queryAll(`
      SELECT id, student_number, first_name, last_name, grade,
        device_asset_tag, guardian_contact
      FROM students
      WHERE active = 1
      ORDER BY last_name, first_name
    `);
    const repairTypes = queryAll(`
      SELECT id, name, is_custom, active
      FROM repair_types
      WHERE active = 1 AND name != 'Fine'
      ORDER BY CASE name
        WHEN 'Screen' THEN 1 WHEN 'Keyboard' THEN 2 WHEN 'Battery' THEN 3
        WHEN 'Top Cover/Hinges' THEN 4 WHEN 'Other' THEN 99 ELSE 5 END, name
    `);
    const parts = queryAll(`
      SELECT id, name, sku, quantity, low_stock_threshold, unit_cost_cents, created_at
      FROM repair_inventory_parts
      ORDER BY name
    `);
    const repairs = queryAll(`
      SELECT r.*, s.student_number, s.first_name, s.last_name, s.grade,
        rt.name AS repair_type_name,
        fs.label AS fee_schedule_label,
        fs.without_chromecare_cents,
        fs.with_chromecare_cents,
        fs.custom_amount AS fee_custom_amount,
        COALESCE(NULLIF(r.parent_email, ''), s.guardian_contact, '') AS parent_email,
        (SELECT GROUP_CONCAT(p.name || ' x' || u.quantity, ', ')
         FROM repair_part_usage u
         JOIN repair_inventory_parts p ON p.id = u.part_id
         WHERE u.repair_id = r.id) AS parts_used,
        (SELECT COUNT(*) FROM repair_photos ph WHERE ph.repair_id = r.id) AS photo_count
      FROM chromebook_repairs r
      JOIN students s ON s.id = r.student_id
      JOIN repair_types rt ON rt.id = r.repair_type_id
      LEFT JOIN repair_fee_schedule fs ON fs.id = r.fee_schedule_id
      ORDER BY r.created_at DESC, r.id DESC
    `);
    const photos = queryAll(`
      SELECT id, repair_id, original_name, mime_type, uploaded_at
      FROM repair_photos
      ORDER BY uploaded_at, id
    `);
    const partUsage = queryAll(`
      SELECT repair_id, part_id, quantity
      FROM repair_part_usage
      ORDER BY repair_id, id
    `);
    const feeSchedule = queryAll(`
      SELECT id, seed_key, label, without_chromecare_cents, with_chromecare_cents,
        custom_amount, active, sort_order, updated_at
      FROM repair_fee_schedule
      WHERE active = 1
      ORDER BY sort_order, label
    `);
    return { repairApiVersion: 2, students, repairTypes, parts, repairs, photos, partUsage, feeSchedule, fineDeviceTypes: FINE_DEVICE_TYPES };
  }

  function createPart(body, actor) {
    const name = requiredText(body.name, "Part name");
    const quantity = Math.max(0, integer(body.quantity));
    const threshold = Math.max(0, integer(body.low_stock_threshold, 2));
    const cost = Math.max(0, integer(body.unit_cost_cents));
    const id = transaction(() => run(`
      INSERT INTO repair_inventory_parts
        (name, sku, quantity, low_stock_threshold, unit_cost_cents)
      VALUES (?, ?, ?, ?, ?)
    `, [name, text(body.sku) || null, quantity, threshold, cost]));
    addAudit("repair_part", id, `${actor} added repair inventory item ${name}.`);
    return id;
  }

  function updatePart(partId, body, actor) {
    const part = queryOne("SELECT * FROM repair_inventory_parts WHERE id = ?", [partId]);
    if (!part) throw Object.assign(new Error("Inventory part was not found."), { status: 404 });
    const quantity = Math.max(0, integer(body.quantity, Number(part.quantity)));
    const threshold = Math.max(0, integer(body.low_stock_threshold, Number(part.low_stock_threshold)));
    const cost = Math.max(0, integer(body.unit_cost_cents, Number(part.unit_cost_cents)));
    transaction(() => run(`
      UPDATE repair_inventory_parts
      SET quantity = ?, low_stock_threshold = ?, unit_cost_cents = ?
      WHERE id = ?
    `, [quantity, threshold, cost, partId]));
    addAudit("repair_part", partId, `${actor} updated repair inventory item ${part.name}.`);
  }

  function normalizePartUsage(rawParts) {
    const combined = new Map();
    for (const raw of Array.isArray(rawParts) ? rawParts.slice(0, 50) : []) {
      const partId = integer(raw?.part_id);
      const quantity = Math.max(1, integer(raw?.quantity, 1));
      if (partId > 0) combined.set(partId, (combined.get(partId) || 0) + quantity);
    }
    return [...combined].map(([partId, quantity]) => ({ partId, quantity }));
  }

  function flag(value) {
    return value === true || value === 1 || value === "1" ? 1 : 0;
  }

  function requireChromecareStatus(value) {
    const status = text(value) || "Unknown";
    if (!VALID_CHROMECARE_STATUSES.has(status)) {
      throw Object.assign(new Error("Choose a valid Chromebook Care status."), { status: 400 });
    }
    return status;
  }

  function requireFeeSchedule(scheduleId) {
    const schedule = queryOne("SELECT * FROM repair_fee_schedule WHERE id = ? AND active = 1", [scheduleId]);
    if (!schedule) throw Object.assign(new Error("Choose a valid fee or fine type."), { status: 400 });
    return schedule;
  }

  function resolveRepairType(recordKind, requestedTypeId, otherType) {
    if (recordKind === "Fine") {
      return queryOne("SELECT * FROM repair_types WHERE name = 'Fine' COLLATE NOCASE AND active = 1");
    }
    const selected = queryOne("SELECT * FROM repair_types WHERE id = ? AND active = 1 AND name != 'Fine'", [requestedTypeId]);
    if (!selected) throw Object.assign(new Error("Repair type was not found."), { status: 404 });
    if (!otherType) return selected;
    const existing = queryOne("SELECT * FROM repair_types WHERE LOWER(name) = LOWER(?)", [otherType]);
    if (existing) return existing;
    const id = run("INSERT INTO repair_types (name, is_custom, active) VALUES (?, 1, 1)", [otherType]);
    return { id, name: otherType, is_custom: 1, active: 1 };
  }

  function validatePartAvailability(usage, oldUsage = []) {
    const previouslyUsed = new Map(oldUsage.map(item => [Number(item.part_id), Number(item.quantity)]));
    for (const item of usage) {
      const part = queryOne("SELECT id, name, quantity FROM repair_inventory_parts WHERE id = ?", [item.partId]);
      if (!part) throw Object.assign(new Error("A selected inventory part was not found."), { status: 400 });
      const available = Number(part.quantity) + Number(previouslyUsed.get(item.partId) || 0);
      if (available < item.quantity) {
        throw Object.assign(new Error(`${part.name} does not have enough stock.`), { status: 400 });
      }
    }
  }

  function replacePartUsage(repairId, usage, oldUsage) {
    for (const item of oldUsage) {
      run("UPDATE repair_inventory_parts SET quantity = quantity + ? WHERE id = ?", [item.quantity, item.part_id]);
    }
    run("DELETE FROM repair_part_usage WHERE repair_id = ?", [repairId]);
    for (const item of usage) {
      run("INSERT INTO repair_part_usage (repair_id, part_id, quantity) VALUES (?, ?, ?)", [repairId, item.partId, item.quantity]);
      run("UPDATE repair_inventory_parts SET quantity = quantity - ? WHERE id = ?", [item.quantity, item.partId]);
    }
  }

  function createRepair(body, actor) {
    const studentId = requirePositiveId(body.student_id, "Student");
    const recordKind = text(body.record_kind) || "Repair";
    if (!VALID_RECORD_KINDS.has(recordKind)) {
      throw Object.assign(new Error("Choose repair or fine."), { status: 400 });
    }
    const notes = requiredText(body.incident_notes, "Incident notes");
    const status = recordKind === "Fine" ? "Complete" : (text(body.status) || "Open");
    if (!VALID_STATUSES.has(status)) {
      throw Object.assign(new Error("Choose a valid repair status."), { status: 400 });
    }
    const student = queryOne("SELECT * FROM students WHERE id = ? AND active = 1", [studentId]);
    if (!student) throw Object.assign(new Error("Student was not found."), { status: 404 });
    const otherType = text(body.other_type);
    const repairType = resolveRepairType(recordKind, requirePositiveId(body.repair_type_id || 1, "Repair type"), otherType);
    if (!repairType) throw Object.assign(new Error("Fine record type is not configured."), { status: 500 });
    const deviceType = recordKind === "Fine" ? requiredText(body.device_type, "Device or item") : "Chromebook";
    if (recordKind === "Fine" && !FINE_DEVICE_TYPES.includes(deviceType)) {
      throw Object.assign(new Error("Choose a valid device or item."), { status: 400 });
    }
    const hasFee = recordKind === "Fine" || flag(body.damage_fee);
    const feeScheduleId = hasFee ? requirePositiveId(body.fee_schedule_id, "Fee or fine type") : null;
    if (hasFee) requireFeeSchedule(feeScheduleId);
    const chromecareStatus = requireChromecareStatus(body.chromecare_status);
    const usage = recordKind === "Repair" ? normalizePartUsage(body.parts) : [];
    validatePartAvailability(usage);

    const repairId = transaction(() => {
      const now = new Date().toISOString();
      const id = run(`
        INSERT INTO chromebook_repairs
          (student_id, asset_tag, repair_type_id, other_details, incident_notes,
           status, damage_fee, fee_amount_cents, parent_email, staff_cc,
           created_by, created_at, completed_at, record_kind, device_type,
           fee_schedule_id, chromecare_status, parent_notified, skyward_entered, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
      `, [
        studentId,
        text(body.asset_tag) || text(student.device_asset_tag),
        Number(repairType.id),
        recordKind === "Repair" ? (otherType || null) : null,
        notes,
        status,
        hasFee ? 1 : 0,
        hasFee ? Math.max(0, integer(body.fee_amount_cents)) : 0,
        text(body.parent_email) || text(student.guardian_contact) || null,
        text(body.staff_cc) || null,
        actor,
        now,
        status === "Complete" ? now : null,
        recordKind,
        deviceType,
        feeScheduleId,
        chromecareStatus,
        now
      ]);
      replacePartUsage(id, usage, []);
      return id;
    });
    addAudit("chromebook_repair", repairId, `${actor} logged Chromebook ${recordKind.toLowerCase()} for ${student.first_name} ${student.last_name}.`);
    return repairId;
  }

  function updateRepair(repairId, body, actor) {
    const existing = queryOne("SELECT * FROM chromebook_repairs WHERE id = ?", [repairId]);
    if (!existing) throw Object.assign(new Error("Repair or fine was not found."), { status: 404 });
    const recordKind = VALID_RECORD_KINDS.has(text(existing.record_kind)) ? text(existing.record_kind) : "Repair";
    const notes = requiredText(body.incident_notes, "Incident notes");
    const status = recordKind === "Fine" ? "Complete" : (text(body.status) || text(existing.status));
    if (!VALID_STATUSES.has(status)) throw Object.assign(new Error("Choose a valid repair status."), { status: 400 });
    const otherType = text(body.other_type);
    const repairType = resolveRepairType(recordKind, requirePositiveId(body.repair_type_id || existing.repair_type_id, "Repair type"), otherType);
    if (!repairType) throw Object.assign(new Error("Fine record type is not configured."), { status: 500 });
    const deviceType = recordKind === "Fine" ? requiredText(body.device_type, "Device or item") : "Chromebook";
    if (recordKind === "Fine" && !FINE_DEVICE_TYPES.includes(deviceType)) {
      throw Object.assign(new Error("Choose a valid device or item."), { status: 400 });
    }
    const hasFee = recordKind === "Fine" || flag(body.damage_fee);
    const feeScheduleId = hasFee ? requirePositiveId(body.fee_schedule_id, "Fee or fine type") : null;
    if (hasFee) requireFeeSchedule(feeScheduleId);
    const chromecareStatus = requireChromecareStatus(body.chromecare_status);
    const amount = hasFee ? Math.max(0, integer(body.fee_amount_cents)) : 0;
    const oldUsage = queryAll("SELECT part_id, quantity FROM repair_part_usage WHERE repair_id = ?", [repairId]);
    const usage = recordKind === "Repair" ? normalizePartUsage(body.parts) : [];
    validatePartAvailability(usage, oldUsage);
    const financialChanged = Number(existing.damage_fee) !== (hasFee ? 1 : 0)
      || Number(existing.fee_amount_cents) !== amount
      || Number(existing.fee_schedule_id || 0) !== Number(feeScheduleId || 0)
      || text(existing.chromecare_status) !== chromecareStatus;
    const parentNotified = financialChanged ? 0 : flag(body.parent_notified);
    const skywardEntered = financialChanged || amount < 1 ? 0 : flag(body.skyward_entered);
    if (skywardEntered && !parentNotified) {
      throw Object.assign(new Error("Record the ParentSquare notice before marking the Skyward entry complete."), { status: 400 });
    }
    const now = new Date().toISOString();

    transaction(() => {
      run(`
        UPDATE chromebook_repairs
        SET asset_tag = ?, repair_type_id = ?, other_details = ?, incident_notes = ?, status = ?,
          damage_fee = ?, fee_amount_cents = ?, parent_email = ?, staff_cc = ?, completed_at = ?,
          device_type = ?, fee_schedule_id = ?, chromecare_status = ?, parent_notified = ?,
          parent_notified_at = ?, skyward_entered = ?, skyward_entered_at = ?,
          skyward_entered_by = ?, updated_at = ?
        WHERE id = ?
      `, [
        text(body.asset_tag), Number(repairType.id), recordKind === "Repair" ? (otherType || null) : null,
        notes, status, hasFee ? 1 : 0, amount, text(body.parent_email) || existing.parent_email || null,
        text(body.staff_cc) || null, status === "Complete" ? (existing.completed_at || now) : null,
        deviceType, feeScheduleId, chromecareStatus, parentNotified,
        parentNotified ? (existing.parent_notified_at || now) : null, skywardEntered,
        skywardEntered ? (existing.skyward_entered_at || now) : null,
        skywardEntered ? (existing.skyward_entered_by || actor) : null, now, repairId
      ]);
      replacePartUsage(repairId, usage, oldUsage);
    });
    addAudit("chromebook_repair", repairId, `${actor} updated Chromebook ${recordKind.toLowerCase()} record.`);
    return { financialReset: Boolean(financialChanged && (Number(existing.parent_notified) || Number(existing.skyward_entered))) };
  }

  function updateStatus(repairId, body, actor) {
    const status = requiredText(body.status, "Status");
    if (!VALID_STATUSES.has(status)) {
      throw Object.assign(new Error("Choose a valid repair status."), { status: 400 });
    }
    const repair = queryOne("SELECT id FROM chromebook_repairs WHERE id = ?", [repairId]);
    if (!repair) throw Object.assign(new Error("Repair was not found."), { status: 404 });
    transaction(() => run(
      "UPDATE chromebook_repairs SET status = ?, completed_at = ? WHERE id = ?",
      [status, status === "Complete" ? new Date().toISOString() : null, repairId]
    ));
    addAudit("chromebook_repair", repairId, `${actor} marked repair ${status}.`);
  }

  function markParentNotified(repairId, body, actor) {
    const repair = queryOne("SELECT id FROM chromebook_repairs WHERE id = ?", [repairId]);
    if (!repair) throw Object.assign(new Error("Repair was not found."), { status: 404 });
    transaction(() => run(`
      UPDATE chromebook_repairs
      SET parent_notified = 1, parent_notified_at = ?, updated_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), new Date().toISOString(), repairId]));
    addAudit("chromebook_repair", repairId, `${actor} recorded parent notification for repair.`);
  }

  function markSkywardEntered(repairId, body, actor) {
    const repair = queryOne("SELECT id, damage_fee, fee_amount_cents, parent_notified FROM chromebook_repairs WHERE id = ?", [repairId]);
    if (!repair) throw Object.assign(new Error("Repair or fine was not found."), { status: 404 });
    if (!Number(repair.damage_fee) || Number(repair.fee_amount_cents) < 1) {
      throw Object.assign(new Error("Only records with a fee or fine need Skyward entry."), { status: 400 });
    }
    const entered = body.entered === false || body.entered === 0 ? 0 : 1;
    if (entered && !Number(repair.parent_notified)) {
      throw Object.assign(new Error("Record the ParentSquare notice before marking the Skyward entry complete."), { status: 400 });
    }
    const now = new Date().toISOString();
    transaction(() => run(`
      UPDATE chromebook_repairs
      SET skyward_entered = ?, skyward_entered_at = ?, skyward_entered_by = ?, updated_at = ?
      WHERE id = ?
    `, [entered, entered ? now : null, entered ? actor : null, now, repairId]));
    addAudit("chromebook_repair", repairId, `${actor} marked Skyward entry ${entered ? "complete" : "not complete"}.`);
  }

  function updateFeeSchedule(scheduleId, body, actor, role) {
    if (role !== "tech_admin") {
      throw Object.assign(new Error("Only Tech Admins can change the Chromebook Care fee schedule."), { status: 403 });
    }
    const item = queryOne("SELECT * FROM repair_fee_schedule WHERE id = ?", [scheduleId]);
    if (!item) throw Object.assign(new Error("Fee schedule item was not found."), { status: 404 });
    const withoutCare = Math.max(0, integer(body.without_chromecare_cents, Number(item.without_chromecare_cents)));
    const withCare = Math.max(0, integer(body.with_chromecare_cents, Number(item.with_chromecare_cents)));
    transaction(() => run(`
      UPDATE repair_fee_schedule
      SET without_chromecare_cents = ?, with_chromecare_cents = ?, updated_at = ?
      WHERE id = ?
    `, [withoutCare, withCare, new Date().toISOString(), scheduleId]));
    addAudit("repair_fee_schedule", scheduleId, `${actor} updated the ${item.label} Chromebook Care fee schedule.`);
  }

  function deleteRepair(repairId, actor) {
    const repair = queryOne("SELECT id, record_kind FROM chromebook_repairs WHERE id = ?", [repairId]);
    if (!repair) throw Object.assign(new Error("Repair or fine was not found."), { status: 404 });
    const photos = queryAll("SELECT stored_name FROM repair_photos WHERE repair_id = ?", [repairId]);
    const usage = queryAll("SELECT part_id, quantity FROM repair_part_usage WHERE repair_id = ?", [repairId]);
    transaction(() => {
      for (const item of usage) {
        run("UPDATE repair_inventory_parts SET quantity = quantity + ? WHERE id = ?", [item.quantity, item.part_id]);
      }
      run("DELETE FROM repair_part_usage WHERE repair_id = ?", [repairId]);
      run("DELETE FROM repair_photos WHERE repair_id = ?", [repairId]);
      run("DELETE FROM chromebook_repairs WHERE id = ?", [repairId]);
    });
    for (const photo of photos) {
      fs.rmSync(path.join(photoDirectory, photo.stored_name), { force: true });
    }
    addAudit("chromebook_repair_deleted", repairId, `${actor} permanently deleted ${text(repair.record_kind).toLowerCase() || "repair"} record #${repairId}.`);
  }

  function savePhoto(repairId, body, actor) {
    const repair = queryOne("SELECT id FROM chromebook_repairs WHERE id = ?", [repairId]);
    if (!repair) throw Object.assign(new Error("Repair was not found."), { status: 404 });
    const mimeType = requiredText(body.mime_type, "Photo type").toLowerCase();
    const extension = ALLOWED_PHOTO_TYPES.get(mimeType);
    if (!extension) {
      throw Object.assign(new Error("Use a JPG, PNG, WEBP, or HEIC image."), { status: 415 });
    }
    const bytes = Buffer.from(requiredText(body.content_base64, "Photo content"), "base64");
    if (!bytes.length || bytes.length >= MAX_REPAIR_PHOTO_BYTES) {
      throw Object.assign(new Error("Photo must be smaller than 2 MB."), { status: 413 });
    }
    const storedName = `repair-${repairId}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension}`;
    fs.writeFileSync(path.join(photoDirectory, storedName), bytes, { flag: "wx" });
    let photoId;
    try {
      photoId = transaction(() => run(`
        INSERT INTO repair_photos
          (repair_id, stored_name, original_name, mime_type, uploaded_by)
        VALUES (?, ?, ?, ?, ?)
      `, [repairId, storedName, requiredText(body.original_name, "Photo file name"), mimeType, actor]));
    } catch (error) {
      fs.rmSync(path.join(photoDirectory, storedName), { force: true });
      throw error;
    }
    addAudit("repair_photo", photoId, `${actor} uploaded a damage photo for repair ${repairId}.`);
    return photoId;
  }

  async function handleApi(req, res, url, currentUser) {
    const actor = currentUser.email || currentUser.name || "Unknown staff user";

    if (req.method === "GET" && url.pathname === "/api/repairs/bootstrap") {
      sendJson(res, 200, snapshot());
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/repairs") {
      try {
        const id = createRepair(await readBody(req), actor);
        sendJson(res, 201, { id });
      } catch (error) {
        throw friendlyDatabaseError(error);
      }
      return true;
    }

    const repairMatch = url.pathname.match(/^\/api\/repairs\/(\d+)$/);
    if (req.method === "PATCH" && repairMatch) {
      const result = updateRepair(requirePositiveId(repairMatch[1], "Repair or fine"), await readBody(req), actor);
      sendJson(res, 200, { ok: true, ...result });
      return true;
    }
    if (req.method === "DELETE" && repairMatch) {
      const body = await readBody(req);
      if (body.confirmation !== "DELETE") {
        throw Object.assign(new Error("Confirm permanent deletion before continuing."), { status: 400 });
      }
      deleteRepair(requirePositiveId(repairMatch[1], "Repair or fine"), actor);
      sendJson(res, 200, { ok: true });
      return true;
    }

    const statusMatch = url.pathname.match(/^\/api\/repairs\/(\d+)\/status$/);
    if (req.method === "PATCH" && statusMatch) {
      updateStatus(requirePositiveId(statusMatch[1], "Repair"), await readBody(req), actor);
      sendJson(res, 200, { ok: true });
      return true;
    }

    const noticeMatch = url.pathname.match(/^\/api\/repairs\/(\d+)\/notice$/);
    if (req.method === "POST" && noticeMatch) {
      markParentNotified(requirePositiveId(noticeMatch[1], "Repair"), await readBody(req), actor);
      sendJson(res, 200, { ok: true });
      return true;
    }

    const skywardMatch = url.pathname.match(/^\/api\/repairs\/(\d+)\/skyward$/);
    if ((req.method === "POST" || req.method === "PATCH") && skywardMatch) {
      markSkywardEntered(requirePositiveId(skywardMatch[1], "Repair or fine"), await readBody(req), actor);
      sendJson(res, 200, { ok: true });
      return true;
    }

    const uploadMatch = url.pathname.match(/^\/api\/repairs\/(\d+)\/photos$/);
    if (req.method === "POST" && uploadMatch) {
      const id = savePhoto(requirePositiveId(uploadMatch[1], "Repair"), await readBody(req), actor);
      sendJson(res, 201, { id, url: `/repair-photos/${id}` });
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/repair-inventory") {
      try {
        const id = createPart(await readBody(req), actor);
        sendJson(res, 201, { id });
      } catch (error) {
        throw friendlyDatabaseError(error);
      }
      return true;
    }

    const partMatch = url.pathname.match(/^\/api\/repair-inventory\/(\d+)$/);
    if (req.method === "PATCH" && partMatch) {
      updatePart(requirePositiveId(partMatch[1], "Inventory part"), await readBody(req), actor);
      sendJson(res, 200, { ok: true });
      return true;
    }

    const feeScheduleMatch = url.pathname.match(/^\/api\/repair-fee-schedule\/(\d+)$/);
    if (req.method === "PATCH" && feeScheduleMatch) {
      updateFeeSchedule(
        requirePositiveId(feeScheduleMatch[1], "Fee schedule item"),
        await readBody(req),
        actor,
        currentUser.role
      );
      sendJson(res, 200, { ok: true });
      return true;
    }

    const photoMatch = url.pathname.match(/^\/repair-photos\/(\d+)$/);
    if (req.method === "GET" && photoMatch) {
      const photo = queryOne("SELECT * FROM repair_photos WHERE id = ?", [requirePositiveId(photoMatch[1], "Photo")]);
      if (!photo) {
        sendJson(res, 404, { error: "Photo was not found." });
      } else {
        sendFile(res, path.join(photoDirectory, photo.stored_name), photo.mime_type);
      }
      return true;
    }

    return false;
  }

  return { migrate, handleApi, snapshot };
}

module.exports = { createChromebookRepairs };
