const { createHash } = require("crypto");

const JOURNAL_TYPES = new Set(["daily", "reflection", "mood", "decision", "calibration", "lesson", "weekly", "monthly", "quarterly", "annual"]);
const JOURNAL_TAG_TYPES = new Map([
  ["journal:reflection","reflection"],["journal:mood","mood"],["journal:decision","decision"],["journal:calibration","calibration"],["journal:lesson","lesson"],
  ["review:weekly","weekly"],["review:monthly","monthly"],["review:quarterly","quarterly"],["review:annual","annual"],
]);

function normalizeJournalMetadata(kind, journalType, journalData) {
  if (kind !== "JOURNAL") return { journalType: null, journalData: undefined };
  const type = journalType == null || journalType === "" ? "daily" : String(journalType).trim().toLowerCase();
  if (!JOURNAL_TYPES.has(type)) throw creationError(400, "JOURNAL_TYPE_INVALID", "Choose a supported journal record type.");
  if (journalData == null) return { journalType: type, journalData: undefined };
  if (typeof journalData !== "object" || Array.isArray(journalData)) throw creationError(400, "JOURNAL_DATA_INVALID", "Journal context must be a structured record.");
  let encoded;
  try { encoded = JSON.stringify(journalData); } catch { throw creationError(400, "JOURNAL_DATA_INVALID", "Journal context could not be saved."); }
  if (encoded.length > 16384) throw creationError(413, "JOURNAL_DATA_TOO_LARGE", "Journal context is too large. Keep extended writing in the document body.");
  return { journalType: type, journalData: JSON.parse(encoded) };
}

function creationError(status, code, message, noteId) {
  return Object.assign(new Error(message), { status, code, ...(noteId && { noteId }) });
}

function noteCreationInput(body = {}) {
  const { title = "", content = "", mood = null, folderId = null, tags = [], entryDate, kind = "NOTE", journalType, journalData, draftForAttachment = false, clientRequestId } = body;
  if (typeof title !== "string" || title.length > 1000 || typeof content !== "string" ||
      (mood !== null && (typeof mood !== "string" || mood.length > 100)) ||
      (folderId !== null && (typeof folderId !== "string" || folderId.length > 191)) ||
      !Array.isArray(tags) || tags.length > 100 || tags.some(tag => typeof tag !== "string" || tag.trim().length > 100) ||
      !["NOTE", "JOURNAL"].includes(kind) ||
      typeof draftForAttachment !== "boolean" ||
      (entryDate !== undefined && (typeof entryDate !== "string" || !Number.isFinite(Date.parse(entryDate)))) ||
      (clientRequestId !== undefined && (typeof clientRequestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)))) {
    throw creationError(400, "NOTE_CREATE_INVALID", "Check the note title, tags, date and save request before trying again.");
  }
  const inferredType = journalType || (Array.isArray(tags) ? tags.map(tag => JOURNAL_TAG_TYPES.get(String(tag).trim().toLowerCase())).find(Boolean) : null);
  const metadata = normalizeJournalMetadata(kind, inferredType, journalData);
  const payload = { title: title.trim(), content, mood: mood || null, folderId: folderId || null, kind, ...metadata,
    tags: [...new Set(tags.map(tag => tag.trim().toLowerCase()).filter(Boolean))].sort(),
    entryDate: entryDate ? new Date(entryDate).toISOString() : null, draftForAttachment };
  return { payload, key: clientRequestId?.toLowerCase(), hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
}

async function createNoteOnce(db, { userId, key, hash }, create, { allowProtectedReplay = false } = {}) {
  if (!key) return { note: await db.$transaction(create), replayed: false };
  const where = { userId_key: { userId, key } };
  async function replay(record) {
    if (record.payloadHash !== hash) throw creationError(409, "NOTE_CREATE_MISMATCH", "This save request was already used for different writing.");
    if (!record.noteId) throw creationError(410, "NOTE_CREATE_REMOVED", "The note from this save was deleted. This retry has not recreated it.");
    const note = await db.note.findFirst({ where: { id: record.noteId, userId }, include: { tags: { include: { tag: true } }, folder: true, attachments: true } });
    if (!note || note.isTrashed) throw creationError(410, "NOTE_CREATE_REMOVED", "The note from this save was deleted or moved to Trash. This retry has not recreated it.");
    if ((note.isLocked || note.isWill) && !allowProtectedReplay) throw creationError(409, "NOTE_CREATE_PROTECTED", "The saved note is now protected. Open and authenticate to that note to continue.", note.id);
    if (+new Date(note.updatedAt) !== +new Date(record.noteUpdatedAt)) throw creationError(409, "NOTE_CREATE_CHANGED", "The first save succeeded, but the note has changed since then. Review it before applying your unsaved writing.", note.id);
    return { note, replayed: true };
  }
  const existing = await db.noteCreationRequest.findUnique({ where });
  if (existing) return replay(existing);
  try {
    const note = await db.$transaction(async tx => {
      // Claim the unique key before writing tags, links or the note.
      const request = await tx.noteCreationRequest.create({ data: { userId, key, payloadHash: hash } });
      const note = await create(tx);
      await tx.noteCreationRequest.update({ where: { id: request.id }, data: { noteId: note.id, noteUpdatedAt: note.updatedAt } });
      return note;
    });
    return { note, replayed: false };
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const winner = await db.noteCreationRequest.findUnique({ where });
    if (!winner) throw error;
    return replay(winner);
  }
}

module.exports = { noteCreationInput, createNoteOnce, normalizeJournalMetadata, JOURNAL_TYPES };
