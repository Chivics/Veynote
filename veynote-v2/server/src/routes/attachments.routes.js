const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { isAllowedMime } = require("../utils/fileTypes");
const { asyncHandler } = require("../middleware/asyncHandler");
const { noteAccess, denyNoteAccess } = require("../utils/noteAccess");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 20MB cap — generous for attachments without letting someone fill the
// disk with one request. Adjust in one place if you need more.
const MAX_FILE_BYTES = 20 * 1024 * 1024;


const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const randomName = crypto.randomBytes(16).toString("hex");
    const originalExt = path.extname(file.originalname);
    const ext = /^\.[a-zA-Z0-9_-]{1,16}$/.test(originalExt) ? originalExt : "";
    cb(null, `${randomName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMime(file.mimetype)) {
      return cb(new Error("UNSUPPORTED_FILE_TYPE"));
    }
    cb(null, true);
  },
});

function kindFor(mimeType) {
  return mimeType.startsWith("image/") ? "IMAGE" : "FILE";
}

function multerErrorHandler(err, _req, res, next) {
  if (err && err.message === "UNSUPPORTED_FILE_TYPE") {
    return res.status(415).json({ error: "That file type isn't supported." });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File is too large (20MB max)." });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
}

// Builds an attachments router for a parent resource (Note or
// TradingEntry). Both mounts share every code path — upload, list,
// delete, error handling — so a fix in one place fixes both.
//   paramName:    the route param holding the parent id, e.g. "noteId"
//   findResource: (req) => the parent row, scoped to req.userId, or null
//   whereClause:  (resource) => the Attachment.where filter for that parent
//   attachData:   (resource) => extra fields to set on create (e.g. { noteId })
function createAttachmentRouter({ paramName, findResource, whereClause, attachData, noteParent = false }) {
  const router = express.Router();
  router.use(requireAuth);

  const checkParent = asyncHandler(async (req, res, next) => {
    const resource = await findResource(req);
    if (!resource) return res.status(404).json({ error: "Not found." });
    if (noteParent) {
      const guard = noteAccess(req, resource);
      if (!guard.ok) return denyNoteAccess(res, guard);
    }
    req.attachmentParent = resource;
    next();
  });

  router.post(`/:${paramName}/attachments`, checkParent, upload.single("file"), asyncHandler(async (req, res) => {
    const resource = req.attachmentParent;
    if (!req.file) return res.status(400).json({ error: "No file was uploaded." });

    let attachment;
    try {
      attachment = await prisma.attachment.create({
      data: {
        userId: req.userId,
        kind: kindFor(req.file.mimetype),
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        ...attachData(resource),
      },
      });
    } catch (error) {
      // Multer already wrote these bytes; a failed metadata write must not
      // leave an unreferenced upload behind.
      await fs.promises.unlink(req.file.path).catch(() => {});
      throw error;
    }

    res.status(201).json({ attachment: { ...attachment, url: `/uploads/${attachment.storedName}` } });
  }));

  router.get(`/:${paramName}/attachments`, checkParent, asyncHandler(async (req, res) => {
    const resource = req.attachmentParent;

    const attachments = await prisma.attachment.findMany({ where: whereClause(resource), orderBy: { createdAt: "asc" } });
    res.json({ attachments: attachments.map((a) => ({ ...a, url: `/uploads/${a.storedName}` })) });
  }));

  router.delete("/attachments/:attachmentId", asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findFirst({
      where: { id: req.params.attachmentId, userId: req.userId, ...(noteParent ? { noteId: { not: null } } : { tradingEntryId: { not: null } }) },
      include: { note: true },
    });
    if (!attachment) return res.status(404).json({ error: "Attachment not found." });
    if (noteParent) {
      const guard = noteAccess(req, attachment.note);
      if (!guard.ok) return denyNoteAccess(res, guard);
    }

    await prisma.attachment.delete({ where: { id: attachment.id } });
    fs.unlink(path.join(UPLOAD_DIR, attachment.storedName), () => {}); // best-effort disk cleanup
    res.json({ ok: true });
  }));

  router.use(multerErrorHandler);
  return router;
}

const noteAttachmentRoutes = createAttachmentRouter({
  noteParent: true,
  paramName: "noteId",
  findResource: (req) => prisma.note.findFirst({ where: { id: req.params.noteId, userId: req.userId } }),
  whereClause: (note) => ({ noteId: note.id }),
  attachData: (note) => ({ noteId: note.id }),
});

const tradingAttachmentRoutes = createAttachmentRouter({
  paramName: "entryId",
  findResource: (req) => prisma.tradingEntry.findFirst({ where: { id: req.params.entryId, userId: req.userId } }),
  whereClause: (entry) => ({ tradingEntryId: entry.id }),
  attachData: (entry) => ({ tradingEntryId: entry.id }),
});

module.exports = { noteAttachmentRoutes, tradingAttachmentRoutes };
