class NoteConflict extends Error {
  constructor() { super("This note changed elsewhere. Review the latest version before saving."); this.code = "NOTE_CONFLICT"; }
}

async function compareAndUpdateNote(db, note, data) {
  // Explicit monotonic timestamps avoid equal-millisecond saves under MySQL's
  // DateTime(3) precision. updateMany is an atomic compare-and-swap operation.
  const updatedAt = new Date(Math.max(Date.now(), new Date(note.updatedAt).getTime() + 1));
  const result = await db.note.updateMany({
    where: { id: note.id, userId: note.userId, updatedAt: note.updatedAt },
    data: { ...data, updatedAt },
  });
  if (result.count !== 1) throw new NoteConflict();
}

module.exports = { NoteConflict, compareAndUpdateNote };
