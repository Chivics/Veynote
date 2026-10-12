// An acknowledged write is distinct from an optimistic change: these overlays
// exist only after the API confirms persistence, and survive failed refreshes.
export function applyNoteAcknowledgements(records = [], changes = {}) {
  const byId = new Map(records.map(record => [record.id, record]));
  for (const [id, change] of Object.entries(changes)) {
    if (change.removed) byId.delete(id);
    else byId.set(id, { ...(byId.get(id) || change.record), ...change.patch });
  }
  return [...byId.values()];
}

export function reconcileNoteAcknowledgements(records, changes) {
  const byId = new Map(records.map(record => [record.id, record]));
  const next = { ...changes }; let changed = false;
  for (const [id, change] of Object.entries(changes)) {
    const record = byId.get(id);
    const matches = change.removed ? !record : record && Object.entries(change.patch).every(([key, value]) => record[key] === value);
    if (matches) { delete next[id]; changed = true; }
  }
  return changed ? next : changes;
}
