const wordSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;
const sentenceSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "sentence" }) : null;
function tokens(text) {
  if (wordSegmenter) return [...wordSegmenter.segment(text)].filter(part => part.isWordLike).map(part => part.segment);
  return text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || [];
}
function sentenceParts(text) {
  if (!text.trim()) return [];
  const parts = sentenceSegmenter ? [...sentenceSegmenter.segment(text)].map(part => part.segment) : text.split(/(?<=[.!?。！？])\s*/u);
  return parts.map(part => part.trim()).filter(part => tokens(part).length > 0);
}

const PARAGRAPH_BOUNDARIES = new Set(["P", "LI", "BLOCKQUOTE", "PRE", "DIV", "SECTION", "FIGURE", "FIGCAPTION", "TD", "TH"]);
// Read DOM nodes in document order, retaining text before/after nested blocks.
// Inline formatting does not create another paragraph; headings are structure.
export function paragraphTextFromNodes(root) {
  const paragraphs = [];
  let run = "";
  const flush = () => { const text = run.replace(/[\u200B\uFEFF]/g, "").trim(); if (text) paragraphs.push(text); run = ""; };
  function visit(node) {
    if (node.nodeType === 3) { run += node.textContent || ""; return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.tagName === "BR") { run += "\n"; return; }
    const heading = /^H[1-6]$/.test(node.tagName || ""), boundary = heading || PARAGRAPH_BOUNDARIES.has(node.tagName);
    if (boundary) flush();
    if (!heading) [...node.childNodes].forEach(visit);
    if (boundary) flush();
  }
  visit(root); flush(); return paragraphs;
}

// Pure measurements keep language/counting rules testable independently of
// DOM extraction. No score or activity duration is inferred from dates.
export function measureWriting(text = "", structure = {}) {
  const clean = text.trim(), words = tokens(clean), parts = sentenceParts(clean);
  const paragraphs = (structure.paragraphTexts || (clean ? clean.split(/\n+/) : [])).filter(part => part.trim());
  const lengths = parts.map(part => tokens(part).length);
  const longest = lengths.reduce((best, length, index) => best < 0 || length > lengths[best] ? index : best, -1);
  const shortest = lengths.reduce((best, length, index) => best < 0 || length < lengths[best] ? index : best, -1);
  const tasks = structure.tasks || 0, tasksDone = Math.min(tasks, structure.tasksDone || 0);
  return {
    words: words.length, characters: Array.from(clean).length, charactersNoSpaces: Array.from(clean.replace(/\s/gu, "")).length,
    sentences: parts.length, paragraphs: paragraphs.length,
    readingMinutes: words.length ? Math.max(1, Math.ceil(words.length / 220)) : 0,
    speakingMinutes: words.length ? Math.max(1, Math.ceil(words.length / 130)) : 0,
    averageWordLength: words.length ? words.reduce((sum, word) => sum + Array.from(word).length, 0) / words.length : 0,
    averageSentenceLength: parts.length ? lengths.reduce((sum, size) => sum + size, 0) / parts.length : 0,
    averageParagraphLength: paragraphs.length ? paragraphs.reduce((sum, part) => sum + tokens(part).length, 0) / paragraphs.length : 0,
    longestSentence: longest < 0 ? null : { text: parts[longest], words: lengths[longest] },
    shortestSentence: shortest < 0 ? null : { text: parts[shortest], words: lengths[shortest] },
    headingsOutline: structure.headingsOutline || [], headings: structure.headingsOutline?.length || 0,
    links: structure.links || 0, images: structure.images || 0, tasks, tasksDone,
    checklistCompletion: tasks ? Math.round(tasksDone / tasks * 100) : null, documentBytes: structure.documentBytes || 0,
  };
}

export function computeStats(html = "") {
  if (!html) return measureWriting();
  const template = document.createElement("template"); template.innerHTML = html;
  const root = template.content;
  root.querySelectorAll("script,style,iframe,object,embed,[hidden]").forEach(node => node.remove());
  const paragraphTexts = paragraphTextFromNodes(root);
  root.querySelectorAll("br").forEach(node => node.replaceWith(document.createTextNode("\n")));
  const blockSelector = "p,li,blockquote,pre,div,section,figure,figcaption,h1,h2,h3,h4,h5,h6,td,th";
  const blocks = [...root.querySelectorAll(blockSelector)];
  const headingsOutline = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(node => ({ level: Number(node.tagName.slice(1)), text: (node.textContent || "").trim() }));
  const items = [...root.querySelectorAll(".cl-item")], looseChecks = [...root.querySelectorAll('input[type="checkbox"]')].filter(node => !node.closest(".cl-item"));
  const tasksDone = items.filter(node => node.dataset.checked === "true" || node.querySelector('input[type="checkbox"]')?.checked).length + looseChecks.filter(node => node.checked).length;
  const links = root.querySelectorAll("a[href]").length, images = root.querySelectorAll("img").length;
  blocks.forEach(node => { node.prepend(document.createTextNode("\n")); node.append(document.createTextNode("\n")); });
  const text = (root.textContent || "").replace(/[\u200B\uFEFF]/g, "").replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
  return measureWriting(text, { paragraphTexts, headingsOutline, links, images, tasks: items.length + looseChecks.length, tasksDone, documentBytes: new TextEncoder().encode(html).byteLength });
}

export function formatStats(stats) {
  if (stats.words === 0) return "";
  const parts = [
    `${stats.words.toLocaleString()} word${stats.words === 1 ? "" : "s"}`,
    `${stats.characters.toLocaleString()} characters`,
    `${stats.readingMinutes} min read`,
  ];
  if (stats.tasks > 0) parts.push(`${stats.tasksDone}/${stats.tasks} tasks complete`);
  return parts.join(" · ");
}
