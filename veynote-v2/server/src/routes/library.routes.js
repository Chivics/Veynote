const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { LIBRARY_DATABASES, parseLibraryInput } = require("../data/libraryConfig");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();
router.use(requireAuth);

const { uploadRoot: UPLOAD_DIR } = require("../utils/storagePaths");
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
router.get("/summary", asyncHandler(async (req, res) => {
  const [counts, recent] = await Promise.all([
    prisma.libraryItem.groupBy({
      by: ["database"],
      where: { userId: req.userId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.libraryItem.findMany({
      where: { userId: req.userId, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 8,
    }),
  ]);
  const summary = Object.fromEntries(VALID_DATABASES.map((d) => [d, 0]));
  counts.forEach((c) => {
    summary[c.database] = c._count._all;
  });
  res.json({ summary, recent: recent.map(serialize) });
}));

router.get("/trash", asyncHandler(async (req, res) => {
  const items = await prisma.libraryItem.findMany({
    where: { userId: req.userId, deletedAt: { not: null } },
    orderBy: [{ deletedAt: "desc" }, { id: "desc" }],
  });
  res.json({ items: items.map(serialize) });
}));

router.get("/favorites", asyncHandler(async (req, res) => {
  const items = await prisma.libraryItem.findMany({
    where: { userId: req.userId, isFavorite: true, deletedAt: null },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  res.json({ items: items.map(serialize) });
}));

router.get("/:database", assertValidDatabase, async (req, res) => {
  const { status, category } = req.query;
  const where = { userId: req.userId, database: req.libraryDatabase, deletedAt: null };
  if (status) where.status = status;
  if (category) where.category = category;

  const items = await prisma.libraryItem.findMany({ where, orderBy: { createdAt: "desc" } });
  res.json({ items: items.map(serialize) });
});

router.get("/:database/:id", assertValidDatabase, async (req, res) => {
  const item = await prisma.libraryItem.findFirst({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null },
  });
  if (!item) return res.status(404).json({ error: "Item not found." });
  res.json({ item: serialize(item) });
});

router.post("/:database", assertValidDatabase, asyncHandler(async (req, res) => {
  let input;
  try { input = parseLibraryInput(req.libraryDatabase, req.body, { create: true }); }
  catch (error) { return res.status(400).json({ error: error.message }); }

  const item = await prisma.libraryItem.create({
    data: {
      userId: req.userId,
      database: req.libraryDatabase,
      ...input.data,
      properties: input.properties,
    },
  });
  res.status(201).json({ item: serialize(item) });
}));

router.patch("/:database/:id", assertValidDatabase, asyncHandler(async (req, res) => {
  const existing = await prisma.libraryItem.findFirst({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null },
  });
  if (!existing) return res.status(404).json({ error: "Item not found." });

  let input;
  try { input = parseLibraryInput(req.libraryDatabase, req.body); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const mergedProps = { ...(existing.properties || {}), ...input.properties };

  const result = await prisma.libraryItem.updateMany({
    where: { id: existing.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null },
    data: {
      ...input.data,
      properties: mergedProps,
    },
  });
  if (!result.count) return res.status(404).json({ error: "Item not found." });
  const item = await prisma.libraryItem.findFirst({
    where: { id: existing.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null },
  });
  if (!item) return res.status(404).json({ error: "Item not found." });
  res.json({ item: serialize(item) });
}));

router.post("/:database/:id/cover", assertValidDatabase, upload.single("file"), asyncHandler(async (req, res) => {
  const existing = await prisma.libraryItem.findFirst({ where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null } });
  if (!existing) { if (req.file) removeStoredFile(req.file.filename); return res.status(404).json({ error: "Item not found." }); }
  if (!req.file) return res.status(400).json({ error: "Choose an image to upload." });
  let validImage = false;
  try { validImage = await hasImageSignature(req.file); }
  catch (error) { removeStoredFile(req.file.filename); throw error; }
  if (!validImage) { removeStoredFile(req.file.filename); return res.status(415).json({ error: "This file does not contain a valid supported image." }); }
  let saved = false;
  try {
    const result = await prisma.libraryItem.updateMany({ where: { id: existing.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null }, data: {
      coverStoredName: req.file.filename, coverOriginalName: req.file.originalname.slice(0, 190),
      coverMimeType: req.file.mimetype, coverSizeBytes: req.file.size,
    } });
    if (!result.count) { removeStoredFile(req.file.filename); return res.status(404).json({ error: "Item not found." }); }
    saved = true;
    const item = await prisma.libraryItem.findFirst({ where: { id: existing.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null } });
    removeStoredFile(existing.coverStoredName);
    if (!item) return res.status(404).json({ error: "Item not found." });
    res.json({ item: serialize(item) });
  } catch (error) { if (!saved) removeStoredFile(req.file.filename); throw error; }
}));

router.delete("/:database/:id/cover", assertValidDatabase, asyncHandler(async (req, res) => {
  const existing = await prisma.libraryItem.findFirst({ where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null } });
  if (!existing) return res.status(404).json({ error: "Item not found." });
  const result = await prisma.libraryItem.updateMany({ where: { id: existing.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null }, data: {
    coverStoredName: null, coverOriginalName: null, coverMimeType: null, coverSizeBytes: null,
  } });
  if (!result.count) return res.status(404).json({ error: "Item not found." });
  const item = await prisma.libraryItem.findFirst({ where: { id: existing.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null } });
  removeStoredFile(existing.coverStoredName);
  if (!item) return res.status(404).json({ error: "Item not found." });
  res.json({ item: serialize(item) });
}));

router.patch("/:database/:id/restore", assertValidDatabase, asyncHandler(async (req, res) => {
  const result = await prisma.libraryItem.updateMany({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  if (!result.count) return res.status(404).json({ error: "Item not found in Trash." });
  const item = await prisma.libraryItem.findFirst({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null },
  });
  if (!item) return res.status(404).json({ error: "Item not found." });
  res.json({ item: serialize(item) });
}));

router.delete("/:database/:id/permanent", assertValidDatabase, asyncHandler(async (req, res) => {
  const existing = await prisma.libraryItem.findFirst({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase },
  });
  if (!existing) return res.status(404).json({ error: "Item not found." });
  if (!existing.deletedAt) return res.status(409).json({ error: "Move the item to Trash before permanently deleting it." });

  const result = await prisma.libraryItem.deleteMany({
    where: { id: existing.id, userId: req.userId, database: req.libraryDatabase, deletedAt: { not: null } },
  });
  if (!result.count) return res.status(409).json({ error: "Item is no longer in Trash." });
  removeStoredFile(existing.coverStoredName);
  res.json({ ok: true });
}));

router.delete("/:database/:id", assertValidDatabase, asyncHandler(async (req, res) => {
  const result = await prisma.libraryItem.updateMany({
    where: { id: req.params.id, userId: req.userId, database: req.libraryDatabase, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!result.count) return res.status(404).json({ error: "Item not found." });
  res.json({ ok: true });
}));

router.use((error, _req, res, next) => {
  if (error?.status === 415) return res.status(415).json({ error: error.message });
  if (!(error instanceof multer.MulterError)) return next(error);
  if (error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Cover images must be 10 MB or smaller." });
  return res.status(400).json({ error: "The cover image could not be uploaded." });
});

module.exports = router;
