const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
const ISSUER = "https://api.veynote.app";
const ACCESS_AUDIENCE = "veynote:session";
const VAULT_AUDIENCE = "veynote:vault";

function verifyPurpose(token, audience, purpose) {
  const payload = jwt.verify(token, SECRET, {
    algorithms: ["HS256"], issuer: ISSUER, audience,
  });
  if (typeof payload.sub !== "string" || !payload.sub || payload.purpose !== purpose) {
    throw new Error("Invalid token purpose or subject.");
  }
  return payload;
}

function signToken(userId) {
  return jwt.sign({ sub: userId, purpose: "session" }, SECRET, {
    algorithm: "HS256", issuer: ISSUER, audience: ACCESS_AUDIENCE, expiresIn: "30d",
  });
}

function verifyToken(token) {
  return verifyPurpose(token, ACCESS_AUDIENCE, "session");
}

// Short-lived, single-purpose tokens for the Locked Notes / Will &
// Inheritance vaults. Deliberately separate from the 30-day login
// token: a stolen login session shouldn't automatically grant access to
// either vault, and these expire in minutes rather than weeks, so
// unlocking one is a real "prove it again" step, not a permanent grant.
const VAULT_TOKEN_TTL = "15m";

function signVaultToken(userId, purpose) {
  if (!["vault", "will"].includes(purpose)) throw new Error("Unknown vault purpose.");
  return jwt.sign({ sub: userId, purpose }, SECRET, {
    algorithm: "HS256", issuer: ISSUER, audience: VAULT_AUDIENCE, expiresIn: VAULT_TOKEN_TTL,
  });
}

// Throws if the token is invalid/expired, or was issued for a different
// user or a different purpose (e.g. a will-vault token can't be replayed
// against the locked-notes vault, and vice versa).
function verifyVaultToken(token, expectedUserId, expectedPurpose) {
  if (!["vault", "will"].includes(expectedPurpose)) throw new Error("Unknown vault purpose.");
  const payload = verifyPurpose(token, VAULT_AUDIENCE, expectedPurpose);
  if (payload.sub !== expectedUserId || payload.purpose !== expectedPurpose) {
    throw new Error("Token does not match the expected user/purpose.");
  }
  return payload;
}

module.exports = { signToken, verifyToken, signVaultToken, verifyVaultToken };
