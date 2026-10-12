// Disposable physical QA of the real Tags workspace against the isolated
// localhost preview. Creates and removes its own account and records.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
process.env.RUST_LOG = "info";
const { PrismaClient } = require("../server/node_modules/@prisma/client");

const app = "http://127.0.0.1:5177", api = "http://127.0.0.1:4001";
const preview = path.join(process.env.LOCALAPPDATA || "", "Veynote", "preview");
const credentials = JSON.parse(fs.readFileSync(path.join(preview, "credentials.json"), "utf8"));
const db = new PrismaClient({ datasourceUrl: `mysql://veynote_preview:${credentials.databasePassword}@127.0.0.1:3307/veynote_preview` });
const chromePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
if (!chromePath) throw new Error("Chrome or Edge is needed for Tags browser QA.");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-tags-qa-"));
const screenshots = [];
let chrome, browser, page, userId, token, stage = "setup";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function until(work, timeout = 16000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { const value = await work(); if (value) return value; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 140));
  }
  throw new Error(`Timed out at ${stage}${lastError ? `: ${lastError.message}` : ""}`);
}
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.pending = new Map(); this.next = 0;
    this.ready = new Promise((resolve, reject) => { this.ws.addEventListener("open", resolve, { once:true }); this.ws.addEventListener("error", reject, { once:true }); });
    this.ws.addEventListener("message", event => {
      const message = JSON.parse(event.data), pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result || {});
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome ${method} timed out at ${stage}`)); }, 30000);
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}
async function request(route, method = "GET", body) {
  const response = await fetch(api + route, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { "Content-Type":"application/json" }) }, body:body && JSON.stringify(body), signal:AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${data.error || ""}`);
  return data;
}
async function evaluate(expression) {
  const result = await page.send("Runtime.evaluate", { expression, awaitPromise:true, returnByValue:true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result?.value;
}
async function screen(label) {
  const file = path.join(os.tmpdir(), `veynote-tags-${label}-${randomBytes(4).toString("hex")}.png`);
  const { data } = await page.send("Page.captureScreenshot", { format:"png", captureBeyondViewport:false });
  fs.writeFileSync(file, Buffer.from(data, "base64")); screenshots.push(file);
}
async function setInput(selector, value) {
  await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); if (!input) throw new Error('Input not found'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
}
async function main() {
  stage = "preview readiness";
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS name`)[0].name, "veynote_preview");
  assert.equal((await fetch(app + "/api/ready")).status, 200);
  const email = `tags-qa-${randomBytes(12).toString("hex")}@example.invalid`;
  const registration = await request("/api/auth/register", "POST", { name:"Tags browser QA", email, password:randomBytes(24).toString("base64url") });
  userId = registration.user.id; token = registration.token;
  stage = "seed owner-scoped writing";
  const first = (await request("/api/notes", "POST", { title:"Planning the next chapter", content:"<p>Revisit the writing plan.</p>", tags:["strategy","research"] })).note;
  await request("/api/notes", "POST", { title:"An investment decision", content:"<p>Record the decision and evidence.</p>", tags:["strategy"] });
  const archived = (await request("/api/notes", "POST", { title:"A previous strategy", content:"<p>Preserved context.</p>", tags:["strategy"] })).note;
  await request(`/api/notes/${archived.id}`, "PATCH", { isArchived:true });
  assert.deepEqual((await request("/api/notes/meta/tags")).tags.map(tag => [tag.name,tag.count]).sort(), [["research",1],["strategy",3]]);
  stage = "Chrome startup";
  const port = await freePort();
  chrome = spawn(chromePath, ["--headless=new","--no-first-run","--no-default-browser-check","--disable-extensions","--disable-background-networking",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,"--window-size=1440,900","about:blank"], { stdio:"ignore", windowsHide:true });
  const version = await until(async () => { const response=await fetch(`http://127.0.0.1:${port}/json/version`); return response.ok ? response.json() : null; }, 20000);
  browser = new CDP(version.webSocketDebuggerUrl);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method:"PUT" })).json();
  page = new CDP(target.webSocketDebuggerUrl);
  await page.send("Page.enable"); await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source:`localStorage.setItem('veynote_token',${JSON.stringify(token)});localStorage.setItem('veynote_install_dismissed_at',String(Date.now()));` });
  stage = "Tags populated desktop";
  await page.send("Page.navigate", { url:app + "/notes/tags" });
  await until(() => evaluate("document.querySelectorAll('.tag-item').length===2"), 22000);
  assert.match(await evaluate("document.querySelector('.tags-feature-lead h2')?.textContent"), /strategy/);
  assert.equal(await evaluate("document.querySelector('.tags-feature-lead p')?.textContent.includes('3 connected records')"), true);
  await evaluate("document.fonts.ready.then(()=>true)");
  await screen("desktop-dark");
  stage = "Tags responsive layouts";
  await page.send("Emulation.setDeviceMetricsOverride", { width:414,height:896,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), true);
  await screen("mobile-dark");
  await evaluate("document.documentElement.dataset.theme='light'");
  await screen("mobile-light");
  await evaluate("document.querySelector('.tags-index').scrollIntoView({block:'start'})");
  await screen("mobile-light-index");
  await page.send("Emulation.setDeviceMetricsOverride", { width:320,height:750,deviceScaleFactor:1,mobile:true });
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), true, "Tags must fit a small phone");
  await page.send("Emulation.setDeviceMetricsOverride", { width:1440,height:900,deviceScaleFactor:1,mobile:false });
  await evaluate("document.documentElement.dataset.theme='dark'; document.querySelector('.tags-index').scrollIntoView({block:'start'})");
  await screen("desktop-dark-index");
  stage = "Tag discovery controls";
  await evaluate("document.querySelector('button[aria-label=\"List view\"]').click()");
  assert.equal(await evaluate("document.querySelector('.tag-grid')?.classList.contains('is-list')"), true);
  await setInput('.tags-index-search input', 'research');
  await until(() => evaluate("document.querySelectorAll('.tag-item').length===1"));
  assert.equal(await evaluate("document.querySelector('.tag-item h3')?.textContent"), "#research");
  await evaluate("document.querySelector('button[aria-label=\"Clear tag search\"]').click()");
  await until(() => evaluate("document.querySelectorAll('.tag-item').length===2"));
  await evaluate("document.querySelector('button[aria-label=\"Grid view\"]').click()");
  stage = "Tag rename";
  await evaluate("[...document.querySelectorAll('.tag-item')].find(item=>item.querySelector('h3')?.textContent==='#research').querySelector('.tag-item-menu-trigger').click()");
  await until(() => evaluate("Boolean(document.querySelector('.tag-item-menu button'))"));
  await evaluate("[...document.querySelectorAll('.tag-item-menu button')].find(button=>button.textContent.includes('Rename')).click()");
  await setInput('.tag-action-panel input', 'research methods');
  await evaluate("document.querySelector('.tag-action-panel button.btn-primary').click()");
  await until(async () => (await request("/api/notes/meta/tags")).tags.some(tag => tag.name === "research methods"));
  stage = "Tag merge confirmation";
  await until(() => evaluate("[...document.querySelectorAll('.tag-item h3')].some(item=>item.textContent==='#research methods')"));
  await evaluate("[...document.querySelectorAll('.tag-item')].find(item=>item.querySelector('h3')?.textContent==='#research methods').querySelector('.tag-item-menu-trigger').click()");
  await evaluate("[...document.querySelectorAll('.tag-item-menu button')].find(button=>button.textContent.includes('Merge')).click()");
  await evaluate("(() => { const select=document.querySelector('.tag-action-panel select'); select.value=[...select.options].find(option=>option.textContent.includes('#strategy')).value; select.dispatchEvent(new Event('change',{bubbles:true})); })()");
  await evaluate("document.querySelector('.tag-action-panel button.btn-primary').click()");
  await until(() => evaluate("Boolean(document.querySelector('.confirm-dialog[open]'))"));
  assert.equal((await request("/api/notes/meta/tags")).tags.length, 2, "Merge must require confirmation");
  await evaluate("document.querySelector('.confirm-dialog .confirm-dialog-actions button:last-child').click()");
  await until(async () => (await request("/api/notes/meta/tags")).tags.length === 1);
  assert.equal((await request(`/api/notes/${first.id}`)).note.tags.includes("strategy"), true);
  stage = "Tag removal confirmation";
  await until(() => evaluate("document.querySelectorAll('.tag-item').length===1"));
  await evaluate("document.querySelector('.tag-item-menu-trigger').click()");
  await evaluate("[...document.querySelectorAll('.tag-item-menu button')].find(button=>button.textContent.includes('Remove')).click()");
  assert.equal((await request("/api/notes/meta/tags")).tags.length, 1, "Removal must require confirmation");
  await evaluate("document.querySelector('.confirm-dialog[open] .confirm-dialog-actions button:last-child').click()");
  await until(async () => (await request("/api/notes/meta/tags")).tags.length === 0);
  assert.equal((await request(`/api/notes/${first.id}`)).note.title, "Planning the next chapter", "Removing tag must preserve the note");
  stage = "standalone subject creation";
  await until(() => evaluate("Boolean(document.querySelector('.tags-empty-workspace'))"));
  await evaluate("document.querySelector('.product-page-actions .btn-primary').click()");
  await until(() => evaluate("Boolean(document.querySelector('.tag-action-panel input'))"));
  await setInput('.tag-action-panel input', 'future research');
  await evaluate("document.querySelector('.tag-action-panel button.btn-primary').click()");
  await until(async () => (await request("/api/notes/meta/tags")).tags.some(tag => tag.name === "future research" && tag.count === 0));
  await until(() => evaluate("document.querySelector('.tag-item h3')?.textContent === '#future research'"));
  await screen("new-subject-desktop-dark");
  console.log(JSON.stringify({ result:"PASS", checks:["populated index", "320px/414px dark/light", "search and view switch", "real rename", "merge confirmation and persistence", "remove confirmation and preserved writing", "standalone zero-use subject"], screenshots }));
}
main().catch(error => { console.error(`TAGS QA FAILED during ${stage}: ${error.stack || error.message}`); process.exitCode = 1; }).finally(async () => {
  try { if (userId) await db.user.deleteMany({ where:{ id:userId } }); } catch { console.error("Tags QA account cleanup needs attention."); process.exitCode=1; }
  try { await browser?.send("Browser.close"); } catch { chrome?.kill(); }
  page?.close(); browser?.close(); chrome?.kill();
  await db.$disconnect();
  const target = path.resolve(profile), tmp = path.resolve(os.tmpdir());
  if (path.dirname(target) === tmp && path.basename(target).startsWith("veynote-tags-qa-")) {
    for (let attempt=0; attempt<4; attempt++) {
      try { fs.rmSync(target,{recursive:true,force:true}); break; }
      catch { await new Promise(resolve=>setTimeout(resolve,500)); }
    }
  }
});
