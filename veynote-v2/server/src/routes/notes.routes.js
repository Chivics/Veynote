const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { hasValidVaultAccess } = require("../utils/vaultAccess");
const { ownedReference } = require("../middleware/ownedReference");
const { sanitizeDocument, sanitizeContent } = require("../utils/documentHtml");
const { asyncHandler } = require("../middleware/asyncHandler");
const { compareAndUpdateNote } = require("../utils/noteConcurrency");
const { hasNoteAccess } = require("../utils/noteAccess");
const { noteCreationInput, createNoteOnce, normalizeJournalMetadata, JOURNAL_TYPES } = require("../utils/noteCreation");
const { noteSummary } = require("../utils/noteSummary");
const { signNoteToken } = require("../utils/jwt");

const router = express.Router();
router.use(requireAuth);
router.use(sanitizeContent);

// Checks vaultGuardFor() below for the actual per-note gate; this file
// only needs the shared hasValidVaultAccess() helper (also used by
// webauthn.routes.js) to check the X-Vault-Token / X-Will-Token headers.

// Checks whether THIS request is allowed to read/write a given note,
// given its isWill/isLocked flags — this is the actual gate; unlike an
// earlier version of this function, it genuinely checks the request's
// X-Vault-Token/X-Will-Token via hasValidVaultAccess() rather than
// unconditionally rejecting every locked/will note regardless of
// whether a valid token was presented.
function vaultGuardFor(req, note) {
  if (note.isWill) {
    return hasValidVaultAccess(req, "will") ? { ok: true } : { ok: false, requiresVault: "will" };
  }
  if (note.isLocked) {
    return hasNoteAccess(req, note.id) ? { ok: true } : { ok: false, requiresVault: "locked-notes" };
  }
  return { ok: true };
}

function serializeNote(note) {
  return {
    ...note,
    content: sanitizeDocument(note.content),
    tags: note.tags?.map((t) => t.tag.name) || [],
    attachments: note.attachments?.filter((a) => !a.deletedAt).map((a) => ({ ...a, url: `/uploads/${a.storedName}` })) || undefined,
  };
}

function serializeNoteSummary(note) {
  return {
    ...note,
    tags: note.tags?.map((item) => item.tag.name) || [],
    attachments: note.attachments?.filter((item) => !item.deletedAt).map((item) => ({ ...item, url: `/uploads/${item.storedName}` })) || undefined,
  };
}

