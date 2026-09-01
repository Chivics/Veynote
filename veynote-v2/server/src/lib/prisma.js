const { PrismaClient } = require("@prisma/client");

// Reuse a single client across hot-reloads in dev so we don't exhaust
// MySQL's connection pool.
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
