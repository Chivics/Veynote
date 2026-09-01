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

// 20MB cap — generous for notes attachments without letting someone fill
// the disk with one request. Adjust in one place if you need more.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const randomName = crypto.randomBytes(16).toString("hex");
    const ext = path.extname(file.originalname);
    cb(null, `${randomName}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: MAX_FILE_BYTES } });

function kindFor(mimeType) {
  return mimeType.startsWith("image/") ? "IMAGE" : "FILE";
}

// POST /api/notes/:noteId/attachments  (multipart/form-data, field name "file")
router.post("/:noteId/attachments", upload.single("file"), async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.noteId, userId: req.userId } });
  if (!note) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: "Note not found." });
  }
  if (!req.file) return res.status(400).json({ error: "No file was uploaded." });

  const attachment = await prisma.attachment.create({
    data: {
      userId: req.userId,
      noteId: note.id,
      kind: kindFor(req.file.mimetype),
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    },
  });

  res.status(201).json({ attachment: { ...attachment, url: `/uploads/${attachment.storedName}` } });
});

router.get("/:noteId/attachments", async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.noteId, userId: req.userId } });
  if (!note) return res.status(404).json({ error: "Note not found." });

  const attachments = await prisma.attachment.findMany({ where: { noteId: note.id }, orderBy: { createdAt: "asc" } });
  res.json({ attachments: attachments.map((a) => ({ ...a, url: `/uploads/${a.storedName}` })) });
});

router.delete("/attachments/:attachmentId", async (req, res) => {
  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, userId: req.userId },
  });
  if (!attachment) return res.status(404).json({ error: "Attachment not found." });

  await prisma.attachment.delete({ where: { id: attachment.id } });
  fs.unlink(path.join(UPLOAD_DIR, attachment.storedName), () => {}); // best-effort disk cleanup
  res.json({ ok: true });
});

// Handle multer's own errors (e.g. file too large) with a clean JSON response
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File is too large (20MB max)." });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
