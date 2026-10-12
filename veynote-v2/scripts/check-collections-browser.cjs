// Isolated real-browser check for Notes collections and their lifecycle.
// Uses only the local preview database and deletes its disposable account.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
process.env.RUST_LOG = "info";
const { PrismaClient } = require("../server/node_modules/@prisma/client");

const app = "http://127.0.0.1:5177";
const api = "http://127.0.0.1:4001";
const credentials = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA || "", "Veynote", "preview", "credentials.json"), "utf8"));
const db = new PrismaClient({ datasourceUrl: `mysql://veynote_preview:${credentials.databasePassword}@127.0.0.1:3307/veynote_preview` });
const chromePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
if (!chromePath) throw new Error("Chrome or Edge is needed for collection browser QA.");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-collections-qa-"));
let userId, token, child, browser, page, stage = "setup";
const screenshots = [];

async function until(work, timeout = 18000) {
  const deadline = Date.now() + timeout;
  let error;
  while (Date.now() < deadline) {
    try { const value = await work(); if (value) return value; } catch (caught) { error = caught; }
    await new Promise(resolve => setTimeout(resolve, 130));
  }
  throw new Error(`Timed out at ${stage}${error ? `: ${error.message}` : ""}`);
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once:true });
      this.socket.addEventListener("error", reject, { once:true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} exceeded 20 seconds at ${stage}`)); }, 20000);
      this.pending.set(id, { resolve:value => { clearTimeout(timeout); resolve(value); }, reject:error => { clearTimeout(timeout); reject(error); } });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}
async function request(route, method = "GET", body) {
  const response = await fetch(api + route, { method, headers:{ ...(token && { Authorization:`Bearer ${token}` }), ...(body && { "Content-Type":"application/json" }) }, body:body && JSON.stringify(body), signal:AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${data.error || ""}`);
  return data;
}
async function evaluate(expression) {
  const result = await page.send("Runtime.evaluate", { expression, awaitPromise:true, returnByValue:true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser JavaScript error");
  return result.result?.value;
}
async function navigate(route, expected) {
  await page.send("Page.navigate", { url:app + route });
  await until(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(expected)}))`));
  await evaluate("document.fonts.ready.then(() => true)");
}
async function screenshot(label) {
  const file = path.join(os.tmpdir(), `veynote-${label}-${randomBytes(4).toString("hex")}.png`);
  const { data } = await page.send("Page.captureScreenshot", { format:"png", captureBeyondViewport:false });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  screenshots.push(file);
}
async function main() {
  stage = "local preview and database";
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS name`)[0].name, "veynote_preview");
  assert.equal((await fetch(app + "/api/ready")).status, 200);
  const email = `collections-qa-${randomBytes(12).toString("hex")}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const registration = await request("/api/auth/register", "POST", { name:"Notes collection QA", email, password });
  userId = registration.user.id;
  token = registration.token;
  const create = (title, kind = "NOTE", tags = []) => request("/api/notes", "POST", { title, kind, tags, content:`<p>${title} is preserved with real content.</p>` }).then(result => result.note);
  const favorite = await create("Important research note", "NOTE", ["research"]);
  const archived = await create("Earlier journal reflection", "JOURNAL", ["research"]);
  const discarded = await create("Discarded draft");
  const permanent = await create("Purge test draft");
  await request(`/api/notes/${favorite.id}`, "PATCH", { isFavorite:true });
  await request(`/api/notes/${archived.id}`, "PATCH", { isArchived:true });
  await request(`/api/notes/${discarded.id}`, "DELETE");
  await request(`/api/notes/${permanent.id}`, "DELETE");

  stage = "Chrome startup";
  const port = await freePort();
  child = spawn(chromePath, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio:["ignore", "ignore", "pipe"], windowsHide:true });
  const version = await until(async () => {
    if (child.exitCode !== null) throw new Error(`Chrome exited ${child.exitCode}`);
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    return response.ok ? response.json() : null;
  }, 20000);
  browser = new CDP(version.webSocketDebuggerUrl);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method:"PUT" })).json();
  page = new CDP(target.webSocketDebuggerUrl);
  await page.send("Page.enable"); await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source:`localStorage.setItem('veynote_token',${JSON.stringify(token)});localStorage.setItem('veynote_install_dismissed_at',String(Date.now()));` });

  stage = "Favorites collection";
  await navigate("/notes/favorites", ".scope-favorites .notes-writing-record");
  assert.equal(await evaluate("document.querySelector('.scope-favorites .notes-records-panel')?.classList.contains('is-grid')"), true);
  assert.match(await evaluate("document.querySelector('.scope-favorites .notes-writing-record')?.innerText"), /Important research note/);
  assert.equal(await evaluate("document.querySelector('.scope-favorites .notes-filter-row')?.hidden"), true, "Secondary filters must stay out of the first mobile viewport until requested");
  await evaluate("document.querySelector('.scope-favorites .notes-filter-toggle').click()");
  assert.equal(await evaluate("document.querySelector('.scope-favorites .notes-filter-row')?.hidden"), false);
  await evaluate("document.querySelector('.scope-favorites .notes-filter-toggle').click()");
  await screenshot("favorites-populated-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414, height:896, deviceScaleFactor:1, mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Favorites must fit a phone viewport");
  await screenshot("favorites-populated-mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await screenshot("favorites-populated-mobile-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await page.send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });

  stage = "tag detail relationship";
  await navigate("/notes/tags/research", ".scope-tag .notes-tag-context");
  await until(() => evaluate("document.querySelectorAll('.scope-tag .notes-writing-record').length === 2"));
  assert.match(await evaluate("document.querySelector('.notes-tag-context')?.innerText"), /2 connected records/);
  assert.match(await evaluate("document.querySelector('.scope-tag .notes-record-layout')?.innerText"), /Archived/);
  assert.equal(await evaluate("document.querySelector('.veynote-context-navigation .veynote-back-navigation')?.textContent.trim()"), "Tags");
  assert.equal(await evaluate("document.querySelector('.scope-tag .product-page-actions .btn-primary')?.getAttribute('href')"), "/notes/new?tag=research");
  await screenshot("tag-detail-populated-desktop-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await screenshot("tag-detail-populated-desktop-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414, height:896, deviceScaleFactor:1, mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Tag detail must fit a phone viewport");
  await screenshot("tag-detail-populated-mobile-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });

  stage = "tagged creation context";
  await navigate("/notes/new?tag=research", ".note-editor-document");
  await until(() => evaluate("document.querySelector('.note-editor-document details summary')?.innerText.includes('1 tag')"));
  await new Promise(resolve => setTimeout(resolve, 1300));
  assert.equal((await request("/api/notes?scope=all&kind=ALL")).notes.some(note => !note.title && note.tags?.includes("research")), false, "Opening a tagged draft must not save an empty record before the user writes");

  stage = "UI delete to Trash";
  await navigate("/notes/all", ".scope-all .notes-writing-record");
  await evaluate("[...document.querySelectorAll('.scope-all .notes-writing-record')].find(row => row.innerText.includes('Important research note')).querySelector('.note-manage-trigger').click()");
  await until(() => evaluate("Boolean(document.querySelector('.note-actions-dialog[open]'))"));
  await evaluate("[...document.querySelectorAll('.note-actions-dialog[open] .note-actions-list button')].find(button => button.textContent.includes('Move to Trash')).click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  await evaluate("[...document.querySelectorAll('.confirm-dialog[open] .confirm-dialog-actions button')].find(button => button.textContent === 'Move to Trash').click()");
  await until(async () => (await request(`/api/notes/${favorite.id}`)).note.isTrashed === true);

  stage = "Archive and Trash recovery";
  await navigate("/notes/archive", ".scope-archive .notes-writing-record");
  assert.match(await evaluate("document.querySelector('.scope-archive .notes-writing-record')?.innerText"), /Earlier journal reflection/);
  await screenshot("archive-populated-desktop-dark");
  await navigate("/notes/trash", ".scope-trash .notes-writing-record");
  assert.equal(await evaluate("document.querySelector('.scope-trash .notes-sort-control select')?.value"), "deleted");
  await screenshot("trash-populated-desktop-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:414, height:896, deviceScaleFactor:1, mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Trash must fit a phone viewport");
  await screenshot("trash-populated-mobile-dark");
  await evaluate("[...document.querySelectorAll('.scope-trash .notes-writing-record')].find(row => row.innerText.includes('Discarded draft')).querySelector('.notes-writing-actions button:first-child').click()");
  await until(async () => (await request(`/api/notes/${discarded.id}`)).note.isTrashed === false);
  assert.equal(await evaluate("[...document.querySelectorAll('.scope-trash .notes-writing-record')].some(row => row.innerText.includes('Discarded draft'))"), false, "Restored writing must leave Trash");
  stage = "UI permanent deletion";
  await evaluate("[...document.querySelectorAll('.scope-trash .notes-writing-record')].find(row => row.innerText.includes('Purge test draft')).querySelector('.notes-writing-actions .is-danger').click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  assert.match(await evaluate("document.querySelector('.confirm-dialog[open]')?.innerText"), /cannot be restored/);
  await evaluate("[...document.querySelectorAll('.confirm-dialog[open] .confirm-dialog-actions button')].find(button => button.textContent === 'Delete permanently').click()");
  await until(async () => (await fetch(`${api}/api/notes/${permanent.id}`, { headers:{ Authorization:`Bearer ${token}` } })).status === 404);
  console.log(JSON.stringify({ result:"PASS", checks:["Favorites grid at desktop/phone", "tag detail includes archived Journal and active Note", "tag-aware creation", "UI delete to Trash", "Archive", "Trash deletion-date sort, restore and permanent deletion"], screenshots }));
}

main().catch(error => { console.error(`COLLECTION QA FAILED at ${stage}: ${error.message}`); process.exitCode = 1; }).finally(async () => {
  try { if (userId) await db.user.deleteMany({ where:{ id:userId } }); } catch { console.error("Disposable account cleanup needs attention."); process.exitCode = 1; }
  try { await browser?.send("Browser.close"); } catch { child?.kill(); }
  page?.close(); browser?.close(); child?.kill();
  await db.$disconnect();
  const target = path.resolve(profile), tmp = path.resolve(os.tmpdir());
  if (path.dirname(target) === tmp && path.basename(target).startsWith("veynote-collections-qa-")) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { fs.rmSync(target, { recursive:true, force:true }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
  }
});
