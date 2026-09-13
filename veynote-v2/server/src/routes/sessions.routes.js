const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { signToken, verifyToken } = require("../utils/jwt");
const { authorizeSession } = require("../utils/sessions");
const router = express.Router();
router.use(requireAuth);
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.get("/", asyncHandler(async (req, res) => {
  const sessions = await prisma.authSession.findMany({
    where: { userId: req.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" }, take: 100,
    select: { id: true, deviceLabel: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  });
  res.json({ sessions: sessions.map(session => ({ ...session, current: session.id === req.authSessionId })) });
}));
router.post("/revoke-others", asyncHandler(async (req, res) => {
  const user = await prisma.$transaction(async db => {
    const updated = await db.user.update({ where: { id: req.userId }, data: { sessionGeneration: { increment: 1 } } });
    await db.authSession.updateMany({ where: { userId: req.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return updated;
  });
  const token = signToken(req.userId, user.sessionGeneration);
  await authorizeSession(prisma, token, verifyToken(token), req.headers["user-agent"]);
  res.json({ token });
}));
router.delete("/:id", asyncHandler(async (req, res) => {
  const result = await prisma.authSession.updateMany({ where: { id: req.params.id, userId: req.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!result.count) return res.status(404).json({ error: "Session not found or already signed out." });
  res.json({ ok: true, current: req.params.id === req.authSessionId });
}));
router.post("/logout", asyncHandler(async (req, res) => {
  await prisma.authSession.updateMany({ where: { id: req.authSessionId, userId: req.userId }, data: { revokedAt: new Date() } });
  res.json({ ok: true });
}));
module.exports = router;
