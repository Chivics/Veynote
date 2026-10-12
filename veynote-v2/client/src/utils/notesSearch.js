import { recordPath, writingText } from "./noteCollection.js";

const DAY = 24 * 60 * 60 * 1000;

export function searchExcerpt(note, query) {
  const text = writingText(note.content);
  if (!text) return "No writing added yet.";
  const term = query.trim().toLocaleLowerCase();
  const match = term ? text.toLocaleLowerCase().indexOf(term) : -1;
  if (match < 0 && text.length <= 220) return text;
  const start = match < 0 ? 0 : Math.max(0, match - 76);
  const end = Math.min(text.length, (match < 0 ? 0 : match) + Math.max(180, term.length + 108));
  const lead = start > 0 ? text.indexOf(" ", start) + 1 || start : 0;
  const tail = end < text.length ? text.lastIndexOf(" ", end) : text.length;
  return `${lead > 0 ? "…" : ""}${text.slice(lead, tail > lead ? tail : end).trim()}${tail < text.length ? "…" : ""}`;
}

export function searchMatchSource(note, query) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return "Recent writing";
  if ((note.title || "").toLocaleLowerCase().includes(term)) return "Title match";
  const tag = note.tags?.find(value => value.toLocaleLowerCase().includes(term));
  if (tag) return `Tag · #${tag}`;
  const attachment = note.attachments?.find(file => file.originalName?.toLocaleLowerCase().includes(term));
  if (attachment) return `Attachment · ${attachment.originalName}`;
  return "Inside this document";
}

export function highlightSearchText(text, query) {
  const value = String(text || "");
  const term = query.trim();
  if (!term) return [{ text: value, match: false }];
  const index = value.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  if (index < 0) return [{ text: value, match: false }];
  return [
    ...(index ? [{ text: value.slice(0, index), match: false }] : []),
    { text: value.slice(index, index + term.length), match: true },
    ...(index + term.length < value.length ? [{ text: value.slice(index + term.length), match: false }] : []),
  ];
}

export function filterSearchRecords(records, filters, now = Date.now()) {
  const term = filters.q.trim().toLocaleLowerCase();
  const span = { week: 7, month: 30, year: 365 }[filters.when];
  const eligible = records.filter(note => {
    if (note.isLocked || note.isWill || note.isTrashed || note.isArchived) return false;
    if (filters.kind !== "ALL" && note.kind !== filters.kind) return false;
    if (filters.focus === "pinned" && !note.isPinned) return false;
    if (filters.focus === "shared" && !note.shareEnabled) return false;
    if (filters.folder && (filters.folder === "unfiled" ? Boolean(note.folderId) : note.folderId !== filters.folder)) return false;
    if (filters.tag && !note.tags?.includes(filters.tag)) return false;
    if (span) {
      const updated = new Date(note.updatedAt || note.createdAt || 0).getTime();
      if (!Number.isFinite(updated) || now - updated > span * DAY) return false;
    }
    return true;
  });
  const relevance = note => {
    if (!term) return 0;
    const title = (note.title || "").toLocaleLowerCase();
    if (title === term) return 100;
    if (title.startsWith(term)) return 85;
    if (title.includes(term)) return 70;
    if (note.tags?.some(tag => tag.toLocaleLowerCase().includes(term))) return 60;
    if (note.attachments?.some(file => file.originalName?.toLocaleLowerCase().includes(term))) return 50;
    return 20;
  };
  const time = note => new Date(note.updatedAt || note.createdAt || 0).getTime() || 0;
  return eligible.sort((a, b) => filters.sort === "title"
    ? (a.title || "Untitled note").localeCompare(b.title || "Untitled note") || String(a.id).localeCompare(String(b.id))
    : filters.sort === "updated"
      ? time(b) - time(a) || String(a.id).localeCompare(String(b.id))
      : relevance(b) - relevance(a) || time(b) - time(a) || String(a.id).localeCompare(String(b.id)));
}

export function searchRecordHref(note) { return recordPath(note); }
