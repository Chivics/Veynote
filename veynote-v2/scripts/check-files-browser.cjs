// Disposable Chrome QA of the real Files workspace against the isolated local preview.
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
const db = new PrismaClient({ datasourceUrl: `mysql://veynote_preview:${credentials.databasePassword}@127.0.0.1:3307/veynote_preview` });
const chromePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
if (!chromePath) throw new Error("Chrome or Edge is needed for Files QA.");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "veynote-files-qa-"));
let child, browser, page, userId, token, rootFolderId, rootFileId;
let stage = "setup", chromeError = "";
const screenshots = [];

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
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
  throw new Error(`Timed out${lastError ? `: ${lastError.message}` : ""}`);
}
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.pending = new Map(); this.sequence = 0;
    this.ready = new Promise((resolve, reject) => { this.ws.addEventListener("open", resolve, { once: true }); this.ws.addEventListener("error", reject, { once: true }); });
    this.ws.addEventListener("message", event => {
      const message = JSON.parse(event.data), waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result || {});
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  close() { this.ws.close(); }
}
async function request(route, method = "GET", body) {
  const multipart = body instanceof FormData;
  const response = await fetch(api + route, { method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && !multipart && { "Content-Type": "application/json" }) }, body: body ? multipart ? body : JSON.stringify(body) : undefined, signal: AbortSignal.timeout(16000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status} ${data.error || ""}`);
  return data;
}
async function evaluate(expression) {
  const response = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "Browser evaluation failed");
  return response.result?.value;
}
async function navigate(route) {
  await page.send("Page.navigate", { url: app + route });
  await until(() => evaluate("Boolean(document.querySelector('.files-workspace .files-banner-summary') && document.querySelector('.files-workspace .file-grid'))"));
  await evaluate("document.fonts.ready.then(() => true)");
}
async function screenshot(label) {
  const file = path.join(os.tmpdir(), `veynote-files-${label}-${randomBytes(4).toString("hex")}.png`);
  const { data } = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(file, Buffer.from(data, "base64")); screenshots.push(file);
}
function pdfBytes() {
  const stream = "BT /F1 22 Tf 72 720 Td (Veynote Files QA) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let content = "%PDF-1.4\n", offsets = [0];
  objects.forEach((item, index) => { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${item}\nendobj\n`; });
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { content += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  content += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(content);
}
function wavBytes() {
  const rate = 8000, count = rate / 2, data = Buffer.alloc(count * 2), output = Buffer.alloc(44 + data.length);
  for (let i = 0; i < count; i++) data.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 3000), i * 2);
  output.write("RIFF", 0); output.writeUInt32LE(output.length - 8, 4); output.write("WAVEfmt ", 8); output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22); output.writeUInt32LE(rate, 24); output.writeUInt32LE(rate * 2, 28);
  output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34); output.write("data", 36); output.writeUInt32LE(data.length, 40); data.copy(output, 44);
  return output;
}
async function captureApproved(id, width, label) {
  const source = fs.readFileSync(path.join(__dirname, "../client/public/product-preview/blueprint.html"), "utf8");
  const start = source.indexOf("const previewScreenTemplate="), end = source.indexOf("function resolvePreviewFonts", start);
  assert.ok(start > 0 && end > start);
  const { previewScreenTemplate, previewAssets, previewFonts } = vm.runInNewContext(`${source.slice(start, end)};({previewScreenTemplate,previewAssets,previewFonts})`, {}, { timeout: 5000 });
  let html = previewScreenTemplate.replace("__PREVIEW_QUERY__", JSON.stringify(`?id=${id}&theme=dark`));
  Object.values(previewFonts).forEach((uri, index) => { html = html.split(`__PREVIEW_FONT_${index}__`).join(uri); });
  Object.entries(previewAssets).forEach(([name, uri]) => { html = html.split(name).join(uri); });
  const file = path.join(profile, `reference-${label}.html`); fs.writeFileSync(file, html);
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width <= 414 ? 896 : 900, deviceScaleFactor: 1, mobile: width <= 414 });
  await page.send("Page.navigate", { url: `file:///${file.replaceAll("\\", "/")}` });
  await until(() => evaluate("Boolean(document.body?.innerText?.length > 100)"));
  await evaluate("document.fonts.ready.then(() => true)");
  await screenshot(`reference-${label}`);
}
async function main() {
  stage = "local isolation";
  assert.equal((await db.$queryRaw`SELECT DATABASE() AS name`)[0].name, "veynote_preview");
  assert.equal((await fetch(app + "/api/ready")).status, 200);
  const suffix = randomBytes(10).toString("hex");
  stage = "account registration";
  const registration = await request("/api/auth/register", "POST", { name: "Local Files QA", email: `files-qa-${suffix}@example.invalid`, password: randomBytes(24).toString("base64url") });
  userId = registration.user.id; token = registration.token;
  stage = "Chrome startup";
  const port = await freePort();
  child = spawn(chromePath, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "about:blank"], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  child.stderr.on("data", chunk => { chromeError = (chromeError + chunk.toString()).slice(-2000); });
  const version = await until(async () => { if (child.exitCode !== null) throw new Error(`Chrome exited ${child.exitCode}`); const response = await fetch(`http://127.0.0.1:${port}/json/version`); return response.ok ? response.json() : null; });
  browser = new CDP(version.webSocketDebuggerUrl);
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  page = new CDP(target.webSocketDebuggerUrl);
  await page.send("Page.enable"); await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem('veynote_token',${JSON.stringify(token)});` });
  await page.send("Page.navigate", { url: app + "/notes/files" });
  await until(() => evaluate("Boolean(document.querySelector('.files-workspace'))"));
  stage = "video fixture";
  const videoBase64 = await evaluate(`(async () => {
    const canvas=document.createElement('canvas'); canvas.width=64; canvas.height=64; canvas.style.cssText='position:fixed;left:-1000px;top:0';document.body.append(canvas);
    const context=canvas.getContext('2d'); context.fillStyle='#aa9bfa'; context.fillRect(0,0,64,64);
    const stream=canvas.captureStream(0), track=stream.getVideoTracks()[0];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm'}), chunks=[];
    const complete=new Promise(resolve=>{recorder.ondataavailable=event=>chunks.push(event.data);recorder.onstop=async()=>{
      const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer()); let binary=''; for(const byte of bytes) binary+=String.fromCharCode(byte); resolve(btoa(binary));
    }});
    let frame=0; const timer=setInterval(()=>{context.fillStyle=frame++%2?'#aa9bfa':'#202630';context.fillRect(0,0,64,64);track.requestFrame()},80);
    recorder.start(250); await new Promise(resolve=>setTimeout(resolve,1800)); recorder.stop(); clearInterval(timer);
    const result=await complete; track.stop(); canvas.remove(); return result;
  })()`);
  assert.ok(videoBase64?.length > 100, `Chrome must create a playable video fixture: ${videoBase64?.length ?? "missing"} characters`);
  const localVideo = await evaluate(`(async () => {
    const binary=atob(${JSON.stringify(videoBase64)}), bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
    const video=document.createElement('video'); video.src=URL.createObjectURL(new Blob([bytes],{type:'video/webm'})); video.preload='metadata';
    return new Promise(resolve=>{video.onloadedmetadata=()=>resolve({ready:true,duration:video.duration,bytes:bytes.length});video.onerror=()=>resolve({ready:false,error:video.error?.code,bytes:bytes.length});setTimeout(()=>resolve({ready:false,error:'timeout',bytes:bytes.length}),8000)});
  })()`);
  assert.ok(localVideo.ready, `Chrome's generated video fixture is not playable: ${JSON.stringify(localVideo)}`);
  stage = "real folder and file creation";
  const rootFolder = (await request("/api/files/folders", "POST", { name: "Cedar project" })).folder;
  rootFolderId = rootFolder.id;
  const nested = (await request("/api/files/folders", "POST", { name: "References", parentId: rootFolder.id })).folder;
  const rootData = new FormData(); rootData.append("files", new Blob(["An intake note"], { type: "text/plain" }), "intake.txt");
  rootFileId = (await request("/api/files/upload", "POST", rootData)).files[0].id;
  const data = new FormData(); data.append("parentId", nested.id);
  data.append("files", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), "cover.png");
  data.append("files", new Blob([pdfBytes()], { type: "application/pdf" }), "brief.pdf");
  data.append("files", new Blob([wavBytes()], { type: "audio/wav" }), "interview.wav");
  data.append("files", new Blob([Buffer.from(videoBase64, "base64")], { type: "video/webm" }), "walkthrough.webm");
  data.append("files", new Blob(["A short text preview."], { type: "text/plain" }), "notes.txt");
  await request("/api/files/upload", "POST", data);
  stage = "desktop root";
  await navigate("/notes/files");
  await until(() => evaluate("[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Not now')"), 3500).catch(() => null);
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Not now')?.click()");
  assert.match(await evaluate("document.querySelector('.files-workspace')?.innerText"), /Cedar project/);
  assert.equal(await evaluate("document.querySelectorAll('.files-item').length"), 2);
  await screenshot("root-desktop-dark");
  stage = "nested folder navigation";
  await evaluate("document.querySelector('.files-item--folder .files-visual').click()");
  await until(() => evaluate(`location.pathname.endsWith(${JSON.stringify(rootFolder.id)}) && Boolean(document.querySelector('.files-item--folder'))`));
  await evaluate("document.querySelector('.files-item--folder .files-visual').click()");
  await until(() => evaluate(`location.pathname.endsWith(${JSON.stringify(nested.id)}) && document.querySelectorAll('.files-item').length === 5`));
  await screenshot("nested-desktop-dark");
  await evaluate("scrollTo(0, document.querySelector('.files-results').getBoundingClientRect().top + scrollY - 12)");
  await screenshot("nested-cards-desktop-dark");
  await evaluate("scrollTo(0,0)");
  stage = "image lightbox";
  await evaluate("document.querySelector('.files-item--image .files-visual').click()");
  await until(() => evaluate("Boolean(document.querySelector('.lightbox-overlay'))"));
  await until(() => evaluate("document.querySelector('.lightbox-img')?.tagName === 'IMG'"));
  assert.equal(await evaluate("document.querySelector('.lightbox-img')?.tagName"), "IMG");
  await evaluate("document.querySelector('.lightbox-topbar button[title^=Close]').click()");
  stage = "PDF audio video and text previews";
  for (const [kind, element] of [["pdf", "iframe"], ["audio", "audio"], ["video", "video"], ["document", "iframe"]]) {
    stage = `${kind} preview`;
    if (kind === "video") await evaluate("document.addEventListener('error',event=>{if(event.target.tagName==='VIDEO')window.__filesQaVideoError={code:event.target.error?.code,src:event.target.currentSrc}},true)");
    await evaluate(`document.querySelector('.files-item--${kind} .files-visual').click()`);
    try { await until(() => evaluate(`Boolean(document.querySelector('.file-preview-dialog[open] .files-preview-body ${element}'))`)); }
    catch (error) {
      await screenshot(`${kind}-preview-failure`);
      throw new Error(`${error.message}; state=${JSON.stringify(await evaluate("({dialog:document.querySelector('.file-preview-dialog')?.outerHTML.slice(0,800),error:document.querySelector('.inline-error')?.innerText,body:document.body?.innerText?.slice(-900)})"))}`);
    }
    assert.ok((await evaluate(`document.querySelector('.file-preview-dialog[open] .files-preview-body ${element}')?.getAttribute('src')`)).includes("preview=1"));
    if (kind === "audio" || kind === "video") {
      try { await until(() => evaluate(`document.querySelector('.file-preview-dialog[open] .files-preview-body ${element}')?.readyState > 0`)); }
      catch (error) { throw new Error(`${error.message}; preview=${JSON.stringify(await evaluate("({body:document.querySelector('.file-preview-dialog')?.innerText,media:document.querySelector('.files-preview-body audio,.files-preview-body video')?.outerHTML,videoError:window.__filesQaVideoError})"))}`); }
    }
    if (kind === "pdf") { await new Promise(resolve => setTimeout(resolve, 2200)); await screenshot("pdf-preview-desktop-dark"); }
    await evaluate("document.querySelector('.file-preview-dialog header > div:last-child > button:last-child').click()");
    await until(() => evaluate("!document.querySelector('.file-preview-dialog[open]')"));
  }
  stage = "rename interaction";
  await evaluate("document.querySelector('.files-item--document .file-card-menu-trigger').click()");
  await evaluate("[...document.querySelectorAll('.files-item--document .files-card-menu button')].find(button=>button.textContent==='Rename').click()");
  await evaluate(`(() => { const input=document.querySelector('.files-item--document .files-rename-form input'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'revised-notes.txt'); input.dispatchEvent(new Event('input',{bubbles:true})); input.closest('form').requestSubmit(); })()`);
  await until(() => evaluate("document.querySelector('.files-item--document h3')?.textContent === 'revised-notes.txt'"));
  stage = "mobile layout";
  await page.send("Emulation.setDeviceMetricsOverride", { width: 414, height: 896, deviceScaleFactor: 1, mobile: true });
  await navigate(`/notes/files/${nested.id}`);
  const geometry = await evaluate("({viewport:innerWidth,document:document.documentElement.scrollWidth,cards:document.querySelectorAll('.files-item').length,actions:[...document.querySelectorAll('.files-workspace .product-page-actions button')].map(button=>{const rect=button.getBoundingClientRect();return [rect.left,rect.right]})})");
  assert.equal(geometry.cards, 5);
  assert.ok(geometry.document <= geometry.viewport + 1, `Files overflow at 414px: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.actions.every(([left,right]) => left >= 0 && right <= geometry.viewport), `Files actions overflow at 414px: ${JSON.stringify(geometry)}`);
  await screenshot("nested-mobile-dark");
  await evaluate("scrollTo(0, document.querySelector('.files-results').getBoundingClientRect().top + scrollY - 12)");
  await screenshot("nested-cards-mobile-dark");
  stage = "approved Files comparison";
  await captureApproved("files", 1440, "files-desktop-dark");
  await captureApproved("files", 414, "files-mobile-dark");
  const directPdf = path.join(profile, "valid-pdf-fixture.pdf"); fs.writeFileSync(directPdf, pdfBytes());
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.send("Page.navigate", { url: `file:///${directPdf.replaceAll("\\", "/")}` });
  await new Promise(resolve => setTimeout(resolve, 2200));
  await screenshot("direct-pdf-control");
  console.log(JSON.stringify({ result: "PASS", checks: ["root and nested folder navigation", "image/PDF/audio/video/text browser preview", "rename", "414px viewport with no overflow", "approved preview capture"], screenshots }));
}
main().catch(error => { console.error(`FILES QA FAILED during ${stage}: ${error.message}${chromeError ? `\nChrome: ${chromeError.slice(-500)}` : ""}`); process.exitCode = 1; }).finally(async () => {
  for (const id of [rootFileId, rootFolderId]) {
    try { if (id) await request(`/api/files/${id}`, "DELETE"); } catch (error) { console.error(`Files QA record ${id} cleanup needs attention: ${error.message}`); process.exitCode = 1; }
  }
  try { if (userId) await db.user.deleteMany({ where: { id: userId } }); } catch { console.error("Files QA account cleanup needs attention."); process.exitCode = 1; }
  try { await browser?.send("Browser.close"); } catch { child?.kill(); }
  page?.close(); browser?.close(); child?.kill(); await db.$disconnect();
  const target = path.resolve(profile), temp = path.resolve(os.tmpdir());
  if (path.dirname(target) === temp && path.basename(target).startsWith("veynote-files-qa-")) {
    for (let attempt = 0; attempt < 4; attempt++) { try { fs.rmSync(target, { recursive: true, force: true }); break; } catch { await new Promise(resolve => setTimeout(resolve, 500)); } }
  }
});
