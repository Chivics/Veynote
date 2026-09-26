const express = require("express");
const { randomBytes } = require("node:crypto");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const prisma = require("../lib/prisma");
const { signToken, verifyToken } = require("../utils/jwt");
const { authorizeSession } = require("../utils/sessions");
const { requireAuth } = require("../middleware/auth");
const { userPublic } = require("../utils/userPublic");
const { asyncHandler } = require("../middleware/asyncHandler");
const { createAuthLimiter } = require("../middleware/authRateLimit");
const { generateAuthenticationOptions, verifyAuthenticationResponse, generateRegistrationOptions, verifyRegistrationResponse } = require("@simplewebauthn/server");
const { consumeChallenge } = require("../utils/webauthnChallenge");

const router = express.Router();
router.use(["/login", "/register", "/passkey/options", "/passkey/verify"], createAuthLimiter());

const GOOGLE_ENABLED = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://api.veynote.app/api/auth/google/callback"
    : "http://localhost:4000/api/auth/google/callback");
const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CLIENT_ORIGIN = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

function passkeyConfig() {
  const origin = CLIENT_ORIGIN;
  return { origin, rpID: new URL(origin).hostname };
}

router.get("/methods", (_req, res) => res.json({ google: GOOGLE_ENABLED, passkey: true }));

if (GOOGLE_ENABLED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email || profile._json?.email_verified !== true) return done(new Error("Google account email is not verified."));

          let user = await prisma.user.findUnique({ where: { email } });

          if (!user) {
            user = await prisma.user.create({
              data: {
                name: profile.displayName || "New user",
                email,
                googleId: profile.id,
                avatarUrl: profile.photos?.[0]?.value || null,
              },
            });
          } else if (!user.googleId) {
            // an account with this email already exists via password login — link it
            user = await prisma.user.update({
              where: { id: user.id },
              data: { googleId: profile.id },
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

// -- Register (email/password) --------------------------------------------
router.post("/register", asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (typeof name !== "string" || !name.trim() || name.length > 120 || typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string") {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ error: "Password must be at least 8 characters and no more than 72 UTF-8 bytes." });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const token = signToken(user.id, user.sessionGeneration);
  await authorizeSession(prisma, token, verifyToken(token), req.headers["user-agent"]);
  res.status(201).json({ token, user: userPublic(user) });
}));

// -- Login (email/password) ------------------------------------------------
router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || !email || email.length > 254 || typeof password !== "string" || !password || password.length > 4096) {
    return res.status(400).json({ error: "Enter your email address and password." });
  }
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = signToken(user.id, user.sessionGeneration);
  await authorizeSession(prisma, token, verifyToken(token), req.headers["user-agent"]);
  res.json({ token, user: userPublic(user) });
}));

// A registered, user-verified passkey can create an ordinary account session.
// Devices discover an account through its credential; older non-discoverable
// credentials retain the email-bound fallback.
router.post("/passkey/options", asyncHandler(async (req, res) => {
  const email = req.body?.email;
  // Discoverable credentials let the OS choose an account without collecting
  // an email first. Persist ceremonies so replay protection survives restarts
  // and works across multiple API instances.
  if (email === undefined || email === "") {
    const { rpID } = passkeyConfig();
    const options = await generateAuthenticationOptions({ rpID, allowCredentials: [], userVerification: "required" });
    const challengeId = randomBytes(32).toString("hex");
    await prisma.webAuthnLoginChallenge.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await prisma.webAuthnLoginChallenge.create({ data: {
      id: challengeId, challenge: options.challenge,
      expiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS),
    } });
    return res.json({ ...options, challengeId });
  }
  if (typeof email !== "string" || !email.trim() || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address for device sign-in." });
  }
  const user = await prisma.user.findUnique({ where: { email: email.trim() } });
  const credentials = user ? await prisma.webAuthnCredential.findMany({ where: { userId: user.id, accountEnabledAt: { not: null } } }) : [];
  if (!credentials.length) {
    return res.status(400).json({ error: "Device sign-in hasn't been set up for this email. Use email and password or Google first." });
  }
  const { rpID } = passkeyConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports ? JSON.parse(credential.transports) : undefined,
    })),
    userVerification: "required",
  });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      webauthnChallenge: JSON.stringify({ challenge: options.challenge, purpose: "account-login", noteId: null }),
      webauthnChallengeExpiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS),
    },
  });
  res.json(options);
}));

