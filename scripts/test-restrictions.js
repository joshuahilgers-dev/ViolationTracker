const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const initSqlJs = require("sql.js");
const root = path.join(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tvt-restrictions-"));
const dbPath = path.join(temp, "test.sqlite");
const port = Number(process.env.TEST_PORT || 45216);
let child;
async function start(role) {
  child = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env,
    AUTH_DISABLED: "1", DEV_USER_ROLE: role, DEV_USER_EMAIL: `${role}@wrps.net`,
    DB_PATH: dbPath, PORT: String(port), SMTP_HOST: "", TEMPLATE_DIR: path.join(temp, "templates"),
    DOCUMENT_DIR: path.join(temp, "documents"), REPAIR_PHOTO_DIR: path.join(temp, "photos")
  }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    let output = ""; const timer = setTimeout(() => reject(new Error(output || "Startup timeout")), 15000);
    child.stdout.on("data", data => { output += data; if (output.includes("Technology tracker running")) { clearTimeout(timer); resolve(); } });
    child.stderr.on("data", data => { output += data; });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
}
async function stop() {
  if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited; }
}
async function request(route, method = "GET", body, expected = 200) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await res.json(); assert.equal(res.status, expected, `${method} ${route}: ${JSON.stringify(result)}`); return result;
}
async function run() {
  await start("tech_admin");
  await request("/api/auth/me");
  const student = await request("/api/students", "POST", { first_name: "Preview", last_name: "Student", grade: "7", student_number: "RESTRICTION-TEST" }, 201);
  const students = await request("/api/students"); const sid = students[0].id;
  const types = await request("/api/restriction-types"); assert.equal(types.length, 2);
  const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const body = { student_id: sid, restriction_type_id: types[0].id, starts_on: "2020-01-01", ends_on: today, notes: "Email access is disabled. Please use Canvas for class communication." };
  const first = await request("/api/restrictions", "POST", body, 201);
  await request("/api/restrictions", "POST", body, 409);
  await request("/api/restrictions", "POST", { ...body, starts_on: "2026-02-30" }, 400);
  await request("/api/restrictions", "POST", { ...body, starts_on: "2099-01-01", ends_on: "2000-01-01" }, 400);
  await request("/api/restrictions", "POST", { ...body, restriction_type_id: 99999 }, 400);
  const second = await request("/api/restrictions", "POST", { ...body, restriction_type_id: types[1].id, ends_on: "" }, 201);
  const initial = await request(`/api/students/${sid}`);
  assert.equal(initial.status.key, "no_violations"); assert.equal(Number(initial.counts.total_count), 0); assert.equal(initial.actions.length, 0);
  let teacher = await request("/api/teacher-dashboard"); assert.equal(teacher.students.length, 0); assert.equal(teacher.restrictions.length, 2);
  assert.equal(teacher.restrictions[0].state, "active", "End date is inclusive");
  await request(`/api/restrictions/${first.id}`, "PATCH", { ...body, notes: "Updated teacher-visible note." });
  await request(`/api/restriction-types/${types[0].id}`, "PUT", { label: "No Email Access (renamed)", description: "Email disabled" });
  assert.equal((await request(`/api/students/${sid}`)).restrictions.find(item => item.id === first.id).label, types[0].label, "Assignment label is preserved");
  await request(`/api/restriction-types/${types[0].id}`, "DELETE");
  await request("/api/restrictions", "POST", { ...body, starts_on: "2099-01-01", ends_on: "" }, 400);
  // Existing assignments retain their type after retirement and can still be edited.
  await request(`/api/restrictions/${first.id}`, "PATCH", { ...body, notes: "Updated teacher-visible note." });
  await request(`/api/restrictions/${second.id}/end`, "PATCH", { reason: "Access restored" });
  await request(`/api/restrictions/${second.id}`, "PATCH", body, 400);
  await request(`/api/restrictions/${second.id}/remove`, "PATCH", { reason: "Incorrect assignment" });
  await request(`/api/restrictions/${second.id}`, "PATCH", body, 400);
  const scheduled = await request("/api/restrictions", "POST", { ...body, restriction_type_id: types[1].id, starts_on: "2099-01-01", ends_on: "" }, 201);
  const expired = await request("/api/restrictions", "POST", { ...body, restriction_type_id: types[1].id, starts_on: "2000-01-01", ends_on: "2000-02-01" }, 201);
  let all = await request("/api/restrictions");
  assert.equal(all.find(item => item.id === scheduled.id).state, "scheduled");
  assert.equal(all.find(item => item.id === expired.id).state, "expired");
  await request("/api/terms/start", "POST", { confirmation: "START NEW TERM", name: "Restriction rollover test" });
  assert.equal((await request("/api/teacher-dashboard")).restrictions.length, 1, "Restrictions survive new term");
  await stop();
  await start("teacher"); await request("/api/auth/me");
  teacher = await request("/api/teacher-dashboard"); assert.equal(teacher.restrictions.length, 1);
  assert.equal(teacher.restrictions[0].notes, "Updated teacher-visible note.");
  assert.ok(!("created_by" in teacher.restrictions[0]));
  assert.equal((await request(`/api/teacher-dashboard/students/${sid}`)).restrictions.length, 1);
  await request("/api/restrictions", "POST", body, 403);
  await request(`/api/restrictions/${first.id}/end`, "PATCH", { reason: "Forbidden" }, 403);
  await request("/api/restriction-types", "POST", { label: "Forbidden" }, 403);
  await request("/api/bootstrap", "GET", undefined, 403);
  await stop();
  await start("tech_staff"); await request("/api/auth/me");
  await request("/api/restriction-types", "POST", { label: "Forbidden" }, 403);
  await request(`/api/restrictions/${scheduled.id}/end`, "PATCH", { reason: "Canceled scheduled restriction" });
  await stop();
  await start("tech_admin"); await request("/api/auth/me");
  const restartedTypes = await request("/api/restriction-types"); assert.equal(restartedTypes.length, 2); assert.equal(restartedTypes.find(item => item.id === types[0].id).active, 0);
  const SQL = await initSqlJs({ locateFile: file => path.join(root, "node_modules/sql.js/dist", file) });
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const audit = db.exec("SELECT message FROM audit_log WHERE entity_type = 'restriction'")[0].values.flat().join("\n");
  assert.match(audit, /Updated teacher-visible note/); assert.match(audit, /Incorrect assignment/); assert.match(audit, /Access restored/);
  db.close();
  console.log("Restrictions integration passed: lifecycle, date boundaries, duplicate prevention, independent counts, term rollover, history, audit, roles, retirement and restart.");
  if (process.argv.includes("--preview")) {
    if (process.argv.includes("--teacher")) { await stop(); await start("teacher"); }
    console.log(`PREVIEW http://127.0.0.1:${port} (synthetic data only)`);
    await new Promise(resolve => process.once("SIGINT", resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await stop(); fs.rmSync(temp, { recursive: true, force: true });
});
