const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Some hosting deployments reuse a checked-in node_modules directory. A
// Prisma Client generated on Windows cannot safely serve a Linux deployment.
// Regenerate before the application imports @prisma/client or any route.
function ensurePrismaClient({ root = path.resolve(__dirname, "../.."), platform = process.platform, nodeEnv = process.env.NODE_ENV, execute = spawnSync, cliPath } = {}) {
  const sourceSchema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8").replace(/\r\n/g, "\n");
  let generatedSchema = "";
  try {
    generatedSchema = fs.readFileSync(path.join(root, "node_modules/.prisma/client/schema.prisma"), "utf8").replace(/\r\n/g, "\n");
  } catch { /* A fresh install has no generated client yet. */ }

  const cli = cliPath || require.resolve("prisma/build/index.js", { paths: [root] });
  function run(...args) {
    const result = execute(process.execPath, [cli, ...args], { cwd: root, env: process.env, stdio: "inherit", timeout: 120000 });
    if (result.error || result.status !== 0) throw new Error(`Prisma ${args.join(" ")} failed before the API could start.`);
  }

  if (platform === "linux" || sourceSchema !== generatedSchema) run("generate");
  if (nodeEnv === "production") run("migrate", "deploy");
}

module.exports = { ensurePrismaClient };