router.post("/passkey/verify", asyncHandler(async (req, res) => {
  const email = req.body?.email;
  const response = req.body?.response;
  if (email === undefined || email === "") {
    const challengeId = req.body?.challengeId;
    if (typeof challengeId !== "string" || !/^[a-f0-9]{64}$/.test(challengeId) || !response || typeof response.id !== "string" || response.id.length > 2048) {
      return res.status(400).json({ error: "Start a new device sign-in attempt." });
    }
    const attempt = await prisma.webAuthnLoginChallenge.findUnique({ where: { id: challengeId } });
    if (!attempt) return res.status(400).json({ error: "This device request expired or was already used. Try again." });
    const consumed = await prisma.webAuthnLoginChallenge.deleteMany({ where: { id: challengeId, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) return res.status(400).json({ error: "This device request expired or was already used. Try again." });
    const stored = await prisma.webAuthnCredential.findFirst({ where: { credentialId: response.id, accountEnabledAt: { not: null } } });
    if (!stored) return res.status(401).json({ error: "Device sign-in is not enabled for this credential. Sign in with email or Google first." });
    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    // Discoverable assertions must identify the account owning the credential.
    const handle = response.response?.userHandle;
    if (!user || typeof handle !== "string" || handle.length > 256 || !/^[a-zA-Z0-9_-]+={0,2}$/.test(handle) ||
        !Buffer.from(handle, "base64url").equals(Buffer.from(user.id))) {
      return res.status(401).json({ error: "Your device could not verify this account. Try another sign-in method." });
    }
    return finishDeviceSignIn(req, res, user, stored, attempt.challenge, response);
  }
  if (typeof email !== "string" || !email.trim() || email.length > 254 || !response || typeof response.id !== "string") {
    return res.status(400).json({ error: "Start a new passkey sign-in attempt." });
  }
  const user = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (!user) return res.status(400).json({ error: "Start a new passkey sign-in attempt." });
  const expectedChallenge = await consumeChallenge(prisma, user.id, "account-login");
  if (!expectedChallenge) return res.status(400).json({ error: "That passkey request expired. Try again." });
  const stored = await prisma.webAuthnCredential.findFirst({ where: { userId: user.id, credentialId: response.id, accountEnabledAt: { not: null } } });
  if (!stored) return res.status(401).json({ error: "This passkey is not registered for that account." });
  return finishDeviceSignIn(req, res, user, stored, expectedChallenge, response);
}));

async function finishDeviceSignIn(req, res, user, stored, expectedChallenge, response) {
  const { rpID, origin } = passkeyConfig();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports ? JSON.parse(stored.transports) : undefined,
      },
      requireUserVerification: true,
    });
  } catch {
    return res.status(401).json({ error: "Your device could not verify you. Try again or use another sign-in method." });
  }
  if (!verification.verified) return res.status(401).json({ error: "Your device could not verify you. Try again or use another sign-in method." });
  // Compare-and-set prevents simultaneous assertions with a stale counter
  // from overwriting a newer authenticator counter.
  const changed = await prisma.webAuthnCredential.updateMany({ where: { id: stored.id, counter: stored.counter, accountEnabledAt: { not: null } }, data: { counter: verification.authenticationInfo.newCounter } });
  if (changed.count !== 1) return res.status(401).json({ error: "Device sign-in changed during verification. Please try again." });
  const token = signToken(user.id, user.sessionGeneration);
  const session = await authorizeSession(prisma, token, verifyToken(token), req.headers["user-agent"]);
  if (!session) return res.status(401).json({ error: "Your account session changed. Please sign in again." });
  res.json({ token, user: userPublic(user) });
}

