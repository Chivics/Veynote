const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

process.env.JWT_SECRET = "tag-scope-test-only-secret-012345678901";
const { signToken } = require("../src/utils/jwt");
const queries = [];
const db = { note: { async findMany(query) { queries.push(query); return []; } } };
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };

let server;
let base;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/notes", require("../src/routes/notes.routes"));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/notes`;
});
test.after(() => new Promise(resolve => server.close(resolve)));

test("tag detail includes owned active and archived Notes and Journal without protected records", async () => {
  const response = await fetch(`${base}?scope=tag&tag=research`, { headers: { Authorization: `Bearer ${signToken("alice")}` } });
  assert.equal(response.status, 200);
  const where = queries.at(-1).where;
  assert.equal(where.userId, "alice");
  assert.equal(where.isTrashed, false);
  assert.equal(where.isLocked, false);
  assert.equal(where.isWill, false);
  assert.equal(where.kind, undefined);
  assert.equal(where.isArchived, undefined);
  assert.deepEqual(where.tags, { some: { tag: { name: "research" } } });
});

test("tag detail requires a tag and does not change ordinary active-only browsing", async () => {
  const headers = { Authorization: `Bearer ${signToken("alice")}` };
  const missing = await fetch(`${base}?scope=tag`, { headers });
  assert.equal(missing.status, 400);
  const active = await fetch(`${base}?scope=all`, { headers });
  assert.equal(active.status, 200);
  assert.equal(queries.at(-1).where.isArchived, false);
  assert.equal(queries.at(-1).where.kind, "NOTE");
});
