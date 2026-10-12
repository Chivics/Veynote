const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

process.env.JWT_SECRET = "note-comments-test-secret-012345678901";
const noteRows = new Map([
  ["ordinary", { id:"ordinary", userId:"alice", isLocked:false, isWill:false, isTrashed:false }],
  ["private", { id:"private", userId:"alice", isLocked:true, isWill:false, isTrashed:false }],
  ["deleted", { id:"deleted", userId:"alice", isLocked:false, isWill:false, isTrashed:true }],
]);
const rows = new Map();
let sequence = 0;
function matches(row, where) {
  return Object.entries(where).every(([key, expected]) => expected && typeof expected === "object" && Object.hasOwn(expected, "not") ? row[key] !== expected.not : row[key] === expected);
}
const db = {
  note: { async findFirst({ where }) { const row = noteRows.get(where.id); return row?.userId === where.userId ? row : null; } },
  noteComment: {
    async findMany({ where, skip = 0, take = 30 }) { return [...rows.values()].filter(row => matches(row, where)).sort((a,b) => b.createdAt - a.createdAt).slice(skip, skip + take); },
    async count({ where }) { return [...rows.values()].filter(row => matches(row, where)).length; },
    async create({ data }) { const row = { id:`comment-${++sequence}`, ...data, resolvedAt:null, createdAt:new Date(), updatedAt:new Date(), user:{ name:"Alice" } }; rows.set(row.id, row); return row; },
    async findFirst({ where }) { return [...rows.values()].find(row => matches(row, where)) || null; },
    async update({ where, data }) { const row = rows.get(where.id); Object.assign(row, data, { updatedAt:new Date() }); return row; },
    async delete({ where }) { const row = rows.get(where.id); rows.delete(where.id); return row; },
  },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id:prismaPath, filename:prismaPath, loaded:true, exports:require("../test-support/sessionDb").withSessions(db) };
const { signToken } = require("../src/utils/jwt");
const { createNoteCommentsRoutes } = require("../src/routes/noteComments.routes");
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use("/notes", createNoteCommentsRoutes({ db }));
  app.use(require("../src/middleware/errorHandler").errorHandler);
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/notes`;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); });
async function request(route, method = "GET", body, user = "alice") {
  const response = await fetch(base + route, { method, headers:{ Authorization:`Bearer ${signToken(user)}`, ...(body && { "Content-Type":"application/json" }) }, body:body && JSON.stringify(body) });
  return { status:response.status, body:await response.json(), cache:response.headers.get("cache-control") };
}

test("document comments persist, resolve, reopen, edit and remove within their owner scope", async () => {
  assert.deepEqual((await request("/ordinary/comments")).body.comments, []);
  const created = await request("/ordinary/comments", "POST", { body:"  Check the source.  ", quote:"   This is the relevant sentence.  " });
  assert.equal(created.status, 201);
  assert.equal(created.body.comment.body, "Check the source.");
  assert.equal(created.body.comment.quote, "This is the relevant sentence.");
  const id = created.body.comment.id;
  const open = await request("/ordinary/comments");
  assert.equal(open.cache, "no-store");
  assert.equal(open.body.openCount, 1);
  assert.equal(open.body.comments[0].authorName, "Alice");
  assert.equal((await request(`/ordinary/comments/${id}`, "PATCH", { resolved:true })).body.comment.resolvedAt != null, true);
  assert.equal((await request("/ordinary/comments")).body.total, 0);
  assert.equal((await request("/ordinary/comments?status=resolved")).body.total, 1);
  assert.equal((await request(`/ordinary/comments/${id}`, "PATCH", { resolved:false, body:"Verified against the source." })).body.comment.body, "Verified against the source.");
  assert.equal((await request(`/ordinary/comments/${id}`, "DELETE")).status, 200);
  assert.equal((await request("/ordinary/comments?status=all")).body.total, 0);
});

test("document discussion refuses foreign, protected, trashed and invalid writes", async () => {
  assert.equal((await request("/ordinary/comments", "GET", null, "bob")).status, 404);
  assert.equal((await request("/private/comments")).status, 401);
  assert.equal((await request("/deleted/comments")).status, 409);
  assert.equal((await request("/ordinary/comments", "POST", { body:" " })).status, 400);
  assert.equal((await request("/ordinary/comments", "POST", { body:"Okay", quote:"x".repeat(501) })).status, 400);
  assert.equal((await request("/ordinary/comments?page=0")).status, 400);
});
