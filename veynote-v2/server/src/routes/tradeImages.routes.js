const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const { uploadRoot: UPLOAD_DIR } = require("../utils/storagePaths");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const VALID_STAGES = ["SETUP", "ENTRY", "DURING_TRADE", "POST_TRADE", "OTHER"];
const ANALYSIS_FIELDS = ["marketStructure", "keyLevels", "liquidity", "bias", "setupReasoning", "confirmation", "notes"];

async function ownedEntry(entryId, userId, activeOnly = true) {
  return prisma.tradingEntry.findFirst({ where: { id: entryId, userId, ...(activeOnly && { archivedAt: null, deletedAt: null }) }, select: { id: true } });
}

router.get("/entries/:entryId/analysis", async (req, res) => {
  const entry = await ownedEntry(req.params.entryId, req.userId, false);
  if (!entry) return res.status(404).json({ error: "Trade entry not found." });
  const blocks = await prisma.tradeAnalysisBlock.findMany({ where: { tradingEntryId: entry.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  res.json({ blocks });
});

router.post("/entries/:entryId/analysis", async (req, res) => {
  const entry = await ownedEntry(req.params.entryId, req.userId);
  if (!entry) return res.status(404).json({ error: "Trade entry not found." });
  const timeframe = String(req.body.timeframe || "").trim().slice(0, 40);
  if (!timeframe) return res.status(400).json({ error: "Choose a timeframe." });
  const existing = await prisma.tradeAnalysisBlock.findFirst({ where: { tradingEntryId: entry.id, timeframe } });
  if (existing) return res.json({ block: existing });
  const count = await prisma.tradeAnalysisBlock.count({ where: { tradingEntryId: entry.id } });
  const block = await prisma.tradeAnalysisBlock.create({ data: { userId: req.userId, tradingEntryId: entry.id, timeframe, position: count } });
  res.status(201).json({ block });
});

router.patch("/analysis/:blockId", async (req, res) => {
  const existing = await prisma.tradeAnalysisBlock.findFirst({ where: { id: req.params.blockId, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Analysis block not found." });
  const data = {};
  for (const field of ANALYSIS_FIELDS) if (field in req.body) data[field] = req.body[field] ? String(req.body[field]).slice(0, 10000) : null;
  if (req.body.position !== undefined) {
    const position = Number(req.body.position);
    if (!Number.isInteger(position) || position < 0) return res.status(400).json({ error: "Invalid analysis position." });
    data.position = position;
  }
  const block = await prisma.tradeAnalysisBlock.update({ where: { id: existing.id }, data });
  res.json({ block });
});

router.delete("/analysis/:blockId", async (req, res) => {
  const existing = await prisma.tradeAnalysisBlock.findFirst({ where: { id: req.params.blockId, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Analysis block not found." });
  const imageCount = await prisma.tradeImage.count({ where: { tradingEntryId: existing.tradingEntryId, timeframe: existing.timeframe, stage: "SETUP" } });
  if (imageCount) return res.status(409).json({ error: "Remove this timeframe's screenshots before deleting its analysis." });
  await prisma.tradeAnalysisBlock.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const randomName = crypto.randomBytes(16).toString("hex");
    cb(null, `${randomName}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image files are allowed here."));
    cb(null, true);
  },
});

// POST /api/trading/entries/:entryId/images  (multipart, field "file", plus body: stage, timeframe, caption)
router.post("/entries/:entryId/images", upload.single("file"), async (req, res) => {
  const entry = await prisma.tradingEntry.findFirst({ where: { id: req.params.entryId, userId: req.userId, archivedAt: null, deletedAt: null } });
  if (!entry) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: "Trade entry not found." });
  }
  if (!req.file) return res.status(400).json({ error: "No image was uploaded." });

  const stage = VALID_STAGES.includes(req.body.stage) ? req.body.stage : "OTHER";

  const image = await prisma.tradeImage.create({
    data: {
      userId: req.userId,
      tradingEntryId: entry.id,
      stage,
      timeframe: req.body.timeframe || null,
      caption: req.body.caption || null,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    },
  });

  res.status(201).json({ image: { ...image, url: `/api/media/${image.storedName}` } });
});

router.get("/entries/:entryId/images", async (req, res) => {
  const entry = await prisma.tradingEntry.findFirst({ where: { id: req.params.entryId, userId: req.userId } });
  if (!entry) return res.status(404).json({ error: "Trade entry not found." });

  const images = await prisma.tradeImage.findMany({
    where: { tradingEntryId: entry.id },
    orderBy: { createdAt: "asc" },
  });
  res.json({ images: images.map((i) => ({ ...i, url: `/api/media/${i.storedName}` })) });
});

router.patch("/images/:imageId", async (req, res) => {
  const image = await prisma.tradeImage.findFirst({ where: { id: req.params.imageId, userId: req.userId } });
  if (!image) return res.status(404).json({ error: "Image not found." });

  const { stage, timeframe, caption } = req.body;
  const updated = await prisma.tradeImage.update({
    where: { id: image.id },
    data: {
      ...(stage && VALID_STAGES.includes(stage) && { stage }),
      ...(timeframe !== undefined && { timeframe }),
      ...(caption !== undefined && { caption }),
    },
  });
  res.json({ image: { ...updated, url: `/api/media/${updated.storedName}` } });
});

// PATCH /api/trading/images/:imageId/file — swaps the underlying file
// for an existing image, keeping the same record (id, caption, stage,
// timeframe) rather than deleting and recreating it. That distinction
// matters: a delete+recreate would briefly leave the slot empty and
// would generate a new id, which is a real difference from the user's
// perspective ("replace this chart" vs "remove it, then add a new one").
router.patch("/images/:imageId/file", upload.single("file"), async (req, res) => {
  const image = await prisma.tradeImage.findFirst({ where: { id: req.params.imageId, userId: req.userId } });
  if (!image) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: "Image not found." });
  }
  if (!req.file) return res.status(400).json({ error: "No replacement image was uploaded." });

  const oldStoredName = image.storedName;
  const updated = await prisma.tradeImage.update({
    where: { id: image.id },
    data: {
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    },
  });
  fs.unlink(path.join(UPLOAD_DIR, oldStoredName), () => {}); // best-effort cleanup of the file being replaced

  res.json({ image: { ...updated, url: `/api/media/${updated.storedName}` } });
});

router.delete("/images/:imageId", async (req, res) => {
  const image = await prisma.tradeImage.findFirst({ where: { id: req.params.imageId, userId: req.userId } });
  if (!image) return res.status(404).json({ error: "Image not found." });

  await prisma.tradeImage.delete({ where: { id: image.id } });
  fs.unlink(path.join(UPLOAD_DIR, image.storedName), () => {});
  res.json({ ok: true });
});

router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Image is too large (20MB max)." });
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

module.exports = router;
