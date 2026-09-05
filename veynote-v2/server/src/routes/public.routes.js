const express = require("express");
const prisma = require("../lib/prisma");

const router = express.Router();
// Deliberately NOT behind requireAuth — this is the whole point: anyone
// with the link can view, no Veynote account needed. Everything it
// returns is scoped to exactly one note, found only by its random
// token, and it never exposes anything about the owner's account.

// GET /api/public/notes/:token
router.get("/notes/:token", async (req, res) => {
  const note = await prisma.note.findFirst({
    where: { shareToken: req.params.token, shareEnabled: true, isTrashed: false, isLocked: false, isWill: false },
    select: { title: true, content: true, updatedAt: true },
  });
  if (!note) return res.status(404).json({ error: "This link is invalid or has been turned off." });
  res.json({ note });
});

module.exports = router;