// A note is worth saving if it has ANY of: a title, real text content
// (an empty contentEditable body still comes through as "<br>" or
// whitespace-only HTML, so we strip tags before checking), a mood, or at
// least one tag. This replaces the old "title is required" rule — per
// requirement, a body-only note (or mood-only, or an attachment-only
// note saved via the attachments flow) must be allowed to save.
function hasMeaningfulContent({ title, content, mood, tags }) {
  const plainText = (content || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return Boolean(title?.trim()) || plainText.length > 0 || /<(?:img|table|hr)\b/i.test(content || "") || Boolean(mood?.trim()) || (tags && tags.length > 0);
}

// GET /api/notes?scope=all|favorites|shared|archive|trash|tag|locked&folderId=&tag=&q=&kind=NOTE|JOURNAL|ALL
router.get("/", asyncHandler(async (req, res) => {
  const { scope = "all", folderId, tag, q, journalType, kind = scope === "tag" ? "ALL" : "NOTE", view } = req.query;

  if (!["NOTE", "JOURNAL", "ALL"].includes(kind)) return res.status(400).json({ error: "Unknown record type." });
  if (view !== undefined && view !== "summary") return res.status(400).json({ error: "Unknown notes view." });
  if (scope === "tag" && !tag?.trim()) return res.status(400).json({ error: "Choose a tag to open its connected writing." });
  if (journalType !== undefined && (kind !== "JOURNAL" || !JOURNAL_TYPES.has(String(journalType).toLowerCase()))) return res.status(400).json({ error: "Choose a supported Journal record type." });

  if (scope === "locked" || scope === "locked-trash") {
    if (!hasValidVaultAccess(req, "vault")) {
      return res.status(401).json({ error: "Unlock Locked Notes first.", requiresVault: "locked-notes" });
    }
    const notes = await prisma.note.findMany({
      where: { userId: req.userId, isLocked: true, isWill: false, isTrashed: scope === "locked-trash" },
      select: { id: true, kind: true },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    });
    return res.json({ notes: notes.map((note) => ({ id: note.id, kind: note.kind, title: "Locked note", isLocked: true })) });
  }

  // Locked and will notes never appear in ordinary browsing/search — they
  // only surface through their own dedicated, vault-gated views above.
  const where = { userId: req.userId, ...(kind !== "ALL" && { kind }), isTrashed: scope === "trash", isLocked: false, isWill: false };
  if (scope === "favorites") where.isFavorite = true;
  if (scope === "shared") where.shareEnabled = true;
  if (scope === "archive") where.isArchived = true;
  if (scope === "all") where.isArchived = false;
  // A tag is a relationship across active and archived writing. The Tags
  // index counts both, so its detail view must use the same boundary.
  if (folderId) where.folderId = folderId;
  if (journalType) where.journalType = String(journalType).toLowerCase();
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { content: { contains: q } },
      { tags: { some: { tag: { name: { contains: q } } } } },
      { attachments: { some: { originalName: { contains: q }, deletedAt: null } } },
    ];
  }
  if (tag) {
    where.tags = { some: { tag: { name: tag } } };
  }

  // Opt-in collection view selects only indexed metadata. In particular,
  // Prisma does not fetch the LongText body or sanitize it on every visit to
  // Overview, Today, and All Notes. The detail route retains full content.
  const relations = {
    tags: { include: { tag: true } }, folder: true,
    ...((folderId || q) && { attachments: true }),
  };
  const notes = await prisma.note.findMany({
    where,
    ...(view === "summary" ? { select: {
      id: true, userId: true, folderId: true, title: true,
      contentPreview: true, wordCount: true, mood: true, kind: true, journalType: true, journalData: true,
      isFavorite: true, isPinned: true, isArchived: true, isTrashed: true,
      trashedAt: true, isLocked: true, isWill: true, shareEnabled: true,
      entryDate: true, createdAt: true, updatedAt: true, ...relations,
    } } : { include: relations }),
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  });

  res.json({ notes: notes.map(view === "summary" ? serializeNoteSummary : serializeNote) });
}));

// GET /api/notes/will/document — fetch (creating lazily on first visit)
// THE Will & Inheritance document. Registered before /:id so "will"
// is never mistaken for a note id (Express matches by full path shape,
// and this is two segments vs /:id's one, but keeping it explicit here
// since it's a easy trap to fall into when adding routes later).
router.get("/will/document", asyncHandler(async (req, res) => {
  if (!hasValidVaultAccess(req, "will")) {
    return res.status(401).json({ error: "Unlock Will & Inheritance first.", requiresVault: "will" });
  }

  let note = await prisma.note.findFirst({ where: { userId: req.userId, isWill: true } });
  if (!note) {
    note = await prisma.note.create({
      data: { userId: req.userId, title: "My Will & Inheritance", content: "", isWill: true },
    });
  }
  const full = await prisma.note.findFirst({
    where: { id: note.id },
    include: { tags: { include: { tag: true } }, folder: true, attachments: true },
  });
  res.json({ note: serializeNote(full) });
}));

