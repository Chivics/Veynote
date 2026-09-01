const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// List folders with a live note count each — never fake counts.
// GET /api/folders?archived=true to see archived folders instead of active ones.
router.get("/", async (req, res) => {
  const showArchived = req.query.archived === "true";
  const folders = await prisma.folder.findMany({
    where: { userId: req.userId, isArchived: showArchived },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { notes: { where: { isTrashed: false } } } } },
  });
  res.json({
    folders: folders.map((f) => ({ ...f, noteCount: f._count.notes, _count: undefined })),
  });
});

router.post("/", async (req, res) => {
  const { name, color, icon } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Folder name is required." });

  const folder = await prisma.folder.create({
    data: { userId: req.userId, name: name.trim(), color, icon },
  });
  res.status(201).json({ folder });
});

router.patch("/:id", async (req, res) => {
  const folder = await prisma.folder.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!folder) return res.status(404).json({ error: "Folder not found." });

  const { name, color, icon, isArchived } = req.body;
  const updated = await prisma.folder.update({
    where: { id: folder.id },
    data: {
      ...(name && { name }),
      ...(color && { color }),
      ...(icon && { icon }),
      ...(isArchived !== undefined && { isArchived }),
    },
  });
  res.json({ folder: updated });
});

// Deleting a folder never deletes its notes — they become unfiled.
router.delete("/:id", async (req, res) => {
  const folder = await prisma.folder.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!folder) return res.status(404).json({ error: "Folder not found." });

  await prisma.note.updateMany({ where: { folderId: folder.id }, data: { folderId: null } });
  await prisma.folder.delete({ where: { id: folder.id } });
  res.json({ ok: true });
});

module.exports = router;
