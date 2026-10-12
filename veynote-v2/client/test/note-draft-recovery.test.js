import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeNoteDraft, clearAllNoteDrafts, clearNoteDraft, readNoteDraft, sameNoteDraft, saveNoteDraft, setNoteDraftCreation } from "../src/utils/noteDraftRecovery.js";

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test("tab drafts are scoped to account, record, and writing kind", () => {
  const storage = memoryStorage();
  const identity = { userId: "alice", kind: "NOTE", noteId: "one" };
  saveNoteDraft(identity, { title: "A", content: "<p>Unsaved</p>", tags: ["Topic"] }, storage);
  assert.equal(readNoteDraft(identity, storage).content, "<p>Unsaved</p>");
  assert.equal(readNoteDraft({ ...identity, userId: "bob" }, storage), null);
  assert.equal(readNoteDraft({ ...identity, kind: "JOURNAL" }, storage), null);
  assert.equal(readNoteDraft({ ...identity, noteId: "two" }, storage), null);
  assert.equal(sameNoteDraft(readNoteDraft(identity, storage), { title: " A ", content: "<p>Unsaved</p>", tags: ["topic"] }), true);
});

test("acknowledging a first create moves newer unsaved typing to the saved record", () => {
  const storage = memoryStorage();
  const identity = { userId: "alice", kind: "JOURNAL", noteId: null };
  saveNoteDraft(identity, { title: "Today", content: "<p>Second thought</p>", entryDate: "2026-10-03" }, storage);
  setNoteDraftCreation(identity, { title: "Today", content: "<p>First thought</p>", clientRequestId: "request-1" }, storage);
  acknowledgeNoteDraft(identity, "saved-id", { title: "Today", content: "<p>First thought</p>", entryDate: "2026-10-03" }, storage);
  assert.equal(readNoteDraft(identity, storage), null);
  const saved = readNoteDraft({ ...identity, noteId: "saved-id" }, storage);
  assert.equal(saved.content, "<p>Second thought</p>");
  assert.equal(saved.creation, null);
  acknowledgeNoteDraft({ ...identity, noteId: "saved-id" }, "saved-id", { title: "Today", content: "<p>Second thought</p>", entryDate: "2026-10-03" }, storage);
  assert.equal(readNoteDraft({ ...identity, noteId: "saved-id" }, storage), null);
});

test("Journal drafts retain structured context independently from prose", () => {
  const storage = memoryStorage();
  const identity = { userId:"alice", kind:"JOURNAL", noteId:"decision" };
  const fields = { title:"Decision", content:"<p>Reasoning</p>", entryDate:"2026-10-11", journalType:"decision", journalData:{ confidence:74, status:"Decided" } };
  assert.equal(saveNoteDraft(identity, fields, storage), true);
  const restored = readNoteDraft(identity, storage);
  assert.equal(restored.journalType, "decision");
  assert.deepEqual(restored.journalData, fields.journalData);
  assert.equal(sameNoteDraft(restored, fields), true);
  assert.equal(sameNoteDraft(restored, { ...fields, journalData:{ ...fields.journalData, confidence:75 } }), false);
});

test("explicit signout clears writing drafts while preserving unrelated session data", () => {
  const storage = memoryStorage();
  storage.setItem("veynote_vault_token", "unrelated");
  const note = { userId: "alice", kind: "NOTE", noteId: "one" };
  const journal = { userId: "bob", kind: "JOURNAL", noteId: null };
  saveNoteDraft(note, { title: "Note", content: "" }, storage);
  saveNoteDraft(journal, { title: "Journal", content: "" }, storage);
  clearNoteDraft(note, storage);
  assert.equal(readNoteDraft(note, storage), null);
  assert.ok(readNoteDraft(journal, storage));
  clearAllNoteDrafts(storage);
  assert.equal(readNoteDraft(journal, storage), null);
  assert.equal(storage.getItem("veynote_vault_token"), "unrelated");
});

test("a storage quota failure is reported rather than claiming local recovery", () => {
  const identity = { userId: "alice", kind: "NOTE", noteId: "long-manuscript" };
  const storage = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.equal(saveNoteDraft(identity, { title: "Chapter", content: "<p>Long draft</p>" }, storage), false);
  assert.equal(readNoteDraft(identity, storage), null);
});
