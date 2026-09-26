const { randomBytes, randomUUID, createHash, hkdfSync, createCipheriv, createDecipheriv } = require("node:crypto");
const nodemailer = require("nodemailer");

function mailConfig(env = process.env) {
  const port = Number(env.SMTP_PORT || 465);
  let origin;
  try {
    const url = new URL(env.CLIENT_URL || "https://veynote.app");
    if (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    origin = url.origin;
  } catch { return null; }
  const secret = env.AUTH_EMAIL_SECRET || env.JWT_SECRET;
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.SMTP_FROM) || ![465, 587].includes(port) || !secret || secret.length < 32) return null;
  return { origin, secret, from: env.SMTP_FROM, transport: {
    host: env.SMTP_HOST, port, secure: port === 465, requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 25000,
    logger: false, debug: false,
  } };
}
function emailKey(secret) { return hkdfSync("sha256", secret, "veynote", "auth-email-delivery-v1", 32); }
function sealToken(token, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", emailKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString("base64url")).join(".");
}
function openToken(sealed, secret) {
  const parts = sealed.split(".").map(value => Buffer.from(value, "base64url"));
  if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16) throw new Error("Invalid mail payload.");
  const decipher = createDecipheriv("aes-256-gcm", emailKey(secret), parts[0]);
  decipher.setAuthTag(parts[1]);
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString("utf8");
}
function tokenHash(token) { return createHash("sha256").update(token).digest("hex"); }
function validToken(token) { return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token); }

async function queueAccountEmail(db, userId, purpose, config, now = new Date()) {
  if (!["PASSWORD_RESET", "VERIFY_EMAIL"].includes(purpose)) throw new Error("Invalid email purpose.");
  const token = randomBytes(32).toString("base64url");
  try {
    await db.$transaction(async tx => {
      const existing = await tx.authEmailChallenge.findUnique({ where: { userId_purpose: { userId, purpose } } });
      // Repeated taps never invalidate the email just sent. This cooldown also
      // applies across API instances, independently of the IP rate limit.
      if (existing && now - existing.createdAt < 60000) return;
      await tx.authEmailChallenge.deleteMany({ where: { userId, purpose } });
      await tx.authEmailChallenge.create({ data: {
        userId, purpose, tokenHash: tokenHash(token), createdAt: now,
        expiresAt: new Date(now.getTime() + (purpose === "PASSWORD_RESET" ? 30 * 60000 : 24 * 60 * 60000)),
        emailJob: { create: { sealedToken: sealToken(token, config.secret), availableAt: now } },
      } });
    });
  } catch (error) {
    // A concurrent request already queued this user's latest link.
    if (error.code !== "P2002") throw error;
  }
}

function createAuthEmailWorker({ db, config, transport = config && nodemailer.createTransport(config.transport), now = () => new Date() }) {
  let running = false;
  async function tick() {
    if (!config || running) return;
    running = true;
    try {
      const time = now();
      await db.authEmailChallenge.deleteMany({ where: { expiresAt: { lte: time } } });
      const eligible = { sentAt: null, attempts: { lt: 5 }, availableAt: { lte: time }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: time } }] };
      const candidate = await db.authEmailJob.findFirst({ where: eligible, orderBy: { availableAt: "asc" } });
      if (!candidate) return;
      const leaseId = randomUUID();
      const claimed = await db.authEmailJob.updateMany({ where: { id: candidate.id, ...eligible }, data: { leaseId, leaseUntil: new Date(time.getTime() + 5 * 60000), attempts: { increment: 1 } } });
      if (claimed.count !== 1) return;
      const job = await db.authEmailJob.findUnique({ where: { id: candidate.id }, include: { challenge: { include: { user: { select: { email: true } } } } } });
      if (!job || job.challenge.expiresAt <= now()) return;
      try {
        const reset = job.challenge.purpose === "PASSWORD_RESET";
        const token = openToken(job.sealedToken, config.secret);
        // Fragment tokens stay out of HTTP URLs, referrers and server logs.
        const link = `${config.origin}/${reset ? "reset-password" : "verify-email"}#token=${token}`;
        await transport.sendMail({ from: config.from, to: job.challenge.user.email,
          subject: reset ? "Reset your Veynote password" : "Verify your Veynote email",
          text: `${reset ? "Reset your account password" : "Verify your email address"}\n\n${link}\n\nThis link expires ${reset ? "in 30 minutes" : "in 24 hours"} and can be used once. If you did not request it, ignore this email.\n\nVeynote will never ask for your device PIN or Vault password by email.`,
          disableFileAccess: true, disableUrlAccess: true,
        });
        await db.authEmailJob.updateMany({ where: { id: job.id, leaseId }, data: { sentAt: now(), sealedToken: "", leaseId: null, leaseUntil: null } });
      } catch {
        console.error(JSON.stringify({ event: "auth_email_delivery_failed" }));
        await db.authEmailJob.updateMany({ where: { id: job.id, leaseId }, data: { availableAt: new Date(now().getTime() + Math.min(30, 2 ** job.attempts) * 60000), leaseId: null, leaseUntil: null } });
      }
    } catch {
      console.error(JSON.stringify({ event: "auth_email_queue_unavailable" }));
    } finally { running = false; }
  }
  return { tick, start() { const interval = setInterval(tick, 2000); interval.unref(); void tick(); return () => { clearInterval(interval); transport?.close?.(); }; } };
}

module.exports = { mailConfig, tokenHash, validToken, queueAccountEmail, sealToken, openToken, createAuthEmailWorker };
