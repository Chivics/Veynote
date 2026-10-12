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
const audioName = "c".repeat(32) + ".mp3";
const videoName = "d".repeat(32) + ".mp4";
const textName = "e".repeat(32) + ".txt";
const unsafeName = "f".repeat(32) + ".html";
let locked = false;
let pdfParentDeleted = false;
let pdfFileDeleted = false;
const file = { id: "attachment", userId: "alice", noteId: "note", storedName: name, mimeType: "image/png", originalName: "chart.png" };
const db = {
  attachment: { async findFirst({ where }) {
    return where.userId === "alice" && where.storedName === name ? { ...file, note: { id: "note", userId: "alice", isLocked: locked } } : null;
  } },
  tradeImage: { async findFirst() { return null; } },
  fileNode: { async findFirst({ where }) {
    if (where.id === "pdf-parent") return where.userId === "alice" && !pdfParentDeleted ? { id: "pdf-parent", userId: "alice", isDirectory: true, parentId: null, deletedAt: null } : null;
    const records = {
      [pdfName]: { mimeType: "application/pdf", name: "estate-plan.pdf", parentId: "pdf-parent" },
      [audioName]: { mimeType: "audio/mpeg", name: "interview.mp3" },
      [videoName]: { mimeType: "video/mp4", name: "review.mp4" },
      [textName]: { mimeType: "text/plain", name: "transcript.txt" },
      [unsafeName]: { mimeType: "text/html", name: "unsafe.html" },
    };
    const record = records[where.storedName];
    if (where.storedName === pdfName && pdfFileDeleted) return null;
    return where.userId === "alice" && record ? { id: where.storedName, userId: "alice", storedName: where.storedName, isDirectory: false, ...record } : null;
  } },
};
let server, root, base;
test.before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "veynote-media-test-"));
  await fs.writeFile(path.join(root, name), "test-image-bytes");
  await fs.writeFile(path.join(root, pdfName), "%PDF-1.4 test-preview-bytes");
  await Promise.all([audioName, videoName, textName, unsafeName].map(storedName => fs.writeFile(path.join(root, storedName), "preview-test-bytes")));
  const app = express(); app.use(express.json());
  const routes = createMediaRoutes({ db, root });
  app.use("/api/media", routes.access); app.use("/uploads", routes.files);
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await Promise.all([name, pdfName, audioName, videoName, textName, unsafeName].map(storedName => fs.unlink(path.join(root, storedName))));
  await fs.rmdir(root);
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
  assert.match(preview.headers.get("content-disposition"), /filename="estate-plan\.pdf"/);
  assert.match(preview.headers.get("content-security-policy"), /sandbox/);
  assert.equal(await preview.text(), "%PDF-1.4 test-preview-bytes");
});

test("moving a Files item or its parent to Trash invalidates existing media grants", async () => {
  const { url } = await (await requestGrant("alice", null, null, pdfName)).json();
  try {
    pdfParentDeleted = true;
    assert.equal((await fetch(base + url)).status, 404);
    assert.equal((await requestGrant("alice", null, null, pdfName)).status, 404);
    pdfParentDeleted = false;
    pdfFileDeleted = true;
    assert.equal((await fetch(base + url)).status, 404);
    assert.equal((await requestGrant("alice", null, null, pdfName)).status, 404);
  } finally { pdfParentDeleted = false; pdfFileDeleted = false; }
});
test("safe media and text preview inline only through an owned, explicit preview grant", async () => {
  for (const [storedName, mimeType] of [[audioName, "audio/mpeg"], [videoName, "video/mp4"], [textName, "text/plain"]]) {
    assert.equal((await requestGrant("bob", null, null, storedName)).status, 404);
    const { url } = await (await requestGrant("alice", null, null, storedName)).json();
    const download = await fetch(base + url);
    assert.match(download.headers.get("content-disposition"), /^attachment/);
    const preview = await fetch(base + url + "&preview=1");
    assert.equal(preview.status, 200);
    assert.ok(preview.headers.get("content-type").startsWith(mimeType));
    assert.match(preview.headers.get("content-disposition"), /^inline/);
    assert.equal(preview.headers.get("x-content-type-options"), "nosniff");
    assert.match(preview.headers.get("content-security-policy"), /sandbox/);
  }
  const { url } = await (await requestGrant("alice", null, null, unsafeName)).json();
  const unsafe = await fetch(base + url + "&preview=1");
  assert.match(unsafe.headers.get("content-disposition"), /^attachment/);
  assert.equal(unsafe.headers.get("content-type"), "application/octet-stream");
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
