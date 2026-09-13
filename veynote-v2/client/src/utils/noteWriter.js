// One writer owns one open document. Every request waits for the previous
// acknowledgement, including the first create and attachment-triggered saves.
function payloadKey(payload) {
  return JSON.stringify({ title: (payload.title || "").trim(), content: payload.content || "", folderId: payload.folderId || null,
    mood: payload.mood || null, tags: [...new Set((payload.tags || []).map(tag => tag.trim().toLowerCase()).filter(Boolean))].sort() });
}

export function createNoteWriter(api, initial = {}) {
  let id = initial.id || null;
  let updatedAt = initial.updatedAt || null;
  let chain = Promise.resolve();
  let conflict = null;
  let pending = 0;
  let acknowledged = typeof initial.content === "string" ? payloadKey(initial) : null;
  let lastNote = initial;
  return {
    get id() { return id; },
    get updatedAt() { return updatedAt; },
    hasChanges(payload) { return Boolean(conflict) || pending > 0 || acknowledged !== payloadKey(payload); },
    save(payload) {
      pending++;
      const operation = chain.then(async () => {
        if (conflict) throw conflict;
        if (id && acknowledged === payloadKey(payload)) return lastNote;
        try {
          const result = id
            ? await api.patch(`/notes/${id}`, { ...payload, expectedUpdatedAt: updatedAt })
            : await api.post("/notes", payload);
          id = result.note.id;
          updatedAt = result.note.updatedAt;
          acknowledged = payloadKey(payload);
          lastNote = result.note;
          return result.note;
        } catch (error) {
          if (error.status === 409 || error.status === 428) conflict = error;
          throw error;
        }
      }).finally(() => { pending--; });
      chain = operation.catch(() => {});
      return operation;
    },
  };
}
