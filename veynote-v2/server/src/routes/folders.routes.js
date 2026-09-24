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
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { notes: { where: { isTrashed: false } }, children: { where: { isArchived: false } } } } },
  });
  res.json({
    folders: folders.map((f) => ({ ...f, noteCount: f._count.notes, childCount: f._count.children, _count: undefined })),
  });
});

router.post("/", async (req, res) => {
  const { name, color, icon, parentId } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Folder name is required." });
  if (parentId) {
    const parent = await prisma.folder.findFirst({ where: { id: parentId, userId: req.userId, isArchived: false }, select: { id: true } });
    if (!parent) return res.status(404).json({ error: "Parent folder not found." });
  }

  const folder = await prisma.folder.create({
    data: { userId: req.userId, name: name.trim(), color, icon, parentId: parentId || null },
  });
  res.status(201).json({ folder });
});

router.patch("/:id", async (req, res) => {
  const folder = await prisma.folder.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!folder) return res.status(404).json({ error: "Folder not found." });

  const { name, color, icon, isArchived, parentId } = req.body;
  if (parentId !== undefined) {
    if (parentId === folder.id) return res.status(400).json({ error: "A folder cannot contain itself." });
    if (parentId) {
      const parent = await prisma.folder.findFirst({ where: { id: parentId, userId: req.userId }, select: { id: true, parentId: true } });
      if (!parent) return res.status(404).json({ error: "Parent folder not found." });
      let cursor = parent;
      const visited = new Set();
      while (cursor) {
        if (cursor.id === folder.id) return res.status(400).json({ error: "A folder cannot be moved inside one of its descendants." });
        if (!cursor.parentId || visited.has(cursor.parentId)) break;
        visited.add(cursor.id);
        cursor = await prisma.folder.findFirst({ where: { id: cursor.parentId, userId: req.userId }, select: { id: true, parentId: true } });
      }
    }
  }
  const updated = await prisma.folder.update({
    where: { id: folder.id },
    data: {
      ...(name && { name }),
      ...(color && { color }),
      ...(icon && { icon }),
      ...(isArchived !== undefined && { isArchived }),
      ...(parentId !== undefined && { parentId: parentId || null }),
    },
  });
  res.json({ folder: updated });
});

// Deleting a folder never deletes its notes — they become unfiled.
router.delete("/:id", async (req, res) => {
  const folder = await prisma.folder.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!folder) return res.status(404).json({ error: "Folder not found." });

  await prisma.$transaction([
    prisma.note.updateMany({ where: { folderId: folder.id }, data: { folderId: folder.parentId || null } }),
    prisma.folder.updateMany({ where: { parentId: folder.id, userId: req.userId }, data: { parentId: folder.parentId || null } }),
    prisma.folder.delete({ where: { id: folder.id } }),
  ]);
  res.json({ ok: true });
});

module.exports = router;
