import { collectWriting, recordPath } from "./noteCollection.js";

export function localDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(+date)) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calendarDayKey(value) {
  // User-selected calendar days retain their meaning west of UTC as well.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return null;
  const key = value.slice(0, 10), parsed = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === key ? key : null;
}

function visible(record) {
  return !record.isLocked && !record.isWill && !record.isArchived && !record.isTrashed && !record.deletedAt;
}

function clockOrder(value) {
  const match = typeof value === "string" && value.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return -1;
  const hour = +match[1], minute = +match[2], meridiem = match[3]?.toLowerCase();
  if (minute > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) return -1;
  return (meridiem ? hour % 12 + (meridiem === "pm" ? 12 : 0) : hour) * 60 + minute;
}

export function buildTodayWorkspace({ notes = [], tasks = [], journal = [], events = [], now = new Date() } = {}) {
  const today = localDayKey(now);
  const writing = collectWriting(notes.filter(visible), { kind: "NOTE", sort: "updated", q: "" });
  const todayWriting = writing.filter(note => localDayKey(note.updatedAt || note.createdAt) === today);
  const taskPriority = task => ({ High: 0, HIGH: 0, Medium: 1, MEDIUM: 1, Low: 2, LOW: 2 }[task.priority] ?? 3);
  const openTasks = tasks.filter(task => !task.isTrashed && !task.deletedAt && task.status !== "DONE" && calendarDayKey(task.dueDate))
    .sort((a, b) => calendarDayKey(a.dueDate).localeCompare(calendarDayKey(b.dueDate)) || taskPriority(a) - taskPriority(b) || a.title.localeCompare(b.title));
  const todayJournal = collectWriting(journal.filter(visible), { kind: "JOURNAL", sort: "updated", q: "" }).find(entry => calendarDayKey(entry.entryDate) === today) || null;
  const accessibleRecords = new Map([...writing, ...journal.filter(visible)].map(record => [record.id, record]));
  const dayEvents = events.filter(event => !event.isTrashed && !event.deletedAt && calendarDayKey(event.date) === today)
    .map(event => {
      const linkedRecord = accessibleRecords.get(event.linkedNoteId);
      return { ...event, linkedRecord:linkedRecord || null, destination:event.href || (linkedRecord ? recordPath(linkedRecord) : "/notes/calendar") };
    })
    .sort((a, b) => clockOrder(a.time) - clockOrder(b.time) || a.title.localeCompare(b.title));
  return {
    today, continuation: writing[0] || null, todayWriting, recentWriting: writing,
    pinned: writing.filter(note => note.isPinned), todayJournal,
    dueTasks: openTasks.filter(task => calendarDayKey(task.dueDate) === today),
    overdueTasks: openTasks.filter(task => calendarDayKey(task.dueDate) < today), events: dayEvents,
  };
}
