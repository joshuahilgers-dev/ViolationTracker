const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const initSqlJs = require("sql.js");
const root = path.join(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tvt-return-dates-"));
const dbPath = path.join(temp, "test.sqlite");
const port = 46000 + Math.floor(Math.random() * 1000);
let child;
async function start(role = "tech_staff") {
  child = spawn(process.execPath, ["server.js"], { cwd: root, env: { ...process.env,
    AUTH_DISABLED: "1", DEV_USER_ROLE: role, DEV_USER_EMAIL: `${role}@wrps.net`,
    DB_PATH: dbPath, PORT: String(port), SMTP_HOST: "", TEMPLATE_DIR: path.join(temp, "templates"),
    DOCUMENT_DIR: path.join(temp, "documents"), REPAIR_PHOTO_DIR: path.join(temp, "photos")
  }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(output || "Startup timeout")), 15000);
    child.stdout.on("data", data => { output += data; if (output.includes("Technology tracker running")) { clearTimeout(timer); resolve(); } });
    child.stderr.on("data", data => { output += data; });
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
}
async function stop() {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once("exit", resolve)); child.kill(); await exited;
  }
}
async function request(route, method = "GET", body, expected = 200) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await res.json(); assert.equal(res.status, expected, `${method} ${route}: ${JSON.stringify(result)}`); return result;
}
async function run() {
  await start();
  await request("/api/auth/me");
  await request("/api/students", "POST", { first_name: "Return", last_name: "Preview", student_number: "RETURN-TEST" }, 201);
  const sid = (await request("/api/students"))[0].id;
  const detail = () => request(`/api/students/${sid}`);
  const adjust = target_step => request(`/api/students/${sid}/step-adjustments`, "POST", { target_step, reason: "Test return date workflow" }, 201);
  const edit = (id, date, expected = 200) => request(`/api/actions/${id}/return-date`, "PATCH", { return_date: date }, expected);
  await adjust("device_restriction");
  let student = await detail();
  const restriction = student.actions.find(a => a.action_type === "device_restriction");
  const reentry = student.actions.find(a => a.action_type === "reentry_check");
  await request(`/api/actions/${restriction.id}`, "PATCH", { status: "complete", asset_tag: "TEST-123", return_date: "2099-01-10" });
  assert.equal((await detail()).actions.find(a => a.id === reentry.id).due_on, "2099-01-10");
  await request(`/api/actions/${reentry.id}`, "PATCH", { status: "complete", return_date: "2099-01-11" });
  student = await detail();
  const returnAction = student.actions.find(a => a.action_type === "return_chromebook");
  assert.equal(returnAction.step_adjustment_id, restriction.step_adjustment_id);
  assert.equal(student.chromebook_return_action_id, returnAction.id);
  const completedOn = student.actions.find(a => a.id === restriction.id).completed_on;
  await edit(returnAction.id, "2099-02-20");
  student = await detail();
  assert.equal(student.status.key, "device_restriction");
  assert.equal(Number(student.counts.total_count), 0);
  assert.equal(student.device_asset_tag, "TEST-123");
  assert.equal(student.chromebook_return_on, "2099-02-20");
  assert.equal(student.device_restriction_supervision_state, "active");
  for (const action of student.actions) assert.equal(action.due_on, "2099-02-20");
  assert.equal(student.actions.find(a => a.id === restriction.id).status, "complete");
  assert.equal(student.actions.find(a => a.id === restriction.id).completed_on, completedOn);
  assert.equal(student.actions.find(a => a.id === returnAction.id).status, "open");
  await edit(restriction.id, "2000-01-01");
  assert.equal((await detail()).device_restriction_supervision_state, "satisfied");
  await edit(returnAction.id, "2099-03-01");
  assert.equal((await detail()).device_restriction_supervision_state, "active");
  for (const date of ["", "2026-02-30", "2026-13-01", "tomorrow"]) await edit(returnAction.id, date, 400);
  await edit(999999, "2099-03-01", 404);
  // Verify support for legacy adjustment return records that lack the group link.
  await stop();
  const SQL = await initSqlJs({ locateFile: file => path.join(root, "node_modules/sql.js/dist", file) });
  let db = new SQL.Database(fs.readFileSync(dbPath));
  db.run("UPDATE actions SET step_adjustment_id = NULL WHERE id = ?", [returnAction.id]);
  fs.writeFileSync(dbPath, Buffer.from(db.export())); db.close();
  await start();
  await edit(returnAction.id, "2099-04-01");
  student = await detail();
  assert.equal(student.actions.find(a => a.id === returnAction.id).step_adjustment_id, restriction.step_adjustment_id);
  for (const action of student.actions) assert.equal(action.due_on, "2099-04-01");
  await adjust("monitor");
  await adjust("device_restriction");
  student = await detail();
  const newer = student.actions.find(a => a.action_type === "device_restriction" && a.id !== restriction.id);
  await edit(newer.id, "2099-05-01");
  assert.equal((await detail()).actions.find(a => a.id === restriction.id).due_on, "2099-04-01", "Prior cycle stays unchanged");
  // Incident-based groups use the same date editing path.
  await adjust("success_contract");
  const bootstrap = await request("/api/bootstrap");
  const type = bootstrap.infractionTypes.find(t => t.active && t.severity === "minor");
  await request("/api/incidents", "POST", { student_id: sid, occurred_on: "2026-10-26", reported_by: "Test staff", severity: "minor", infraction_type_id: type.id }, 201);
  student = await detail();
  const incidentRestriction = student.actions.find(a => a.action_type === "device_restriction" && a.incident_id);
  await edit(incidentRestriction.id, "2099-06-01");
  student = await detail();
  assert.equal(student.chromebook_return_on, "2099-06-01");
  for (const action of student.actions.filter(a => a.incident_id === incidentRestriction.incident_id)) assert.equal(action.due_on, "2099-06-01");
  await adjust("reflection");
  const reflection = (await detail()).actions.find(a => a.action_type === "digital_reflection");
  await edit(reflection.id, "2099-06-01", 400);
  await stop(); await start("teacher");
  await edit(incidentRestriction.id, "2099-07-01", 403);
  await stop(); await start("tech_admin");
  assert.equal((await detail()).actions.find(a => a.id === incidentRestriction.id).due_on, "2099-06-01", "Date persists after restart");
  await stop();
  db = new SQL.Database(fs.readFileSync(dbPath));
  const audit = db.exec("SELECT message FROM audit_log WHERE entity_type = 'action'")[0].values.flat().join("\n");
  assert.match(audit, /Chromebook return date changed from 2099-01-11 to 2099-02-20 by tech_staff@wrps.net/);
  db.close();
  console.log("Chromebook return date integration test passed.");
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await stop(); fs.rmSync(temp, { recursive: true, force: true });
});