// Create protected writing atomically. Collection access authorizes the
// creation ceremony; the response then narrows access to this one note so
// subsequent saves cannot use the broader collection token by accident.
router.post("/locked", ownedReference(prisma.folder, "folderId"), asyncHandler(async (req, res) => {
  if (!hasValidVaultAccess(req, "vault")) {
    return res.status(401).json({ error: "Unlock Protected Notes before creating private writing.", requiresVault: "locked-notes" });
  }
  const input = noteCreationInput(req.body);
  const { title, content, folderId, mood, tags, entryDate, kind, journalType, journalData, draftForAttachment } = input.payload;
  if (kind !== "NOTE") return res.status(400).json({ error: "Protected writing must be created inside the Notes workspace." });
  if (!draftForAttachment && !hasMeaningfulContent({ title, content, mood, tags })) {
    return res.status(400).json({ error: "Write something before saving — a title, some text, or a mood." });
  }
  const result = await createNoteOnce(prisma, { userId: req.userId, key: input.key, hash: input.hash }, async db => {
    const tagRecords = await resolveTags(req.userId, tags, db);
    const note = await db.note.create({
      data: { userId: req.userId, title: title?.trim() || "", content: content || "", ...noteSummary(content), folderId: folderId || null,
        mood: mood || null, kind, journalType, journalData, entryDate: entryDate ? new Date(entryDate) : new Date(), isLocked: true,
        tags: { create: tagRecords.map(tag => ({ tagId: tag.id })) } },
      include: { tags: { include: { tag: true } }, folder: true, attachments: true },
    });
    if (content) await syncNoteLinks(note.id, content, db);
    return note;
  }, { allowProtectedReplay: true });
  res.status(result.replayed ? 200 : 201).json({ note: serializeNote(result.note), noteToken: signNoteToken(req.userId, result.note.id), replayed: result.replayed });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const note = await prisma.note.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { tags: { include: { tag: true } }, folder: true, attachments: true },
  });
  if (!note) return res.status(404).json({ error: "Note not found." });

  const guard = vaultGuardFor(req, note);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });

  res.json({ note: serializeNote(note) });
}));

async function resolveTags(userId, tagNames = [], db = prisma) {
  const tags = [];
  for (const rawName of tagNames) {
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    const tag = await db.tag.upsert({
      where: { userId_name: { userId, name } },
      update: {},
      create: { userId, name },
    });
    tags.push(tag);
  }
  return tags;
}

// [[note links]] are stored in content as
// <a class="note-link" data-note-id="...">Title</a> (inserted by the
// editor's [[ picker — see NoteLinkMenu on the client). Keeping a real
// NoteLink row per link (rather than re-scanning HTML on every
// backlinks lookup) means the "Linked from:" panel is a plain indexed
// query instead of a text search across every note's content.
async function syncNoteLinks(sourceNoteId, content, db = prisma) {
  const targetIds = new Set();
  const re = /data-note-id="([a-zA-Z0-9_-]+)"/g;
  let match;
  while ((match = re.exec(content || ""))) targetIds.add(match[1]);
  targetIds.delete(sourceNoteId); // a note linking to itself isn't a backlink worth tracking

  const existing = await db.noteLink.findMany({ where: { sourceNoteId } });
  const existingIds = new Set(existing.map((l) => l.targetNoteId));

  const toRemove = existing.filter((l) => !targetIds.has(l.targetNoteId)).map((l) => l.id);
  const toAdd = [...targetIds].filter((id) => !existingIds.has(id));

  if (toRemove.length) await db.noteLink.deleteMany({ where: { id: { in: toRemove } } });
  if (toAdd.length) {
    // Only link to notes that actually exist and belong to this user —
    // a stale/tampered data-note-id shouldn't silently create a dangling
    // or cross-account row.
    const validTargets = await db.note.findMany({
      where: { id: { in: toAdd }, userId: (await db.note.findUnique({ where: { id: sourceNoteId } })).userId, kind: "NOTE", isLocked: false, isWill: false, isTrashed: false },
      select: { id: true },
    });
    await db.noteLink.createMany({
      data: validTargets.map((t) => ({ sourceNoteId, targetNoteId: t.id })),
      skipDuplicates: true,
    });
  }
}

// Snapshots the note's pre-edit state into NoteVersion, but only if the
// last snapshot is more than 10 minutes old (or there isn't one yet) —
// otherwise every ~900ms autosave tick while typing would create its own
// version, burying anything worth actually reverting to.
const VERSION_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

async function maybeSnapshotVersion(note, db = prisma) {
  const lastVersion = await db.noteVersion.findFirst({
    where: { noteId: note.id },
    orderBy: { createdAt: "desc" },
  });
  const dueForSnapshot = !lastVersion || Date.now() - new Date(lastVersion.createdAt).getTime() > VERSION_SNAPSHOT_INTERVAL_MS;
  if (!dueForSnapshot) return;

  await db.noteVersion.create({
    data: { noteId: note.id, title: note.title, content: note.content },
  });
}

