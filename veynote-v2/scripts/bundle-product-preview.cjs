/* Repackages the approved, self-contained design reference. No application APIs. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = process.argv[2];
if (!source || !fs.existsSync(path.join(source, "catalog.js"))) throw new Error("Pass the approved veynote-blueprint directory as the first argument.");
const destination = path.join(root, "client", "public", "product-preview");
fs.mkdirSync(destination, { recursive: true });
const read = file => fs.readFileSync(path.join(source, file), "utf8");
const assets = {};
for (const name of ["app-icon.png", "brand-mark.png", "wordmark.png"]) {
  assets[`assets/${name}`] = `data:image/png;base64,${fs.readFileSync(path.join(source, "assets", name)).toString("base64")}`;
}
const fonts = {};
const fontDirectory = path.join(root, "client", "public", "fonts");
if (fs.existsSync(fontDirectory)) {
  for (const entry of fs.readdirSync(fontDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.woff2?$/i.test(entry.name)) continue;
    const family = /fraunces/i.test(entry.name) ? "Fraunces" : /inter/i.test(entry.name) ? "Inter" : /plex|mono/i.test(entry.name) ? "IBM Plex Mono" : null;
    if (family) fonts[entry.name] = `data:font/${entry.name.endsWith("woff2") ? "woff2" : "woff"};base64,${fs.readFileSync(path.join(fontDirectory, entry.name)).toString("base64")}`;
  }
}
const fontStyles = fs.existsSync(path.join(fontDirectory, "fonts.css")) ? fs.readFileSync(path.join(fontDirectory, "fonts.css"), "utf8").replace(/\/fonts\/([^)'"\s]+)/g, (_match, name) => `__PREVIEW_FONT_${Object.keys(fonts).indexOf(name)}__`) : "";
const inlineScript = text => `<script>${text.replace(/<\/script/gi, "<\\/script")}</script>`;
const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src blob: data:; frame-src about: blob:; object-src 'none'; form-action 'none'; base-uri 'none'">`;
// Opaque-origin frames cannot change the browser URL or use origin-bound storage.
// History is presentation-only in the prototype; its in-memory route remains real.
const isolation = `function previewReplaceState(){ try { history.replaceState.apply(history,arguments); } catch {} }
function previewPushState(){ try { history.pushState.apply(history,arguments); } catch {} }
`;
const safeSource = text => {
  if (/\b(?:localStorage|sessionStorage|indexedDB)\s*(?:\.|\[)|\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(text)) throw new Error("Design source needs review before bundling: origin storage or networking was added.");
  return text.replace(/history\.replaceState\(/g, "previewReplaceState(").replace(/history\.pushState\(/g, "previewPushState(").replace(/new URLSearchParams\(location\.search\)/g, 'new URLSearchParams(window.__veynotePreviewQuery || "")');
};
let screen = read("screen.html");
screen = screen.replace(/<link\b[^>]*>/gi, tag => {
  const href = tag.match(/href="([^"]+)"/)?.[1];
  return href && !/^https?:/.test(href) ? `<style>${read(href).replace(/@import[^;]+;/g, "")}</style>` : "";
});
screen = screen.replace(/<script src="([^"]+)"><\/script>/g, (_, file) => inlineScript(safeSource(read(file))));
screen = screen.replace("<head>", `<head>${policy}<style>${fontStyles}</style>`).replace("<body>", `<body>${inlineScript(isolation + "window.__veynotePreviewQuery=__PREVIEW_QUERY__;")}`);
let gallery = read("index.html");
gallery = gallery.replace(/<link rel="stylesheet" href="review.css">/, `<style>${read("review.css")}</style>`);
gallery = gallery.replace('src="screen.html?id=home&theme=dark"', 'sandbox="allow-scripts" referrerpolicy="no-referrer"');
gallery = gallery.replace("<head>", `<head>${policy}<meta name="veynote-design-reference" content="complete">`);
gallery = gallery.replace('src="assets/app-icon.png"', 'data-preview-asset="assets/app-icon.png"');
gallery = gallery.replace(/<script src="catalog.js"><\/script>/, inlineScript(isolation + safeSource(read("catalog.js"))));
let review = safeSource(read("review.js"));
review = review.replace("$('preview').src=`screen.html?id=${id}&theme=${theme}`", "$('preview').srcdoc=makePreviewScreen(id,theme)");
// Full size stays within the isolated review frame; never opens an app-origin tab.
review = review.replace(/\$\('open'\)\.onclick=[^;]+;/, "$('open').textContent='Full size / Fit';$('open').onclick=()=>{ $('fit').checked=!$('fit').checked; resize(); };");
const template = JSON.stringify(screen).replace(/<\/script/gi, "<\\/script");
const controller = `const previewScreenTemplate=${template};
const previewAssets=${JSON.stringify(assets)},previewFonts=${JSON.stringify(fonts)};
function resolvePreviewFonts(text){return Object.values(previewFonts).reduce((result,uri,index)=>result.split('__PREVIEW_FONT_'+index+'__').join(uri),text)}
function makePreviewScreen(id,theme){const content=resolvePreviewFonts(previewScreenTemplate.replace('__PREVIEW_QUERY__',JSON.stringify('?id='+encodeURIComponent(id)+'&theme='+encodeURIComponent(theme))));return Object.entries(previewAssets).reduce((result,[name,uri])=>result.split(name).join(uri),content);}
document.querySelectorAll('[data-preview-asset]').forEach(image=>image.src=previewAssets[image.dataset.previewAsset]);
const previewFontStyle=document.createElement('style');previewFontStyle.textContent=resolvePreviewFonts(${JSON.stringify(fontStyles)});document.head.append(previewFontStyle);
`;
gallery = gallery.replace(/<script src="review.js"><\/script>/, inlineScript(controller + review));
fs.writeFileSync(path.join(destination, "blueprint.html"), gallery, "utf8");
const catalog = vm.runInNewContext(`${read("catalog.js")}\n;SCREENS.map(screen=>({id:screen.id,title:screen.title,group:screen.group}));`, {}, { timeout: 1000 });
fs.writeFileSync(path.join(destination, "manifest.json"), JSON.stringify({ screenCount: catalog.length, screens: catalog, sourceCatalogSha256: crypto.createHash("sha256").update(read("catalog.js")).digest("hex"), variants: ["desktop-dark", "desktop-light", "mobile-dark", "mobile-light"], widths: [320, 375, 414, 768, 1024, 1280, 1440, 1920] }, null, 2) + "\n", "utf8");
fs.writeFileSync(path.join(destination, "README.md"), "# Approved Veynote Product Preview\n\nBundled from the complete approved interactive blueprint. Design-only representative data; never a production feature demo.\n\nThe application loads this HTML into an opaque-origin iframe (`sandbox=allow-scripts` without `allow-same-origin`). All styles, scripts and brand assets are embedded. Content Security Policy blocks network connections, remote scripts, forms and object embeds. Prototype URL updates are safely ignored when the sandbox rejects them. No prototype session or app storage is exposed.\n\nRegenerate with `node scripts/bundle-product-preview.cjs <approved-blueprint-directory>`. The development navigation exposes Product Preview from every workspace.\n", "utf8");
const scripts = [...gallery.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
for (const script of scripts) new Function(script);
for (const script of [...screen.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1])) new Function(script.replace("__PREVIEW_QUERY__", '"?id=home&theme=dark"'));
if (!gallery.includes("makePreviewScreen(id,theme)") || !gallery.includes('sandbox="allow-scripts"')) throw new Error("Preview integration failed");
console.log(JSON.stringify({ bundle: "client/public/product-preview/blueprint.html", bytes: Buffer.byteLength(gallery), screens: catalog.length, fonts: Object.keys(fonts), isolated: true, scriptsChecked: scripts.length }));
