const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_REPAIR_TYPES = ["Screen", "Keyboard", "Battery", "Top Cover/Hinges", "Other"];
const VALID_STATUSES = new Set(["Open", "In Progress", "Complete"]);
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
    for (const name of DEFAULT_REPAIR_TYPES) {
      run("INSERT OR IGNORE INTO repair_types (name, is_custom, active) VALUES (?, 0, 1)", [name]);
    }
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
      WHERE active = 1
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
        COALESCE(NULLIF(r.parent_email, ''), s.guardian_contact, '') AS parent_email,
        (SELECT GROUP_CONCAT(p.name || ' x' || u.quantity, ', ')
         FROM repair_part_usage u
         JOIN repair_inventory_parts p ON p.id = u.part_id
         WHERE u.repair_id = r.id) AS parts_used,
        (SELECT COUNT(*) FROM repair_photos ph WHERE ph.repair_id = r.id) AS photo_count
      FROM chromebook_repairs r
      JOIN students s ON s.id = r.student_id
      JOIN repair_types rt ON rt.id = r.repair_type_id
      ORDER BY r.created_at DESC, r.id DESC
    `);
    const photos = queryAll(`
      SELECT id, repair_id, original_name, mime_type, uploaded_at
      FROM repair_photos
      ORDER BY uploaded_at, id
    `);
    return { students, repairTypes, parts, repairs, photos };
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

  function createRepair(body, actor) {
    const studentId = requirePositiveId(body.student_id, "Student");
    let repairTypeId = requirePositiveId(body.repair_type_id, "Repair type");
    const notes = requiredText(body.incident_notes, "Incident notes");
    const status = text(body.status) || "Open";
    if (!VALID_STATUSES.has(status)) {
      throw Object.assign(new Error("Choose a valid repair status."), { status: 400 });
    }
    const student = queryOne("SELECT * FROM students WHERE id = ? AND active = 1", [studentId]);
    if (!student) throw Object.assign(new Error("Student was not found."), { status: 404 });
    const selectedType = queryOne("SELECT * FROM repair_types WHERE id = ? AND active = 1", [repairTypeId]);
    if (!selectedType) throw Object.assign(new Error("Repair type was not found."), { status: 404 });
    const otherType = text(body.other_type);
    const usage = normalizePartUsage(body.parts);

    for (const item of usage) {
      const part = queryOne("SELECT id, name, quantity FROM repair_inventory_parts WHERE id = ?", [item.partId]);
      if (!part) throw Object.assign(new Error("A selected inventory part was not found."), { status: 400 });
      if (Number(part.quantity) < item.quantity) {
        throw Object.assign(new Error(`${part.name} does not have enough stock.`), { status: 400 });
      }
    }

    const repairId = transaction(() => {
      if (otherType) {
        const existing = queryOne("SELECT id FROM repair_types WHERE LOWER(name) = LOWER(?)", [otherType]);
        if (existing) {
          repairTypeId = Number(existing.id);
        } else {
          repairTypeId = run("INSERT INTO repair_types (name, is_custom, active) VALUES (?, 1, 1)", [otherType]);
        }
      }
      const now = new Date().toISOString();
      const id = run(`
        INSERT INTO chromebook_repairs
          (student_id, asset_tag, repair_type_id, other_details, incident_notes,
           status, damage_fee, fee_amount_cents, parent_email, staff_cc,
           created_by, created_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        studentId,
        text(body.asset_tag) || text(student.device_asset_tag),
        repairTypeId,
        otherType || null,
        notes,
        status,
        body.damage_fee ? 1 : 0,
        body.damage_fee ? Math.max(0, integer(body.fee_amount_cents)) : 0,
        text(body.parent_email) || text(student.guardian_contact) || null,
        text(body.staff_cc) || null,
        actor,
        now,
        status === "Complete" ? now : null
      ]);
      for (const item of usage) {
        run("INSERT INTO repair_part_usage (repair_id, part_id, quantity) VALUES (?, ?, ?)", [id, item.partId, item.quantity]);
        run("UPDATE repair_inventory_parts SET quantity = quantity - ? WHERE id = ?", [item.quantity, item.partId]);
      }
      return id;
    });
    addAudit("chromebook_repair", repairId, `${actor} logged Chromebook repair for ${student.first_name} ${student.last_name}.`);
    return repairId;
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
      SET parent_notified = 1, parent_email = ?, staff_cc = ?
      WHERE id = ?
    `, [text(body.parent_email) || null, text(body.staff_cc) || null, repairId]));
    addAudit("chromebook_repair", repairId, `${actor} recorded parent notification for repair.`);
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
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) {
      throw Object.assign(new Error("Photo must be smaller than 8 MB."), { status: 413 });
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
