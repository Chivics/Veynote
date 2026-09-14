require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const tables = await db.$queryRawUnsafe("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) IN ('user', 'authsession', 'notecreationrequest', '_prisma_migrations')");
  const columns = await db.$queryRawUnsafe("SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'user' AND COLUMN_NAME = 'sessionGeneration'");
  console.log(JSON.stringify({ tables, sessionGeneration: columns.length > 0 }));
  if (process.argv.includes("--require-ready")) {
    const ready = columns.length > 0 && ["User", "AuthSession", "NoteCreationRequest"].every(name => tables.some(table => table.TABLE_NAME === name));
    if (!ready) process.exitCode = 1;
  }
  if (tables.some(table => table.TABLE_NAME === "_prisma_migrations")) {
    const migrations = await db.$queryRawUnsafe("SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at");
    console.log(JSON.stringify({ migrations }));
  }
}
main().catch(error => {
  console.error(JSON.stringify({ check: "database", errorType: error.name, code: error.code || null }));
  process.exitCode = 1;
}).finally(() => db.$disconnect());
