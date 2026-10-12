import test from "node:test";
import assert from "node:assert/strict";
import { buildTodayWorkspace, calendarDayKey, localDayKey } from "../src/utils/todayWorkspace.js";

const now = new Date(2026, 8, 29, 12);
const timestamp = new Date(2026, 8, 29, 10).toISOString();
test("Today distinguishes edit timestamps from chosen calendar dates", () => {
  assert.equal(localDayKey(now), "2026-09-29");
  assert.equal(calendarDayKey("2026-09-29T00:00:00.000Z"), "2026-09-29");
  assert.equal(calendarDayKey("2026-02-30"), null);
  assert.equal(calendarDayKey("invalid"), null);
  assert.equal(localDayKey("invalid"), null);
});
test("Today writing and reflection exclude protected, archived and deleted records", () => {
  const note = { id:"today", title:"Working", kind:"NOTE", updatedAt:timestamp, isPinned:true };
  const records = [note, ...["isLocked", "isWill", "isArchived", "isTrashed"].map(flag => ({ ...note, id:flag, [flag]:true })), { ...note, id:"deleted", deletedAt:timestamp }, { ...note, id:"journal-in-notes", kind:"JOURNAL" }];
  const entry = { ...note, id:"entry", kind:"JOURNAL", entryDate:"2026-09-29T00:00:00Z" };
  const result = buildTodayWorkspace({ notes:records, journal:[entry, { ...entry, id:"locked-entry", isLocked:true }], now });
  assert.deepEqual(result.todayWriting.map(item => item.id), ["today"]);
  assert.deepEqual(result.pinned.map(item => item.id), ["today"]);
  assert.equal(result.continuation.id, "today");
  assert.equal(result.todayJournal.id, "entry");
});
test("Today selects recent writing by actual edit time and retains earlier writing", () => {
  const result = buildTodayWorkspace({ notes:[{ id:"yesterday", updatedAt:new Date(2026, 8, 28, 16).toISOString() }, { id:"undated" }, { id:"today", updatedAt:timestamp }], now });
  assert.equal(result.continuation.id, "today");
  assert.deepEqual(result.todayWriting.map(item => item.id), ["today"]);
  assert.deepEqual(result.recentWriting.map(item => item.id), ["today", "yesterday", "undated"]);
});
test("Agenda includes only open due and overdue tasks with deterministic priority", () => {
  const task = { id:"due", title:"Due", status:"TODO", dueDate:"2026-09-29T00:00:00Z", priority:"Low" };
  const result = buildTodayWorkspace({ tasks:[task, { ...task, id:"high", priority:"High" }, { ...task, id:"overdue", dueDate:"2026-09-28T00:00:00Z" }, { ...task, id:"tomorrow", dueDate:"2026-09-30T00:00:00Z" }, { ...task, id:"done", status:"DONE" }, { ...task, id:"trashed", isTrashed:true }, { ...task, id:"undated", dueDate:null }, { ...task, id:"invalid", dueDate:"invalid" }], now });
  assert.deepEqual(result.dueTasks.map(item => item.id), ["high", "due"]);
  assert.deepEqual(result.overdueTasks.map(item => item.id), ["overdue"]);
});
test("Calendar shows selected-day events and sorts genuine clock times", () => {
  const event = { id:"morning", title:"Morning", date:"2026-09-29T00:00:00Z", time:"09:00" };
  const result = buildTodayWorkspace({ events:[{ ...event, id:"afternoon", time:"6:00 PM" }, event, { ...event, id:"any", time:null }, { ...event, id:"tomorrow", date:"2026-09-30T00:00:00Z" }, { ...event, id:"removed", isTrashed:true }], now });
  assert.deepEqual(result.events.map(item => item.id), ["any", "morning", "afternoon"]);
});
test("Calendar opens each linked record in its own workspace and excludes private or archived context", () => {
  const event = { title:"Review", date:"2026-09-29T00:00:00Z" };
  const result = buildTodayWorkspace({ now, notes:[{ id:"note", kind:"NOTE" }, { id:"archived", isArchived:true }, { id:"locked", isLocked:true }], journal:[{ id:"entry", kind:"JOURNAL" }], events:[...['note','entry','archived','locked'].map(id => ({ ...event, id, linkedNoteId:id }))] });
  const destinations = Object.fromEntries(result.events.map(item => [item.id, item.destination]));
  assert.equal(destinations.note, "/notes/note");
  assert.equal(destinations.entry, "/journal/entries/entry");
  assert.equal(destinations.archived, "/notes/calendar");
  assert.equal(destinations.locked, "/notes/calendar");
  assert.equal(result.events.find(item => item.id === "locked").linkedRecord, null);
});
