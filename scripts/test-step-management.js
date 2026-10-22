const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const initSqlJs = require("sql.js");

const root = path.join(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tvt-adjustment-notes-test-"));
const dbPath = path.join(tempRoot, "test.sqlite");
const port = 44000 + Math.floor(Math.random() * 1000);
let server;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Test server did not start in time.")), 15_000);
    let output = "";
    child.stdout.on("data", chunk => {
      output += chunk.toString();
      if (output.includes("Technology tracker running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on("data", chunk => { output += chunk.toString(); });
    child.once("exit", code => {
      clearTimeout(timeout);
      reject(new Error(`Test server exited with code ${code}.\n${output}`));
    });
  });
}

async function request(urlPath, method = "GET", body) {
  const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function run() {
  server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      AUTH_DISABLED: "1",
      DEV_USER_ROLE: "tech_admin",
      DB_PATH: dbPath,
      DOCUMENT_DIR: path.join(tempRoot, "documents"),
      TEMPLATE_DIR: path.join(tempRoot, "templates"),
      REPAIR_PHOTO_DIR: path.join(tempRoot, "repair-photos"),
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer(server);

  let result = await request("/api/students", "POST", {
    first_name: "Adjustment", last_name: "Test", student_number: "ADJUSTMENT-TEST"
  });
  assert.equal(result.status, 201);
  result = await request("/api/students");
  const studentId = result.body[0].id;

  result = await request(`/api/students/${studentId}/step-adjustments`, "POST", {
    target_step: "monitor", reason: "Initial monitor note"
  });
  assert.equal(result.status, 201);
  const firstId = result.body.id;

  result = await request(`/api/students/${studentId}/step-adjustments`, "POST", {
    target_step: "reflection", reason: "Original reflection note"
  });
  assert.equal(result.status, 201);
  const secondId = result.body.id;

  result = await request(`/api/step-adjustments/${secondId}`, "PATCH", {
    notes: "Corrected reflection note"
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.notes, "Corrected reflection note");

  result = await request(`/api/students/${studentId}`);
  assert.equal(result.status, 200);
  const updated = result.body.stepAdjustments.find(item => item.id === secondId);
  const superseded = result.body.stepAdjustments.find(item => item.id === firstId);
  assert.equal(updated.reason, "Corrected reflection note");
  assert.equal(updated.target_step, "reflection");
  assert.equal(superseded.ended_reason, `Superseded by adjustment #${secondId}: Corrected reflection note`);
  assert.equal(result.body.status.key, "reflection");

  result = await request(`/api/step-adjustments/${secondId}`, "PATCH", { notes: "   " });
  assert.equal(result.status, 400);
  result = await request("/api/step-adjustments/999999", "PATCH", { notes: "Missing" });
  assert.equal(result.status, 404);

  const SQL = await initSqlJs({
    locateFile: file => path.join(root, "node_modules", "sql.js", "dist", file)
  });
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const audit = db.exec(`SELECT message FROM audit_log WHERE entity_type = 'step_adjustment' AND entity_id = ${secondId} ORDER BY id`)[0].values.map(row => row[0]);
  assert.match(audit.at(-1), /Original reflection note/);
  assert.match(audit.at(-1), /Corrected reflection note/);
  db.close();

  const bootstrap = (await request("/api/bootstrap")).body;
  const minor = bootstrap.infractionTypes.find(item => item.severity === "minor" && item.active);
  const major = bootstrap.infractionTypes.find(item => item.severity === "major" && item.active);
  const detail = async () => (await request(`/api/students/${studentId}`)).body;
  const adjust = async target_step => {
    const response = await request(`/api/students/${studentId}/step-adjustments`, "POST", {
      target_step, reason: `Admin completed review; move to ${target_step}.`
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal((await detail()).status.key, target_step);
    return response.body.id;
  };
  const incident = async (severity = "minor", entry_type = "violation") => {
    const response = await request("/api/incidents", "POST", {
      student_id: studentId, occurred_on: "2026-10-22", reported_by: "Test Staff",
      severity, infraction_type_id: (severity === "minor" ? minor : major).id, entry_type
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body;
  };

  // Reach Admin review through actual violations, then lower below that calculation.
  for (let index = 0; index < 5; index++) await incident();
  assert.equal((await detail()).status.key, "admin_review");
  const countBefore = (await detail()).violation_count;
  await adjust("success_contract");
  let student = await detail();
  assert.equal(student.automaticStatus.key, "admin_review");
  assert.equal(student.violation_count, countBefore);
  assert(student.actions.some(action => action.action_type === "success_contract" && action.status === "open"));
  assert(student.actions.some(action => action.action_type === "return_chromebook" && action.status === "open"));
  assert(!student.actions.some(action => action.action_type === "admin_review" && action.status === "open"));
  await incident("minor", "warning");
  assert.equal((await detail()).status.key, "success_contract");
  const restriction = await incident();
  assert.equal(restriction.currentStatus.key, "device_restriction");
  assert.equal((await incident()).currentStatus.key, "admin_review");

  await adjust("no_violations");
  assert.equal((await incident()).currentStatus.key, "monitor");
  assert.equal((await incident()).currentStatus.key, "reflection");
  assert.equal((await incident()).currentStatus.key, "success_contract");
  await adjust("monitor");
  assert.equal((await incident()).currentStatus.key, "reflection");
  await adjust("no_violations");
  assert.equal((await incident("major")).currentStatus.key, "success_contract");
  await adjust("reflection");
  const contract = await incident();
  assert.equal(contract.currentStatus.key, "success_contract");
  result = await request(`/api/incidents/${contract.id}/cancel`, "POST", { reason: "Entered in error" });
  assert.equal(result.status, 200);
  assert.equal((await detail()).status.key, "reflection");

  // Ending a downward adjustment restores the full history calculation and its work.
  const downwardId = await adjust("monitor");
  result = await request(`/api/step-adjustments/${downwardId}/end`, "POST", { reason: "Restore calculated step" });
  assert.equal(result.status, 200);
  assert.equal((await detail()).status.key, "admin_review");
  assert((await detail()).actions.some(action => action.action_type === "admin_review" && action.status === "open"));
  const deleteId = await adjust("monitor");
  result = await request(`/api/step-adjustments/${deleteId}`, "DELETE", {});
  assert.equal(result.status, 200);
  assert.equal((await detail()).status.key, "admin_review");
  await adjust("device_restriction");
  await adjust("admin_review");
  result = await request(`/api/students/${studentId}/step-adjustments`, "POST", { target_step: "constructor", reason: "Invalid" });
  assert.equal(result.status, 400);
  result = await request(`/api/students/${studentId}/step-adjustments`, "POST", { target_step: "monitor", reason: " " });
  assert.equal(result.status, 400);
  await adjust("no_violations");
  result = await request("/api/terms/start", "POST", { confirmation: "START NEW TERM", name: "Next test term" });
  assert.equal(result.status, 200);
  student = await detail();
  assert.equal(student.status.key, "no_violations");
  assert.equal(student.activeAdjustment, null);

  console.log("Step management integration test passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (server && server.exitCode === null && !server.killed) {
    server.kill();
    await new Promise(resolve => server.once("exit", resolve));
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

