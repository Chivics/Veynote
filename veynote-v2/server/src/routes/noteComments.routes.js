const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { noteAccess } = require("../utils/noteAccess");

function createNoteCommentsRoutes({ db }) {
  const router = express.Router();
  router.use(requireAuth);
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  const loadNote = asyncHandler(async (req, res, next) => {
    const note = await db.note.findFirst({ where: { id: req.params.noteId, userId: req.userId } });
    if (!note) return res.status(404).json({ error: "Document not found." });
    const access = noteAccess(req, note);
    if (!access.ok) return res.status(access.status).json({ error: "Unlock this document before opening its discussion.", ...(access.requiresVault && { requiresVault: access.requiresVault }) });
    if (note.isTrashed) return res.status(409).json({ error: "Restore this document before changing its discussion." });
    req.commentNote = note;
    next();
  });

  const select = { id: true, noteId: true, userId: true, body: true, quote: true, resolvedAt: true, createdAt: true, updatedAt: true, user: { select: { name: true } } };
  const serialize = row => ({ id: row.id, noteId: row.noteId, authorId: row.userId, authorName: row.user?.name || "Veynote member", body: row.body, quote: row.quote, resolvedAt: row.resolvedAt, createdAt: row.createdAt, updatedAt: row.updatedAt });

  router.get("/:noteId/comments", loadNote, asyncHandler(async (req, res) => {
    const page = Number(req.query.page || 1);
    const status = req.query.status || "open";
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !["open", "resolved", "all"].includes(status)) return res.status(400).json({ error: "Choose a valid discussion page and status." });
    const where = { noteId: req.commentNote.id, ...(status === "open" ? { resolvedAt: null } : status === "resolved" ? { resolvedAt: { not: null } } : {}) };
    const take = 30;
    const [rows, total, openCount] = await Promise.all([
      db.noteComment.findMany({ where, select, orderBy: { createdAt: "desc" }, skip: (page - 1) * take, take }),
      db.noteComment.count({ where }),
      db.noteComment.count({ where: { noteId: req.commentNote.id, resolvedAt: null } }),
    ]);
    res.json({ comments: rows.map(serialize), total, openCount, page, pages: Math.max(1, Math.ceil(total / take)) });
  }));

  router.post("/:noteId/comments", loadNote, asyncHandler(async (req, res) => {
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const quote = typeof req.body?.quote === "string" ? req.body.quote.trim() : "";
    if (!body || body.length > 4000 || quote.length > 500) return res.status(400).json({ error: "Write a comment of 1–4,000 characters and keep quoted text under 500 characters." });
    const row = await db.noteComment.create({ data: { noteId: req.commentNote.id, userId: req.userId, body, quote: quote || null }, select });
    res.status(201).json({ comment: serialize(row) });
  }));

  router.patch("/:noteId/comments/:commentId", loadNote, asyncHandler(async (req, res) => {
    const existing = await db.noteComment.findFirst({ where: { id: req.params.commentId, noteId: req.commentNote.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: "Comment not found." });
    const hasBody = Object.hasOwn(req.body || {}, "body");
    const hasResolved = Object.hasOwn(req.body || {}, "resolved");
    if (!hasBody && !hasResolved) return res.status(400).json({ error: "Choose an edit or resolution state." });
    const data = {};
    if (hasBody) {
      const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
      if (!body || body.length > 4000) return res.status(400).json({ error: "Write a comment of 1–4,000 characters." });
      data.body = body;
    }
    if (hasResolved) {
      if (typeof req.body.resolved !== "boolean") return res.status(400).json({ error: "Choose whether this discussion is resolved." });
      data.resolvedAt = req.body.resolved ? existing.resolvedAt || new Date() : null;
    }
    const updated = await db.noteComment.update({ where: { id: existing.id }, data, select });
    res.json({ comment: serialize(updated) });
  }));

  router.delete("/:noteId/comments/:commentId", loadNote, asyncHandler(async (req, res) => {
    const existing = await db.noteComment.findFirst({ where: { id: req.params.commentId, noteId: req.commentNote.id, userId: req.userId } });
    if (!existing) return res.status(404).json({ error: "Comment not found." });
    await db.noteComment.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }));
  return router;
}

module.exports = { createNoteCommentsRoutes };
