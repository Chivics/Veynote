const PREFIX = "veynote:unsaved-writing:v1:";

function storageKey(identity) {
  if (!identity?.userId || !["NOTE", "JOURNAL"].includes(identity.kind)) return null;
  const record = identity.noteId ? `note:${encodeURIComponent(identity.noteId)}` : "new";
  return `${PREFIX}${encodeURIComponent(identity.userId)}:${identity.kind}:${record}`;
}

function storageOrDefault(storage) {
  return storage || globalThis.sessionStorage;
}

function normalizedTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).filter(tag => typeof tag === "string").map(tag => tag.trim().toLowerCase()).filter(Boolean))].sort();
}

export function sameNoteDraft(draft, fields) {
  return (draft.title || "").trim() === (fields.title || "").trim()
    && (draft.content || "") === (fields.content || "")
    && (draft.folderId || null) === (fields.folderId || null)
    && (draft.mood || null) === (fields.mood || null)
    && JSON.stringify(normalizedTags(draft.tags)) === JSON.stringify(normalizedTags(fields.tags))
    && (draft.kind !== "JOURNAL" || ((draft.entryDate || "").slice(0, 10) === (fields.entryDate || "").slice(0, 10)
      && (draft.journalType || "daily") === (fields.journalType || "daily")
      && JSON.stringify(draft.journalData || {}) === JSON.stringify(fields.journalData || {})));
}

export function readNoteDraft(identity, storage) {
  const key = storageKey(identity);
  if (!key) return null;
  try {
    const raw = storageOrDefault(storage)?.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (draft?.version !== 1 || draft.userId !== identity.userId || draft.kind !== identity.kind
      || (draft.noteId || null) !== (identity.noteId || null)
      || typeof draft.title !== "string" || typeof draft.content !== "string"
      || !Number.isFinite(draft.savedAt)) return null;
    return draft;
  } catch { return null; }
}

export function saveNoteDraft(identity, fields, storage) {
  const key = storageKey(identity);
  if (!key) return false;
  try {
    const previous = readNoteDraft(identity, storage);
    storageOrDefault(storage).setItem(key, JSON.stringify({
      version: 1, userId: identity.userId, kind: identity.kind, noteId: identity.noteId || null,
      savedAt: Date.now(), title: fields.title || "", content: fields.content || "",
      folderId: fields.folderId || null, mood: fields.mood || null,
      tags: Array.isArray(fields.tags) ? fields.tags.filter(tag => typeof tag === "string") : [],
      entryDate: identity.kind === "JOURNAL" ? fields.entryDate || null : null,
      journalType: identity.kind === "JOURNAL" ? fields.journalType || "daily" : null,
      journalData: identity.kind === "JOURNAL" ? fields.journalData || {} : null,
      creation: previous?.creation || null,
    }));
    return true;
  } catch { return false; }
}

export function setNoteDraftCreation(identity, creation, storage) {
  const key = storageKey(identity);
  const draft = readNoteDraft(identity, storage);
  if (!key || !draft) return;
  try { storageOrDefault(storage).setItem(key, JSON.stringify({ ...draft, creation: creation || null })); } catch {}
}

export function clearNoteDraft(identity, storage) {
  const key = storageKey(identity);
  if (!key) return;
  try { storageOrDefault(storage)?.removeItem(key); } catch {}
}

export function acknowledgeNoteDraft(identity, savedNoteId, payload, storage) {
  if (!storageKey(identity) || !savedNoteId) return;
  const savedIdentity = { ...identity, noteId: savedNoteId };
  const draft = readNoteDraft(identity, storage);
  if (draft && !identity.noteId) {
    const existing = readNoteDraft(savedIdentity, storage);
    if (!sameNoteDraft(draft, payload) && (!existing || existing.savedAt <= draft.savedAt)) {
      try {
        storageOrDefault(storage).setItem(storageKey(savedIdentity), JSON.stringify({ ...draft, noteId: savedNoteId, creation: null }));
      } catch {}
    }
    clearNoteDraft(identity, storage);
  }
  const savedDraft = readNoteDraft(savedIdentity, storage);
  if (savedDraft && sameNoteDraft(savedDraft, payload)) clearNoteDraft(savedIdentity, storage);
}

export function clearAllNoteDrafts(storage) {
  try {
    const target = storageOrDefault(storage);
    for (let index = target.length - 1; index >= 0; index--) {
      const key = target.key(index);
      if (key?.startsWith(PREFIX)) target.removeItem(key);
    }
  } catch {}
}
