const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { hasValidVaultAccess } = require("../utils/vaultAccess");
const { hasNoteAccess } = require("../utils/noteAccess");
const { DOCUMENT_CHUNK_BYTES, MAX_DOCUMENT_BYTES, STAGING_AGE_MS, revisionInput, validChunk, sha256, manifestSha256 } = require("../utils/documentRevisionProtocol");

function createNoteDocumentRevisionRoutes({ db = prisma } = {}) {
  const router = express.Router();
  router.use(requireAuth);

  async function ownedNote(req, res) {
    const note = await db.note.findFirst({ where: { id: req.params.noteId, userId: req.userId }, select: { id: true, updatedAt: true, isTrashed: true, isLocked: true, isWill: true } });
    if (!note) { res.status(404).json({ error: "Document not found." }); return null; }
    if (note.isTrashed) { res.status(410).json({ error: "Restore this document from Trash before editing it." }); return null; }
    if (note.isWill && !hasValidVaultAccess(req, "will")) { res.status(401).json({ error: "Unlock Will & Inheritance first.", requiresVault: "will" }); return null; }
    if (note.isLocked && !hasNoteAccess(req, note.id)) { res.status(401).json({ error: "Unlock this note first.", requiresVault: "locked-notes" }); return null; }
    return note;
  }

  async function ownedRevision(req, res) {
    const note = await ownedNote(req, res);
    if (!note) return null;
    const revision = await db.noteDocumentRevision.findFirst({ where: { id: req.params.revisionId, noteId: note.id, userId: req.userId } });
    if (!revision) { res.status(404).json({ error: "Document transfer not found." }); return null; }
    return { note, revision };
  }

  router.post("/:noteId/document-revisions", asyncHandler(async (req, res) => {
    const note = await ownedNote(req, res);
    if (!note) return;
    const input = revisionInput(req.body);
    if (!input) return res.status(400).json({ error: "Provide a valid document size, digest, request ID and current version. Maximum document size is 500 MB." });
    if (+note.updatedAt !== +input.expectedUpdatedAt) return res.status(409).json({ code: "NOTE_CONFLICT", error: "This document changed elsewhere. Reload before starting a transfer." });
    await db.noteDocumentRevision.deleteMany({ where: { userId: req.userId, status: { in: ["STAGING", "VERIFYING", "VERIFIED"] }, createdAt: { lt: new Date(Date.now() - STAGING_AGE_MS) } } });
    const identity = { userId_clientRequestId: { userId: req.userId, clientRequestId: input.clientRequestId } };
    let revision = await db.noteDocumentRevision.findUnique({ where: identity });
    if (revision && (revision.noteId !== note.id || revision.totalBytes !== input.totalBytes || revision.sha256 !== input.sha256 || +revision.expectedUpdatedAt !== +input.expectedUpdatedAt)) {
      return res.status(409).json({ error: "This transfer ID belongs to a different document attempt." });
    }
    if (!revision) {
      const claim = await db.$transaction(async tx => {
        // Serialize this account's transfer reservations, including requests
        // arriving at separate API workers. A preflight count alone races.
        await tx.$queryRaw`SELECT id FROM User WHERE id = ${req.userId} FOR UPDATE`;
        const existing = await tx.noteDocumentRevision.findUnique({ where: identity });
        if (existing) return { revision: existing };
        const quota = await tx.noteDocumentRevision.aggregate({ where: { userId: req.userId }, _count: { id: true }, _sum: { totalBytes: true } });
        if (quota._count.id >= 2 || (quota._sum.totalBytes || 0) + input.totalBytes > MAX_DOCUMENT_BYTES) return { quotaExceeded: true };
        return { revision: await tx.noteDocumentRevision.create({ data: { ...input, noteId: note.id, userId: req.userId } }) };
      });
      if (claim.quotaExceeded) return res.status(429).json({ error: "Finish or cancel an existing document transfer before starting another." });
      revision = claim.revision;
      if (revision.noteId !== note.id || revision.totalBytes !== input.totalBytes || revision.sha256 !== input.sha256 || +revision.expectedUpdatedAt !== +input.expectedUpdatedAt) {
        return res.status(409).json({ error: "This transfer ID belongs to a different document attempt." });
      }
    }
    res.status(201).json({ revision: { id: revision.id, status: revision.status, chunkBytes: DOCUMENT_CHUNK_BYTES, maxBytes: MAX_DOCUMENT_BYTES } });
  }));

  router.get("/:noteId/document-revisions/:revisionId", asyncHandler(async (req, res) => {
    const owned = await ownedRevision(req, res);
    if (!owned) return;
    const chunks = await db.noteDocumentChunk.findMany({ where: { revisionId: owned.revision.id }, select: { ordinal: true, sizeBytes: true, sha256: true }, orderBy: { ordinal: "asc" } });
    res.set("Cache-Control", "no-store").json({ revision: { id: owned.revision.id, status: owned.revision.status, totalBytes: owned.revision.totalBytes, chunkCount: owned.revision.chunkCount, chunkBytes: DOCUMENT_CHUNK_BYTES, receivedBytes: chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0), received: chunks.map(({ ordinal }) => ordinal) } });
  }));

  router.put("/:noteId/document-revisions/:revisionId/chunks/:index", express.raw({ type: "application/octet-stream", limit: "2mb" }), asyncHandler(async (req, res) => {
    const owned = await ownedRevision(req, res);
    if (!owned) return;
    const { revision } = owned;
    if (revision.status !== "STAGING") return res.status(409).json({ error: "This transfer is no longer accepting chunks." });
    const ordinal = Number(req.params.index);
    if (!validChunk(revision, ordinal, req.body)) return res.status(400).json({ error: "The document chunk has the wrong position or size." });
    const digest = sha256(req.body);
    try {
      await db.noteDocumentChunk.create({ data: { revisionId: revision.id, ordinal, sizeBytes: req.body.length, sha256: digest, bytes: req.body } });
    } catch (error) {
      if (error.code !== "P2002") throw error;
      const prior = await db.noteDocumentChunk.findUnique({ where: { revisionId_ordinal: { revisionId: revision.id, ordinal } }, select: { sha256: true, sizeBytes: true } });
      if (!prior || prior.sha256 !== digest || prior.sizeBytes !== req.body.length) return res.status(409).json({ error: "This chunk was already saved with different content." });
    }
    res.json({ ordinal, sha256: digest });
  }));

  router.get("/:noteId/document-revisions/:revisionId/chunks/:index", asyncHandler(async (req, res) => {
    const owned = await ownedRevision(req, res);
    if (!owned) return;
    const ordinal = Number(req.params.index);
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= owned.revision.chunkCount) return res.status(404).json({ error: "Chunk not found." });
    const chunk = await db.noteDocumentChunk.findUnique({ where: { revisionId_ordinal: { revisionId: owned.revision.id, ordinal } }, select: { bytes: true, sha256: true } });
    if (!chunk) return res.status(404).json({ error: "Chunk not found." });
    res.set("Cache-Control", "no-store").set("X-Content-SHA256", chunk.sha256).type("application/octet-stream").send(Buffer.from(chunk.bytes));
  }));

  router.post("/:noteId/document-revisions/:revisionId/verify", asyncHandler(async (req, res) => {
    const owned = await ownedRevision(req, res);
    if (!owned) return;
    const { note, revision } = owned;
    if (revision.status === "VERIFIED") return res.json({ revision: { id: revision.id, status: "VERIFIED", totalBytes: revision.totalBytes } });
    if (+note.updatedAt !== +revision.expectedUpdatedAt) return res.status(409).json({ code: "NOTE_CONFLICT", error: "This document changed during transfer. The original remains untouched." });
    // A worker that dies while verifying may release its claim after 15 min.
    await db.noteDocumentRevision.updateMany({ where: { id: revision.id, status: "VERIFYING", updatedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } }, data: { status: "STAGING" } });
    const claim = await db.noteDocumentRevision.updateMany({ where: { id: revision.id, status: "STAGING" }, data: { status: "VERIFYING" } });
    if (!claim.count) return res.status(409).json({ error: "This document transfer is already being verified." });
    let verified = false;
    try {
      const digests = [];
      let total = 0;
      for (let ordinal = 0; ordinal < revision.chunkCount; ordinal++) {
        const chunk = await db.noteDocumentChunk.findUnique({ where: { revisionId_ordinal: { revisionId: revision.id, ordinal } }, select: { bytes: true, sizeBytes: true, sha256: true } });
        if (!chunk) return res.status(409).json({ error: "Some document chunks are missing. Resume the transfer before verifying." });
        if (!validChunk(revision, ordinal, Buffer.from(chunk.bytes)) || chunk.sizeBytes !== chunk.bytes.length || sha256(chunk.bytes) !== chunk.sha256) {
          // A damaged stored chunk must be removable by a normal resume. The
          // transfer is still private and never changes the visible note.
          await db.noteDocumentChunk.delete({ where: { revisionId_ordinal: { revisionId: revision.id, ordinal } } });
          return res.status(409).json({ error: "A document chunk needs to be transferred again. Retry to resume." });
        }
        digests.push(chunk.sha256); total += chunk.sizeBytes;
      }
      if (total !== revision.totalBytes || manifestSha256(digests) !== revision.sha256) return res.status(422).json({ error: "The transferred document did not match its original checksum. The current note was not changed." });
      const latest = await db.note.findFirst({ where: { id: note.id, userId: req.userId }, select: { updatedAt: true, isTrashed: true } });
      if (!latest || latest.isTrashed || +latest.updatedAt !== +revision.expectedUpdatedAt) return res.status(409).json({ code: "NOTE_CONFLICT", error: "This document changed during transfer. The original remains untouched." });
      await db.noteDocumentRevision.update({ where: { id: revision.id }, data: { status: "VERIFIED" } });
      verified = true;
      res.json({ revision: { id: revision.id, status: "VERIFIED", totalBytes: total } });
    } finally {
      if (!verified) await db.noteDocumentRevision.updateMany({ where: { id: revision.id, status: "VERIFYING" }, data: { status: "STAGING" } });
    }
  }));

  router.delete("/:noteId/document-revisions/:revisionId", asyncHandler(async (req, res) => {
    const owned = await ownedRevision(req, res);
    if (!owned) return;
    await db.noteDocumentRevision.delete({ where: { id: owned.revision.id } });
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createNoteDocumentRevisionRoutes };
