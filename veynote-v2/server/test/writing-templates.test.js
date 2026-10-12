const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

process.env.JWT_SECRET = "writing-templates-test-secret-0123456789";
const { signToken } = require("../src/utils/jwt");
const rows = new Map();
const source = { id: "ordinary", userId: "alice", kind: "NOTE", isTrashed: false, isLocked: false, isWill: false, content: "<h2>Purpose</h2><p>Write here.</p>" };
let sequence = 0;
const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
const db = {
  note: { async findFirst({ where }) { return matches(source, where) ? { content: source.content } : null; } },
  writingTemplate: {
    async findMany({ where }) { return [...rows.values()].filter(row => matches(row, where)); },
    async findFirst({ where }) { return [...rows.values()].find(row => matches(row, where)) || null; },
    async create({ data }) { const row = { id: `template-${++sequence}`, isTrashed: false, trashedAt: null, ...data }; rows.set(row.id, row); return row; },
    async update({ where, data }) { const row = { ...rows.get(where.id), ...data }; rows.set(row.id, row); return row; },
    async updateMany({ where, data }) { const row = [...rows.values()].find(entry => matches(entry, where)); if (!row) return { count: 0 }; rows.set(row.id, { ...row, ...data }); return { count: 1 }; },
    async deleteMany({ where }) { const row = [...rows.values()].find(entry => matches(entry, where)); if (!row) return { count: 0 }; rows.delete(row.id); return { count: 1 }; },
  },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };

let server, base;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/templates", require("../src/routes/writingTemplates.routes").router);
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/templates`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
const headers = userId => ({ Authorization: `Bearer ${signToken(userId)}`, "Content-Type": "application/json" });
const call = (path, method, userId, body) => fetch(base + path, { method, headers: headers(userId), ...(body && { body: JSON.stringify(body) }) });

test("personal writing templates are owned, portable, and recoverable through Trash", async () => {
  const created = await call("", "POST", "alice", { sourceNoteId: "ordinary", name: "Decision record", category: "Work", description: "A reusable brief" });
  assert.equal(created.status, 201);
  const { template } = await created.json();
  assert.match(template.content, /Purpose/);
  assert.equal((await call("", "GET", "bob")).status, 200);
  assert.deepEqual((await (await call("", "GET", "bob")).json()).templates, []);
  assert.equal((await call(`/${template.id}`, "GET", "bob")).status, 404);
  assert.equal((await call(`/${template.id}`, "DELETE", "bob")).status, 404);
  assert.equal((await call(`/${template.id}/permanent`, "DELETE", "alice")).status, 404);
  assert.equal((await call(`/${template.id}`, "DELETE", "alice")).status, 200);
  assert.equal((await call(`/${template.id}`, "GET", "alice")).status, 404);
  assert.equal((await (await call("?trashed=true", "GET", "alice")).json()).templates.length, 1);
  assert.equal((await call(`/${template.id}/restore`, "POST", "alice")).status, 200);
  assert.equal((await call(`/${template.id}`, "GET", "alice")).status, 200);
  await call(`/${template.id}`, "DELETE", "alice");
  assert.equal((await call(`/${template.id}/permanent`, "DELETE", "alice")).status, 200);
});

test("templates cannot be created from protected, foreign, or media-bound notes", async () => {
  assert.equal((await call("", "POST", "bob", { sourceNoteId: "ordinary", name: "Wrong owner" })).status, 404);
  source.isLocked = true;
  assert.equal((await call("", "POST", "alice", { sourceNoteId: "ordinary", name: "Locked" })).status, 404);
  source.isLocked = false;
  source.content = '<p>Chart</p><img src="/uploads/private.png">';
  const response = await call("", "POST", "alice", { sourceNoteId: "ordinary", name: "Media" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Remove images/);
  source.content = "<h2>Purpose</h2><p>Write here.</p>";
});
