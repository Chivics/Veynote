export const COLLECTION_PAGE_SIZE = 24;

export function writingText(html = "") {
  // Template contents are inert: previews must never load images or execute embeds.
  if (typeof document !== "undefined") {
    const template = document.createElement("template");
    template.innerHTML = html;
    template.content.querySelectorAll("script, style, iframe, object").forEach(node => node.remove());
    template.content.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, li, tr, br").forEach(node => node.append(" "));
    return (template.content.textContent || "").replace(/\s+/g, " ").trim();
  }
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function recordPath(note) {
  return note.kind === "JOURNAL" ? `/journal/entries/${note.id}` : `/notes/${note.id}`;
}

export function recordDate(value, options = {}) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Date unavailable";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", ...options });
}

export function collectionState(params, scope) {
  const defaultKind = ["all", "folder"].includes(scope) ? "NOTE" : "ALL";
  const page = Number(params.get("page"));
  return {
    q: params.get("q") || "",
    sort: ["updated", "created", "title"].includes(params.get("sort")) ? params.get("sort") : "updated",
    view: params.get("view") === "grid" ? "grid" : "list",
    kind: ["NOTE", "JOURNAL", "ALL"].includes(params.get("kind")) ? params.get("kind") : defaultKind,
    folder: params.get("folder") || "", tag: params.get("tag") || "",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function collectionParams(previous, patch) {
  const next = new URLSearchParams(previous);
  for (const [key, value] of Object.entries(patch)) {
    if (value === "" || value == null) next.delete(key);
    else next.set(key, String(value));
  }
  if (Object.keys(patch).some(key => ["q", "sort", "kind", "folder", "tag"].includes(key))) next.delete("page");
  return next;
}

export function collectWriting(notes, filters, searchOnServer = false) {
  const needle = filters.q.trim().toLocaleLowerCase();
  return notes.filter(note => {
    if (note.isLocked || note.isWill) return false;
    if (filters.kind !== "ALL" && (note.kind || "NOTE") !== filters.kind) return false;
    if (filters.folder && (filters.folder === "unfiled" ? note.folderId : note.folderId !== filters.folder)) return false;
    if (filters.tag && !note.tags?.includes(filters.tag)) return false;
    return searchOnServer || !needle || `${note.title || ""} ${writingText(note.content)} ${(note.tags || []).join(" ")}`.toLocaleLowerCase().includes(needle);
  }).sort((a, b) => {
    if (filters.sort === "title") return (a.title || "Untitled note").localeCompare(b.title || "Untitled note");
    const field = filters.sort === "created" ? "createdAt" : "updatedAt";
    const time = note => new Date(note[field] || note.createdAt || note.entryDate || 0).getTime() || 0;
    return time(b) - time(a) || String(a.id).localeCompare(String(b.id));
  });
}

export function collectionPage(notes, requestedPage, size = COLLECTION_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(notes.length / size));
  const page = Math.max(1, Math.min(requestedPage, pages));
  return { page, pages, records: notes.slice((page - 1) * size, page * size) };
}

export function nextTasks(tasks, today) {
  // Dates entered in the task editor are calendar dates, not a local-time conversion.
  const date = task => task.dueDate?.slice(0, 10) || "9999-12-31";
  return tasks.filter(task => task.status !== "DONE").sort((a, b) => {
    const overdue = task => date(task) < today;
    return Number(overdue(b)) - Number(overdue(a)) || date(a).localeCompare(date(b)) ||
      Number(b.status === "IN_PROGRESS") - Number(a.status === "IN_PROGRESS") ||
      ({ High: 0, Medium: 1, Low: 2 }[a.priority] ?? 3) - ({ High: 0, Medium: 1, Low: 2 }[b.priority] ?? 3);
  });
}
