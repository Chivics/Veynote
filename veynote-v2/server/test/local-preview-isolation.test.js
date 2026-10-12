const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("a preview loads its selected environment and storage without reading the deployment .env", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-preview-"));
  try {
    fs.writeFileSync(path.join(directory, ".env"), "DEPLOYMENT_ONLY_VALUE=must-not-load\n");
    fs.writeFileSync(path.join(directory, "preview.env"),
      "PREVIEW_ONLY_VALUE=isolated\nRUST_LOG=info\nDATABASE_URL=mysql://preview@127.0.0.1:3307/veynote_preview\n");
    const loader = path.resolve(__dirname, "../src/utils/loadEnvironment.js");
    const storage = path.resolve(__dirname, "../src/utils/storagePaths.js");
    const env = { ...process.env, VEYNOTE_ENV_FILE: path.join(directory, "preview.env"),
      PREVIEW_ONLY_VALUE: "inherited", RUST_LOG: "warn",
      DATABASE_URL: "mysql://inherited@127.0.0.1:3306/elsewhere",
      UPLOAD_DIR: path.join(directory, "files"), WILL_UPLOAD_DIR: path.join(directory, "estate") };
    delete env.DEPLOYMENT_ONLY_VALUE;
    const result = spawnSync(process.execPath, ["-e", `
      require(${JSON.stringify(loader)});
      const paths = require(${JSON.stringify(storage)});
      require("node:assert/strict").equal(process.env.PREVIEW_ONLY_VALUE, "isolated");
      require("node:assert/strict").equal(process.env.RUST_LOG, "info");
      require("node:assert/strict").equal(new URL(process.env.DATABASE_URL).pathname, "/veynote_preview");
      require("node:assert/strict").equal(process.env.DEPLOYMENT_ONLY_VALUE, undefined);
      require("node:assert/strict").equal(paths.uploadRoot, process.env.UPLOAD_DIR);
      require("node:assert/strict").equal(paths.willUploadRoot, process.env.WILL_UPLOAD_DIR);
    `], { cwd: directory, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const missing = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(loader)})`], {
      cwd: directory, env: { ...env, VEYNOTE_ENV_FILE: path.join(directory, "missing.env") }, encoding: "utf8",
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /environment file could not be read/);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.match(path.basename(directory), /^veynote-preview-/);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
