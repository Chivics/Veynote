import test from "node:test";
import assert from "node:assert/strict";
import { noteAttachmentUploadKey, uploadNoteAttachment, cancelNoteAttachmentUpload } from "../src/utils/noteAttachmentUpload.js";

test("a paused Note attachment resumes at the acknowledged chunk and reports progress", async () => {
  const bytes = Buffer.alloc(4 * 1024 * 1024 + 3, 65);
  const file = { name: "manuscript.pdf", type: "application/pdf", size: bytes.length, lastModified: 42, slice: (start, end) => bytes.subarray(start, end) };
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const state = { received: 0, nextIndex: 0, chunks: [] };
  const api = {
    async post(path) { return path.endsWith("/complete") ? { attachment: { id: "attachment-1" } } : { session: { id: "session-1", received: 0, nextIndex: 0, chunkBytes: 4 * 1024 * 1024 } }; },
    async get() { return { session: { ...state, id: "session-1", chunkBytes: 4 * 1024 * 1024 } }; },
    async uploadChunk(path, chunk) { state.chunks.push(path); state.received += chunk.length; state.nextIndex++; return { received: state.received, nextIndex: state.nextIndex }; },
  };
  const controller = new AbortController();
  const progress = [];
  await assert.rejects(uploadNoteAttachment(api, "note-1", file, {
    storage, signal: controller.signal,
    onProgress: (percent, received) => { progress.push([percent, received]); if (received === 4 * 1024 * 1024) controller.abort(); },
  }), { name: "AbortError" });
  assert.equal(storage.getItem(noteAttachmentUploadKey("note-1", file)), "session-1");
  assert.equal(state.chunks.length, 1);
  const result = await uploadNoteAttachment(api, "note-1", file, { storage, onProgress: (percent, received) => progress.push([percent, received]) });
  assert.equal(result.attachment.id, "attachment-1");
  assert.equal(state.chunks.length, 2);
  assert.ok(state.chunks[1].endsWith("/chunks/1"));
  assert.deepEqual(progress.at(-1), [100, file.size]);
  assert.equal(storage.getItem(noteAttachmentUploadKey("note-1", file)), null);
});

test("cancelling a saved Note session discards it", async () => {
  const file = { name: "notes.txt", size: 1, lastModified: 1 };
  const key = noteAttachmentUploadKey("note-1", file);
  const values = new Map([[key, "session-2"]]);
  const storage = { getItem: key => values.get(key) || null, removeItem: key => values.delete(key) };
  const routes = [];
  await cancelNoteAttachmentUpload({ delete: async path => { routes.push(path); return { ok: true }; } }, "note-1", file, { storage });
  assert.deepEqual(routes, ["/notes/note-1/attachments/upload-sessions/session-2"]);
  assert.equal(values.has(key), false);
});

test("a lost completion response retries the completed session without sending bytes again", async () => {
  const bytes = Buffer.from("saved");
  const file = { name: "draft.txt", size: bytes.length, lastModified: 8, slice: (start, end) => bytes.subarray(start, end) };
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let uploaded = 0;
  let completions = 0;
  const api = {
    async post(path) {
      if (!path.endsWith("/complete")) return { session: { id: "session-3", received: 0, nextIndex: 0, chunkBytes: 4 * 1024 * 1024 } };
      completions++;
      if (completions === 1) throw new Error("Response lost after persistence");
      return { attachment: { id: "attachment-3" } };
    },
    async get() { return { session: { id: "session-3", size: bytes.length, received: bytes.length, nextIndex: 1, chunkBytes: 4 * 1024 * 1024 } }; },
    async uploadChunk() { uploaded++; return { received: bytes.length, nextIndex: 1 }; },
  };
  await assert.rejects(uploadNoteAttachment(api, "note-1", file, { storage }), /Response lost/);
  assert.equal(storage.getItem(noteAttachmentUploadKey("note-1", file)), "session-3");
  assert.equal((await uploadNoteAttachment(api, "note-1", file, { storage })).attachment.id, "attachment-3");
  assert.equal(uploaded, 1);
  assert.equal(completions, 2);
  assert.equal(storage.getItem(noteAttachmentUploadKey("note-1", file)), null);
});

test("unrecoverable missing bytes clear the saved session so the file can be chosen again", async () => {
  const file = { name: "draft.txt", size: 4, lastModified: 9, slice: () => Buffer.alloc(0) };
  const key = noteAttachmentUploadKey("note-1", file);
  const values = new Map([[key, "session-4"]]);
  const storage = { getItem: key => values.get(key) || null, removeItem: key => values.delete(key) };
  const api = {
    async get() { return { session: { id: "session-4", received: 4, nextIndex: 1, chunkBytes: 4 * 1024 * 1024 } }; },
    async post() { throw Object.assign(new Error("Choose the file again."), { status: 410 }); },
  };
  await assert.rejects(uploadNoteAttachment(api, "note-1", file, { storage }), /Choose the file again/);
  assert.equal(storage.getItem(key), null);
});
