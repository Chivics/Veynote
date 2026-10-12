const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

process.env.JWT_SECRET = "tag-management-test-secret-0123456789";
const { signToken } = require("../src/utils/jwt");

const tags = [
  { id: "source", userId: "alice", name: "research" },
  { id: "target", userId: "alice", name: "work" },
  { id: "foreign", userId: "bob", name: "private" },
  { id: "hidden", userId: "alice", name: "estate", isVisibleInIndex: false },
];
const links = [{ noteId: "n1", tagId: "source" }, { noteId: "n2", tagId: "source" }, { noteId: "n2", tagId: "target" }];

const db = {
  tag: {
    async findMany({ where }) {
      assert.equal(where.userId, "alice");
      assert.equal(where.OR[0].isVisibleInIndex, true);
      assert.equal(where.OR[1].notes.some.note.isLocked, false);
      return tags.filter(tag => tag.userId === "alice" && (tag.isVisibleInIndex || links.some(link => link.tagId === tag.id)))
        .map(tag => ({ ...tag, _count: { notes: links.filter(link => link.tagId === tag.id).length } }));
    },
    async findFirst({ where }) {
      return tags.find(tag => tag.id === where.id && tag.userId === where.userId)
        || tags.find(tag => tag.userId === where.userId && tag.name === where.name && (!where.id?.not || tag.id !== where.id.not))
        || null;
    },
    async update({ where, data }) { const tag = tags.find(item => item.id === where.id); Object.assign(tag, data); return { ...tag }; },
    async upsert({ where, create, update }) {
      let tag = tags.find(item => item.userId === where.userId_name.userId && item.name === where.userId_name.name);
      if (tag) Object.assign(tag, update);
      else { tag = { id: `tag-${tags.length + 1}`, ...create }; tags.push(tag); }
      return { ...tag };
    },
    async delete({ where }) { const index = tags.findIndex(item => item.id === where.id); return tags.splice(index, 1)[0]; },
  },
  noteTag: {
    async findMany({ where }) { return links.filter(link => link.tagId === where.tagId).map(link => ({ noteId: link.noteId })); },
    async createMany({ data }) { for (const row of data) if (!links.some(link => link.noteId === row.noteId && link.tagId === row.tagId)) links.push(row); },
  },
  async $transaction(callback) { const result = await callback(db); const existing = new Set(tags.map(tag => tag.id)); for (let index = links.length - 1; index >= 0; index--) if (!existing.has(links[index].tagId)) links.splice(index, 1); return result; },
};

const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: require("../test-support/sessionDb").withSessions(db) };

let server;
let base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/notes", require("../src/routes/notes.routes")); app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/notes/meta/tags`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
const headers = { Authorization: `Bearer ${signToken("alice")}`, "Content-Type": "application/json" };

test("tag rename is normalized and remains tenant scoped", async () => {
  const renamed = await fetch(`${base}/source`, { method: "PATCH", headers, body: JSON.stringify({ name: "  Knowledge  " }) });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).tag.name, "knowledge");
  const foreign = await fetch(`${base}/foreign`, { method: "PATCH", headers, body: JSON.stringify({ name: "exposed" }) });
  assert.equal(foreign.status, 404);
});

test("merging moves unique note relationships and removes only the source tag", async () => {
  const response = await fetch(`${base}/source/merge`, { method: "POST", headers, body: JSON.stringify({ targetTagId: "target" }) });
  assert.equal(response.status, 200);
  assert.equal(tags.some(tag => tag.id === "source"), false);
  assert.deepEqual(links.filter(link => link.tagId === "target").map(link => link.noteId).sort(), ["n1", "n2"]);
  assert.equal(tags.some(tag => tag.id === "foreign"), true);
});

test("standalone subjects appear at zero use without surfacing hidden protected-only tags", async () => {
  const before = await (await fetch(base, { headers })).json();
  assert.equal(before.tags.some(tag => tag.name === "estate"), false);
  const created = await fetch(base, { method: "POST", headers, body: JSON.stringify({ name: "  Strategy  " }) });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).tag.name, "strategy");
  const after = await (await fetch(base, { headers })).json();
  assert.equal(after.tags.find(tag => tag.name === "strategy").count, 0);
  const repeated = await fetch(base, { method: "POST", headers, body: JSON.stringify({ name: "strategy" }) });
  assert.equal(repeated.status, 409);
  const foreign = await fetch(base, { method: "POST", headers: { Authorization: `Bearer ${signToken("bob")}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "estate" }) });
  assert.equal(foreign.status, 201);
});
