// Exercises real Notes folders against the isolated local preview database.
// A disposable account and browser profile are removed after the check.
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
if (!chromePath) throw new Error("Chrome or Edge is needed for folder browser QA.");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-folders-qa-"));
let userId, token, child, browser, page, stage = "setup";
const screenshots = [];
function at(label) { stage = label; console.error(`FOLDER QA: ${label}`); }

async function until(work, timeout = 20000) {
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
    this.socket = new WebSocket(url); this.sequence = 0; this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once:true }); this.socket.addEventListener("error", reject, { once:true }); });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data), pending = this.pending.get(message.id);
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
}
async function chooseFiles(selector, files) {
  const { root } = await page.send("DOM.getDocument", { depth:1 });
  const { nodeId } = await page.send("DOM.querySelector", { nodeId:root.nodeId, selector });
  assert.ok(nodeId, `File picker ${selector} must exist`);
  await page.send("DOM.setFileInputFiles", { nodeId, files });
}
async function screenshot(label) {
  const file = path.join(os.tmpdir(), `veynote-${label}-${randomBytes(4).toString("hex")}.png`);
  const { data } = await page.send("Page.captureScreenshot", { format:"png", captureBeyondViewport:true });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  screenshots.push(file);
}

async function main() {
  at("isolated preview readiness");
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS name`)[0].name, "veynote_preview");
  at("preview database confirmed");
  const stale = await db.user.findMany({ where:{ email:{ startsWith:"folders-qa-", endsWith:"@example.invalid" }, createdAt:{ lt:new Date(Date.now() - 60000) } }, select:{ id:true } });
  if (stale.length) { await db.user.deleteMany({ where:{ id:{ in:stale.map(user => user.id) } } }); console.error(`Removed ${stale.length} abandoned disposable folder QA accounts.`); }
  assert.equal((await fetch(app + "/api/ready")).status, 200);
  at("preview API confirmed");
  const registration = await request("/api/auth/register", "POST", { name:"Folder QA", email:`folders-qa-${randomBytes(12).toString("hex")}@example.invalid`, password:randomBytes(24).toString("base64url") });
  userId = registration.user.id; token = registration.token;
  at("disposable account registered");
  const folder = (await request("/api/folders", "POST", { name:"Research room", color:"#7c6cff" })).folder;
  await request("/api/folders", "POST", { name:"Sources", parentId:folder.id });
  await request("/api/notes", "POST", { title:"Zebra brief", content:"<p>Final draft.</p>", folderId:folder.id });
  await request("/api/notes", "POST", { title:"Alpha brief", content:"<p>Starting point.</p>", folderId:folder.id });
  at("folder fixtures created");

  at("Chrome startup");
  const port = await freePort();
  child = spawn(chromePath, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio:["ignore", "ignore", "pipe"], windowsHide:true });
  const version = await until(async () => {
    if (child.exitCode !== null) throw new Error(`Chrome exited ${child.exitCode}`);
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    return response.ok ? response.json() : null;
  });
  browser = new CDP(version.webSocketDebuggerUrl);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method:"PUT" })).json();
  page = new CDP(target.webSocketDebuggerUrl);
  await page.send("Page.enable"); await page.send("Runtime.enable"); await page.send("DOM.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source:`localStorage.setItem('veynote_token',${JSON.stringify(token)});localStorage.setItem('veynote_install_dismissed_at',String(Date.now()));` });

  at("folder navigation and contents");
  await navigate("/notes/folders", ".folder-directory-card");
  assert.match(await evaluate("document.querySelector('.folder-directory-grid')?.innerText"), /Research room/);
  await navigate(`/notes/folders/${folder.id}`, ".folder-workspace");
  await until(() => evaluate("document.querySelector('.folder-note-list')?.innerText.includes('Alpha brief')"));
  assert.match(await evaluate("document.querySelector('.nested-folder-grid')?.innerText"), /Sources/);
  assert.equal(await evaluate("document.querySelector('.folder-breadcrumb')?.innerText.includes('Research room')"), true);

  at("secure device picker into current folder");
  const textFile = path.join(profile, "a-reference.txt"), csvFile = path.join(profile, "b-ledger.csv"), oversized = path.join(profile, "too-large.txt");
  fs.writeFileSync(textFile, "A selected source file.\n");
  fs.writeFileSync(csvFile, "name,value\nexample,12\n");
  fs.writeFileSync(oversized, Buffer.alloc(20 * 1024 * 1024 + 1));
  await chooseFiles('.folder-workspace input[type="file"]', [csvFile, textFile]);
  await until(async () => (await request(`/api/notes?scope=all&folderId=${folder.id}`)).notes.reduce((total, note) => total + (note.attachments?.length || 0), 0) === 2);
  await until(() => evaluate("document.querySelector('.folder-view-tabs')?.innerText.includes('2')"));
  await evaluate("[...document.querySelectorAll('.folder-view-tabs button')].find(button => button.textContent.includes('Files')).click()");
  await until(() => evaluate("document.querySelectorAll('.folder-file-card').length === 2"));
  await screenshot("folder-files-desktop-dark");

  at("sorting, type filter, and search");
  await evaluate("{ const select = document.querySelector('select[aria-label=\"Sort folder contents\"]'); select.value = 'title'; select.dispatchEvent(new Event('change', { bubbles:true })); }");
  await until(() => evaluate("document.querySelector('.folder-file-card h3')?.textContent === 'a-reference.txt'"));
  await evaluate("{ const select = document.querySelector('select[aria-label=\"Filter file type\"]'); select.value = 'Spreadsheet'; select.dispatchEvent(new Event('change', { bubbles:true })); }");
  await until(() => evaluate("document.querySelectorAll('.folder-file-card').length === 1 && document.querySelector('.folder-file-card h3')?.textContent === 'b-ledger.csv'"));
  await evaluate("document.querySelector('input[aria-label=\"Search this folder\"]').focus()");
  await page.send("Input.insertText", { text:"a-reference" });
  await until(() => evaluate("Boolean(document.querySelector('.folder-section .empty-state')) || document.body.innerText.includes('No matching files')"));
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent === 'Clear filters').click()");
  await until(() => evaluate("document.querySelectorAll('.folder-file-card').length === 2"));
  await page.send("Emulation.setDeviceMetricsOverride", { width:414, height:896, deviceScaleFactor:1, mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true, "Folder contents must fit a phone viewport");
  await screenshot("folder-files-mobile-dark");
  await page.send("Emulation.setDeviceMetricsOverride", { width:1440, height:900, deviceScaleFactor:1, mobile:false });

  at("oversized file preflight");
  await chooseFiles('.folder-workspace input[type="file"]', [oversized]);
  await until(() => evaluate("document.querySelector('.inline-error')?.innerText.includes('20 MB')"));
  assert.equal((await request(`/api/notes?scope=all&folderId=${folder.id}`)).notes.length, 4, "Rejected file must not create an empty note");

  at("archived tab import destination");
  await navigate("/notes/folders", ".folder-directory-card");
  await evaluate("[...document.querySelectorAll('.folder-tabs button')].find(button => button.textContent.includes('Archived')).click()");
  await evaluate("[...document.querySelectorAll('.product-page-actions button')].find(button => button.textContent.includes('Import')).click()");
  await until(() => evaluate("[...document.querySelector('select[aria-label=\"Destination folder\"]')?.options || []].some(option => option.textContent === 'Research room')"));
  assert.equal(await evaluate("[...document.querySelectorAll('.folder-tabs button')].find(button => button.textContent.includes('Active'))?.className.includes('bg-ink')"), true);
  const overviewFile = path.join(profile, "overview.txt");
  fs.writeFileSync(overviewFile, "Selected from the folder directory.\n");
  at("overview destination selection");
  await evaluate(`{ const select = document.querySelector('select[aria-label="Destination folder"]'); select.value = ${JSON.stringify(folder.id)}; select.dispatchEvent(new Event('change', { bubbles:true })); }`);
  await until(() => evaluate(`document.querySelector('select[aria-label="Destination folder"]')?.value === ${JSON.stringify(folder.id)} && !document.querySelector('.folder-importer-controls button')?.disabled`));
  at("overview picker import");
  await chooseFiles('input[aria-label="Choose files from your device"]', [overviewFile]);
  await until(async () => (await request(`/api/notes?scope=all&folderId=${folder.id}`)).notes.reduce((total, note) => total + (note.attachments?.length || 0), 0) === 3);
  await until(() => evaluate("document.querySelector('.folder-import-feedback')?.innerText.includes('1 file imported into Research room')"));
  assert.equal(await evaluate("document.querySelector('.folder-import-feedback a')?.getAttribute('href')"), `/notes/folders/${folder.id}`);
  console.log(JSON.stringify({ result:"PASS", checks:["nested folder and notes", "selected device files enter current folder", "file name sorting, type and search filters", "phone viewport", "oversized file rejected before draft creation", "archived tab offers active import destination and picker import"], screenshots }));
}

main().catch(error => { console.error(`FOLDER QA FAILED at ${stage}: ${error.message}`); process.exitCode = 1; }).finally(async () => {
  try { if (userId) await db.user.deleteMany({ where:{ id:userId } }); } catch { console.error("Disposable account cleanup needs attention."); process.exitCode = 1; }
  try { await browser?.send("Browser.close"); } catch { child?.kill(); }
  page?.close(); browser?.close(); child?.kill();
  await db.$disconnect();
  const target = path.resolve(profile), tmp = path.resolve(os.tmpdir());
  if (path.dirname(target) === tmp && path.basename(target).startsWith("veynote-folders-qa-")) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try { fs.rmSync(target, { recursive:true, force:true }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
  }
});
