const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.join(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tvt-document-test-"));
const documentDirectory = path.join(tempRoot, "documents");
const port = 44000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
let server;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Test server did not start.\n${output}`)), 15_000);
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
  const response = await fetch(baseUrl + urlPath, {
    method,
    headers: { "content-type": "application/json" },
    body: body && JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function fileContents(urlPath) {
  const response = await fetch(baseUrl + urlPath);
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    contents: Buffer.from(await response.arrayBuffer())
  };
}

async function run() {
  server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      AUTH_DISABLED: "1",
      DEV_USER_ROLE: "tech_admin",
      DB_PATH: path.join(tempRoot, "test.sqlite"),
      DOCUMENT_DIR: documentDirectory,
      TEMPLATE_DIR: path.join(tempRoot, "templates"),
      REPAIR_PHOTO_DIR: path.join(tempRoot, "repair-photos"),
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer(server);

  let result = await request("/api/students", "POST", {
    first_name: "Document", last_name: "Test", student_number: "DOC-TEST"
  });
  assert.equal(result.status, 201);
  result = await request("/api/students");
  const studentId = result.body[0].id;

  const wrongFile = Buffer.from("wrong file for this student");
  result = await request(`/api/students/${studentId}/documents`, "POST", {
    document_type: "other",
    title: "Wrong attachment",
    original_name: "wrong.pdf",
    mime_type: "application/pdf",
    content_base64: wrongFile.toString("base64")
  });
  assert.equal(result.status, 201);
  const documentId = result.body.id;
  const documentUrl = result.body.url;
  const uploadedFile = await fileContents(documentUrl);
  assert.deepEqual(uploadedFile.contents, wrongFile);
  assert.equal(uploadedFile.cacheControl, "private, no-store");

  const correctedFile = Buffer.from("corrected file for this student");
  result = await request(`/api/documents/${documentId}`, "PUT", {
    title: "Correct attachment",
    original_name: "correct.pdf",
    mime_type: "application/pdf",
    content_base64: correctedFile.toString("base64")
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.id, documentId);
  assert.deepEqual((await fileContents(documentUrl)).contents, correctedFile);
  result = await request(`/api/students/${studentId}`);
  assert.equal(result.body.documents.length, 1);
  assert.equal(result.body.documents[0].original_name, "correct.pdf");
  assert.equal(result.body.documents[0].title, "Correct attachment");
  assert.equal(fs.readdirSync(documentDirectory).length, 1);

  result = await request(`/api/documents/${documentId}`, "PUT", {
    title: "Rejected update",
    original_name: "unsafe.exe",
    content_base64: correctedFile.toString("base64")
  });
  assert.equal(result.status, 400);
  assert.deepEqual((await fileContents(documentUrl)).contents, correctedFile);

  result = await request(`/api/documents/${documentId}`, "DELETE");
  assert.equal(result.status, 200);
  result = await request(`/api/students/${studentId}`);
  assert.deepEqual(result.body.documents, []);
  assert.equal((await fileContents(documentUrl)).status, 404);
  assert.deepEqual(fs.readdirSync(documentDirectory), []);
  assert.equal((await fetch(baseUrl + `/api/students/${studentId}/history.pdf`)).status, 200);

  result = await request("/api/bootstrap");
  const infraction = result.body.infractionTypes.find(item => item.severity === "minor");
  result = await request("/api/incidents", "POST", {
    student_id: studentId,
    occurred_on: "2026-09-22",
    reported_by: "test@wrps.net",
    severity: "minor",
    infraction_type_id: infraction.id,
    entry_type: "warning"
  });
  assert.equal(result.status, 201);
  const incidentId = result.body.id;
  result = await request(`/api/incidents/${incidentId}/documents`, "POST", {
    original_name: "reflection.pdf",
    mime_type: "application/pdf",
    content_base64: correctedFile.toString("base64")
  });
  assert.equal(result.status, 201);
  const incidentDocumentId = result.body.id;
  result = await request(`/api/documents/${incidentDocumentId}`, "PUT", {
    title: "Digital Impact Reflection",
    original_name: "revised-reflection.pdf",
    mime_type: "application/pdf",
    content_base64: wrongFile.toString("base64")
  });
  assert.equal(result.status, 200);
  result = await request(`/api/students/${studentId}`);
  assert.equal(result.body.documents[0].incident_id, incidentId);
  assert.equal(result.body.documents[0].original_name, "revised-reflection.pdf");
  result = await request(`/api/documents/${incidentDocumentId}`, "DELETE");
  assert.equal(result.status, 200);
  result = await request(`/api/students/${studentId}`);
  assert.equal(result.body.documents.length, 0);
  assert.equal(result.body.incidents.length, 1);
  assert.deepEqual(fs.readdirSync(documentDirectory), []);

  console.log("Student document update/delete integration test passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (server && server.exitCode === null && !server.killed) {
    server.kill();
    await new Promise(resolve => server.once("exit", resolve));
  }
  const tempDirectory = path.resolve(os.tmpdir()) + path.sep;
  if (path.resolve(tempRoot).startsWith(tempDirectory)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
