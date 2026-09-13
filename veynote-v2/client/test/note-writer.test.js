import test from "node:test";
import assert from "node:assert/strict";
import { createNoteWriter } from "../src/utils/noteWriter.js";

test("overlapping first saves create once and update with the acknowledged version", async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const writer = createNoteWriter({
    async post(path, body) { calls.push([path, body]); await gate; return { note: { id: "new", updatedAt: "v1" } }; },
    async patch(path, body) { calls.push([path, body]); return { note: { id: "new", updatedAt: "v2" } }; },
  });
  const first = writer.save({ content: "first" });
  const second = writer.save({ content: "second" });
  await Promise.resolve(); assert.equal(calls.length, 1);
  release(); await Promise.all([first, second]);
  assert.equal(calls[1][0], "/notes/new");
  assert.equal(calls[1][1].expectedUpdatedAt, "v1");
  assert.equal(calls[1][1].content, "second");
});
test("a conflict pauses later writes instead of overwriting remote changes", async () => {
  let calls = 0;
  const writer = createNoteWriter({ async patch() { calls++; throw Object.assign(new Error("conflict"), { status: 409 }); } }, { id: "note", updatedAt: "v1" });
  await assert.rejects(writer.save({ content: "a" }));
  await assert.rejects(writer.save({ content: "b" }));
  assert.equal(calls, 1);
});
test("a failed update can be retried without advancing its version", async () => {
  let calls = 0;
  const writer = createNoteWriter({ async patch(_path, body) { assert.equal(body.expectedUpdatedAt, "v1"); if (++calls === 1) throw new Error("network"); return { note: { id: "note", updatedAt: "v2" } }; } }, { id: "note", updatedAt: "v1" });
  await assert.rejects(writer.save({ content: "a" }));
  await writer.save({ content: "a" });
  assert.equal(calls, 2);
});
