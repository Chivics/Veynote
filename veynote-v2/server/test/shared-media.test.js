const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
let enabled = true;
let locked = false;
let fileLookups = 0;
const name = "a".repeat(32) + ".png";
const db = {
  note: { async findFirst({ where }) {
    assert.equal(where.isLocked, false); assert.equal(where.isWill, false); assert.equal(where.isTrashed, false);
    if (!enabled || locked || where.shareToken !== "share") return null;
    return { id: "note", userId: "alice", title: "Shared", updatedAt: new Date(), content: `<img src="/uploads/${name}"><img src="/uploads/${"b".repeat(32)}.png">`, attachments: [{ userId: "alice", storedName: name }] };
  } },
  attachment: { async findFirst({ where }) { fileLookups++; assert.equal(where.noteId, "note"); assert.equal(where.userId, "alice"); return null; } },
};
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
let base, server;
test.before(async () => {
  const app = express(); app.use("/api/public", require("../src/routes/public.routes"));
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/public`;
});
test.after(async () => { await new Promise((resolve) => server.close(resolve)); });
test("public HTML exposes only this note's attached image routes", async () => {
  const response = await fetch(`${base}/notes/share`);
  const { note } = await response.json();
  assert.deepEqual(Object.keys(note).sort(), ["content", "title", "updatedAt"]);
  assert.match(note.content, new RegExp(`/api/public/notes/share/files/${name}`));
  assert.equal(note.content.includes("b".repeat(32)), false);
});
test("revocation and locking block shared files before any file lookup", async (t) => {
  t.after(() => { enabled = true; locked = false; });
  const initial = fileLookups;
  enabled = false;
  assert.equal((await fetch(`${base}/notes/share/files/${name}`)).status, 404);
  enabled = true; locked = true;
  assert.equal((await fetch(`${base}/notes/share/files/${name}`)).status, 404);
  assert.equal(fileLookups, initial);
});
test("active shares still cannot fetch unrelated files", async () => {
  assert.equal((await fetch(`${base}/notes/share/files/${"b".repeat(32)}.png`)).status, 404);
});
