const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

function createAuthLimiter({ limit = 20, windowMs = 15 * 60 * 1000, authenticated = false } = {}) {
  return rateLimit({
    windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false,
    skip: req => req.method !== "POST" && req.method !== "DELETE",
    keyGenerator: req => authenticated && req.userId ? `user:${req.userId}` : ipKeyGenerator(req.ip),
    message: { code: "AUTH_RATE_LIMIT", error: "Too many authentication attempts. Wait 15 minutes before trying again." },
  });
}
module.exports = { createAuthLimiter };
