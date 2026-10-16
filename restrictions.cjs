// Access restrictions have their own lifecycle and never participate in incident counts.
function createRestrictions({ prepare, execSql, localDateText, readBody, sendJson, requireTechAdmin, audit }) {
  function migrate() {
    execSql(`
      CREATE TABLE IF NOT EXISTS restriction_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL COLLATE NOCASE UNIQUE,
        description TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS student_restrictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        restriction_type_id INTEGER NOT NULL REFERENCES restriction_types(id),
        label TEXT NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT,
        notes TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TEXT, ended_by TEXT, ended_reason TEXT,
        removed_at TEXT, removed_by TEXT, removed_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS student_restrictions_student ON student_restrictions(student_id);
    `, true);
    // Seed once; retired or renamed types must never be recreated on restart.
    if (!prepare("SELECT key FROM app_settings WHERE key = ?").get("restriction_types_seeded")) {
      for (const label of ["No Email Access", "Teacher/Admin Email Access Only"]) {
        prepare("INSERT OR IGNORE INTO restriction_types (label) VALUES (?)").run(label);
      }
      prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").run("restriction_types_seeded", "1");
    }
  }
  function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
  function text(value, max, name, required = false) {
    const result = String(value ?? "").trim();
    if ((required && !result) || result.length > max) fail(`${name} ${!result ? "is required" : `must be ${max} characters or fewer`}.`);
    return result;
  }
  function date(value, name, optional = false) {
    if (optional && !value) return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(`${name} must be a valid date.`);
    return value;
  }
  function view(row, today = localDateText()) {
    return { ...row, state: row.removed_at ? "removed" : row.ended_at ? "ended"
      : row.ends_on && row.ends_on < today ? "expired" : row.starts_on > today ? "scheduled" : "active" };
  }
  function forStudent(id) {
    return prepare("SELECT * FROM student_restrictions WHERE student_id = ? ORDER BY starts_on DESC, id DESC").all(id).map(row => view(row));
  }
  function list() {
    return prepare(`SELECT r.*, s.first_name, s.last_name, s.grade FROM student_restrictions r
      JOIN students s ON s.id = r.student_id WHERE s.active = 1 ORDER BY r.label, s.last_name, s.first_name`).all().map(row => view(row));
  }
  function types() { return prepare("SELECT * FROM restriction_types ORDER BY label").all(); }
  function payload(body, studentId, excludeId = 0, existing = null) {
    const type = prepare("SELECT * FROM restriction_types WHERE id = ?").get(Number(body.restriction_type_id));
    if (!type || (!type.active && type.id !== existing?.restriction_type_id)) fail("Select an active restriction type.");
    const starts = date(body.starts_on, "Effective date");
    const ends = date(body.ends_on, "End date", true);
    if (ends && ends < starts) fail("End date must be on or after the effective date.");
    const duplicate = prepare(`SELECT id FROM student_restrictions WHERE student_id = ? AND restriction_type_id = ?
      AND id != ? AND ended_at IS NULL AND removed_at IS NULL
      AND starts_on <= ? AND (ends_on IS NULL OR ends_on >= ?)`).get(studentId, type.id, excludeId, ends || "9999-12-31", starts);
    if (duplicate) fail("This student already has this restriction during the selected dates. Edit the existing entry instead.", 409);
    return { type, starts, ends, notes: text(body.notes, 5000, "Notes") };
  }
  async function handleApi(req, res, url, user) {
    if (!url.pathname.startsWith("/api/restriction-types") && !url.pathname.startsWith("/api/restrictions")) return false;
    const actor = user.email || user.name;
    if (url.pathname.startsWith("/api/restriction-types")) {
      if (req.method === "GET" && url.pathname === "/api/restriction-types") {
        sendJson(res, 200, types()); return true;
      }
      requireTechAdmin(user);
      const match = url.pathname.match(/^\/api\/restriction-types\/(\d+)$/);
      const existing = match ? prepare("SELECT * FROM restriction_types WHERE id = ?").get(Number(match[1])) : null;
      if (match && !existing) fail("Restriction type not found.", 404);
      if ((req.method === "POST" && url.pathname === "/api/restriction-types") || (req.method === "PUT" && match)) {
        const body = await readBody(req);
        const label = text(body.label, 100, "Type name", true);
        const description = text(body.description, 500, "Description");
        const duplicate = prepare("SELECT * FROM restriction_types WHERE label = ? COLLATE NOCASE AND id != ?").get(label, existing?.id || 0);
        if (duplicate) fail("A restriction type with that name already exists, including retired types.", 409);
        const id = existing ? existing.id : Number(prepare("INSERT INTO restriction_types (label, description) VALUES (?, ?)").run(label, description).lastInsertRowid);
        if (existing) prepare("UPDATE restriction_types SET label = ?, description = ? WHERE id = ?").run(label, description, id);
        audit("restriction_type", id, `${actor} ${existing ? "updated" : "added"} restriction type: ${label}. Previous: ${JSON.stringify(existing)}.`);
        sendJson(res, existing ? 200 : 201, { id, label }); return true;
      }
      if (req.method === "DELETE" && match) {
        prepare("UPDATE restriction_types SET active = 0 WHERE id = ?").run(existing.id);
        audit("restriction_type", existing.id, `${actor} retired ${existing.label}; existing assignments preserved.`);
        sendJson(res, 200, { ok: true }); return true;
      }
    } else {
      if (req.method === "GET" && url.pathname === "/api/restrictions") { sendJson(res, 200, list()); return true; }
      if (req.method === "POST" && url.pathname === "/api/restrictions") {
        const body = await readBody(req);
        const studentId = Number(body.student_id);
        const student = prepare("SELECT * FROM students WHERE id = ? AND active = 1").get(studentId);
        if (!student) fail("Select an active student.");
        const p = payload(body, studentId);
        const id = Number(prepare(`INSERT INTO student_restrictions
          (student_id, restriction_type_id, label, starts_on, ends_on, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(studentId, p.type.id, p.type.label, p.starts, p.ends, p.notes, actor).lastInsertRowid);
        audit("restriction", id, `${actor} added restriction: ${JSON.stringify(body)}.`);
        sendJson(res, 201, { id, entry_type: "restriction" }); return true;
      }
      const match = url.pathname.match(/^\/api\/restrictions\/(\d+)(?:\/(end|remove))?$/);
      if (match && req.method === "PATCH") {
        const existing = prepare("SELECT * FROM student_restrictions WHERE id = ?").get(Number(match[1]));
        if (!existing) fail("Restriction not found.", 404);
        if (existing.removed_at) fail("Removed entries cannot be changed.");
        const body = await readBody(req);
        const operation = match[2];
        if (operation) {
          if (operation === "end" && (existing.ended_at || view(existing).state === "expired")) fail("This restriction has already ended.");
          const reason = text(body.reason, 1000, "Reason", true);
          const prefix = operation === "end" ? "ended" : "removed";
          prepare(`UPDATE student_restrictions SET ${prefix}_at = ?, ${prefix}_by = ?, ${prefix}_reason = ? WHERE id = ?`)
            .run(new Date().toISOString(), actor, reason, existing.id);
        } else {
          if (!["active", "scheduled"].includes(view(existing).state)) fail("Ended or expired restrictions are read-only. Add a new restriction if needed.");
          const p = payload(body, existing.student_id, existing.id, existing);
          prepare("UPDATE student_restrictions SET restriction_type_id = ?, label = ?, starts_on = ?, ends_on = ?, notes = ? WHERE id = ?")
            .run(p.type.id, p.type.id === existing.restriction_type_id ? existing.label : p.type.label, p.starts, p.ends, p.notes, existing.id);
        }
        audit("restriction", existing.id, `${actor} ${operation || "edited"} restriction. Before: ${JSON.stringify(existing)}. Change: ${JSON.stringify(body)}.`);
        sendJson(res, 200, { ok: true }); return true;
      }
    }
    fail("Restriction endpoint not found.", 404);
  }
  return { migrate, forStudent, list, types, handleApi };
}
module.exports = { createRestrictions };
