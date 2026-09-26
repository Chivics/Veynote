const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Some hosting deployments reuse a checked-in node_modules directory. A
// Prisma Client generated on Windows cannot safely serve a Linux deployment.
// Regenerate before the application imports @prisma/client or any route.
function ensurePrismaClient({ root = path.resolve(__dirname, "../.."), platform = process.platform, execute = spawnSync, cliPath } = {}) {
  const sourceSchema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8").replace(/\r\n/g, "\n");
  let generatedSchema = "";
  try {
    generatedSchema = fs.readFileSync(path.join(root, "node_modules/.prisma/client/schema.prisma"), "utf8").replace(/\r\n/g, "\n");
  } catch { /* A fresh install has no generated client yet. */ }

  let linuxEnginePresent = false;
  if (platform === "linux") {
    try {
      linuxEnginePresent = fs.readdirSync(path.join(root, "node_modules/.prisma/client"))
        .some(name => (name.startsWith("libquery_engine-") || name.startsWith("query-engine-")) && !name.includes("windows"));
    } catch { /* A fresh install has no engine yet. */ }
  }

  function run(...args) {
    const cli = cliPath || require.resolve("prisma/build/index.js", { paths: [root] });
    const result = execute(process.execPath, [cli, ...args], { cwd: root, env: process.env, stdio: "inherit", timeout: 45000 });
    if (result.error || result.status !== 0) throw new Error(`Prisma ${args.join(" ")} failed before the API could start.`);
  }

  if (sourceSchema !== generatedSchema || (platform === "linux" && !linuxEnginePresent)) run("generate");
}

module.exports = { ensurePrismaClient };
