const { createHash } = require("crypto");
function sessionId(token) { return createHash("sha256").update(token).digest("hex"); }
function deviceLabel(agent = "") {
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const platform = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Macintosh/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "Unknown device";
  return `${browser} on ${platform}`;
}
async function authorizeSession(db, token, payload, agent) {
  const user = await db.user.findUnique({ where: { id: payload.sub }, select: { sessionGeneration: true } });
  if (!user || (payload.generation ?? 0) !== (user.sessionGeneration ?? 0)) return null;
  const id = sessionId(token);
  const now = new Date();
  let session = await db.authSession.findUnique({ where: { id } });
  if (!session) {
    session = await db.authSession.upsert({ where: { id }, update: {}, create: {
      id, userId: payload.sub, deviceLabel: deviceLabel(agent), expiresAt: new Date(payload.exp * 1000),
    } });
  }
  if (session.userId !== payload.sub || session.revokedAt || session.expiresAt <= now) return null;
  if (now - session.lastSeenAt > 60000) await db.authSession.updateMany({ where: { id, revokedAt: null }, data: { lastSeenAt: now } });
  return session;
}
module.exports = { authorizeSession, sessionId, deviceLabel };
