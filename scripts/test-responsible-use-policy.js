const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const root = path.join(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tvt-policy-test-"));
const templateDirectory = path.join(tempRoot, "templates");
const port = 43000 + Math.floor(Math.random() * 1000);
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

async function jsonRequest(urlPath, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function pdfPageCount(urlPath) {
  const response = await fetch(`http://127.0.0.1:${port}${urlPath}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /application\/pdf/);
  const document = await PDFDocument.load(await response.arrayBuffer());
  return document.getPageCount();
}

async function createPolicyPdf() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const label of ["Responsible Use Policy - Page 1", "Responsible Use Policy - Page 2"]) {
    const page = document.addPage([612, 792]);
    page.drawText(label, { x: 72, y: 700, size: 18, font });
  }
  return Buffer.from(await document.save());
}

async function run() {
  server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      AUTH_DISABLED: "1",
      DEV_USER_ROLE: "tech_admin",
      DB_PATH: path.join(tempRoot, "test.sqlite"),
      TEMPLATE_DIR: templateDirectory,
      REPAIR_PHOTO_DIR: path.join(tempRoot, "repair-photos"),
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer(server);

  let result = await jsonRequest("/api/students", {
    method: "POST",
    body: JSON.stringify({ first_name: "Policy", last_name: "Test", student_number: "RUP-1" })
  });
  assert.equal(result.response.status, 201);

  result = await jsonRequest("/api/students");
  assert.equal(result.response.status, 200);
  const studentId = result.body[0].id;
  const baseParentPages = await pdfPageCount(`/api/students/${studentId}/parent-history.pdf`);
  const baseFullPages = await pdfPageCount(`/api/students/${studentId}/history.pdf`);

  const policyBytes = await createPolicyPdf();
  result = await jsonRequest("/api/settings/responsible-use-policy", {
    method: "POST",
    body: JSON.stringify({
      original_name: "Responsible-Use-Policy.pdf",
      content_base64: policyBytes.toString("base64")
    })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.page_count, 2);
  assert.equal(await pdfPageCount(`/api/students/${studentId}/parent-history.pdf`), baseParentPages + 2);
  assert.equal(await pdfPageCount(`/api/students/${studentId}/history.pdf`), baseFullPages);

  result = await jsonRequest("/api/settings/responsible-use-policy", {
    method: "POST",
    body: JSON.stringify({
      original_name: "not-a-real-policy.pdf",
      content_base64: Buffer.from("not a PDF").toString("base64")
    })
  });
  assert.equal(result.response.status, 400);
  assert.equal(await pdfPageCount(`/api/students/${studentId}/parent-history.pdf`), baseParentPages + 2);

  result = await jsonRequest("/api/settings/responsible-use-policy", {
    method: "DELETE",
    body: JSON.stringify({})
  });
  assert.equal(result.response.status, 200);
  assert.equal(await pdfPageCount(`/api/students/${studentId}/parent-history.pdf`), baseParentPages);
  console.log("Responsible Use Policy integration test passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (server && !server.killed) server.kill();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});
