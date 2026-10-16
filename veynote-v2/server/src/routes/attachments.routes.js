const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { isAllowedMime } = require("../utils/fileTypes");
const { MAX_FILE_BYTES: MAX_CHUNKED_FILE_BYTES, CHUNK_BYTES, normalizeRelativePath, canonicalImportMime } = require("../utils/fileImport");
const { createChunkedFileUpload } = require("../utils/chunkedFileUpload");
const { createNoteAttachmentReceiptStore } = require("../utils/noteAttachmentReceipt");
const { asyncHandler } = require("../middleware/asyncHandler");
const { noteAccess, denyNoteAccess } = require("../utils/noteAccess");

const { uploadRoot: UPLOAD_DIR } = require("../utils/storagePaths");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// Keep Note attachment sessions separate from Files sessions. Otherwise a
// same-user session could be completed through the other resource's route.
const NOTE_SESSION_ROOT = path.join(UPLOAD_DIR, ".note-attachment-staging");
const noteChunked = createChunkedFileUpload(NOTE_SESSION_ROOT);
const noteReceipts = createNoteAttachmentReceiptStore(NOTE_SESSION_ROOT);
const completingSessions = new Set();

async function sweepAbandonedNoteAttachments() {
  await noteReceipts.sweepAbandoned({
    publicRoot: UPLOAD_DIR,
    lookupReferences: async storedName => {
      const [attachment, fileNode] = await Promise.all([
        prisma.attachment.findFirst({ where: { storedName } }),
        prisma.fileNode.findFirst({ where: { storedName } }),
      ]);
      return { attachment, fileNode };
    },
    discard: id => noteChunked.discard(id),
    isActive: id => completingSessions.has(id),
  });
}
sweepAbandonedNoteAttachments().catch(() => {});
const noteSweepTimer = setInterval(() => { sweepAbandonedNoteAttachments().catch(() => {}); }, 60 * 60 * 1000);
noteSweepTimer.unref?.();

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

function attachmentSessionName(value) {
  const name = normalizeRelativePath(value);
  return name && !name.includes("/") ? name : null;
}

function sessionView(id, session) {
  return { id, received: session.received, nextIndex: session.nextIndex, chunkBytes: CHUNK_BYTES, size: session.size };
}

