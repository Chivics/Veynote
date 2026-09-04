const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;

function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: "30d" });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// Short-lived, single-purpose tokens for the Locked Notes / Will &
// Inheritance vaults. Deliberately separate from the 30-day login
// token: a stolen login session shouldn't automatically grant access to
// either vault, and these expire in minutes rather than weeks, so
// unlocking one is a real "prove it again" step, not a permanent grant.
const VAULT_TOKEN_TTL = "15m";

function signVaultToken(userId, purpose) {
  return jwt.sign({ sub: userId, purpose }, SECRET, { expiresIn: VAULT_TOKEN_TTL });
}

// Throws if the token is invalid/expired, or was issued for a different
// user or a different purpose (e.g. a will-vault token can't be replayed
// against the locked-notes vault, and vice versa).
function verifyVaultToken(token, expectedUserId, expectedPurpose) {
  const payload = jwt.verify(token, SECRET);
  if (payload.sub !== expectedUserId || payload.purpose !== expectedPurpose) {
    throw new Error("Token does not match the expected user/purpose.");
  }
  return payload;
}

module.exports = { signToken, verifyToken, signVaultToken, verifyVaultToken };
