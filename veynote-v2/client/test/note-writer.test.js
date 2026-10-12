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

test("metadata actions stay ordered with writing and preserve the next save version", async () => {
  const calls = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const writer = createNoteWriter({ async patch(_path, body) {
    calls.push(body);
    if (calls.length === 1) await gate;
    return { note: { id: "note", content: body.content || "changed", isFavorite: body.isFavorite || false, updatedAt: `v${calls.length + 1}` } };
  } }, { id: "note", updatedAt: "v1", content: "original" });
  const writing = writer.save({ content: "changed" });
  const favorite = writer.patchMetadata({ isFavorite: true });
  const laterWriting = writer.save({ content: "changed again" });
  await Promise.resolve(); assert.equal(calls.length, 1);
  release(); await Promise.all([writing, favorite, laterWriting]);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].isFavorite, true);
  assert.equal(calls[2].expectedUpdatedAt, "v3");
  assert.equal(writer.updatedAt, "v4");
});

test("opening unchanged writing does not save or invalidate navigation caches", async () => {
  const initial = { id: "note", updatedAt: "v1", title: "Title", content: "<p>Text</p>", tags: ["one", "two"] };
  const writer = createNoteWriter({ async patch() { throw Error("unnecessary write"); } }, initial);
  assert.equal(writer.hasChanges({ ...initial, folderId: "", mood: "", tags: ["TWO", "one", "one"] }), false);
  assert.equal(await writer.save(initial), initial);
  assert.equal(writer.updatedAt, "v1");
});

test("structured Journal context participates in dirty detection and persistence", async () => {
  const calls = [];
  const initial = { id:"journal", updatedAt:"v1", kind:"JOURNAL", content:"<p>Decision</p>", entryDate:"2026-10-11", journalType:"decision", journalData:{ confidence:60 } };
  const writer = createNoteWriter({ async patch(_path, body) { calls.push(body); return { note:{ ...initial, ...body, updatedAt:"v2" } }; } }, initial);
  assert.equal(writer.hasChanges({ ...initial, journalData:{ confidence:60 } }), false);
  assert.equal(writer.hasChanges({ ...initial, journalData:{ confidence:75 } }), true);
  await writer.save({ ...initial, journalData:{ confidence:75 } });
  assert.equal(calls[0].journalType, "decision");
  assert.deepEqual(calls[0].journalData, { confidence:75 });
});

test("duplicate queued saves share acknowledgement, while reverting during a save persists the revert", async () => {
  let calls = 0;
  const writer = createNoteWriter({ async patch(_path, body) { calls++; return { note: { id: "note", content: body.content, updatedAt: `v${calls + 1}` } }; } }, { id: "note", updatedAt: "v1", content: "original" });
  const first = writer.save({ content: "changed" });
  assert.equal(writer.hasChanges({ content: "original" }), true);
  const second = writer.save({ content: "changed" });
  const third = writer.save({ content: "original" });
  await Promise.all([first, second, third]);
  assert.equal(calls, 2);
  assert.equal(writer.hasChanges({ content: "original" }), false);
});

test("returning to an old local value cannot mark a conflicted note saved", async () => {
  const writer = createNoteWriter({ async patch() { throw Object.assign(Error("conflict"), { status: 409 }); } }, { id: "note", updatedAt: "v1", content: "original" });
  await assert.rejects(writer.save({ content: "changed" }));
  assert.equal(writer.hasChanges({ content: "original" }), true);
  await assert.rejects(writer.save({ content: "original" }));
});

test("lost create response retries the original request before saving newer typing", async () => {
  const posts = []; const patches = [];
  const writer = createNoteWriter({
    async post(_path, body) { posts.push(structuredClone(body)); if (posts.length === 1) throw Error("response lost"); return { note: { id: "recovered", updatedAt: "v1", content: "first" } }; },
    async patch(path, body) { patches.push({ path, body }); return { note: { id: "recovered", updatedAt: "v2", content: body.content } }; },
  });
  await assert.rejects(writer.save({ content: "first", tags: ["draft"] }));
  const saved = await writer.save({ content: "newer", tags: ["draft"] });
  assert.match(posts[0].clientRequestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(posts[0], posts[1]);
  assert.equal(patches.length, 1); assert.equal(patches[0].path, "/notes/recovered");
  assert.equal(patches[0].body.expectedUpdatedAt, "v1");
  assert.equal(saved.content, "newer");
});

test("a restored tab draft retries its frozen create request before newer typing", async () => {
  let creation;
  const first = createNoteWriter({ async post() { throw Error("response lost"); } }, {}, {
    onCreateAttempt(value) { creation = structuredClone(value); },
  });
  await assert.rejects(first.save({ title: "First", content: "<p>Original</p>" }));
  const posts = []; const patches = [];
  const restored = createNoteWriter({
    async post(_path, body) { posts.push(body); return { note: { id: "saved", updatedAt: "v1" } }; },
    async patch(_path, body) { patches.push(body); return { note: { id: "saved", updatedAt: "v2" } }; },
  }, {}, { recoveredCreation: creation });
  await restored.save({ title: "First", content: "<p>Newer</p>" });
  assert.deepEqual(posts[0], creation);
  assert.equal(patches[0].content, "<p>Newer</p>");
  assert.equal(patches[0].expectedUpdatedAt, "v1");
});

test("protected creation uses its dedicated endpoint and exposes the scoped grant response", async () => {
  let createdResponse;
  const calls = [];
  const writer = createNoteWriter({
    async post(path, body) {
      calls.push({ path, body });
      return { note: { id: "private-note", updatedAt: "v1", content: body.content, isLocked: true }, noteToken: "scoped-note-grant" };
    },
  }, {}, { createPath: "/notes/locked", onCreated(response) { createdResponse = response; } });
  const note = await writer.save({ title: "Private", content: "<p>Confidential</p>" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/notes/locked");
  assert.equal(note.isLocked, true);
  assert.equal(createdResponse.noteToken, "scoped-note-grant");
});

test("a rejected invalid first save can be corrected, while a deleted creation stays blocked", async () => {
  const bodies = [];
  const writer = createNoteWriter({ async post(_path, body) {
    bodies.push(body);
    if (bodies.length === 1) throw Object.assign(Error("invalid"), { status: 400 });
    throw Object.assign(Error("deleted"), { status: 410 });
  } });
  await assert.rejects(writer.save({ title: "invalid" }));
  await assert.rejects(writer.save({ title: "corrected" }));
  assert.notEqual(bodies[0].clientRequestId, bodies[1].clientRequestId);
  assert.equal(bodies[1].title, "corrected");
  await assert.rejects(writer.save({ title: "again" }));
  assert.equal(bodies.length, 2);
});