// Signup can add an account-only passkey after password reauthentication.
// This credential cannot unlock Locked Notes until the owner independently
// unlocks that vault and explicitly enables the additional scope.
router.post("/passkey/register/options", requireAuth, createAuthLimiter({ authenticated: true }), asyncHandler(async (req, res) => {
  const password = req.body?.password;
  if (typeof password !== "string" || !password || password.length > 4096) {
    return res.status(400).json({ error: "Enter your account password to add a passkey." });
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.passwordHash || !await bcrypt.compare(password, user.passwordHash)) {
    return res.status(401).json({ error: "Your account password is incorrect." });
  }
  const existing = await prisma.webAuthnCredential.findMany({ where: { userId: user.id } });
  const { rpID } = passkeyConfig();
  const options = await generateRegistrationOptions({
    rpName: "Veynote",
    rpID,
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports ? JSON.parse(credential.transports) : undefined,
    })),
    authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      webauthnChallenge: JSON.stringify({ challenge: options.challenge, purpose: "account-register", noteId: null }),
      webauthnChallengeExpiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS),
    },
  });
  res.json(options);
}));

router.post("/passkey/register/verify", requireAuth, createAuthLimiter({ authenticated: true }), asyncHandler(async (req, res) => {
  const expectedChallenge = await consumeChallenge(prisma, req.userId, "account-register");
  if (!expectedChallenge) return res.status(400).json({ error: "That passkey setup expired. Try again." });
  if (!req.body?.response || typeof req.body.response.id !== "string") {
    return res.status(400).json({ error: "Start a new passkey setup attempt." });
  }
  const { rpID, origin } = passkeyConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return res.status(400).json({ error: "The device could not verify this passkey. Try again." });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: "The device could not verify this passkey. Try again." });
  }
  const { credential } = verification.registrationInfo;
  const label = req.body.deviceLabel;
  const saved = await prisma.webAuthnCredential.create({
    data: {
      userId: req.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      deviceLabel: typeof label === "string" ? label.slice(0, 100) : null,
      accountEnabledAt: new Date(),
      vaultEnabled: false,
    },
  });
  res.status(201).json({ credential: { id: saved.id, deviceLabel: saved.deviceLabel, createdAt: saved.createdAt, accountEnabledAt: saved.accountEnabledAt } });
}));

router.get("/passkey/credentials", requireAuth, asyncHandler(async (req, res) => {
  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: req.userId, accountEnabledAt: { not: null } },
    select: { id: true, deviceLabel: true, createdAt: true, vaultEnabled: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ credentials });
}));

router.post("/passkey/credentials/:id/remove-signin", requireAuth, createAuthLimiter({ authenticated: true }), asyncHandler(async (req, res) => {
  const password = req.body?.password;
  if (typeof password !== "string" || !password || password.length > 4096) {
    return res.status(400).json({ error: "Enter your account password to remove passkey sign-in." });
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.passwordHash || !await bcrypt.compare(password, user.passwordHash)) {
    return res.status(401).json({ error: "Your account password is incorrect." });
  }
  const credential = await prisma.webAuthnCredential.findFirst({
    where: { id: req.params.id, userId: req.userId, accountEnabledAt: { not: null } },
  });
  if (!credential) return res.status(404).json({ error: "Passkey not found." });
  if (credential.vaultEnabled) {
    await prisma.webAuthnCredential.update({ where: { id: credential.id }, data: { accountEnabledAt: null } });
  } else {
    await prisma.webAuthnCredential.delete({ where: { id: credential.id } });
  }
  res.json({ ok: true });
}));

// -- Google SSO -------------------------------------------------------------
router.get("/google", (req, res, next) => {
  if (!GOOGLE_ENABLED) {
    return res.status(503).json({
      error:
        "Google sign-in isn't configured yet — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env.",
    });
  }
  passport.authenticate("google", { scope: ["profile", "email"], session: false })(req, res, next);
});

