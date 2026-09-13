function withSessions(db) {
  const records = new Map();
  if (!db.user) db.user = { async findUnique() { return { sessionGeneration: 0 }; } };
  db.authSession = {
    async findMany({ where, select }) {
      return [...records.values()].filter(row => row.userId === where.userId && !row.revokedAt && row.expiresAt > where.expiresAt.gt)
        .map(row => Object.fromEntries(Object.keys(select).map(key => [key, row[key]])));
    },
    async findUnique({ where }) { return records.get(where.id) || null; },
    async upsert({ where, create }) {
      if (!records.has(where.id)) records.set(where.id, { createdAt: new Date(), lastSeenAt: new Date(), revokedAt: null, ...create });
      return records.get(where.id);
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of records.values()) {
        if (where.id && row.id !== where.id || where.userId && row.userId !== where.userId || where.revokedAt === null && row.revokedAt) continue;
        Object.assign(row, data); count++;
      }
      return { count };
    },
  };
  return db;
}
module.exports = { withSessions };
