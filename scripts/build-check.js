const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const requiredFiles = [
  "server.js",
  "public/index.html",
  "public/app.js",
  "public/styles.css"
];

for (const file of requiredFiles) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
}

for (const file of ["server.js", "public/app.js"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], {
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

const wasmPath = path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm");
if (!fs.existsSync(wasmPath)) {
  console.error("Missing sql.js runtime. Run `npm install` before `npm run build`.");
  process.exit(1);
}

console.log("Build check passed. Use `npm start` for production.");
