const { asyncHandler } = require("../middleware/asyncHandler");
const { createAuthLimiter } = require("../middleware/authRateLimit");
const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { signVaultToken, signNoteToken } = require("../utils/jwt");
const { hasValidVaultAccess } = require("../utils/vaultAccess");
const { recordVaultSecurityActivity } = require("../utils/vaultSecurityActivity");

const router = express.Router();
router.use(requireAuth);
router.use(createAuthLimiter({ authenticated: true }));

// Two independent vaults, each with its own password field on User and
// its own token "purpose" (see utils/jwt.js) — a locked-notes password
// can never unlock the will vault or vice versa.
const VAULTS = {
  "locked-notes": { field: "lockedNotesPasswordHash", purpose: "vault" },
  will: { field: "willPasswordHash", purpose: "will" },
};

function vaultConfig(name) {
  return VAULTS[name] || null;
}

// GET /api/security/status
router.get("/status", asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json({
    lockedNotesConfigured: Boolean(user.lockedNotesPasswordHash),
    willConfigured: Boolean(user.willPasswordHash),
  });
}));

// The Vault activity ledger contains access-control events only. It never
// stores document titles, filenames, IP addresses, note identifiers, or
// content. Collection proof is required before the ledger can be read.
router.get("/activity", asyncHandler(async (req, res) => {
  const scope = req.query.scope;
  if (scope !== undefined && !["locked-notes", "will"].includes(scope)) return res.status(400).json({ error: "Unknown security scope." });
  const requiredPurpose = scope === "will" ? "will" : "vault";
  if (!hasValidVaultAccess(req, requiredPurpose)) {
    return res.status(401).json({
      error: scope === "will" ? "Unlock Will & Inheritance before reviewing estate security activity." : "Unlock Protected Notes before reviewing security activity.",
      requiresVault: scope === "will" ? "will" : "locked-notes",
    });
  }
  const events = await prisma.vaultSecurityEvent.findMany({
    where: { userId: req.userId, ...(scope && { scope }) },
    select: { id: true, scope: true, action: true, method: true, outcome: true, deviceLabel: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.set("Cache-Control", "no-store");
  res.json({ events });
}));

// POST /api/security/:vault/password  { currentPassword?, newPassword }
// Sets the password on first use; requires the current one to change it.
router.post("/:vault/password", asyncHandler(async (req, res) => {
  const config = vaultConfig(req.params.vault);
  if (!config) return res.status(404).json({ error: "Unknown vault." });

  const { currentPassword, newPassword } = req.body;
  if (typeof newPassword !== "string" || newPassword.length < 6 || Buffer.byteLength(newPassword, "utf8") > 72) {
    return res.status(400).json({ error: "Choose a password with at least 6 characters." });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const existingHash = user[config.field];

  if (existingHash) {
    if (typeof currentPassword !== "string" || !currentPassword || Buffer.byteLength(currentPassword, "utf8") > 72) {
      return res.status(400).json({ error: "Enter your current password to change it." });
    }
    const matches = await bcrypt.compare(currentPassword, existingHash);
    if (!matches) return res.status(401).json({ error: "Current password is incorrect." });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: req.userId }, data: { [config.field]: newHash } });
  await recordVaultSecurityActivity(prisma, { userId: req.userId, scope: req.params.vault, action: existingHash ? "protection_changed" : "protection_created", method: "password", outcome: "succeeded" });
  res.json({ ok: true });
}));

// POST /api/security/:vault/verify  { password }  -> { token }
// The returned token is short-lived (15 min) and scoped to this one
// vault — see signVaultToken/verifyVaultToken in utils/jwt.js.
router.post("/:vault/verify", asyncHandler(async (req, res) => {
  const config = vaultConfig(req.params.vault);
  if (!config) return res.status(404).json({ error: "Unknown vault." });

  const noteId = req.body.noteId;
  const access = req.body.access === "write" ? "write" : "read";
  if (access === "write" && req.params.vault !== "will") return res.status(400).json({ error: "Edit authorization is only available for estate records." });
  if (typeof req.body.password !== "string" || Buffer.byteLength(req.body.password, "utf8") > 72) return res.status(400).json({ error: "Enter your protection password." });
  if (noteId !== undefined) {
    if (config.purpose !== "vault" || typeof noteId !== "string") return res.status(400).json({ error: "Invalid note." });
    const note = await prisma.note.findFirst({ where: { id: noteId, userId: req.userId, isLocked: true, isWill: false } });
    if (!note) return res.status(404).json({ error: "Locked note not found." });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user[config.field]) {
    return res.status(400).json({ error: "No password has been set up for this section yet." });
  }

  const matches = await bcrypt.compare(req.body.password || "", user[config.field]);
  if (!matches) {
    await recordVaultSecurityActivity(prisma, { userId: req.userId, scope: req.params.vault, action: "unlock_denied", method: "password", outcome: "denied" });
    return res.status(401).json({ error: "Incorrect password." });
  }

  const token = noteId ? signNoteToken(req.userId, noteId) : signVaultToken(req.userId, config.purpose, access);
  await recordVaultSecurityActivity(prisma, { userId: req.userId, scope: req.params.vault, action: noteId ? "record_unlock_succeeded" : access === "write" ? "edit_authorized" : "collection_unlock_succeeded", method: "password", outcome: "succeeded" });
  res.json({ token });
}));

module.exports = router;
