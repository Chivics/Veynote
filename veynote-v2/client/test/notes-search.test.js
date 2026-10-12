import test from "node:test";
import assert from "node:assert/strict";
import { filterSearchRecords, highlightSearchText, searchExcerpt, searchMatchSource } from "../src/utils/notesSearch.js";

const now = new Date("2026-09-30T12:00:00Z").getTime();
const records = [
  { id:"body", kind:"NOTE", title:"The first hour", content:"<p>A quieter morning gave the decision more room to breathe.</p>", updatedAt:"2026-09-29T10:00:00Z", tags:["writing"] },
  { id:"title", kind:"NOTE", title:"Decision", content:"<p>Keep the record.</p>", updatedAt:"2026-09-19T10:00:00Z", tags:[] },
  { id:"tag", kind:"JOURNAL", title:"Reflection", content:"<p>Reviewing the week.</p>", updatedAt:"2026-09-27T10:00:00Z", tags:["decision"] },
  { id:"file", kind:"NOTE", title:"Research", content:"", updatedAt:"2026-09-28T10:00:00Z", attachments:[{ originalName:"Decision memo.pdf" }] },
  { id:"locked", kind:"NOTE", title:"Decision", isLocked:true, updatedAt:"2026-09-30T10:00:00Z" },
  { id:"will", kind:"NOTE", title:"Decision", isWill:true, updatedAt:"2026-09-30T10:00:00Z" },
  { id:"trash", kind:"NOTE", title:"Decision", isTrashed:true, updatedAt:"2026-09-30T10:00:00Z" },
  { id:"archive", kind:"NOTE", title:"Decision", isArchived:true, updatedAt:"2026-09-30T10:00:00Z" },
];

test("search ranks real match context while never showing protected or inactive writing", () => {
  const result = filterSearchRecords(records, { q:"decision", kind:"ALL", focus:"all", when:"all", sort:"best", folder:"", tag:"" }, now);
  assert.deepEqual(result.map(record => record.id), ["title", "tag", "file", "body"]);
  assert.equal(searchMatchSource(records[1], "decision"), "Title match");
  assert.equal(searchMatchSource(records[2], "decision"), "Tag · #decision");
  assert.equal(searchMatchSource(records[3], "decision"), "Attachment · Decision memo.pdf");
  assert.equal(searchMatchSource(records[0], "decision"), "Inside this document");
});

test("type, folder, date, and focus facets intersect against accessible results", () => {
  const filters = { q:"decision", kind:"NOTE", focus:"pinned", when:"week", sort:"updated", folder:"f1", tag:"" };
  const selected = records.map(record => record.id === "file" ? { ...record, folderId:"f1", isPinned:true } : record);
  assert.deepEqual(filterSearchRecords(selected, filters, now).map(record => record.id), ["file"]);
  assert.deepEqual(filterSearchRecords(selected, { ...filters, when:"month", tag:"missing" }, now), []);
});

test("result excerpts and highlights preserve ordinary text around a match", () => {
  const excerpt = searchExcerpt({ content:`<p>${"A useful sentence. ".repeat(30)}The turning point mattered.</p>` }, "turning point");
  assert.match(excerpt, /turning point mattered/);
  assert.ok(excerpt.startsWith("…"));
  assert.deepEqual(highlightSearchText("Decision memo.pdf", "memo"), [
    { text:"Decision ", match:false }, { text:"memo", match:true }, { text:".pdf", match:false },
  ]);
});