router.get(
  "/google/callback",
  (req, res, next) => {
    if (!GOOGLE_ENABLED) return res.redirect(`${CLIENT_ORIGIN}/login?error=google_disabled`);
    passport.authenticate("google", { session: false, failureRedirect: `${CLIENT_ORIGIN}/login?error=google_failed` })(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const token = signToken(req.user.id, req.user.sessionGeneration);
    await authorizeSession(prisma, token, verifyToken(token), req.headers["user-agent"]);
    // The fragment is never sent in the next HTTP request or referrer. The SPA
    // reads it once and immediately removes it from browser history.
    res.redirect(`${CLIENT_ORIGIN}/auth/callback#token=${encodeURIComponent(token)}`);
  })
);

// -- Current user -------------------------------------------------------------
router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user: userPublic(user) });
}));

// -- Set default/last-active mode + remembered path (§2 of the board) ------
router.patch("/me", requireAuth, asyncHandler(async (req, res) => {
  const { defaultMode, defaultWorkspace, lastActiveNotesPath, lastActiveTradingPath, theme, editorFontSize, name } = req.body;
  if ((theme !== undefined && !["dark", "light", "system"].includes(theme)) ||
      (editorFontSize !== undefined && !["small", "medium", "comfort", "large", "display", "xlarge"].includes(editorFontSize)) ||
      (defaultMode !== undefined && !["NOTES", "TRADING"].includes(defaultMode)) ||
      (defaultWorkspace !== undefined && !["Notes", "Trading", "Business", "Library", "Journal", "Vault"].includes(defaultWorkspace)) ||
      (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 120)) ||
      (lastActiveNotesPath !== undefined && (typeof lastActiveNotesPath !== "string" || !/^\/notes(?:\/|$)/.test(lastActiveNotesPath) || lastActiveNotesPath.length > 500)) ||
      (lastActiveTradingPath !== undefined && (typeof lastActiveTradingPath !== "string" || !/^\/trading(?:\/|$)/.test(lastActiveTradingPath) || lastActiveTradingPath.length > 500))) {
    return res.status(400).json({ error: "Choose a valid profile or preference value." });
  }
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(defaultMode && { defaultMode }),
      ...(defaultWorkspace ? { defaultWorkspace } : defaultMode ? { defaultWorkspace: defaultMode === "TRADING" ? "Trading" : "Notes" } : {}),
      ...(lastActiveNotesPath && { lastActiveNotesPath }),
      ...(lastActiveTradingPath && { lastActiveTradingPath }),
      ...(theme && { theme }),
      ...(editorFontSize && { editorFontSize }),
      ...(name && { name }),
    },
  });
  res.json({ user: userPublic(user) });
}));

// -- Change password ---------------------------------------------------
router.post("/change-password", requireAuth, createAuthLimiter({ authenticated: true }), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (typeof newPassword !== "string" || typeof confirmPassword !== "string" || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: "Enter your new password twice." });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New password and confirmation don't match." });
  }
  if (newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
    return res.status(400).json({ error: "New password must be at least 8 characters and no more than 72 UTF-8 bytes." });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found." });

  if (user.passwordHash) {
    // Normal case: they already have a password, so the current one must
    // be verified before it can be changed.
    if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 4096) {
      return res.status(400).json({ error: "Enter your current password." });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
  }
  // If passwordHash is null, this account was created via Google SSO —
  // there's no existing password to verify, so this call sets one for
  // the first time (lets a Google-only account add email/password login).

  const newHash = await bcrypt.hash(newPassword, 10);
  const updated = await prisma.$transaction(async db => {
    const value = await db.user.update({ where: { id: user.id }, data: { passwordHash: newHash, sessionGeneration: { increment: 1 } } });
    await db.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    return value;
  });
  const token = signToken(user.id, updated.sessionGeneration);
  await authorizeSession(prisma, token, verifyToken(token), req.headers["user-agent"]);
  res.json({ ok: true, token, message: "Password updated. Other sessions have been signed out." });
}));

module.exports = { router, GOOGLE_ENABLED };