router.post("/", ownedReference(prisma.folder, "folderId"), asyncHandler(async (req, res) => {
  const input = noteCreationInput(req.body);
  const { title, content, folderId, mood, tags, entryDate, kind, journalType, journalData, draftForAttachment } = input.payload;

  // `draftForAttachment` is set only by the "Add File"/"Add Image" flow,
  // when a user attaches something before typing a single word — an
  // attachment-only note is explicitly allowed content per spec, but it
  // needs a real note id to attach the file to, so the client creates an
  // empty draft first and then immediately uploads onto it.
  if (!draftForAttachment && !hasMeaningfulContent({ title, content, mood, tags })) {
    return res.status(400).json({ error: "Write something before saving — a title, some text, or a mood." });
  }

  const result = await createNoteOnce(prisma, { userId: req.userId, key: input.key, hash: input.hash }, async db => {
  const tagRecords = await resolveTags(req.userId, tags, db);
  const note = await db.note.create({
    data: {
      userId: req.userId,
      title: title?.trim() || "",
      content: content || "",
      ...noteSummary(content),
      folderId: folderId || null,
      mood: mood || null,
      kind,
      journalType,
      journalData,
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      tags: { create: tagRecords.map((t) => ({ tagId: t.id })) },
    },
    include: { tags: { include: { tag: true } }, folder: true, attachments: true },
  });

  if (content) await syncNoteLinks(note.id, content, db);
  return note;
  });

  res.status(result.replayed ? 200 : 201).json({ note: serializeNote(result.note), replayed: result.replayed });
}));

router.patch("/:id", ownedReference(prisma.folder, "folderId"), asyncHandler(async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });

  const guard = vaultGuardFor(req, existing);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });

  if (existing.isTrashed) return res.status(410).json({ error: "This record is in Trash. Restore it before making changes." });
  const { title, content, folderId, mood, isFavorite, isPinned, isArchived, tags, entryDate, journalType, journalData } = req.body;
  const editsWriting = title !== undefined || content !== undefined;
  // The editor sends its current title/body alongside folder and tag edits.
  // Treat an identical body as unchanged: copying a large manuscript into
  // another version row (and re-indexing links) on a metadata edit wastes
  // storage and makes otherwise quick organization feel like a document save.
  const titleChanged = title !== undefined && title !== existing.title;
  const contentChanged = content !== undefined && content !== existing.content;
  if (editsWriting && !req.body.expectedUpdatedAt) {
    return res.status(428).json({ code: "NOTE_VERSION_REQUIRED", error: "Reload this note before saving. Your editor needs its latest version." });
  }
  if (editsWriting && new Date(req.body.expectedUpdatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
    return res.status(409).json({ code: "NOTE_CONFLICT", error: "This note changed elsewhere. Your changes have not overwritten it." });
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string"))) {
    return res.status(400).json({ error: "Tags must be a list of names." });
  }
  if (entryDate !== undefined && (typeof entryDate !== "string" || !Number.isFinite(Date.parse(entryDate)))) {
    return res.status(400).json({ error: "Choose a valid entry date." });
  }
  const journalMetadata = journalType !== undefined || journalData !== undefined
    ? normalizeJournalMetadata(existing.kind, journalType !== undefined ? journalType : existing.journalType, journalData !== undefined ? journalData : existing.journalData)
    : null;
  const note = await prisma.$transaction(async (db) => {
    await compareAndUpdateNote(db, existing, {
      ...(titleChanged && { title }),
      ...(contentChanged && { content, ...noteSummary(content) }),
      ...(folderId !== undefined && { folderId: folderId || null }),
      ...(mood !== undefined && { mood }),
      ...(isFavorite !== undefined && { isFavorite }),
      ...(isPinned !== undefined && { isPinned }),
      ...(isArchived !== undefined && { isArchived }),
      ...(entryDate !== undefined && { entryDate: new Date(entryDate) }),
      ...(journalMetadata && journalMetadata),
    });
    if (titleChanged || contentChanged) await maybeSnapshotVersion(existing, db);
    if (tags !== undefined) {
      const records = await resolveTags(req.userId, [...new Set(tags)], db);
      await db.noteTag.deleteMany({ where: { noteId: existing.id } });
      if (records.length) await db.noteTag.createMany({ data: records.map((tag) => ({ noteId: existing.id, tagId: tag.id })) });
    }
    if (contentChanged) await syncNoteLinks(existing.id, content, db);
    return db.note.findUnique({ where: { id: existing.id }, include: { tags: { include: { tag: true } }, folder: true, attachments: true } });
  });

  res.json({ note: serializeNote(note) });
}));

