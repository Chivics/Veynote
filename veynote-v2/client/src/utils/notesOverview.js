import { collectWriting, noteWordCount } from "./noteCollection.js";

export function notesOverview(records, now = Date.now()) {
  const notes = collectWriting(records.filter(note => !note.isArchived && !note.isTrashed && !note.deletedAt), { kind: "NOTE", sort: "updated", q: "" });
  const cutoff = now - 30 * 86400000;
  const current = new Date(now);
  const activity = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(current.getFullYear(), current.getMonth(), current.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { key, label: date.toLocaleDateString(undefined, { weekday: "short" }), count: 0 };
  });
  const activityByDay = new Map(activity.map(day => [day.key, day]));
  for (const note of notes) {
    const date = new Date(note.updatedAt || note.createdAt);
    if (Number.isNaN(+date)) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const day = activityByDay.get(key);
    if (day) day.count += 1;
  }
  return {
    notes,
    words: notes.reduce((total, note) => total + noteWordCount(note), 0),
    favorites: notes.filter(note => note.isFavorite).length,
    unfiled: notes.filter(note => !note.folderId).length,
    revisit: notes.filter(note => { const timestamp = Date.parse(note.updatedAt || note.createdAt); return Number.isFinite(timestamp) && timestamp < cutoff; }).slice(-3).reverse(),
    activity,
    touchedThisWeek: activity.reduce((sum, day) => sum + day.count, 0),
  };
}
