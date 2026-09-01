const express = require("express");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const prisma = require("../lib/prisma");
const { signToken } = require("../utils/jwt");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const GOOGLE_ENABLED = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

if (GOOGLE_ENABLED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/auth/google/callback",
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error("Google account has no email."));

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

function userPublic(user) {
  const { passwordHash, ...rest } = user;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

// -- Register (email/password) --------------------------------------------
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const token = signToken(user.id);
  res.status(201).json({ token, user: userPublic(user) });
});

// -- Login (email/password) ------------------------------------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = signToken(user.id);
  res.json({ token, user: userPublic(user) });
});

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
    if (!GOOGLE_ENABLED) return res.redirect(`${process.env.CLIENT_URL}/login?error=google_disabled`);
    passport.authenticate("google", { session: false, failureRedirect: "/login" })(req, res, next);
  },
  (req, res) => {
    const token = signToken(req.user.id);
    // Hand off to the SPA with the token in the URL — the frontend reads it
    // once and stores it, then strips it from the address bar.
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
  }
);

// -- Current user -------------------------------------------------------------
router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user: userPublic(user) });
});

// -- Set default/last-active mode + remembered path (§2 of the board) ------
router.patch("/me", requireAuth, async (req, res) => {
  const { defaultMode, lastActiveNotesPath, lastActiveTradingPath, theme, editorFontSize, name } = req.body;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(defaultMode && { defaultMode }),
      ...(lastActiveNotesPath && { lastActiveNotesPath }),
      ...(lastActiveTradingPath && { lastActiveTradingPath }),
      ...(theme && { theme }),
      ...(editorFontSize && { editorFontSize }),
      ...(name && { name }),
    },
  });
  res.json({ user: userPublic(user) });
});

// -- Change password ---------------------------------------------------
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ error: "Enter your new password twice." });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New password and confirmation don't match." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: "User not found." });

  if (user.passwordHash) {
    // Normal case: they already have a password, so the current one must
    // be verified before it can be changed.
    if (!currentPassword) {
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
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

  res.json({ ok: true, message: "Password updated." });
});

module.exports = { router, GOOGLE_ENABLED };