// GET /api/notes/:id/versions — history list (title + timestamp only,
// not full content, to keep the list cheap)
router.get("/:id/versions", asyncHandler(async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!note) return res.status(404).json({ error: "Note not found." });
  const guard = vaultGuardFor(req, note);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });

  const versions = await prisma.noteVersion.findMany({
    where: { noteId: note.id },
    select: { id: true, title: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ versions });
}));

router.get("/:id/versions/:versionId", asyncHandler(async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!note) return res.status(404).json({ error: "Note not found." });
  const guard = vaultGuardFor(req, note);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });

  const version = await prisma.noteVersion.findFirst({ where: { id: req.params.versionId, noteId: note.id } });
  if (!version) return res.status(404).json({ error: "Version not found." });
  res.json({ version: { ...version, content: sanitizeDocument(version.content) } });
}));

// POST /api/notes/:id/versions/:versionId/restore — snapshots the
// CURRENT state first (so restoring is itself undoable), then overwrites
// title/content with the chosen version's.
router.post("/:id/versions/:versionId/restore", asyncHandler(async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!note) return res.status(404).json({ error: "Note not found." });
  const guard = vaultGuardFor(req, note);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });
  if (note.isTrashed) return res.status(410).json({ error: "This record is in Trash. Restore it before changing its version." });

  const version = await prisma.noteVersion.findFirst({ where: { id: req.params.versionId, noteId: note.id } });
  if (!version) return res.status(404).json({ error: "Version not found." });

  if (!req.body.expectedUpdatedAt) return res.status(428).json({ error: "Open the current note before restoring a version." });
  if (new Date(req.body.expectedUpdatedAt).getTime() !== new Date(note.updatedAt).getTime()) {
    return res.status(409).json({ code: "NOTE_CONFLICT", error: "This note changed since you opened history. Review the latest note before restoring." });
  }
  const content = sanitizeDocument(version.content);
  const updated = await prisma.$transaction(async db => {
    await compareAndUpdateNote(db, note, { title: version.title, content, ...noteSummary(content) });
    await db.noteVersion.create({ data: { noteId: note.id, title: note.title, content: note.content } });
    await syncNoteLinks(note.id, content, db);
    return db.note.findUnique({ where: { id: note.id }, include: { tags: { include: { tag: true } }, folder: true, attachments: true } });
  });

  res.json({ note: serializeNote(updated) });
}));

// GET /api/notes/:id/backlinks — other notes that [[link]] to this one
router.get("/:id/backlinks", asyncHandler(async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!note) return res.status(404).json({ error: "Note not found." });
  const guard = vaultGuardFor(req, note);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });

  const links = await prisma.noteLink.findMany({
    where: { targetNoteId: note.id, sourceNote: { userId: req.userId, isLocked: false, isWill: false, isTrashed: false } },
    include: { sourceNote: { select: { id: true, title: true, kind: true } } },
  });
  const backlinks = links.map((l) => l.sourceNote);
  res.json({ backlinks });
}));