function attachmentView(attachment) {
  return { ...attachment, url: `/uploads/${attachment.storedName}` };
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

  if (noteParent) {
    const checkOrdinaryNote = (req, res, next) => {
      const note = req.attachmentParent;
      if (note.isLocked || note.isWill) return res.status(403).json({ error: "Use the protected attachment flow for this note." });
      if (note.isTrashed) return res.status(410).json({ error: "Restore this note before adding files." });
      next();
    };
    const sessionForNote = async (req) => {
      const session = await noteChunked.read(req.params.sessionId, req.userId);
      return session?.purpose === "note-attachment" && session.noteId === req.attachmentParent.id ? session : null;
    };
    const base = `/:${paramName}/attachments/upload-sessions`;

    router.post(base, checkParent, checkOrdinaryNote, asyncHandler(async (req, res) => {
      const name = attachmentSessionName(req.body.name);
      const size = Number(req.body.size);
      const mimeType = String(req.body.mimeType || "");
      if (!name || !Number.isSafeInteger(size) || size < 0 || size > MAX_CHUNKED_FILE_BYTES) {
        return res.status(400).json({ error: "Choose a file no larger than 200 MB with a valid name." });
      }
      if (!isAllowedMime(mimeType) || canonicalImportMime(name) !== mimeType) return res.status(415).json({ error: "That file type or extension isn't supported." });
      const session = await noteChunked.create(req.userId, { purpose: "note-attachment", noteId: req.attachmentParent.id, path: name, size, mimeType });
      res.status(201).json({ session: sessionView(session.id, session) });
    }));

    router.get(`${base}/:sessionId`, checkParent, checkOrdinaryNote, asyncHandler(async (req, res) => {
      const receipt = await noteReceipts.read(req.params.sessionId, req.userId, req.attachmentParent.id);
      if (receipt) {
        return res.json({ session: sessionView(req.params.sessionId, { size: receipt.size, received: receipt.size, nextIndex: Math.ceil(receipt.size / CHUNK_BYTES) }), completed: true });
      }
      const session = await sessionForNote(req);
      if (!session) {
        const finalizing = await noteReceipts.readFinalizing(req.params.sessionId, req.userId, req.attachmentParent.id);
        if (!finalizing) return res.status(404).json({ error: "This attachment upload can no longer be resumed." });
        return res.json({ session: sessionView(req.params.sessionId, { size: finalizing.size, received: finalizing.size, nextIndex: Math.ceil(finalizing.size / CHUNK_BYTES) }) });
      }
      res.json({ session: sessionView(req.params.sessionId, session) });
    }));

    router.put(`${base}/:sessionId/chunks/:index`, checkParent, checkOrdinaryNote, express.raw({ type: "application/octet-stream", limit: "4mb" }), asyncHandler(async (req, res) => {
      if (!await sessionForNote(req)) return res.status(404).json({ error: "Attachment upload not found." });
      const result = await noteChunked.append(req.params.sessionId, req.userId, Number(req.params.index), req.body);
      if (!result) return res.status(404).json({ error: "This attachment upload can no longer be resumed." });
      if (result.conflict) return res.status(409).json({ error: "This upload is already being updated." });
      if (result.invalid) return res.status(409).json({ error: "The chunk is out of sequence or has the wrong size. Resume from the current position." });
      res.json({ received: result.received, nextIndex: result.nextIndex });
    }));

    router.post(`${base}/:sessionId/complete`, checkParent, checkOrdinaryNote, asyncHandler(async (req, res) => {
      const id = req.params.sessionId;
      if (completingSessions.has(id)) return res.status(409).json({ error: "This attachment is already being saved." });
      const receipt = await noteReceipts.read(id, req.userId, req.attachmentParent.id);
      if (receipt) {
        const existing = await prisma.attachment.findFirst({ where: { id: receipt.attachmentId, userId: req.userId, noteId: req.attachmentParent.id } });
        if (!existing || existing.deletedAt) return res.status(410).json({ error: "This upload was completed, but the attachment is no longer available." });
        return res.json({ attachment: attachmentView(existing) });
      }
      const session = await sessionForNote(req);
      const finalizing = await noteReceipts.readFinalizing(id, req.userId, req.attachmentParent.id);
      if (!session && !finalizing) return res.status(404).json({ error: "Attachment upload not found." });
      completingSessions.add(id);
      try {
        let details = finalizing;
        if (!details) {
          let storedName = session.materializedName;
          if (!storedName || (!fs.existsSync(path.join(NOTE_SESSION_ROOT, storedName)) && !fs.existsSync(path.join(UPLOAD_DIR, storedName)))) {
            const completed = await noteChunked.materialize(id, req.userId);
            if (!completed) return res.status(404).json({ error: "This attachment upload can no longer be resumed." });
            if (completed.conflict) return res.status(409).json({ error: "This upload is still receiving data." });
            if (completed.incomplete) return res.status(409).json({ error: "The upload is incomplete. Resume the remaining data before saving." });
            storedName = completed.storedName;
          }
          details = { userId: req.userId, noteId: session.noteId, storedName, size: session.size, path: session.path, mimeType: session.mimeType };
          // Survives a restart after the staged bytes move, even if the chunk
          // session expires before the client retries completion.
          await noteReceipts.writeFinalizing(id, details);
        } else await noteReceipts.writeFinalizing(id, details);
        const latestNote = await prisma.note.findFirst({ where: { id: details.noteId, userId: req.userId } });
        if (!latestNote || latestNote.isTrashed || latestNote.isLocked || latestNote.isWill) {
          return res.status(409).json({ error: "This note is no longer available for the attachment." });
        }
        const stagedPath = path.join(NOTE_SESSION_ROOT, details.storedName);
        const publicPath = path.join(UPLOAD_DIR, details.storedName);
        if (!fs.existsSync(publicPath) && fs.existsSync(stagedPath)) await fs.promises.rename(stagedPath, publicPath);
        const stat = await fs.promises.stat(publicPath).catch(error => { if (error.code === "ENOENT") return null; throw error; });
        if (!stat || stat.size !== details.size) return res.status(410).json({ error: "The uploaded bytes are no longer available. Choose the file again." });

        const lookup = () => prisma.attachment.findFirst({ where: { userId: req.userId, noteId: details.noteId, storedName: details.storedName } });
        const finish = async (attachment, status) => {
          await noteReceipts.write(id, { userId: req.userId, noteId: details.noteId, attachmentId: attachment.id, size: details.size });
          await noteChunked.discard(id).catch(() => {});
          await noteReceipts.removeFinalizing(id).catch(() => {});
          await fs.promises.unlink(stagedPath).catch(() => {});
          if (attachment.deletedAt) return res.status(410).json({ error: "This upload was completed, but the attachment is now in Trash." });
          res.status(status).json({ attachment: attachmentView(attachment) });
        };
        const existing = await lookup();
        if (existing) return await finish(existing, 200);
        let attachment;
        try {
          attachment = await prisma.attachment.create({ data: {
            userId: req.userId,
            kind: kindFor(details.mimeType),
            originalName: details.path,
            storedName: details.storedName,
            mimeType: details.mimeType,
            sizeBytes: details.size,
            noteId: details.noteId,
          } });
        } catch (error) {
          // A DB write can commit even when the response fails. Never remove
          // bytes when the ownership lookup itself failed or found the row.
          let persisted;
          try { persisted = await lookup(); }
          catch (_lookupError) { throw error; }
          if (persisted) return await finish(persisted, 200);
          await fs.promises.unlink(publicPath).catch(() => {});
          await fs.promises.unlink(stagedPath).catch(() => {});
          await noteReceipts.removeFinalizing(id).catch(() => {});
          await noteChunked.discard(id).catch(() => {});
          throw error;
        }
        await finish(attachment, 201);
      } finally {
        completingSessions.delete(id);
      }
    }));

    router.delete(`${base}/:sessionId`, checkParent, checkOrdinaryNote, asyncHandler(async (req, res) => {
      if (completingSessions.has(req.params.sessionId)) return res.status(409).json({ error: "This attachment is already being saved." });
      if (await noteReceipts.read(req.params.sessionId, req.userId, req.attachmentParent.id)) return res.status(409).json({ error: "This upload has already become an attachment." });
      if (await noteReceipts.readFinalizing(req.params.sessionId, req.userId, req.attachmentParent.id)) return res.status(409).json({ error: "Finish this upload before removing it." });
      if (!await sessionForNote(req)) return res.status(404).json({ error: "Attachment upload not found." });
      await noteChunked.discard(req.params.sessionId);
      res.json({ ok: true });
    }));
  }

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

    const attachments = await prisma.attachment.findMany({ where: { ...whereClause(resource), deletedAt: null }, orderBy: { createdAt: "asc" } });
    res.json({ attachments: attachments.map((a) => ({ ...a, url: `/uploads/${a.storedName}` })) });
  }));

  router.delete("/attachments/:attachmentId", asyncHandler(async (req, res) => {
    const attachment = await prisma.attachment.findFirst({
      where: { id: req.params.attachmentId, userId: req.userId, deletedAt: null, ...(noteParent ? { noteId: { not: null } } : { tradingEntryId: { not: null } }) },
      include: { note: true },
    });
    if (!attachment) return res.status(404).json({ error: "Attachment not found." });
    if (noteParent) {
      const guard = noteAccess(req, attachment.note);
      if (!guard.ok) return denyNoteAccess(res, guard);
    }

    // Ordinary writing has a recovery path in Files Trash. Sensitive records
    // are intentionally excluded from that index; their existing deliberate
    // removal flow stays permanent until Vault-specific recovery is available.
    if (noteParent && !attachment.note.isLocked && !attachment.note.isWill) {
      await prisma.attachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date() } });
      return res.json({ ok: true, recoverable: true });
    }
    await prisma.attachment.delete({ where: { id: attachment.id } });
    fs.unlink(path.join(UPLOAD_DIR, attachment.storedName), () => {}); // best-effort disk cleanup
    res.json({ ok: true, recoverable: false });
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
  findResource: (req) => prisma.tradingEntry.findFirst({ where: { id: req.params.entryId, userId: req.userId, archivedAt: null, deletedAt: null } }),
  whereClause: (entry) => ({ tradingEntryId: entry.id }),
  attachData: (entry) => ({ tradingEntryId: entry.id }),
});

module.exports = { noteAttachmentRoutes, tradingAttachmentRoutes };
