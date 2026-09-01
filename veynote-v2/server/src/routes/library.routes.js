const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { LIBRARY_DATABASES, pickProperties } = require("../data/libraryConfig");

const router = express.Router();
router.use(requireAuth);

const VALID_DATABASES = Object.keys(LIBRARY_DATABASES);

function assertValidDatabase(req, res, next) {
  const db = req.params.database?.toUpperCase();
  if (!VALID_DATABASES.includes(db)) {
    return res.status(404).json({ error: "Unknown Library database." });
  }
  req.libraryDatabase = db;
  next();
}

// GET /api/library/summary — real per-database counts for the Library
// dashboard cards. Never hard-coded; a brand-new account gets all zeros.
router.get("/summary", async (req, res) => {
  const counts = await prisma.libraryItem.groupBy({
    by: ["database"],
    where: { userId: req.userId },
    _count: { _all: true },
  });
  const summary = Object.fromEntries(VALID_DATABASES.map((d) => [d, 0]));
  counts.forEach((c) => {
    summary[c.database] = c._count._all;
  });
  res.json({ summary });
});

router.get("/:database", assertValidDatabase, async (req, res) => {
  const { status, category } = req.query;
  const where = { userId: req.userId, database: req.libraryDatabase };
  if (status) where.status = status;
  if (category) where.category = category;

  const items = await prisma.libraryItem.findMany({ where, orderBy: { createdAt: "desc" } });
  res.json({ items });
});

router.get("/:database/:id", assertValidDatabase, async (req, res) => {
  const item = await prisma.libraryItem.findFirst({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase },
  });
  if (!item) return res.status(404).json({ error: "Item not found." });
  res.json({ item });
});

router.post("/:database", assertValidDatabase, async (req, res) => {
  const { title, category, status, priority, notes, link } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "Title is required." });

  const item = await prisma.libraryItem.create({
    data: {
      userId: req.userId,
      database: req.libraryDatabase,
      title: title.trim(),
      category: category || null,
      status: status || null,
      priority: priority || null,
      notes: notes || null,
      link: link || null,
      properties: pickProperties(req.libraryDatabase, req.body),
    },
  });
  res.status(201).json({ item });
});

router.patch("/:database/:id", assertValidDatabase, async (req, res) => {
  const existing = await prisma.libraryItem.findFirst({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase },
  });
  if (!existing) return res.status(404).json({ error: "Item not found." });

  const { title, category, status, priority, notes, link } = req.body;
  const mergedProps = { ...(existing.properties || {}), ...pickProperties(req.libraryDatabase, req.body) };

  const item = await prisma.libraryItem.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined && { title }),
      ...(category !== undefined && { category }),
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(notes !== undefined && { notes }),
      ...(link !== undefined && { link }),
      properties: mergedProps,
    },
  });
  res.json({ item });
});

router.delete("/:database/:id", assertValidDatabase, async (req, res) => {
  const existing = await prisma.libraryItem.findFirst({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase },
  });
  if (!existing) return res.status(404).json({ error: "Item not found." });

  await prisma.libraryItem.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

module.exports = router;
