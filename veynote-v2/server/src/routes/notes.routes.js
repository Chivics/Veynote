const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { hasValidVaultAccess } = require("../utils/vaultAccess");

const router = express.Router();
router.use(requireAuth);

// Checks vaultGuardFor() below for the actual per-note gate; this file
// only needs the shared hasValidVaultAccess() helper (also used by
// webauthn.routes.js) to check the X-Vault-Token / X-Will-Token headers.

function vaultGuardFor(note) {
  if (note.isWill) return { ok: false, requiresVault: "will", purpose: "will" };
  if (note.isLocked) return { ok: false, requiresVault: "locked-notes", purpose: "vault" };
  return { ok: true };
}

function serializeNote(note) {
  return {
    ...note,
    tags: note.tags?.map((t) => t.tag.name) || [],
    attachments: note.attachments?.map((a) => ({ ...a, url: `/uploads/${a.storedName}` })) || undefined,
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
  return Boolean(title?.trim()) || plainText.length > 0 || Boolean(mood?.trim()) || (tags && tags.length > 0);
}

// GET /api/notes?scope=all|favorites|archive|trash|locked&folderId=&tag=&q=
router.get("/", async (req, res) => {
  const { scope = "all", folderId, tag, q } = req.query;

  if (scope === "locked") {
    if (!hasValidVaultAccess(req, "vault")) {
      return res.status(401).json({ error: "Unlock Locked Notes first.", requiresVault: "locked-notes" });
    }
    const notes = await prisma.note.findMany({
      where: { userId: req.userId, isLocked: true, isTrashed: false },
      include: { tags: { include: { tag: true } }, folder: true },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    });
    return res.json({ notes: notes.map(serializeNote) });
  }

  // Locked and will notes never appear in ordinary browsing/search — they
  // only surface through their own dedicated, vault-gated views above.
  const where = { userId: req.userId, isTrashed: scope === "trash", isLocked: false, isWill: false };
  if (scope === "favorites") where.isFavorite = true;
  if (scope === "archive") where.isArchived = true;
  if (scope === "all") where.isArchived = false;
  if (folderId) where.folderId = folderId;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { content: { contains: q } },
    ];
  }
  if (tag) {
    where.tags = { some: { tag: { name: tag } } };
  }

  const notes = await prisma.note.findMany({
    where,
    include: { tags: { include: { tag: true } }, folder: true },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  });

  res.json({ notes: notes.map(serializeNote) });
});

// GET /api/notes/will/document — fetch (creating lazily on first visit)
// THE Will & Inheritance document. Registered before /:id so "will"
// is never mistaken for a note id (Express matches by full path shape,
// and this is two segments vs /:id's one, but keeping it explicit here
// since it's a easy trap to fall into when adding routes later).
router.get("/will/document", async (req, res) => {
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
});

router.get("/:id", async (req, res) => {
  const note = await prisma.note.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { tags: { include: { tag: true } }, folder: true, attachments: true },
  });
  if (!note) return res.status(404).json({ error: "Note not found." });

  const guard = vaultGuardFor(note);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });

  res.json({ note: serializeNote(note) });
});

async function resolveTags(userId, tagNames = []) {
  const tags = [];
  for (const rawName of tagNames) {
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId, name } },
      update: {},
      create: { userId, name },
    });
    tags.push(tag);
  }
  return tags;
}

router.post("/", async (req, res) => {
  const { title, content, folderId, mood, tags, entryDate, draftForAttachment } = req.body;

  // `draftForAttachment` is set only by the "Add File"/"Add Image" flow,
  // when a user attaches something before typing a single word — an
  // attachment-only note is explicitly allowed content per spec, but it
  // needs a real note id to attach the file to, so the client creates an
  // empty draft first and then immediately uploads onto it.
  if (!draftForAttachment && !hasMeaningfulContent({ title, content, mood, tags })) {
    return res.status(400).json({ error: "Write something before saving — a title, some text, or a mood." });
  }

  const tagRecords = await resolveTags(req.userId, tags);

  const note = await prisma.note.create({
    data: {
      userId: req.userId,
      title: title?.trim() || "",
      content: content || "",
      folderId: folderId || null,
      mood: mood || null,
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      tags: { create: tagRecords.map((t) => ({ tagId: t.id })) },
    },
    include: { tags: { include: { tag: true } }, folder: true, attachments: true },
  });

  res.status(201).json({ note: serializeNote(note) });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });

  const guard = vaultGuardFor(existing);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });

  const { title, content, folderId, mood, isFavorite, isPinned, isArchived, tags, entryDate } = req.body;

  if (tags) {
    const tagRecords = await resolveTags(req.userId, tags);
    await prisma.noteTag.deleteMany({ where: { noteId: existing.id } });
    await prisma.noteTag.createMany({
      data: tagRecords.map((t) => ({ noteId: existing.id, tagId: t.id })),
    });
  }

  const note = await prisma.note.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(folderId !== undefined && { folderId: folderId || null }),
      ...(mood !== undefined && { mood }),
      ...(isFavorite !== undefined && { isFavorite }),
      ...(isPinned !== undefined && { isPinned }),
      ...(isArchived !== undefined && { isArchived }),
      ...(entryDate !== undefined && { entryDate: new Date(entryDate) }),
    },
    include: { tags: { include: { tag: true } }, folder: true, attachments: true },
  });

  res.json({ note: serializeNote(note) });
});

// PATCH /api/notes/:id/lock  { locked: boolean } — move a note in/out of
// the Locked Notes vault. Requires an active vault token either way:
// locking without it would let anyone with API access hide notes without
// ever proving they know the vault password, and unlocking obviously
// needs it too.
router.patch("/:id/lock", async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });
  if (existing.isWill) {
    return res.status(400).json({ error: "The Will & Inheritance document has its own protection and can't also be moved to Locked Notes." });
  }
  if (!hasValidVaultAccess(req, "vault")) {
    return res.status(401).json({ error: "Unlock Locked Notes first.", requiresVault: "locked-notes" });
  }

  const note = await prisma.note.update({
    where: { id: existing.id },
    data: { isLocked: Boolean(req.body.locked) },
    include: { tags: { include: { tag: true } }, folder: true, attachments: true },
  });
  res.json({ note: serializeNote(note) });
});

// Soft delete -> Trash
router.delete("/:id", async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });

  const guard = vaultGuardFor(existing);
  if (!guard.ok) return res.status(401).json({ error: "This note is protected.", requiresVault: guard.requiresVault });

  if (existing.isTrashed) {
    // already in trash -> permanent delete
    await prisma.note.delete({ where: { id: existing.id } });
    return res.json({ ok: true, permanentlyDeleted: true });
  }

  await prisma.note.update({
    where: { id: existing.id },
    data: { isTrashed: true, trashedAt: new Date() },
  });
  res.json({ ok: true, permanentlyDeleted: false });
});

router.post("/:id/restore", async (req, res) => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Note not found." });

  const note = await prisma.note.update({
    where: { id: existing.id },
    data: { isTrashed: false, trashedAt: null },
  });
  res.json({ note });
});

router.get("/meta/tags", async (req, res) => {
  const tags = await prisma.tag.findMany({
    where: { userId: req.userId },
    include: { _count: { select: { notes: true } } },
  });
  res.json({ tags: tags.map((t) => ({ id: t.id, name: t.name, count: t._count.notes })) });
});

module.exports = router;
