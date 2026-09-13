const express = require("express");
const prisma = require("../lib/prisma");
const path = require("path");
const { asyncHandler } = require("../middleware/asyncHandler");
const { sendMedia, validName } = require("./media.routes");
const { sanitizeDocument } = require("../utils/documentHtml");

const router = express.Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
// Deliberately NOT behind requireAuth — this is the whole point: anyone
// with the link can view, no Veynote account needed. Everything it
// returns is scoped to exactly one note, found only by its random
// token, and it never exposes anything about the owner's account.

// GET /api/public/notes/:token
router.get("/notes/:token", asyncHandler(async (req, res) => {
  const note = await prisma.note.findFirst({
    where: { shareToken: req.params.token, shareEnabled: true, isTrashed: false, isLocked: false, isWill: false },
    select: { id: true, userId: true, title: true, content: true, updatedAt: true, attachments: { select: { storedName: true, userId: true } } },
  });
  if (!note) return res.status(404).json({ error: "This link is invalid or has been turned off." });
  const names = new Set(note.attachments.filter((a) => a.userId === note.userId).map((a) => a.storedName));
  const content = sanitizeDocument(note.content, { imageUrl: (src) => {
    const name = src.startsWith("/uploads/") ? src.slice(9) : null;
    return name && names.has(name) ? `/api/public/notes/${req.params.token}/files/${name}` : "";
  } });
  res.set("Cache-Control", "no-store");
  res.json({ note: { title: note.title, content, updatedAt: note.updatedAt } });
}));

router.get("/notes/:token/files/:storedName", asyncHandler(async (req, res) => {
  if (!validName(req.params.storedName)) return res.status(404).json({ error: "File not found." });
  const note = await prisma.note.findFirst({ where: { shareToken: req.params.token, shareEnabled: true, isTrashed: false, isLocked: false, isWill: false }, select: { id: true, userId: true } });
  if (!note) return res.status(404).json({ error: "This share is no longer available." });
  const file = await prisma.attachment.findFirst({ where: { noteId: note.id, userId: note.userId, storedName: req.params.storedName } });
  if (!file) return res.status(404).json({ error: "File not found." });
  return sendMedia(res, file, path.join(__dirname, "..", "..", "uploads"));
}));

module.exports = router;
