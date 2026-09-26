const { verifyToken } = require("../utils/jwt");
const { authorizeSession } = require("../utils/sessions");

function authenticate({ allowLocked = false } = {}) { return async function authenticateRequest(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Not authenticated." });
  }

  let payload;
  try { payload = verifyToken(token); } catch (err) {
    return res.status(401).json({ error: "Session expired — please log in again." });
  }
  try {
    const session = await authorizeSession(require("../lib/prisma"), token, payload, req.headers["user-agent"]);
    if (!session) return res.status(401).json({ error: "This session was revoked or expired. Please log in again." });
    if (session.lockedAt && !allowLocked) return res.status(423).json({ code: "SESSION_LOCKED", error: "Your workspace is locked. Verify yourself to continue where you left off." });
    req.userId = payload.sub;
    req.authSessionId = session.id;
    req.authSession = session;
    req.authGeneration = payload.generation ?? 0;
    next();
  } catch (error) { next(error); }
}; }

const requireAuth = authenticate();
const requireSession = authenticate({ allowLocked: true });
module.exports = { requireAuth, requireSession };
