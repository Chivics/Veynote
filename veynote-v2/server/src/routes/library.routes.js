const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { LIBRARY_DATABASES, pickProperties } = require("../data/libraryConfig");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString("hex")}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => IMAGE_TYPES.has(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error("Choose a JPG, PNG, WebP, or AVIF image."), { status: 415 })),
});

const VALID_DATABASES = Object.keys(LIBRARY_DATABASES);

function serialize(item) {
  if (!item) return item;
  return { ...item, coverUrl: item.coverStoredName ? `/uploads/${item.coverStoredName}` : null };
}

function removeStoredFile(storedName) {
  if (!storedName) return;
  fs.unlink(path.join(UPLOAD_DIR, storedName), () => {});
}

async function hasImageSignature(file) {
  const handle = await fs.promises.open(file.path, "r");
  try {
    const bytes = Buffer.alloc(16);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead < 3) return false;
    if (file.mimetype === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (file.mimetype === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (file.mimetype === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    if (file.mimetype === "image/avif") return bytes.subarray(4, 12).toString() === "ftypavif" || bytes.subarray(4, 12).toString() === "ftypavis";
    return false;
  } finally { await handle.close(); }
}

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
  res.json({ items: items.map(serialize) });
});

router.get("/:database/:id", assertValidDatabase, async (req, res) => {
  const item = await prisma.libraryItem.findFirst({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase },
  });
  if (!item) return res.status(404).json({ error: "Item not found." });
  res.json({ item: serialize(item) });
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
  res.status(201).json({ item: serialize(item) });
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
  res.json({ item: serialize(item) });
});

router.post("/:database/:id/cover", assertValidDatabase, upload.single("file"), asyncHandler(async (req, res) => {
  const existing = await prisma.libraryItem.findFirst({ where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase } });
  if (!existing) { if (req.file) removeStoredFile(req.file.filename); return res.status(404).json({ error: "Item not found." }); }
  if (!req.file) return res.status(400).json({ error: "Choose an image to upload." });
  let validImage = false;
  try { validImage = await hasImageSignature(req.file); }
  catch (error) { removeStoredFile(req.file.filename); throw error; }
  if (!validImage) { removeStoredFile(req.file.filename); return res.status(415).json({ error: "This file does not contain a valid supported image." }); }
  try {
    const item = await prisma.libraryItem.update({ where: { id: existing.id }, data: {
      coverStoredName: req.file.filename, coverOriginalName: req.file.originalname.slice(0, 190),
      coverMimeType: req.file.mimetype, coverSizeBytes: req.file.size,
    } });
    removeStoredFile(existing.coverStoredName);
    res.json({ item: serialize(item) });
  } catch (error) { removeStoredFile(req.file.filename); throw error; }
}));

router.delete("/:database/:id/cover", assertValidDatabase, asyncHandler(async (req, res) => {
  const existing = await prisma.libraryItem.findFirst({ where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase } });
  if (!existing) return res.status(404).json({ error: "Item not found." });
  const item = await prisma.libraryItem.update({ where: { id: existing.id }, data: {
    coverStoredName: null, coverOriginalName: null, coverMimeType: null, coverSizeBytes: null,
  } });
  removeStoredFile(existing.coverStoredName);
  res.json({ item: serialize(item) });
}));

router.delete("/:database/:id", assertValidDatabase, async (req, res) => {
  const existing = await prisma.libraryItem.findFirst({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase },
  });
  if (!existing) return res.status(404).json({ error: "Item not found." });

  await prisma.libraryItem.delete({ where: { id: existing.id } });
  removeStoredFile(existing.coverStoredName);
  res.json({ ok: true });
});

router.use((error, _req, res, next) => {
  if (error?.status === 415) return res.status(415).json({ error: error.message });
  if (!(error instanceof multer.MulterError)) return next(error);
  if (error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Cover images must be 10 MB or smaller." });
  return res.status(400).json({ error: "The cover image could not be uploaded." });
});

module.exports = router;
