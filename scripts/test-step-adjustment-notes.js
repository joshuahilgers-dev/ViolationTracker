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

  console.log("Step adjustment notes integration test passed.");
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
