const express = require("express");
const bcrypt = require("bcryptjs");
const { asyncHandler } = require("../middleware/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { createAuthLimiter } = require("../middleware/authRateLimit");
const { mailConfig, validToken, tokenHash, queueAccountEmail } = require("../utils/authEmail");

const accepted = { message: "If an account matches that email, a recovery link will arrive shortly. Check your inbox and spam folder." };
const invalidLink = { code: "AUTH_LINK_INVALID", error: "This link has expired or was already used. Request a new one." };
function createAccountEmailRoutes({ db, config = mailConfig() }) {
  const router = express.Router();
  router.use(["/forgot-password", "/reset-password", "/verify-email"], createAuthLimiter({ limit: 10 }));
  const unavailable = res => res.status(503).json({ code: "AUTH_EMAIL_UNAVAILABLE", error: "Email delivery is unavailable right now. Try device sign-in or Google if you previously set it up, or try again later." });

  router.post("/forgot-password", asyncHandler(async (req, res) => {
    const email = req.body?.email;
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: "Enter a valid email address." });
    if (!config) return unavailable(res);
    const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
    if (user) await queueAccountEmail(db, user.id, "PASSWORD_RESET", config);
    // Delivery happens in the durable worker, not on an account-dependent
    // SMTP round trip. Known and unknown addresses get the same response.
    res.status(202).json(accepted);
  }));
  router.post("/verification-email", requireAuth, createAuthLimiter({ authenticated: true, limit: 5 }), asyncHandler(async (req, res) => {
    if (!config) return unavailable(res);
    const user = await db.user.findUnique({ where: { id: req.userId }, select: { id: true, emailVerifiedAt: true } });
    if (!user) return res.status(401).json({ error: "Sign in again to verify your email." });
    if (!user.emailVerifiedAt) await queueAccountEmail(db, user.id, "VERIFY_EMAIL", config);
    res.status(202).json({ message: user.emailVerifiedAt ? "Your email is already verified." : "A verification link will arrive shortly. Check your inbox and spam folder." });
  }));

  async function consume(token, purpose, mutate) {
    if (!validToken(token)) return false;
    return db.$transaction(async tx => {
      const challenge = await tx.authEmailChallenge.findUnique({ where: { tokenHash: tokenHash(token) } });
      if (!challenge || challenge.purpose !== purpose || challenge.expiresAt <= new Date()) return false;
      const consumed = await tx.authEmailChallenge.deleteMany({ where: { id: challenge.id, tokenHash: tokenHash(token), purpose, expiresAt: { gt: new Date() } } });
      if (consumed.count !== 1) return false;
      await mutate(tx, challenge.userId);
      return true;
    });
  }
  router.post("/reset-password", asyncHandler(async (req, res) => {
    const { token, password, confirmPassword } = req.body || {};
    if (!validToken(token)) return res.status(400).json(invalidLink);
    if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72 || password !== confirmPassword) return res.status(400).json({ error: "Use at least 8 characters, no more than 72 UTF-8 bytes, and enter the same password twice." });
    const passwordHash = await bcrypt.hash(password, 10);
    const success = await consume(token, "PASSWORD_RESET", async (tx, userId) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, emailVerifiedAt: new Date(), sessionGeneration: { increment: 1 }, webauthnChallenge: null, webauthnChallengeExpiresAt: null } });
      await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      // Invalidate any other email link, but never change either Vault secret.
      await tx.authEmailChallenge.deleteMany({ where: { userId } });
    });
    if (!success) return res.status(400).json(invalidLink);
    res.json({ ok: true, message: "Password updated. Previous sessions are signed out. Sign in with your new password." });
  }));
  router.post("/verify-email", asyncHandler(async (req, res) => {
    const success = await consume(req.body?.token, "VERIFY_EMAIL", (tx, userId) => tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } }));
    if (!success) return res.status(400).json(invalidLink);
    res.json({ ok: true, message: "Your email is verified." });
  }));
  return router;
}
module.exports = { createAccountEmailRoutes };
