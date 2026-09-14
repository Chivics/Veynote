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
  let creation = null;
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
          if (!id) {
            // Freeze the first request across network failures. Later typing is
            // patched only after that same creation has been acknowledged.
            creation ||= { ...payload, tags: [...(payload.tags || [])], clientRequestId: crypto.randomUUID() };
            const created = await api.post("/notes", creation);
            id = created.note.id;
            updatedAt = created.note.updatedAt;
            acknowledged = payloadKey(creation);
            lastNote = created.note;
            if (acknowledged === payloadKey(payload)) return lastNote;
          }
          const result = await api.patch(`/notes/${id}`, { ...payload, expectedUpdatedAt: updatedAt });
          id = result.note.id;
          updatedAt = result.note.updatedAt;
          acknowledged = payloadKey(payload);
          lastNote = result.note;
          return result.note;
        } catch (error) {
          // These responses reject creation before persistence. A corrected
          // payload can start a new attempt; ambiguous failures keep the key.
          if (!id && [400, 403, 404, 413, 422].includes(error.status)) creation = null;
          if ([409, 410, 428].includes(error.status)) conflict = error;
          throw error;
        }
      }).finally(() => { pending--; });
      chain = operation.catch(() => {});
      return operation;
    },
  };
}
