const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createAuthLimiter } = require("../src/middleware/authRateLimit");
test("authentication limits return recoverable JSON and do not block read-only status", async () => {
  const app = express();
  app.use(createAuthLimiter({ limit: 2 }));
  app.all("/", (_req, res) => res.json({ ok: true }));
  let server;
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (let i = 0; i < 2; i++) assert.equal((await fetch(url, { method: "POST" })).status, 200);
    const denied = await fetch(url, { method: "POST" });
    assert.equal(denied.status, 429);
    assert.equal((await denied.json()).code, "AUTH_RATE_LIMIT");
    assert.ok(Number(denied.headers.get("retry-after")) > 0);
    assert.equal((await fetch(url)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
