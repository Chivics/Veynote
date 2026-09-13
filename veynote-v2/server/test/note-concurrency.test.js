const test = require("node:test");
const assert = require("node:assert/strict");
const { compareAndUpdateNote } = require("../src/utils/noteConcurrency");

test("two writers on the same base cannot both update a note", async () => {
  const initial = { id: "note", userId: "alice", updatedAt: new Date("2026-09-13T00:00:00.000Z") };
  let row = { ...initial, content: "original" };
  const db = { note: { async updateMany({ where, data }) {
    assert.equal(where.userId, "alice");
    if (row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
    row = { ...row, ...data }; return { count: 1 };
  } } };
  const results = await Promise.allSettled([
    compareAndUpdateNote(db, initial, { content: "first" }),
    compareAndUpdateNote(db, initial, { content: "second" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "NOTE_CONFLICT");
  assert.equal(row.content, "first");
  assert.ok(row.updatedAt > initial.updatedAt);
});

test("save versions advance even when the host clock is behind the stored timestamp", async () => {
  const note = { id: "note", userId: "alice", updatedAt: new Date("2099-01-01T00:00:00.000Z") };
  await compareAndUpdateNote({ note: { async updateMany({ data }) {
    assert.equal(data.updatedAt.getTime(), note.updatedAt.getTime() + 1);
    return { count: 1 };
  } } }, note, { content: "new" });
});
