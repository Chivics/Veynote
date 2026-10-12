// Diagnostic for the isolated localhost preview. Never prints connection data.
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('../server/node_modules/dotenv');
const root = path.resolve(__dirname, '..');
const envFile = path.join(process.env.LOCALAPPDATA || '', 'Veynote', 'preview', 'runtime.env');
if (!process.env.LOCALAPPDATA || !fs.existsSync(envFile)) throw new Error('Isolated preview environment is unavailable.');
const local = dotenv.parse(fs.readFileSync(envFile));
const url = new URL(local.DATABASE_URL);
if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1' || url.port !== '3307' || url.pathname !== '/veynote_preview') throw new Error('Refusing to query a non-preview database.');
Object.assign(process.env, local);
const { PrismaClient } = require(path.join(root, 'server', 'node_modules', '@prisma', 'client'));
const db = new PrismaClient();
const probes = [
  ['connection', () => db.$queryRaw`SELECT 1`],
  ['account', () => db.user.findMany({ select: { sessionGeneration: true, defaultWorkspace: true, emailVerifiedAt: true }, take: 1 })],
  ['sessions', () => db.authSession.findMany({ select: { id: true, inactivityMinutes: true, lastActivityAt: true, lockedAt: true, reauthenticatedAt: true, reauthChallengeExpiresAt: true }, take: 1 })],
  ['note_saves', () => db.noteCreationRequest.findMany({ select: { id: true }, take: 1 })],
  ['note_list_summaries', () => db.note.findMany({ select: { id: true, contentPreview: true, wordCount: true }, take: 1 })],
  ['device_access', () => db.webAuthnCredential.findMany({ select: { vaultEnabled: true }, take: 1 })],
  ['device_signin', () => db.webAuthnLoginChallenge.findMany({ select: { id: true }, take: 1 })],
  ['account_email', () => db.authEmailChallenge.findMany({ select: { id: true }, take: 1 })],
  ['email_delivery', () => db.authEmailJob.findMany({ select: { id: true }, take: 1 })],
  ['writing_templates', () => db.writingTemplate.findMany({ select: { id: true, isTrashed: true }, take: 1 })],
  ['tag_index', () => db.tag.findMany({ select: { id: true, isVisibleInIndex: true }, take: 1 })],
  ['file_trash', () => db.fileNode.findMany({ select: { id: true, deletedAt: true }, take: 1 })],
  ['attachment_trash', () => db.attachment.findMany({ select: { id: true, deletedAt: true }, take: 1 })],
  ['note_comments', () => db.noteComment.findMany({ select: { id: true }, take: 1 })],
  ['task_trash', () => db.task.findMany({ select: { id: true, deletedAt: true }, take: 1 })],
];
async function check() {
  for (const [name, operation] of probes) {
    const started = Date.now();
    try {
      await Promise.race([operation(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))]);
      process.stdout.write(`${name}: ready (${Date.now() - started} ms)\n`);
    } catch (error) {
      process.stdout.write(`${name}: ${error.message === 'timeout' ? 'timed out' : `failed (${error.code || 'unknown'})`}\n`);
      process.exitCode = 1;
      break;
    }
  }
  await db.$disconnect().catch(() => {});
}
check().finally(() => process.exit(process.exitCode || 0));
