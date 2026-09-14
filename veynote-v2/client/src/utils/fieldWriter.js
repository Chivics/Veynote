// Serialize partial updates and retain edits until their exact revision is
// acknowledged. A response for an older value must never clear newer typing.
export function createFieldWriter(persist) {
  const fields = new Map();
  let revision = 0, tail = Promise.resolve(), pending = 0;
  function set(values) {
    for (const [key, value] of Object.entries(values)) fields.set(key, { value, revision: ++revision });
  }
  function draft() { return Object.fromEntries([...fields].map(([key, entry]) => [key, entry.value])); }
  function save() {
    const snapshot = new Map(fields);
    if (!snapshot.size) return tail;
    const payload = Object.fromEntries([...snapshot].map(([key, entry]) => [key, entry.value]));
    pending++;
    const operation = tail.then(async () => {
      const result = await persist(payload);
      for (const [key, entry] of snapshot) {
        if (fields.get(key)?.revision === entry.revision) fields.delete(key);
      }
      return result;
    }).finally(() => { pending--; });
    tail = operation.catch(() => {});
    return operation;
  }
  return { set, draft, save, idle: () => tail, hasChanges: () => fields.size > 0 || pending > 0 };
}