// POST /api/notes/:id/duplicate
router.post("/:id/duplicate", asyncHandler(async (req, res) => {
  const existing = await prisma.note.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { tags: true },
  });
  if (!existing) return res.status(404).json({ error: "Note not found." });
  const guard = vaultGuardFor(req, existing);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });
  if (existing.isTrashed) return res.status(410).json({ error: "This record is in Trash. Restore it before making changes." });

  if (existing.isWill) return res.status(400).json({ error: "Inheritance documents cannot be duplicated into ordinary notes." });
  const copy = await prisma.note.create({
    data: {
      userId: req.userId,
      title: existing.title ? `${existing.title} (copy)` : "",
      content: existing.content,
      ...noteSummary(existing.content),
      isLocked: existing.isLocked,
      folderId: existing.folderId,
      mood: existing.mood,
      kind: existing.kind,
      tags: { create: existing.tags.map((t) => ({ tagId: t.tagId })) },
    },
    include: { tags: { include: { tag: true } }, folder: true, attachments: true },
  });
  res.status(201).json({ note: serializeNote(copy) });
}));

// POST /api/notes/:id/share — enable a public, read-only link. Always
// issues a brand-new token (never reuses/reactivates an old one, even if
// this note was shared and unshared before).
router.post("/:id/share", asyncHandler(async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });
  if (existing.isLocked || existing.isWill) {
    return res.status(400).json({ error: "Locked and Will & Inheritance notes can't be shared." });
  }
  if (existing.isTrashed) return res.status(400).json({ error: "Trashed notes can't be shared." });

  const shareToken = crypto.randomBytes(24).toString("hex");
  await prisma.note.update({ where: { id: existing.id }, data: { shareEnabled: true, shareToken } });
  res.json({ shareToken });
}));

// DELETE /api/notes/:id/share — revoke. Clears the token entirely so the
// old link is dead even if sharing is turned back on later.
router.delete("/:id/share", asyncHandler(async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });
  await prisma.note.update({ where: { id: existing.id }, data: { shareEnabled: false, shareToken: null } });
  res.json({ ok: true });
}));

// PATCH /api/notes/:id/lock  { locked: boolean } — move a note in/out of
// the Locked Notes vault. Requires an active vault token either way:
// locking without it would let anyone with API access hide notes without
// ever proving they know the vault password, and unlocking obviously
// needs it too.
router.patch("/:id/lock", asyncHandler(async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });
  if (existing.isWill) {
    return res.status(400).json({ error: "The Will & Inheritance document has its own protection and can't also be moved to Locked Notes." });
  }
  if (!(existing.isLocked ? hasNoteAccess(req, existing.id) : hasValidVaultAccess(req, "vault"))) {
    return res.status(401).json({ error: "Unlock Locked Notes first.", requiresVault: "locked-notes" });
  }

  const note = await prisma.note.update({
    where: { id: existing.id },
    data: { isLocked: Boolean(req.body.locked), ...(req.body.locked && { shareEnabled: false, shareToken: null }) },
    include: { tags: { include: { tag: true } }, folder: true, attachments: true },
  });
  res.json({ note: serializeNote(note) });
}));

// Soft delete -> Trash
router.delete("/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });

  const guard = vaultGuardFor(req, existing);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });

  if (existing.isTrashed) {
    // A retry after a lost response must never turn a recoverable deletion
    // into a permanent one. Purging is an explicit, separate operation.
    return res.json({ ok: true, permanentlyDeleted: false });
  }

  await prisma.note.update({
    where: { id: existing.id },
    data: { isTrashed: true, trashedAt: new Date(), shareEnabled: false, shareToken: null },
  });
  res.json({ ok: true, permanentlyDeleted: false });
}));

router.delete("/:id/permanent", asyncHandler(async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });
  const guard = vaultGuardFor(req, existing);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });
  if (!existing.isTrashed) return res.status(409).json({ error: "Move this record to Trash before deleting it permanently." });
  // Compare the state again at deletion: a concurrent Restore takes precedence.
  const removed = await prisma.note.deleteMany({ where: { id: existing.id, userId: req.userId, isTrashed: true } });
  if (!removed.count) return res.status(409).json({ error: "This record was restored. Refresh Trash before continuing." });
  res.json({ ok: true, permanentlyDeleted: true });
}));

router.post("/:id/restore", asyncHandler(async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });

  const guard = vaultGuardFor(req, existing);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });

  const note = await prisma.note.update({
    where: { id: existing.id },
    data: { isTrashed: false, trashedAt: null },
    include: { tags: { include: { tag: true } }, folder: true, attachments: true },
  });
  res.json({ note: serializeNote(note) });
}));

