const express = require("express");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { signVaultToken } = require("../utils/jwt");
const { hasValidVaultAccess } = require("../utils/vaultAccess");

const router = express.Router();
router.use(requireAuth);

// WebAuthn is scoped to Locked Notes only, as a faster unlock method
// layered on top of the password — never a replacement for it. The
// password must already be set up before a passkey can be registered,
// so losing/replacing a device never permanently locks someone out.
//
// IMPORTANT DEPLOYMENT NOTE: WebAuthn only works over HTTPS, or on
// "localhost" exactly, per the spec — not a bare IP address or a
// non-localhost HTTP origin. rpID/origin below are derived from
// CLIENT_URL, so set that correctly in production.
function webauthnConfig() {
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const { hostname } = new URL(clientUrl);
  return { rpID: hostname, rpName: "Veynote", origin: clientUrl };
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

async function stashChallenge(userId, challenge) {
  await prisma.user.update({
    where: { id: userId },
    data: { webauthnChallenge: challenge, webauthnChallengeExpiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
}

async function consumeChallenge(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  // Always clear it, even on failure — a challenge is one-shot regardless.
  await prisma.user.update({ where: { id: userId }, data: { webauthnChallenge: null, webauthnChallengeExpiresAt: null } });
  if (!user.webauthnChallenge || !user.webauthnChallengeExpiresAt || user.webauthnChallengeExpiresAt < new Date()) {
    return null;
  }
  return user.webauthnChallenge;
}

// GET /api/webauthn/credentials — list registered passkeys (no key material)
router.get("/credentials", async (req, res) => {
  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: req.userId },
    select: { id: true, deviceLabel: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ credentials });
});

router.delete("/credentials/:id", async (req, res) => {
  if (!hasValidVaultAccess(req, "vault")) {
    return res.status(401).json({ error: "Unlock Locked Notes first.", requiresVault: "locked-notes" });
  }
  const credential = await prisma.webAuthnCredential.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!credential) return res.status(404).json({ error: "Not found." });
  await prisma.webAuthnCredential.delete({ where: { id: credential.id } });
  res.json({ ok: true });
});

// POST /api/webauthn/register/options
router.post("/register/options", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user.lockedNotesPasswordHash) {
    return res.status(400).json({ error: "Set up a Locked Notes password first — a passkey is an additional unlock method, not a replacement." });
  }
  // Adding a NEW unlock method requires already being unlocked with the
  // existing one — otherwise a stolen 30-day login session (without the
  // vault password) could register a passkey and permanently bypass it.
  if (!hasValidVaultAccess(req, "vault")) {
    return res.status(401).json({ error: "Unlock Locked Notes first to add a passkey.", requiresVault: "locked-notes" });
  }

  const existing = await prisma.webAuthnCredential.findMany({ where: { userId: req.userId } });
  const { rpID, rpName } = webauthnConfig();

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userID: new TextEncoder().encode(user.id),
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports ? JSON.parse(c.transports) : undefined })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });

  await stashChallenge(req.userId, options.challenge);
  res.json(options);
});

// POST /api/webauthn/register/verify  { response, deviceLabel? }
router.post("/register/verify", async (req, res) => {
  if (!hasValidVaultAccess(req, "vault")) {
    return res.status(401).json({ error: "Unlock Locked Notes first to add a passkey.", requiresVault: "locked-notes" });
  }
  const expectedChallenge = await consumeChallenge(req.userId);
  if (!expectedChallenge) return res.status(400).json({ error: "That registration attempt expired — try again." });

  const { rpID, origin } = webauthnConfig();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err) {
    return res.status(400).json({ error: "Couldn't verify that passkey — please try again." });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ error: "Couldn't verify that passkey — please try again." });
  }

  const { credential } = verification.registrationInfo;
  const saved = await prisma.webAuthnCredential.create({
    data: {
      userId: req.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      deviceLabel: req.body.deviceLabel?.slice(0, 100) || null,
    },
  });

  res.status(201).json({ credential: { id: saved.id, deviceLabel: saved.deviceLabel, createdAt: saved.createdAt } });
});

// POST /api/webauthn/authenticate/options
router.post("/authenticate/options", async (req, res) => {
  const credentials = await prisma.webAuthnCredential.findMany({ where: { userId: req.userId } });
  if (credentials.length === 0) {
    return res.status(400).json({ error: "No passkey is set up yet — use your password instead." });
  }

  const { rpID } = webauthnConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((c) => ({ id: c.credentialId, transports: c.transports ? JSON.parse(c.transports) : undefined })),
    userVerification: "preferred",
  });

  await stashChallenge(req.userId, options.challenge);
  res.json(options);
});

// POST /api/webauthn/authenticate/verify  { response }  -> { token }
router.post("/authenticate/verify", async (req, res) => {
  const expectedChallenge = await consumeChallenge(req.userId);
  if (!expectedChallenge) return res.status(400).json({ error: "That unlock attempt expired — try again." });

  const stored = await prisma.webAuthnCredential.findFirst({
    where: { userId: req.userId, credentialId: req.body.response?.id },
  });
  if (!stored) return res.status(400).json({ error: "That passkey isn't registered on this account." });

  const { rpID, origin } = webauthnConfig();

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports ? JSON.parse(stored.transports) : undefined,
      },
    });
  } catch (err) {
    return res.status(400).json({ error: "Couldn't verify that passkey — please try again or use your password." });
  }

  if (!verification.verified) {
    return res.status(401).json({ error: "Passkey verification failed." });
  }

  // Persist the updated signature counter — a stored counter that goes
  // backwards on a later attempt is the standard signal of a cloned
  // authenticator, which is exactly why this has to be checked and saved.
  await prisma.webAuthnCredential.update({
    where: { id: stored.id },
    data: { counter: verification.authenticationInfo.newCounter },
  });

  const token = signVaultToken(req.userId, "vault");
  res.json({ token });
});

module.exports = router;
