// One writer owns one open document. Every request waits for the previous
// acknowledgement, including the first create and attachment-triggered saves.
export function createNoteWriter(api, initial = {}) {
  let id = initial.id || null;
  let updatedAt = initial.updatedAt || null;
  let chain = Promise.resolve();
  let conflict = null;
  return {
    get id() { return id; },
    save(payload) {
      const operation = chain.then(async () => {
        if (conflict) throw conflict;
        try {
          const result = id
            ? await api.patch(`/notes/${id}`, { ...payload, expectedUpdatedAt: updatedAt })
            : await api.post("/notes", payload);
          id = result.note.id;
          updatedAt = result.note.updatedAt;
          return result.note;
        } catch (error) {
          if (error.status === 409 || error.status === 428) conflict = error;
          throw error;
        }
      });
      chain = operation.catch(() => {});
      return operation;
    },
  };
}
