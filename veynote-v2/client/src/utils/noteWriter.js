// One writer owns one open document. Every request waits for the previous
// acknowledgement, including the first create and attachment-triggered saves.
function metadataKey(payload) {
  return JSON.stringify({ title: (payload.title || "").trim(), folderId: payload.folderId || null,
    mood: payload.mood || null, kind: payload.kind || "NOTE", entryDate: payload.kind === "JOURNAL" ? payload.entryDate?.slice(0, 10) || null : null,
    journalType: payload.kind === "JOURNAL" ? payload.journalType || "daily" : null,
    journalData: payload.kind === "JOURNAL" ? payload.journalData || null : null,
    tags: [...new Set((payload.tags || []).map(tag => tag.trim().toLowerCase()).filter(Boolean))].sort() });
}

// Keep the acknowledged immutable string by reference. Serializing the entire
// document for every dirty-state check doubles memory pressure for manuscripts.
function sameContent(snapshot, payload) {
  return snapshot && snapshot.metadata === metadataKey(payload) && snapshot.content === (payload.content || "");
}

function snapshotOf(payload) {
  return { metadata: metadataKey(payload), content: payload.content || "" };
}

export function createNoteWriter(api, initial = {}, { recoveredCreation = null, onCreateAttempt, onAcknowledged, createPath = "/notes", onCreated } = {}) {
  let id = initial.id || null;
  let updatedAt = initial.updatedAt || null;
  let chain = Promise.resolve();
  let conflict = null;
  let pending = 0;
  let acknowledged = typeof initial.content === "string" ? snapshotOf(initial) : null;
  let lastNote = initial;
  let creation = !id && recoveredCreation?.clientRequestId ? { ...recoveredCreation } : null;
  return {
    get id() { return id; },
    get updatedAt() { return updatedAt; },
    get pending() { return pending; },
    hasChanges(payload) { return Boolean(conflict) || pending > 0 || !sameContent(acknowledged, payload); },
    save(payload) {
      pending++;
      const operation = chain.then(async () => {
        if (conflict) throw conflict;
        if (id && sameContent(acknowledged, payload)) { onAcknowledged?.(payload, lastNote); return lastNote; }
        try {
          if (!id) {
            // Freeze the first request across network failures. Later typing is
            // patched only after that same creation has been acknowledged.
            creation ||= { ...payload, tags: [...(payload.tags || [])], clientRequestId: crypto.randomUUID() };
            onCreateAttempt?.(creation);
            const created = await api.post(createPath, creation);
            onCreated?.(created);
            id = created.note.id;
            updatedAt = created.note.updatedAt;
            acknowledged = snapshotOf(creation);
            lastNote = created.note;
            onAcknowledged?.(creation, created.note);
            if (sameContent(acknowledged, payload)) return lastNote;
          }
          const result = await api.patch(`/notes/${id}`, { ...payload, expectedUpdatedAt: updatedAt });
          id = result.note.id;
          updatedAt = result.note.updatedAt;
          acknowledged = snapshotOf(payload);
          lastNote = result.note;
          onAcknowledged?.(payload, result.note);
          return result.note;
        } catch (error) {
          // These responses reject creation before persistence. A corrected
          // payload can start a new attempt; ambiguous failures keep the key.
          if (!id && [400, 403, 404, 413, 422].includes(error.status)) { creation = null; onCreateAttempt?.(null); }
          if ([409, 410, 428].includes(error.status)) conflict = error;
          throw error;
        }
      }).finally(() => { pending--; });
      chain = operation.catch(() => {});
      return operation;
    },
    patchMetadata(fields) {
      pending++;
      const operation = chain.then(async () => {
        if (conflict) throw conflict;
        if (!id) throw new Error("Save this record before changing its status.");
        const result = await api.patch(`/notes/${id}`, fields);
        updatedAt = result.note.updatedAt;
        lastNote = result.note;
        return result.note;
      }).finally(() => { pending--; });
      chain = operation.catch(() => {});
      return operation;
    },
  };
}
