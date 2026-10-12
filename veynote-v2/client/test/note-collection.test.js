import test from "node:test";
import assert from "node:assert/strict";
import { collectionState, collectionParams, collectWriting, collectionPage, nextTasks, noteExcerpt, noteWordCount } from "../src/utils/noteCollection.js";

test("collection navigation retains filter, view, sort, and unrelated URL context", () => {
  const initial = new URLSearchParams("q=decision&view=grid&sort=created&folder=f1&tag=research&page=3&source=home");
  const next = collectionParams(initial, { q: "review" });
  assert.equal(next.get("page"), null);
  assert.equal(next.get("source"), "home");
  assert.equal(initial.get("q"), "decision");
  const restored = collectionState(new URLSearchParams(next.toString()), "all");
  assert.deepEqual(restored, { q:"review", view:"grid", sort:"created", folder:"f1", tag:"research", kind:"NOTE", focus:"all", page:1 });
  assert.equal(collectionParams(next, { page:2 }).get("q"), "review");
});

test("malformed URLs fall back safely without mixing Notes and recovery collections", () => {
  const malformed = new URLSearchParams("page=-2&kind=SECRET&view=bad&sort=bad");
  assert.equal(collectionState(malformed, "all").kind, "NOTE");
  assert.equal(collectionState(malformed, "trash").kind, "ALL");
  assert.equal(collectionState(new URLSearchParams("page=Infinity"), "all").page, 1);
  assert.equal(collectionState(malformed, "all").view, "list");
});

const notes = [
  { id:"1", kind:"NOTE", title:"Review", content:"Decision", folderId:"f1", tags:["research"], createdAt:"2026-09-02", entryDate:"2020-01-01", updatedAt:"2026-09-06" },
  { id:"2", kind:"JOURNAL", title:"Reflection", content:"Review", tags:["research"], createdAt:"2026-09-01", entryDate:"2026-09-10", updatedAt:"2026-09-08" },
  { id:"3", kind:"NOTE", title:"Private", content:"Decision", isLocked:true },
  { id:"4", kind:"NOTE", title:"Estate", content:"Decision", isWill:true },
];
test("collection filters intersect and never expose protected writing", () => {
  const filters = { kind:"ALL", sort:"updated", q:"review", tag:"research" };
  assert.deepEqual(collectWriting(notes, filters).map(n => n.id), ["2", "1"]);
  assert.deepEqual(collectWriting(notes, { ...filters, folder:"f1" }).map(n => n.id), ["1"]);
  assert.deepEqual(collectWriting(notes, { ...filters, folder:"unfiled" }).map(n => n.id), ["2"]);
  assert.deepEqual(collectWriting(notes, { ...filters, kind:"NOTE" }).map(n => n.id), ["1"]);
});
test("creation order uses persisted creation time rather than a backdated journal date", () => {
  assert.deepEqual(collectWriting(notes, { kind:"ALL", sort:"created", q:"" }).map(n => n.id), ["1", "2"]);
});

test("Trash defaults to deletion time and keeps explicit sort choices", () => {
  assert.equal(collectionState(new URLSearchParams(), "trash").sort, "deleted");
  assert.equal(collectionState(new URLSearchParams("sort=title"), "trash").sort, "title");
  const deleted = [
    { id:"older", kind:"NOTE", title:"Older", createdAt:"2026-01-01", updatedAt:"2026-09-28", trashedAt:"2026-09-29" },
    { id:"newer", kind:"JOURNAL", title:"Newer", createdAt:"2026-01-02", updatedAt:"2026-09-26", trashedAt:"2026-09-30" },
  ];
  assert.deepEqual(collectWriting(deleted, { kind:"ALL", sort:"deleted", q:"" }).map(n => n.id), ["newer", "older"]);
});

test("Favorites opens as a visual collection while preserving an explicit list choice", () => {
  assert.equal(collectionState(new URLSearchParams(), "favorites").view, "grid");
  assert.equal(collectionState(new URLSearchParams("view=list"), "favorites").view, "list");
});

test("pinned and shared views intersect filters and preserve return context", () => {
  const records = [...notes, { ...notes[0], id:"pinned", isPinned:true, shareEnabled:true }, { ...notes[0], id:"hidden", isLocked:true, isPinned:true, shareEnabled:true }];
  const initial = new URLSearchParams("q=review&folder=f1&view=grid&page=3");
  const selected = collectionParams(initial, { focus:"pinned" });
  assert.equal(selected.get("page"), null);
  const filters = collectionState(selected,"all");
  assert.deepEqual(collectWriting(records, filters).map(note=>note.id), ["pinned"]);
  assert.deepEqual(collectWriting(records, {...filters, focus:"shared"}).map(note=>note.id), ["pinned"]);
  assert.equal(filters.view,"grid");
  assert.equal(collectionState(new URLSearchParams("focus=private"),"all").focus,"all");
});
test("deleted last-page records clamp pagination without hiding remaining writing", () => {
  const records = Array.from({length:25}, (_,id) => ({id}));
  assert.equal(collectionPage(records, 2).records.length, 1);
  const result = collectionPage(records.slice(0,24), 2);
  assert.equal(result.page, 1); assert.equal(result.records.length, 24);
  assert.equal(collectionPage([], 50).page, 1);
});
test("next actions favor overdue dates, preserve date-only meaning, and omit completed work", () => {
  const tasks = [
    {id:"later",dueDate:"2026-09-30T00:00:00Z",status:"TODO"},
    {id:"today",dueDate:"2026-09-26T00:00:00Z",status:"TODO"},
    {id:"done",dueDate:"2026-09-20",status:"DONE"},
    {id:"overdue",dueDate:"2026-09-25T00:00:00Z",status:"TODO"},
    {id:"working",status:"IN_PROGRESS"},
    {id:"undated",status:"TODO"},
  ];
  assert.deepEqual(nextTasks(tasks,"2026-09-26").map(t=>t.id),["overdue","today","later","working","undated"]);
});

test("collection summaries retain excerpts and full counts without a document body", () => {
  const summary = { id:"large", title:"Long manuscript", contentPreview:"A bounded opening excerpt", wordCount:382140, kind:"NOTE" };
  assert.equal(noteExcerpt(summary), "A bounded opening excerpt");
  assert.equal(noteWordCount(summary), 382140);
  assert.deepEqual(collectWriting([summary], { kind:"NOTE", sort:"updated", q:"bounded" }).map(note => note.id), ["large"]);
  assert.equal(noteExcerpt({ content:"<p>Short text</p>" }), "Short text");
});
