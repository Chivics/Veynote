import test from "node:test";
import assert from "node:assert/strict";
import { notesOverview } from "../src/utils/notesOverview.js";
import { WORKSPACES, QUICK_NAV, currentWorkspace } from "../src/components/layout/navigationConfig.js";

test("home summaries exclude protected, archived, deleted and journal records", () => {
  const note = { id:"visible", content:"Two words", createdAt:"2026-01-01", isFavorite:true };
  const records = [note, ...["isLocked", "isWill", "isArchived", "isTrashed"].map(flag => ({ ...note, id:flag, [flag]:true })), { ...note, kind:"JOURNAL" }, { ...note, deletedAt:"2026-02-01" }];
  const result = notesOverview(records, Date.parse("2026-09-27"));
  assert.equal(result.notes.length, 1);
  assert.equal(result.words, 2);
  assert.equal(result.favorites, 1);
  assert.equal(result.unfiled, 1);
  assert.deepEqual(result.revisit.map(item => item.id), ["visible"]);
});
test("resurfacing uses actual dates and excludes recent or undated writing", () => {
  const result = notesOverview([{ id:"old", updatedAt:"2026-01-01" }, { id:"recent", updatedAt:"2026-09-26" }, { id:"unknown" }], Date.parse("2026-09-27"));
  assert.deepEqual(result.revisit.map(item => item.id), ["old"]);
});
test("writing rhythm counts the most recent edit per accessible document without inventing past sessions", () => {
  const result = notesOverview([
    { id:"one", kind:"NOTE", createdAt:"2026-09-20T12:00:00", updatedAt:"2026-09-27T12:00:00" },
    { id:"two", kind:"NOTE", updatedAt:"2026-09-26T12:00:00" },
    { id:"private", kind:"NOTE", isLocked:true, updatedAt:"2026-09-27T12:00:00" },
  ], new Date("2026-09-27T12:00:00").getTime());
  assert.equal(result.activity.length, 7);
  assert.equal(result.activity.at(-1).count, 1);
  assert.equal(result.activity.at(-2).count, 1);
  assert.equal(result.touchedThisWeek, 2);
});
test("Notes destinations belong to Notes; related work retains its own workspace", () => {
  for (const [,path] of [...WORKSPACES.Notes.pages, ...QUICK_NAV.Notes]) assert.equal(currentWorkspace(path), "Notes");
  assert.equal(currentWorkspace("/notes/library/reading"), "Library");
  assert.equal(currentWorkspace("/will"), "Vault");
  assert.equal(currentWorkspace("/notes/locked"), "Vault");
});
