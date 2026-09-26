const express = require("express");
const bcrypt = require("bcryptjs");
const { generateAuthenticationOptions, verifyAuthenticationResponse } = require("@simplewebauthn/server");
const { requireAuth, requireSession } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { createAuthLimiter } = require("../middleware/authRateLimit");
const { sessionPublic, IDLE_MINUTES } = require("../utils/sessions");

function createSessionProtectionRoutes({ db, generateOptions = generateAuthenticationOptions, verifyResponse = verifyAuthenticationResponse }) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const unavailable = res => res.status(401).json({ error: "This session ended. Sign in again to continue." });
  const failed = res => res.status(400).json({ error: "Your device request expired or could not be verified. Try again." });
  const verificationLimit = createAuthLimiter({ authenticated: true, limit: 10 });
  const config = () => { const origin = new URL(process.env.CLIENT_URL || "https://veynote.app").origin; return { origin, rpID: new URL(origin).hostname }; };
  async function unlockMethods(userId) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    const device = await db.webAuthnCredential.findFirst({ where: { userId, accountEnabledAt: { not: null } }, select: { id: true } });
    return { password: Boolean(user?.passwordHash), device: Boolean(device) };
  }

  router.get("/current", requireSession, asyncHandler(async (req, res) => {
    res.json({ session: sessionPublic(req.authSession), methods: await unlockMethods(req.userId) });
  }));
  router.patch("/current", requireAuth, asyncHandler(async (req, res) => {
    if (!IDLE_MINUTES.includes(req.body?.inactivityMinutes)) return res.status(400).json({ error: "Choose a supported inactivity duration." });
    if (Date.now() - (req.authSession.reauthenticatedAt || req.authSession.createdAt) > 5 * 60000) return res.status(403).json({ code: "REAUTH_REQUIRED", error: "Verify yourself before changing session protection, then save the setting again." });
    if (req.body.inactivityMinutes > 0) {
      const methods = await unlockMethods(req.userId);
      if (!methods.password && !methods.device) return res.status(400).json({ error: "Set up device sign-in or an account password before enabling inactivity protection, so you can resume your open work securely." });
    }
    const updated = await db.authSession.updateMany({ where: { id: req.authSessionId, revokedAt: null, lockedAt: null }, data: { inactivityMinutes: req.body.inactivityMinutes, lastActivityAt: new Date() } });
    if (updated.count !== 1) return unavailable(res);
    res.json({ session: sessionPublic(await db.authSession.findUnique({ where: { id: req.authSessionId } })) });
  }));
  router.post("/activity", requireAuth, asyncHandler(async (req, res) => {
    await db.authSession.updateMany({ where: { id: req.authSessionId, revokedAt: null, lockedAt: null }, data: { lastActivityAt: new Date() } });
    res.json({ ok: true });
  }));
  router.post("/lock", requireSession, asyncHandler(async (req, res) => {
    await db.authSession.updateMany({ where: { id: req.authSessionId, revokedAt: null, lockedAt: null }, data: { lockedAt: new Date() } });
    res.json({ ok: true });
  }));
  router.post("/logout", requireSession, asyncHandler(async (req, res) => {
    await db.authSession.updateMany({ where: { id: req.authSessionId, userId: req.userId }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
  }));

  async function resume(req) {
    return db.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: req.userId }, select: { sessionGeneration: true } });
      if (!user || user.sessionGeneration !== req.authGeneration) return null;
      const now = new Date();
      const changed = await tx.authSession.updateMany({ where: { id: req.authSessionId, userId: req.userId, revokedAt: null, expiresAt: { gt: now } },
        data: { lockedAt: null, lastActivityAt: now, reauthenticatedAt: now, reauthChallenge: null, reauthChallengeExpiresAt: null } });
      return changed.count === 1 ? sessionPublic(await tx.authSession.findUnique({ where: { id: req.authSessionId } })) : null;
    });
  }
  router.post("/reauth/password", requireSession, verificationLimit, asyncHandler(async (req, res) => {
    const password = req.body?.password;
    if (typeof password !== "string" || !password || password.length > 4096) return res.status(400).json({ error: "Enter your account password." });
    const user = await db.user.findUnique({ where: { id: req.userId }, select: { passwordHash: true } });
    if (!user?.passwordHash || !await bcrypt.compare(password, user.passwordHash)) return res.status(400).json({ error: "That account password did not match. Your workspace remains protected." });
    const session = await resume(req);
    if (!session) return unavailable(res);
    res.json({ session });
  }));
  router.post("/reauth/device/options", requireSession, verificationLimit, asyncHandler(async (req, res) => {
    const credentials = await db.webAuthnCredential.findMany({ where: { userId: req.userId, accountEnabledAt: { not: null } } });
    if (!credentials.length) return res.status(400).json({ error: "Device sign-in is not set up for this account. Use your account password or sign in again." });
    const options = await generateOptions({ rpID: config().rpID, userVerification: "required", allowCredentials: credentials.map(item => ({ id: item.credentialId, transports: item.transports ? JSON.parse(item.transports) : undefined })) });
    const saved = await db.authSession.updateMany({ where: { id: req.authSessionId, revokedAt: null }, data: { reauthChallenge: options.challenge, reauthChallengeExpiresAt: new Date(Date.now() + 5 * 60000) } });
    if (saved.count !== 1) return unavailable(res);
    res.json(options);
  }));
  router.post("/reauth/device/verify", requireSession, verificationLimit, asyncHandler(async (req, res) => {
    const response = req.body?.response;
    const pending = req.authSession;
    if (!pending.reauthChallenge || !pending.reauthChallengeExpiresAt || pending.reauthChallengeExpiresAt <= new Date() || typeof response?.id !== "string" || response.id.length > 2048) return failed(res);
    // Consume before verification. Another tab/session cannot reuse a ceremony.
    const consumed = await db.authSession.updateMany({ where: { id: pending.id, revokedAt: null, reauthChallenge: pending.reauthChallenge, reauthChallengeExpiresAt: { gt: new Date() } }, data: { reauthChallenge: null, reauthChallengeExpiresAt: null } });
    if (consumed.count !== 1) return failed(res);
    const credential = await db.webAuthnCredential.findFirst({ where: { userId: req.userId, credentialId: response.id, accountEnabledAt: { not: null } } });
    if (!credential) return failed(res);
    let verification;
    try { verification = await verifyResponse({ response, expectedChallenge: pending.reauthChallenge, expectedOrigin: config().origin, expectedRPID: config().rpID,
      credential: { id: credential.credentialId, publicKey: new Uint8Array(credential.publicKey), counter: credential.counter, transports: credential.transports ? JSON.parse(credential.transports) : undefined }, requireUserVerification: true }); }
    catch { return failed(res); }
    if (!verification.verified) return failed(res);
    const changed = await db.webAuthnCredential.updateMany({ where: { id: credential.id, counter: credential.counter, accountEnabledAt: { not: null } }, data: { counter: verification.authenticationInfo.newCounter } });
    if (changed.count !== 1) return failed(res);
    const session = await resume(req);
    if (!session) return unavailable(res);
    res.json({ session });
  }));
  return router;
}
module.exports = { createSessionProtectionRoutes };
