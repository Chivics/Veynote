// Downloads the approved Google Fonts faces and retains their license notices.
const fs = require("node:fs/promises"), path = require("node:path");
const root = path.resolve(__dirname, "..");
async function download(url, target) {
  const response = await fetch(url); if (!response.ok) throw new Error(`Font download failed: HTTP ${response.status}`);
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
}
async function main() {
  const directory = path.join(root, "client/public/fonts"); await fs.mkdir(directory, { recursive: true });
  const source = await fs.readFile(path.join(root, "client/public/product-preview/font-source.css"), "utf8");
  const jobs = [], blocks = [];
  for (const match of source.matchAll(/\/\* (latin(?:-ext)?) \*\/\s*(@font-face\s*\{[^}]+\})/g)) {
    const block = match[2], family = block.match(/font-family:\s*'([^']+)'/)[1], style = block.match(/font-style:\s*(\w+)/)[1], weight = block.match(/font-weight:\s*([^;]+)/)[1].replace(/\s/g, "-");
    const url = block.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/)[1];
    const name = `${family.toLowerCase().replace(/\s+/g, "-")}-${style}-${weight}-${match[1]}.woff2`;
    jobs.push(download(url, path.join(directory, name))); blocks.push(block.replace(url, `/fonts/${name}`));
  }
  if (blocks.length !== 10) throw new Error("Review changed font CSS before downloading a different face set.");
  await Promise.all(jobs);
  await Promise.all(["inter", "fraunces", "ibmplexmono"].map(family => download(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`, path.join(directory, `${family}-OFL.txt`))));
  await fs.writeFile(path.join(directory, "fonts.css"), blocks.join("\n\n") + "\n");
  console.log(`Saved ${blocks.length} approved compressed font faces and their licenses.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
