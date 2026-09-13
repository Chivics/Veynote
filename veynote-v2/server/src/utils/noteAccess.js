const { hasValidVaultAccess } = require("./vaultAccess");

function noteAccess(req, note) {
  if (!note || note.userId !== req.userId) return { ok: false, status: 404 };
  const purpose = note.isWill ? "will" : note.isLocked ? "vault" : null;
  if (purpose && !hasValidVaultAccess(req, purpose)) {
    return { ok: false, status: 401, requiresVault: purpose === "vault" ? "locked-notes" : "will" };
  }
  return { ok: true };
}

function denyNoteAccess(res, access) {
  return res.status(access.status).json({ error: access.status === 404 ? "File not found." : "Unlock this note to access its files.", ...(access.requiresVault && { requiresVault: access.requiresVault }) });
}

module.exports = { noteAccess, denyNoteAccess };
