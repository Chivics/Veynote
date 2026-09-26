const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ensurePrismaClient } = require("../src/utils/prismaBootstrap");

test("deployment boot regenerates a stale Prisma Client before loading routes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-prisma-bootstrap-"));
  try {
    fs.mkdirSync(path.join(root, "prisma"));
    fs.mkdirSync(path.join(root, "node_modules/.prisma/client"), { recursive: true });
    fs.writeFileSync(path.join(root, "prisma/schema.prisma"), "model WebAuthnCredential { vaultEnabled Boolean }\n");
    fs.writeFileSync(path.join(root, "node_modules/.prisma/client/schema.prisma"), "model WebAuthnCredential { id String }\n");
    const calls = [];
    ensurePrismaClient({ root, platform: "linux", cliPath: "prisma-cli", execute(_node, args) {
      calls.push(args.slice(1));
      return { status: 0 };
    } });
    assert.deepEqual(calls, [["generate"]]);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a matching local client does not trigger a migration", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-prisma-bootstrap-"));
  try {
    fs.mkdirSync(path.join(root, "prisma"));
    fs.mkdirSync(path.join(root, "node_modules/.prisma/client"), { recursive: true });
    for (const file of ["prisma/schema.prisma", "node_modules/.prisma/client/schema.prisma"]) {
      fs.writeFileSync(path.join(root, file), "same schema\n");
    }
    ensurePrismaClient({ root, platform: "win32", cliPath: "prisma-cli", execute() {
      assert.fail("No Prisma command should run for an unchanged local schema");
    } });
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a matching Linux client with its library engine does not regenerate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-prisma-bootstrap-"));
  try {
    fs.mkdirSync(path.join(root, "prisma"));
    fs.mkdirSync(path.join(root, "node_modules/.prisma/client"), { recursive: true });
    for (const file of ["prisma/schema.prisma", "node_modules/.prisma/client/schema.prisma"]) {
      fs.writeFileSync(path.join(root, file), "same schema\n");
    }
    fs.writeFileSync(path.join(root, "node_modules/.prisma/client/libquery_engine-debian-openssl-1.1.x.so.node"), "");
    ensurePrismaClient({ root, platform: "linux", cliPath: "prisma-cli", execute() {
      assert.fail("No Prisma command should run when the Linux client is already present");
    } });
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
