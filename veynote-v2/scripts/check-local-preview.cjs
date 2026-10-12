// End-to-end smoke check of the real, isolated preview. No fixtures or mock API.
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
process.env.RUST_LOG = "info";
const { PrismaClient } = require("../server/node_modules/@prisma/client");
const root = path.join(process.env.LOCALAPPDATA, "Veynote/preview");
const credentials = JSON.parse(fs.readFileSync(path.join(root, "credentials.json"), "utf8"));
const db = new PrismaClient({ datasourceUrl: `mysql://veynote_preview:${credentials.databasePassword}@127.0.0.1:3307/veynote_preview` });
const origin = "http://127.0.0.1:4001";
const accounts = [];
let uploadedFile;
let uploadedAttachment;
let token;
async function request(route, { method = "GET", body, auth = token, expected = 200 } = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${origin}${route}`, { method,
    headers: { ...(auth && { Authorization: `Bearer ${auth}` }), ...(body && !multipart && { "Content-Type": "application/json" }) },
    body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, expected, `${method} ${route}: HTTP ${response.status}`);
  return response.json();
}
async function register() {
  const suffix = randomBytes(12).toString("hex");
  const email = `preview-check-${suffix}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const data = await request("/api/auth/register", { method: "POST", auth: null, expected: 201,
    body: { name: "Local workflow check", email, password } });
  accounts.push({ id: data.user.id, email });
  return { ...data, email, password };
}
async function main() {
  const database = await db.$queryRaw`SELECT DATABASE() AS name`;
  assert.equal(database[0].name, "veynote_preview");
  await request("/api/ready", { auth: null });
  const account = await register();
  const login = await request("/api/auth/login", { method: "POST", auth: null, body: { email: account.email, password: account.password } });
  token = login.token;
  assert.equal((await request("/api/auth/me")).user.id, account.user.id);
  const folder = (await request("/api/folders", { method: "POST", expected: 201, body: { name: "Local persistence check" } })).folder;
  const visualNote = (await request("/api/notes", { method: "POST", expected: 201, body: { content: '<table><tbody><tr><td></td></tr></tbody></table>', folderId: folder.id } })).note;
  assert.ok((await request(`/api/notes/${visualNote.id}`)).note.content.includes("<table>"));
  let note = (await request("/api/notes", { method: "POST", expected: 201,
    body: { title: "Local saved note", content: "<p>Persisted in local MySQL.</p>", folderId: folder.id } })).note;
  note = (await request(`/api/notes/${note.id}`, { method: "PATCH",
    body: { content: "<p>Updated and persisted.</p>", expectedUpdatedAt: note.updatedAt } })).note;
  assert.equal((await request(`/api/notes/${note.id}`)).note.content, "<p>Updated and persisted.</p>");
  const freshLogin = await request("/api/auth/login", { method: "POST", auth: null, body: { email: account.email, password: account.password } });
  assert.equal((await request(`/api/notes/${note.id}`, { auth: freshLogin.token })).note.folderId, folder.id);
  await request(`/api/notes/${note.id}`, { method:"PATCH", body:{ isPinned:true } });
  await request(`/api/notes/${note.id}`, { method:"PATCH", body:{ isFavorite:true } });
  const savedFlags = (await request(`/api/notes/${note.id}`, { auth:freshLogin.token })).note;
  assert.equal(savedFlags.isPinned,true); assert.equal(savedFlags.isFavorite,true);
  assert.equal(savedFlags.content,"<p>Updated and persisted.</p>");
  assert.ok((await request('/api/notes?scope=favorites')).notes.some(record=>record.id===note.id));
  await request(`/api/notes/${note.id}`, { method:"PATCH", body:{ isPinned:false, isFavorite:false } });
  assert.ok(!(await request('/api/notes?scope=favorites')).notes.some(record=>record.id===note.id));

  const bytes = "Veynote local upload check";
  const data = new FormData(); data.append("files", new Blob([bytes], { type: "text/plain" }), "preview-check.txt");
  uploadedFile = (await request("/api/files/upload", { method: "POST", body: data, expected: 201 })).files[0];
  const fileName = uploadedFile.url.split("/").pop();
  assert.ok(fs.existsSync(path.join(root, "uploads", fileName)));
  const grant = await request("/api/media/access", { method: "POST", body: { storedName: fileName } });
  const downloaded = await fetch(`${origin}${grant.url}`);
  assert.equal(downloaded.status, 200); assert.equal(await downloaded.text(), bytes);
  assert.equal((await fetch(`${origin}/uploads/${fileName}`)).status, 401);
  const attachmentData = new FormData(); attachmentData.append("file", new Blob([bytes], { type: "text/plain" }), "note-check.txt");
  uploadedAttachment = (await request(`/api/notes/${note.id}/attachments`, { method: "POST", body: attachmentData, expected: 201 })).attachment;
  assert.ok(fs.existsSync(path.join(root, "uploads", uploadedAttachment.storedName)));
  const other = await register();
  await request(`/api/notes/${note.id}`, { auth: other.token, expected: 404 });
  await request("/api/media/access", { method: "POST", auth: other.token, body: { storedName: fileName }, expected: 404 });
  await request(`/api/notes/${note.id}/permanent`, { method: "DELETE", expected: 409 });
  await request(`/api/notes/${note.id}`, { method: "PATCH", body: { isArchived: true } });
  const deleted = await request(`/api/notes/${note.id}`, { method: "DELETE" });
  assert.equal(deleted.permanentlyDeleted, false);
  assert.equal((await request(`/api/notes/${note.id}`, { method: "DELETE" })).permanentlyDeleted, false);
  assert.ok((await request('/api/notes?scope=trash')).notes.some(record => record.id === note.id));
  assert.ok(!(await request('/api/notes?scope=all')).notes.some(record => record.id === note.id));
  await request(`/api/notes/${note.id}`, { method: "PATCH", body: { isFavorite: true }, expected: 410 });
  const restored = (await request(`/api/notes/${note.id}/restore`, { method: "POST" })).note;
  assert.equal(restored.content, "<p>Updated and persisted.</p>");
  assert.equal(restored.folderId, folder.id); assert.equal(restored.isArchived, true);
  assert.ok(restored.attachments.some(file => file.id === uploadedAttachment.id));
  await request(`/api/notes/${note.id}`, { method: "PATCH", body: { isArchived: false } });
  assert.ok((await request('/api/notes?scope=all')).notes.some(record => record.id === note.id));
  await request(`/api/notes/${note.id}`, { method: "DELETE" });
  await request(`/api/notes/${note.id}/permanent`, { method: "DELETE", auth: other.token, expected: 404 });
  // Permanent-delete coverage uses only this script's disposable account.
  await request(`/api/notes/${note.id}/permanent`, { method: "DELETE" });
  await request(`/api/notes/${note.id}`, { expected: 404 });
  // The owning rows are gone; remove only our synthetic upload at cleanup.
  const syntheticAttachmentPath = path.join(root, "uploads", uploadedAttachment.storedName);
  assert.equal(path.dirname(syntheticAttachmentPath), path.join(root, "uploads"));
  fs.rmSync(syntheticAttachmentPath, { force: true }); uploadedAttachment = null;
  const page = await fetch("http://127.0.0.1:5177/"); assert.equal(page.status, 200);
  const proxied = await fetch("http://127.0.0.1:5177/api/ready"); assert.equal(proxied.status, 200);
  console.log("PASS: real signup/login, session, folder, visual-only note persistence, save/update/re-login, pin/favorite, uploads, protected downloads, ownership, Archive/Trash/repeated Delete/Restore/explicit purge, and frontend API proxy.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  try {
    if (uploadedAttachment) await request(`/api/notes/attachments/${uploadedAttachment.id}`, { method: "DELETE" });
    if (uploadedFile) await request(`/api/files/${uploadedFile.id}`, { method: "DELETE" });
    for (const account of accounts) await db.user.deleteMany({ where: { id: account.id, email: account.email } });
  } catch { console.error("Local test cleanup needs attention."); process.exitCode = 1; }
  await db.$disconnect();
});
