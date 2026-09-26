const prismaTestPath = require.resolve("../src/lib/prisma"); require.cache[prismaTestPath] = { exports: require("../test-support/sessionDb").withSessions({}) };
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = "file-tests-only-secret-not-for-production-0123456789";
const { signToken, signVaultToken, signNoteToken } = require("../src/utils/jwt");
const { createMediaRoutes } = require("../src/routes/media.routes");
const name = "a".repeat(32) + ".png";
const pdfName = "b".repeat(32) + ".pdf";
let locked = false;
const file = { id: "attachment", userId: "alice", noteId: "note", storedName: name, mimeType: "image/png", originalName: "chart.png" };
const db = {
  attachment: { async findFirst({ where }) {
    return where.userId === "alice" && where.storedName === name ? { ...file, note: { id: "note", userId: "alice", isLocked: locked } } : null;
  } },
  tradeImage: { async findFirst() { return null; } },
  fileNode: { async findFirst({ where }) { return where.userId === "alice" && where.storedName === pdfName ? { id: "pdf", userId: "alice", storedName: pdfName, mimeType: "application/pdf", name: "estate-plan.pdf", isDirectory: false } : null; } },
};
let server, root, base;
test.before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "veynote-media-test-"));
  await fs.writeFile(path.join(root, name), "test-image-bytes");
  await fs.writeFile(path.join(root, pdfName), "%PDF-1.4 test-preview-bytes");
  const app = express(); app.use(express.json());
  const routes = createMediaRoutes({ db, root });
  app.use("/api/media", routes.access); app.use("/uploads", routes.files);
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.unlink(path.join(root, name)); await fs.unlink(path.join(root, pdfName)); await fs.rmdir(root);
});
const requestGrant = (user, vault, note, storedName = name) => fetch(`${base}/api/media/access`, { method: "POST", headers: {
  Authorization: `Bearer ${signToken(user)}`, "Content-Type": "application/json", ...(vault && { "X-Vault-Token": vault }), ...(note && { "X-Note-Token": note }),
}, body: JSON.stringify({ storedName }) });

test("raw upload URLs no longer expose bytes", async () => {
  const response = await fetch(`${base}/uploads/${name}`);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control"), /no-store/);
});
test("only the owner can mint a grant and read the file", async () => {
  assert.equal((await requestGrant("bob")).status, 404);
  const grant = await requestGrant("alice"); assert.equal(grant.status, 200);
  const { url } = await grant.json();
  const response = await fetch(base + url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "test-image-bytes");
  assert.match(response.headers.get("content-security-policy"), /sandbox/);
});
test("owned PDFs preview inline only when explicitly requested", async () => {
  assert.equal((await requestGrant("bob", null, null, pdfName)).status, 404);
  const { url } = await (await requestGrant("alice", null, null, pdfName)).json();
  const download = await fetch(base + url);
  assert.match(download.headers.get("content-disposition"), /^attachment/);
  const preview = await fetch(base + url + "&preview=1");
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "application/pdf");
  assert.match(preview.headers.get("content-disposition"), /^inline/);
  assert.match(preview.headers.get("content-security-policy"), /sandbox/);
  assert.equal(await preview.text(), "%PDF-1.4 test-preview-bytes");
});
test("locking a note invalidates previous grants and requires authentication for that note", async (t) => {
  t.after(() => { locked = false; });
  const { url } = await (await requestGrant("alice")).json();
  locked = true;
  assert.equal((await fetch(base + url)).status, 404);
  assert.equal((await requestGrant("alice")).status, 401);
  assert.equal((await requestGrant("alice", signVaultToken("bob", "vault"))).status, 401);
  assert.equal((await requestGrant("alice", signVaultToken("alice", "vault"))).status, 401);
  assert.equal((await requestGrant("alice", null, signNoteToken("alice", "other-note"))).status, 401);
  const grant = await requestGrant("alice", null, signNoteToken("alice", "note"));
  assert.equal(grant.status, 200);
  assert.equal((await fetch(base + (await grant.json()).url)).status, 200);
});
test("file grants are scoped, expiring and cannot be replaced with login tokens", async () => {
  const { url } = await (await requestGrant("alice")).json();
  assert.equal((await fetch(base + url.replace(name, "b".repeat(32) + ".png"))).status, 401);
  assert.equal((await fetch(`${base}/uploads/${name}?access=${signToken("alice")}`)).status, 401);
  const expired = jwt.sign({ sub: "alice", purpose: "file", storedName: name }, process.env.JWT_SECRET, { expiresIn: -1, issuer: "https://api.veynote.app", audience: "veynote:file" });
  assert.equal((await fetch(`${base}/uploads/${name}?access=${expired}`)).status, 401);
});