router.get("/meta/tags", asyncHandler(async (req, res) => {
  const visibleNote = { userId: req.userId, isLocked: false, isWill: false, isTrashed: false };
  const tags = await prisma.tag.findMany({
    where: { userId: req.userId, OR: [{ isVisibleInIndex: true }, { notes: { some: { note: visibleNote } } }] },
    include: { _count: { select: { notes: { where: { note: visibleNote } } } } },
  });
  res.json({ tags: tags.map((t) => ({ id: t.id, name: t.name, count: t._count.notes })) });
}));

router.post("/meta/tags", asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().toLowerCase() : "";
  if (!name || name.length > 60) return res.status(400).json({ error: "Enter a tag name between 1 and 60 characters." });
  const existing = await prisma.tag.findFirst({ where: { userId: req.userId, name }, select: { id: true, isVisibleInIndex: true } });
  if (existing?.isVisibleInIndex) return res.status(409).json({ code: "TAG_EXISTS", error: "That subject is already in your index." });
  const tag = await prisma.tag.upsert({
    where: { userId_name: { userId: req.userId, name } },
    create: { userId: req.userId, name, isVisibleInIndex: true },
    update: { isVisibleInIndex: true },
  });
  res.status(201).json({ tag: { id: tag.id, name: tag.name } });
}));

router.patch("/meta/tags/:tagId", asyncHandler(async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim().toLowerCase() : "";
  if (!name || name.length > 60) return res.status(400).json({ error: "Enter a tag name between 1 and 60 characters." });
  const tag = await prisma.tag.findFirst({ where: { id: req.params.tagId, userId: req.userId } });
  if (!tag) return res.status(404).json({ error: "Tag not found." });
  const duplicate = await prisma.tag.findFirst({ where: { userId: req.userId, name, id: { not: tag.id } }, select: { id: true } });
  if (duplicate) return res.status(409).json({ code: "TAG_EXISTS", error: "That tag already exists. Merge the two tags instead." });
  const updated = await prisma.tag.update({ where: { id: tag.id }, data: { name } });
  res.json({ tag: updated });
}));

router.post("/meta/tags/:tagId/merge", asyncHandler(async (req, res) => {
  const source = await prisma.tag.findFirst({ where: { id: req.params.tagId, userId: req.userId } });
  const target = typeof req.body.targetTagId === "string"
    ? await prisma.tag.findFirst({ where: { id: req.body.targetTagId, userId: req.userId } })
    : null;
  if (!source || !target) return res.status(404).json({ error: "One of those tags could not be found." });
  if (source.id === target.id) return res.status(400).json({ error: "Choose a different tag to merge into." });
  await prisma.$transaction(async db => {
    const links = await db.noteTag.findMany({ where: { tagId: source.id }, select: { noteId: true } });
    if (links.length) await db.noteTag.createMany({ data: links.map(link => ({ noteId: link.noteId, tagId: target.id })), skipDuplicates: true });
    await db.tag.delete({ where: { id: source.id } });
  });
  res.json({ ok: true, target: { id: target.id, name: target.name } });
}));

router.delete("/meta/tags/:tagId", asyncHandler(async (req, res) => {
  const tag = await prisma.tag.findFirst({ where: { id: req.params.tagId, userId: req.userId } });
  if (!tag) return res.status(404).json({ error: "Tag not found." });
  await prisma.tag.delete({ where: { id: tag.id } });
  res.json({ ok: true });
}));

// GET /api/notes/meta/search?q= — powers the [[ note-link picker.
// Deliberately excludes locked/will notes (linking to one from an
// ordinary note would leak its existence into normal browsing) and
// trashed ones.
router.get("/meta/search", asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  const notes = await prisma.note.findMany({
    where: {
      userId: req.userId,
      isTrashed: false,
      isLocked: false,
      isWill: false,
      kind: "NOTE",
      ...(q ? { title: { contains: q } } : {}),
    },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  res.json({ notes });
}));

module.exports = router;
