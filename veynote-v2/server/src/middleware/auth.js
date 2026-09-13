const { verifyToken } = require("../utils/jwt");
const { authorizeSession } = require("../utils/sessions");

async function requireAuth(req, res, next) {
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
    req.userId = payload.sub;
    req.authSessionId = session.id;
    next();
  } catch (error) { next(error); }
}

module.exports = { requireAuth };
