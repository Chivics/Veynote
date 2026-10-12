import test from "node:test";
import assert from "node:assert/strict";
import { applyNoteAcknowledgements, reconcileNoteAcknowledgements } from "../src/utils/noteAcknowledgements.js";

test("Undo reintroduces persisted writing when the following refresh fails", () => {
  const record = { id: "n", title: "Writing", content: "Preserved", isTrashed: false };
  const removed = { n: { removed: true } };
  assert.deepEqual(applyNoteAcknowledgements([record], removed), []);
  const restored = { n: { record, patch: { isTrashed: false, shareEnabled: false } } };
  assert.equal(applyNoteAcknowledgements([], restored)[0].content, "Preserved");
  assert.equal(reconcileNoteAcknowledgements([], restored), restored);
  assert.deepEqual(reconcileNoteAcknowledgements([{ ...record, shareEnabled: false }], restored), {});
});

test("acknowledged metadata preserves fresher writing and reconciles only its intended fields", () => {
  const stale = { id: "n", content: "Old", isFavorite: false, isPinned: false };
  const changes = { n: { record: stale, patch: { isFavorite: true } } };
  const fresh = { ...stale, content: "New writing", isFavorite: true, isPinned: true };
  assert.equal(applyNoteAcknowledgements([fresh], changes)[0].content, "New writing");
  assert.deepEqual(reconcileNoteAcknowledgements([fresh], changes), {});
});

test("deleted records remain absent until a fresh read confirms removal", () => {
  const changes = { n: { removed: true } };
  assert.equal(reconcileNoteAcknowledgements([{ id: "n" }], changes), changes);
  assert.deepEqual(reconcileNoteAcknowledgements([], changes), {});
});
