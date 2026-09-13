const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { noteAccess, denyNoteAccess } = require("../utils/noteAccess");

const validName = (value) => typeof value === "string" && /^[a-f0-9]{32}(?:\.[a-z0-9_-]{1,16})?$/i.test(value);
const scopeFor = (file) => JSON.stringify([file.id, file.note?.id || null, Boolean(file.note?.isLocked), Boolean(file.note?.isWill), Boolean(file.note?.isTrashed)]);
const TOKEN_OPTIONS = { algorithms: ["HS256"], issuer: "https://api.veynote.app", audience: "veynote:file" };

function createMediaRoutes({ db, root = path.join(__dirname, "..", "..", "uploads") }) {
  const access = express.Router();
  const files = express.Router();
  files.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });

  async function ownedFile(storedName, userId) {
    const attachment = await db.attachment.findFirst({ where: { storedName, userId }, include: { note: true } });
    if (attachment) {
      if (attachment.noteId && (!attachment.note || attachment.note.userId !== userId)) return null;
      return attachment;
    }
    return await db.tradeImage.findFirst({ where: { storedName, userId } })
      || await db.fileNode.findFirst({ where: { storedName, userId, isDirectory: false } });
  }

  access.post("/access", requireAuth, asyncHandler(async (req, res) => {
    const { storedName } = req.body || {};
    if (!validName(storedName)) return res.status(400).json({ error: "Invalid file reference." });
    const file = await ownedFile(storedName, req.userId);
    if (!file) return res.status(404).json({ error: "File not found." });
    if (file.note) {
      const guard = noteAccess(req, file.note);
      if (!guard.ok) return denyNoteAccess(res, guard);
    }
    const token = jwt.sign({ sub: req.userId, purpose: "file", storedName, scope: scopeFor(file) }, process.env.JWT_SECRET, {
      algorithm: "HS256", issuer: TOKEN_OPTIONS.issuer, audience: TOKEN_OPTIONS.audience, expiresIn: "60s",
    });
    res.set("Cache-Control", "no-store");
    res.json({ url: `/uploads/${storedName}?access=${token}`, expiresIn: 60 });
  }));

  files.get("/:storedName", asyncHandler(async (req, res) => {
    if (!validName(req.params.storedName)) return res.status(404).json({ error: "File not found." });
    let grant;
    try {
      grant = jwt.verify(req.query.access, process.env.JWT_SECRET, TOKEN_OPTIONS);
      if (grant.purpose !== "file" || typeof grant.sub !== "string" || grant.storedName !== req.params.storedName) throw new Error("Invalid scope");
    } catch {
      return res.status(401).json({ error: "File access expired. Reopen the file to continue." });
    }
    const file = await ownedFile(req.params.storedName, grant.sub);
    if (!file || grant.scope !== scopeFor(file)) return res.status(404).json({ error: "File access is no longer available." });
    return sendMedia(res, file, root);
  }));

  return { access, files };
}

function sendMedia(res, file, root) {
  if (!validName(file.storedName)) return res.status(404).json({ error: "File not found." });
  const raster = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"].includes(file.mimeType);
  res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; sandbox" });
  if (!raster) res.attachment(file.originalName || file.name || "download");
  res.type(raster ? file.mimeType : "application/octet-stream");
  return res.sendFile(file.storedName, { root: path.resolve(root), dotfiles: "deny" }, (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: "The stored file is unavailable." });
  });
}

module.exports = { createMediaRoutes, sendMedia, validName };
