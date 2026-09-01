const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const VALID_STAGES = ["SETUP", "ENTRY", "DURING_TRADE", "POST_TRADE", "OTHER"];

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
  const entry = await prisma.tradingEntry.findFirst({ where: { id: req.params.entryId, userId: req.userId } });
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

  res.status(201).json({ image: { ...image, url: `/uploads/${image.storedName}` } });
});

router.get("/entries/:entryId/images", async (req, res) => {
  const entry = await prisma.tradingEntry.findFirst({ where: { id: req.params.entryId, userId: req.userId } });
  if (!entry) return res.status(404).json({ error: "Trade entry not found." });

  const images = await prisma.tradeImage.findMany({
    where: { tradingEntryId: entry.id },
    orderBy: { createdAt: "asc" },
  });
  res.json({ images: images.map((i) => ({ ...i, url: `/uploads/${i.storedName}` })) });
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
  res.json({ image: { ...updated, url: `/uploads/${updated.storedName}` } });
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
