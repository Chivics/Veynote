// Isolated, disposable Chrome QA for the real Notes Search workspace.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const vm = require("node:vm");
process.env.RUST_LOG = "info";
const { PrismaClient } = require("../server/node_modules/@prisma/client");

const app = "http://127.0.0.1:5177";
const api = "http://127.0.0.1:4001";
const store = path.join(process.env.LOCALAPPDATA || "", "Veynote", "preview");
const credentials = JSON.parse(fs.readFileSync(path.join(store, "credentials.json"), "utf8"));
const db = new PrismaClient({ datasourceUrl:`mysql://veynote_preview:${credentials.databasePassword}@127.0.0.1:3307/veynote_preview` });
const chromePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
if (!chromePath) throw new Error("Chrome or Edge is needed for Search QA.");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-search-qa-"));
const output = path.join(__dirname, "../client/node_modules/.cache/veynote-search-qa");
fs.mkdirSync(output, { recursive:true });
let child, browser, page, userId, token;
let stage = "setup", chromeError = "";
const screenshots = [];

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve,reject) => server.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function until(work, timeout = 18000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try { const value = await work(); if (value) return value; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out during ${stage}${lastError ? `: ${lastError.message}` : ""}`);
}
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.pending = new Map(); this.sequence = 0;
    this.ready = new Promise((resolve,reject) => { this.ws.addEventListener("open",resolve,{ once:true }); this.ws.addEventListener("error",reject,{ once:true }); });
    this.ws.addEventListener("message",event => {
      const message = JSON.parse(event.data), waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result || {});
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome ${method} timed out during ${stage}`)); },30000);
      this.pending.set(id,{ resolve:value => { clearTimeout(timer); resolve(value); }, reject:error => { clearTimeout(timer); reject(error); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}
async function request(route, method = "GET", body) {
  const multipart = body instanceof FormData;
  const response = await fetch(api + route, { method, headers:{ ...(token && { Authorization:`Bearer ${token}` }), ...(body && !multipart && { "Content-Type":"application/json" }) }, body:body ? multipart ? body : JSON.stringify(body) : undefined, signal:AbortSignal.timeout(16000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status} ${data.error || ""}`);
  return data;
}
async function evaluate(expression) {
  const response = await page.send("Runtime.evaluate",{ expression, awaitPromise:true, returnByValue:true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "Browser evaluation failed");
  return response.result?.value;
}
async function navigate(route) {
  await page.send("Page.navigate",{ url:app + route });
  await until(() => evaluate("Boolean(document.querySelector('.notes-search-workspace .search-workspace-query input'))"));
  await evaluate("document.fonts.ready.then(() => true)");
}
async function screenshot(label) {
  const file = path.join(output, `${label}.png`);
  const { data } = await page.send("Page.captureScreenshot",{ format:"png", captureBeyondViewport:false });
  fs.writeFileSync(file,Buffer.from(data,"base64")); screenshots.push(file);
}
async function setInput(value) {
  await evaluate(`(() => { const input=document.querySelector('.search-workspace-query input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
}
async function select(label, value) {
  await evaluate(`(() => { const node=document.querySelector(${JSON.stringify(label)}); const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; setter.call(node,${JSON.stringify(value)}); node.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
}
async function captureApproved(theme, width, label) {
  const source = fs.readFileSync(path.join(__dirname,"../client/public/product-preview/blueprint.html"),"utf8");
  const start = source.indexOf("const previewScreenTemplate="), end = source.indexOf("function resolvePreviewFonts",start);
  assert.ok(start > 0 && end > start);
  const { previewScreenTemplate, previewAssets, previewFonts } = vm.runInNewContext(`${source.slice(start,end)};({previewScreenTemplate,previewAssets,previewFonts})`,{}, { timeout:5000 });
  let html = previewScreenTemplate.replace("__PREVIEW_QUERY__",JSON.stringify(`?id=search&theme=${theme}`));
  Object.values(previewFonts).forEach((uri,index) => { html = html.split(`__PREVIEW_FONT_${index}__`).join(uri); });
  Object.entries(previewAssets).forEach(([name,uri]) => { html = html.split(name).join(uri); });
  const file = path.join(profile,`${label}.html`); fs.writeFileSync(file,html);
  await page.send("Emulation.setDeviceMetricsOverride",{ width,height:width <= 414 ? 896 : 900,deviceScaleFactor:1,mobile:width <= 414 });
  await page.send("Page.navigate",{ url:`file:///${file.replaceAll("\\","/")}` });
  await until(() => evaluate("Boolean(document.querySelector('.page h1') && document.body.innerText.includes('Find the thread'))"));
  await evaluate("document.fonts.ready.then(() => true)");
  await screenshot(label);
}

async function main() {
  stage = "local isolation";
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS name`)[0].name,"veynote_preview");
  assert.equal((await fetch(app + "/api/ready")).status,200);
  stage = "registration";
  const registration = await request("/api/auth/register","POST",{ name:"Local Search QA", email:`search-qa-${randomBytes(10).toString("hex")}@example.invalid`, password:randomBytes(24).toString("base64url") });
  userId = registration.user.id; token = registration.token;
  const folder = (await request("/api/folders","POST",{ name:"Search research" })).folder;
  const exact = (await request("/api/notes","POST",{ title:"Focus decision", content:"<p>Protect the first writing hour and record why the choice mattered.</p>", tags:["strategy"], folderId:folder.id })).note;
  const journal = (await request("/api/notes","POST",{ kind:"JOURNAL", title:"September reflection", content:"<p>A calmer focus helped the morning feel clearer.</p>", tags:["review"] })).note;
  const attachmentNote = (await request("/api/notes","POST",{ title:"Research bundle", content:"<p>Source notes for the project.</p>" })).note;
  const attachment = new FormData(); attachment.append("file",new Blob(["Local search reference"],{ type:"text/plain" }),"focus-brief.txt");
  await request(`/api/notes/${attachmentNote.id}/attachments`,"POST",attachment);
  await request(`/api/notes/${exact.id}`,"PATCH",{ isPinned:true });
  const protectedNote = (await request("/api/notes","POST",{ title:"Focus protected", content:"<p>Private context.</p>" })).note;
  await db.note.update({ where:{ id:protectedNote.id }, data:{ isLocked:true } });
  const archived = (await request("/api/notes","POST",{ title:"Focus archived", content:"<p>Old context.</p>" })).note;
  await request(`/api/notes/${archived.id}`,"PATCH",{ isArchived:true });
  stage = "Chrome startup";
  const port = await freePort();
  child = spawn(chromePath,["--headless=new","--no-first-run","--no-default-browser-check","--disable-extensions","--disable-background-networking",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,"--window-size=1440,900","about:blank"],{ stdio:["ignore","ignore","pipe"],windowsHide:true });
  child.stderr.on("data",chunk => { chromeError = (chromeError + chunk.toString()).slice(-2000); });
  const version = await until(async () => { if (child.exitCode !== null) throw new Error(`Chrome exited ${child.exitCode}`); const response = await fetch(`http://127.0.0.1:${port}/json/version`); return response.ok ? response.json() : null; });
  browser = new CDP(version.webSocketDebuggerUrl);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{ method:"PUT" })).json();
  page = new CDP(target.webSocketDebuggerUrl);
  await page.send("Page.enable"); await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument",{ source:`if(location.protocol==='http:') { localStorage.setItem('veynote_token',${JSON.stringify(token)}); localStorage.setItem('veynote_install_dismissed_at',String(Date.now())); }` });
  await page.send("Emulation.setDeviceMetricsOverride",{ width:1440,height:900,deviceScaleFactor:1,mobile:false });
  stage = "desktop Search";
  await navigate("/notes/search?q=focus");
  await until(() => evaluate("document.querySelectorAll('.search-result').length===3"));
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.search-result-title')].map(node=>node.textContent.trim())"),["Focus decision","Research bundle","September reflection"]);
  assert.equal(await evaluate("document.querySelectorAll('.search-result-match').length"),3);
  assert.match(await evaluate("document.querySelector('.search-result-match')?.textContent"),/Title match/);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"),true);
  await screenshot("search-app-desktop-dark");
  stage = "search filters";
  await evaluate("[...document.querySelectorAll('.search-workspace-types button')].find(node=>node.textContent.includes('Journal')).click()");
  await until(() => evaluate("document.querySelectorAll('.search-result').length===1"));
  assert.match(await evaluate("document.querySelector('.search-result-title')?.textContent"),/September reflection/);
  await evaluate("[...document.querySelectorAll('.search-workspace-types button')].find(node=>node.textContent.includes('All writing')).click()");
  await until(() => evaluate("document.querySelectorAll('.search-result').length===3"));
  await evaluate("document.querySelector('.search-workspace-filter-toggle').click()");
  await select(".search-workspace-facet-row label:first-child select",folder.id);
  await until(() => evaluate("document.querySelectorAll('.search-result').length===1"));
  assert.match(await evaluate("document.querySelector('.search-result-title')?.textContent"),/Focus decision/);
  await select(".search-workspace-facet-row label:first-child select","");
  await evaluate("[...document.querySelectorAll('.search-workspace-focus button')].find(node=>node.textContent.includes('Pinned')).click()");
  await until(() => evaluate("document.querySelectorAll('.search-result').length===1"));
  await screenshot("search-app-filtered-desktop-dark");
  stage = "quick preview";
  await evaluate("document.querySelector('.search-result-end button').click()");
  await until(() => evaluate("Boolean(document.querySelector('.note-quick-preview[open]'))"));
  assert.match(await evaluate("document.querySelector('.note-quick-preview h2')?.textContent"),/Focus decision/);
  await screenshot("search-app-preview-desktop-dark");
  await evaluate("document.querySelector('.note-preview-toolbar button').click()");
  await until(() => evaluate("!document.querySelector('.note-quick-preview[open]')"));
  stage = "mobile light Search";
  await request("/api/auth/me","PATCH",{ theme:"light" });
  await page.send("Emulation.setDeviceMetricsOverride",{ width:414,height:896,deviceScaleFactor:1,mobile:true });
  await navigate("/notes/search?q=focus");
  await until(() => evaluate("document.querySelectorAll('.search-result').length===3 && document.documentElement.dataset.theme==='light'"));
  const geometry = await evaluate("({ viewport:innerWidth,document:document.documentElement.scrollWidth,search:document.querySelector('.search-workspace-query').getBoundingClientRect().right,results:[...document.querySelectorAll('.search-result')].map(node=>node.getBoundingClientRect().right) })");
  assert.ok(geometry.document <= geometry.viewport + 1,`Mobile Search overflow: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.search <= geometry.viewport + 1 && geometry.results.every(right => right <= geometry.viewport + 1),`Mobile Search content overflow: ${JSON.stringify(geometry)}`);
  await screenshot("search-app-mobile-light");
  await evaluate("scrollTo(0,document.querySelector('.search-workspace-results').getBoundingClientRect().top + scrollY - 10)");
  await screenshot("search-app-results-mobile-light");
  stage = "live query change and empty state";
  await setInput("absent phrase 90210");
  await until(() => evaluate("document.querySelector('.search-workspace-empty h2')?.textContent.includes('No matching writing')"));
  await screenshot("search-app-empty-mobile-light");
  await evaluate("document.querySelector('.search-workspace-clear').click()");
  await until(() => evaluate("document.querySelectorAll('.search-result').length===3"));
  stage = "approved preview comparison";
  await captureApproved("dark",1440,"search-approved-desktop-dark");
  await captureApproved("light",414,"search-approved-mobile-light");
  console.log(JSON.stringify({ result:"PASS", checks:["live title/body/attachment query", "locked and archived exclusion", "type/folder/pinned filters", "quick preview", "mobile light theme without overflow", "live empty and reset states", "approved preview desktop/mobile capture"], screenshots }));
}

main().catch(error => { console.error(`SEARCH QA FAILED during ${stage}: ${error.message}${chromeError ? `\nChrome: ${chromeError.slice(-500)}` : ""}`); process.exitCode = 1; }).finally(async () => {
  try { if (userId) await db.user.deleteMany({ where:{ id:userId } }); }
  catch (error) { console.error(`Search QA account cleanup needs attention: ${error.message}`); process.exitCode = 1; }
  try { await browser?.send("Browser.close"); } catch { child?.kill(); }
  page?.close(); browser?.close(); child?.kill(); await db.$disconnect();
  const target = path.resolve(profile), temp = path.resolve(os.tmpdir());
  if (path.dirname(target) === temp && path.basename(target).startsWith("veynote-search-qa-")) {
    for (let attempt = 0; attempt < 4; attempt++) { try { fs.rmSync(target,{ recursive:true,force:true }); break; } catch { await new Promise(resolve => setTimeout(resolve,500)); } }
  }
});
