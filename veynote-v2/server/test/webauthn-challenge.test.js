const test = require("node:test");
const assert = require("node:assert/strict");
const { consumeChallenge } = require("../src/utils/webauthnChallenge");
function database(expired = false) {
  let row = { webauthnChallenge: JSON.stringify({ challenge: "random", purpose: "authenticate", noteId: "a" }), webauthnChallengeExpiresAt: new Date(Date.now() + (expired ? -1000 : 60000)) };
  return { user: {
    async findUnique() { return { ...row }; },
    async updateMany({ where, data }) {
      if (where.webauthnChallenge !== row.webauthnChallenge) return { count: 0 };
      row = { ...row, ...data }; return { count: 1 };
    },
  } };
}
test("a passkey challenge can be consumed only once under concurrent verification", async () => {
  const db = database();
  const results = await Promise.all([consumeChallenge(db, "u", "authenticate", "a"), consumeChallenge(db, "u", "authenticate", "a")]);
  assert.deepEqual(results.sort(), ["random", null].sort());
});
test("passkey challenges cannot cross notes, purposes, or expiry", async () => {
  assert.equal(await consumeChallenge(database(), "u", "authenticate", "b"), null);
  assert.equal(await consumeChallenge(database(), "u", "register", "a"), null);
  assert.equal(await consumeChallenge(database(true), "u", "authenticate", "a"), null);
});
