import test from "node:test";
import assert from "node:assert/strict";
import { ensureFolderImportNote, folderImportNoteKey } from "../src/pages/notes/folderFileImport.js";

test("reselecting an interrupted folder file reuses its draft note", async () => {
  const file = { name: "report.pdf", size: 200 * 1024 * 1024, lastModified: 42 };
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const calls = [];
  const api = { async post(path, body) { calls.push({ path, body }); return { note: { id: "draft-1" } }; } };
  const first = await ensureFolderImportNote(api, storage, "folder-1", file);
  const reselected = await ensureFolderImportNote(api, storage, "folder-1", { ...file });
  assert.equal(first.noteId, "draft-1");
  assert.equal(reselected.noteId, "draft-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.folderId, "folder-1");
  assert.equal(calls[0].body.draftForAttachment, true);
  assert.equal(JSON.parse(values.get(folderImportNoteKey("folder-1", file))).noteId, "draft-1");
  assert.match(calls[0].body.clientRequestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(folderImportNoteKey("folder-1", file), folderImportNoteKey("folder-2", file));
});

test("a lost creation response replays the same draft request ID", async () => {
  const file = { name: "report.pdf", size: 2, lastModified: 7 };
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const requests = [];
  const api = { async post(_path, body) {
    requests.push(body.clientRequestId);
    if (requests.length === 1) throw new Error("Response lost");
    return { note: { id: "draft-2" } };
  } };
  await assert.rejects(ensureFolderImportNote(api, storage, "folder-1", file), /Response lost/);
  assert.equal(JSON.parse(values.get(folderImportNoteKey("folder-1", file))).noteId, undefined);
  assert.equal((await ensureFolderImportNote(api, storage, "folder-1", file)).noteId, "draft-2");
  assert.deepEqual(requests, [requests[0], requests[0]]);
});

test("an edited saved draft is surfaced for review without creating a second note", async () => {
  const file = { name: "report.pdf", size: 2, lastModified: 8 };
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  let calls = 0;
  const api = { async post() {
    calls++;
    if (calls === 1) throw new Error("Response lost");
    throw Object.assign(new Error("Changed"), { status: 409, data: { code: "NOTE_CREATE_CHANGED", noteId: "draft-3" } });
  } };
  await assert.rejects(ensureFolderImportNote(api, storage, "folder-1", file), /Response lost/);
  await assert.rejects(ensureFolderImportNote(api, storage, "folder-1", file), error => error.noteId === "draft-3" && /Open it to review/.test(error.message));
  assert.equal(calls, 2);
  assert.equal(JSON.parse(values.get(folderImportNoteKey("folder-1", file))).noteId, undefined);
});
