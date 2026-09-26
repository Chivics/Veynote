function withSessions(db) {
  const records = new Map();
  const matches = (row, where) => Object.entries(where).every(([key, value]) => value && typeof value === "object" && !(value instanceof Date) ? (!value.gt || row[key] > value.gt) : value instanceof Date ? Number(row[key]) === Number(value) : row[key] === value);
  if (!db.user) db.user = { async findUnique() { return { sessionGeneration: 0 }; } };
  db.authSession = {
    async findMany({ where, select }) {
      return [...records.values()].filter(row => row.userId === where.userId && !row.revokedAt && row.expiresAt > where.expiresAt.gt)
        .map(row => Object.fromEntries(Object.keys(select).map(key => [key, row[key]])));
    },
    async findUnique({ where }) { return records.has(where.id) ? structuredClone(records.get(where.id)) : null; },
    async upsert({ where, create }) {
      if (!records.has(where.id)) records.set(where.id, { createdAt: new Date(), lastSeenAt: new Date(), lastActivityAt: new Date(), reauthenticatedAt: new Date(), inactivityMinutes: 0, lockedAt: null, reauthChallenge: null, reauthChallengeExpiresAt: null, revokedAt: null, ...create });
      return structuredClone(records.get(where.id));
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of records.values()) {
        if (!matches(row, where)) continue;
        Object.assign(row, data); count++;
      }
      return { count };
    },
  };
  return db;
}
module.exports = { withSessions };
