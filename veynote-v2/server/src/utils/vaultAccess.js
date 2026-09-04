const { verifyVaultToken } = require("./jwt");

// Checks the X-Vault-Token / X-Will-Token header against the given
// purpose ("vault" for Locked Notes, "will" for Will & Inheritance).
// Shared by notes.routes.js (gating note read/write) and
// webauthn.routes.js (gating passkey registration — adding a new unlock
// method should require already being unlocked, same as changing a
// password would).
function hasValidVaultAccess(req, purpose) {
  const header = purpose === "will" ? req.headers["x-will-token"] : req.headers["x-vault-token"];
  if (!header) return false;
  try {
    verifyVaultToken(header, req.userId, purpose);
    return true;
  } catch {
    return false;
  }
}

module.exports = { hasValidVaultAccess };
