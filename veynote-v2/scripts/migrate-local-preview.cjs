// Apply pending schema changes only to the isolated localhost preview database.
// The live API must be stopped first so Prisma can replace its Windows engine.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('../server/node_modules/dotenv');

const root = path.resolve(__dirname, '..');
const server = path.join(root, 'server');
const preview = path.join(process.env.LOCALAPPDATA || '', 'Veynote', 'preview');
const envFile = path.join(preview, 'runtime.env');

if (!process.env.LOCALAPPDATA || !fs.existsSync(envFile)) {
  throw new Error('The isolated local preview environment is not installed.');
}

const local = dotenv.parse(fs.readFileSync(envFile));
let database;
try {
  database = new URL(local.DATABASE_URL);
} catch {
  throw new Error('The isolated local preview database URL is invalid.');
}

if (
  database.protocol !== 'mysql:' ||
  database.hostname !== '127.0.0.1' ||
  database.port !== '3307' ||
  database.pathname !== '/veynote_preview'
) {
  throw new Error('Refusing to run migrations outside the isolated local preview database.');
}

if (process.argv.includes('--check')) {
  console.log('Isolated local preview database verified.');
  process.exit(0);
}

const runtime = path.join(preview, 'runtime');
const portable = fs.existsSync(runtime)
  ? fs.readdirSync(runtime)
      .filter((name) => /^node-v22\.\d+\.\d+-win-x64$/.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((name) => path.join(runtime, name, 'node.exe'))
      .find(fs.existsSync)
  : null;
const node = process.env.VEYNOTE_PREVIEW_NODE || portable || process.execPath;
const prisma = path.join(server, 'node_modules', 'prisma', 'build', 'index.js');
const env = { ...process.env, ...local, VEYNOTE_ENV_FILE: envFile };

const resolveIndex = process.argv.indexOf('--resolve-rolled-back');
if (resolveIndex >= 0) {
  const migration = process.argv[resolveIndex + 1];
  if (!/^\d{14}_[a-z0-9_]+$/.test(migration || '') || !fs.existsSync(path.join(server, 'prisma', 'migrations', migration, 'migration.sql'))) {
    throw new Error('Choose an existing migration name to resolve.');
  }
  console.log(`Marking failed local preview migration ${migration} as rolled back.`);
  const resolved = spawnSync(node, [prisma, 'migrate', 'resolve', '--rolled-back', migration], {
    cwd: server,
    env,
    stdio: 'pipe',
    encoding: 'utf8',
    windowsHide: true,
  });
  if (resolved.error || resolved.status !== 0) throw new Error('Prisma could not resolve the failed isolated local preview migration.');
}

const steps = process.argv.includes('--skip-generate') ? [['migrate', 'deploy']] : [['generate'], ['migrate', 'deploy']];
for (const args of steps) {
  const action = args.join(' ');
  console.log(`Running Prisma ${action} against the isolated local preview database.`);
  const result = spawnSync(node, [prisma, ...args], {
    cwd: server,
    env,
    stdio: 'pipe',
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    // Keep diagnostics useful while removing any connection URL or password.
    const safe = `${result.stdout || ''}\n${result.stderr || ''}`
      .replace(/mysql:\/\/[^\s]+/gi, 'mysql://[redacted]')
      .split(/\r?\n/)
      .filter(line => /Error|migration|P\d{4}|database error|failed/i.test(line))
      .slice(0, 18);
    safe.forEach(line => console.error(line.trim()));
    throw new Error(`Prisma ${action} failed for the isolated local preview database.`);
  }
  const summary = (result.stdout || '').split(/\r?\n/)
    .filter((line) => /Generated Prisma Client|migration.*applied|migration.*found|No pending migrations/i.test(line));
  summary.forEach((line) => console.log(line.trim()));
}
