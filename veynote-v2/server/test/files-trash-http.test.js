const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.JWT_SECRET = "files-trash-test-secret-012345678901234";
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-files-trash-test-"));
process.env.UPLOAD_DIR = uploadDir;
const rows = new Map();
const match = (row, where) => Object.entries(where).every(([key, expected]) => {
  if (expected && typeof expected === "object" && !(expected instanceof Date) && Object.hasOwn(expected, "not")) {
    return expected.not === null ? row[key] != null : row[key] !== expected.not;
  }
  return row[key] === expected;
});
const copy = row => row ? { ...row } : null;
const db = { attachment: { async findMany() { return []; } }, fileNode: {
  async findFirst({ where }) { return copy([...rows.values()].find(row => match(row, where))); },
  async findMany({ where, orderBy }) {
    const found = [...rows.values()].filter(row => match(row, where));
    const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
    for (const order of orders.reverse()) {
      if (!order) continue;
      const [field, direction] = Object.entries(order)[0];
      found.sort((a, b) => ((a[field] > b[field]) - (a[field] < b[field])) * (direction === "desc" ? -1 : 1));
    }
    return found.map(copy);
  },
  async updateMany({ where, data }) {
    let count = 0;
    for (const row of rows.values()) if (match(row, where)) { Object.assign(row, data); count++; }
    return { count };
  },
  async deleteMany({ where }) {
    const root = [...rows.values()].find(row => match(row, where));
    if (!root) return { count: 0 };
    const descendants = id => {
      for (const child of [...rows.values()].filter(row => row.parentId === id)) descendants(child.id);
      rows.delete(id);
    };
    descendants(root.id);
    return { count: 1 };
  },
} };
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };
const { signToken } = require("../src/utils/jwt");
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/files", require("../src/routes/files.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/files`;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(uploadDir, { recursive: true, force: true });
});
function seed(id, extras = {}) {
  const row = { id, userId: "alice", parentId: null, name: id, isDirectory: false, storedName: null, mimeType: null, sizeBytes: null, deletedAt: null, createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-01"), ...extras };
  rows.set(id, row); return row;
}
async function request(route, method = "GET", user = "alice") {
  const response = await fetch(`${base}${route}`, { method, headers: { Authorization: `Bearer ${signToken(user)}` } });
  return { status: response.status, body: await response.json() };
}

test("a deleted folder hides its whole tree, preserves bytes, and restores in place", async () => {
  const storedName = `${"a".repeat(32)}.pdf`;
  fs.writeFileSync(path.join(uploadDir, storedName), "retained document");
  seed("project", { name: "Project", isDirectory: true });
  seed("research", { parentId: "project", name: "Research", isDirectory: true });
  seed("source", { parentId: "research", name: "source.pdf", storedName, mimeType: "application/pdf", sizeBytes: 17 });
  assert.deepEqual((await request("/root")).body.children.map(item => item.id), ["project"]);
  assert.equal((await request("/project")).body.children[0].id, "research");

  assert.equal((await request("/project", "DELETE")).status, 200);
  assert.ok(rows.get("project").deletedAt instanceof Date);
  assert.equal(fs.existsSync(path.join(uploadDir, storedName)), true);
  assert.deepEqual((await request("/root")).body.children, []);
  assert.equal((await request("/project")).status, 404);
  assert.equal((await request("/research")).status, 404);
  assert.equal((await request("/source", "PATCH")).status, 404);
  assert.deepEqual((await request("/trash")).body.items.map(item => item.id), ["project"]);
  assert.deepEqual((await request("/trash", "GET", "bob")).body.items, []);
  assert.equal((await request("/trash/project/restore", "PATCH", "bob")).status, 404);
  assert.equal((await request("/trash/project/permanent", "DELETE", "bob")).status, 404);

  assert.equal((await request("/trash/project/restore", "PATCH")).status, 200);
  assert.equal((await request("/research")).body.children[0].id, "source");
  assert.equal((await request("/trash/project/permanent", "DELETE")).status, 404);
  assert.equal(fs.existsSync(path.join(uploadDir, storedName)), true);
});

test("individual recovery respects its original parent, and purge is Trash-only", async () => {
  const storedName = `${"b".repeat(32)}.txt`;
  fs.writeFileSync(path.join(uploadDir, storedName), "recovery copy");
  seed("contracts", { name: "Contracts", isDirectory: true });
  seed("contract", { parentId: "contracts", name: "contract.txt", storedName, mimeType: "text/plain" });
  assert.equal((await request("/trash/contract/permanent", "DELETE")).status, 404);
  assert.equal((await request("/contract", "DELETE")).status, 200);
  assert.equal((await request("/contracts", "DELETE")).status, 200);
  assert.equal((await request("/trash/contract/restore", "PATCH")).status, 409);
  assert.equal((await request("/trash/contracts/restore", "PATCH")).status, 200);
  assert.equal((await request("/trash/contract/restore", "PATCH")).status, 200);
  assert.equal((await request("/contracts")).body.children[0].id, "contract");
  assert.equal((await request("/contract", "DELETE")).status, 200);
  assert.equal((await request("/trash/contract/permanent", "DELETE")).status, 200);
  for (let attempt = 0; attempt < 30 && fs.existsSync(path.join(uploadDir, storedName)); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(fs.existsSync(path.join(uploadDir, storedName)), false);
  assert.equal(rows.has("contract"), false);
});
