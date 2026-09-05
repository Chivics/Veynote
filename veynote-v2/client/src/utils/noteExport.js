// Converts the editor's known HTML vocabulary (headings, bold/italic/
// underline/strike, lists, checklists, blockquote, code, callouts,
// tables, links, images, hr) into Markdown. Hand-rolled rather than
// pulling in a generic HTML->Markdown library — the editor only ever
// produces a fixed, known set of tags, so a tailored converter is both
// simpler and more predictable than a general-purpose one.
function inline(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const children = Array.from(node.childNodes).map(inline).join("");
  const tag = node.tagName.toLowerCase();

  switch (tag) {
    case "strong":
    case "b":
      return `**${children}**`;
    case "em":
    case "i":
      return `*${children}*`;
    case "u":
      return `<u>${children}</u>`; // no native Markdown underline
    case "s":
    case "strike":
    case "del":
      return `~~${children}~~`;
    case "code":
      return `\`${children}\``;
    case "a":
      return `[${children || node.getAttribute("href")}](${node.getAttribute("href") || ""})`;
    case "img":
      return `![${node.getAttribute("alt") || ""}](${node.getAttribute("src") || ""})`;
    case "br":
      return "\n";
    default:
      return children;
  }
}

function blockToMarkdown(node, listDepth = 0) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent.trim();
    return text ? text + "\n\n" : "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const tag = node.tagName.toLowerCase();
  const indent = "  ".repeat(listDepth);

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    return `${"#".repeat(level)} ${inline(node).trim()}\n\n`;
  }
  if (tag === "blockquote") {
    return inline(node).trim().split("\n").map((l) => `> ${l}`).join("\n") + "\n\n";
  }
  if (tag === "pre") {
    return `\`\`\`\n${node.textContent}\n\`\`\`\n\n`;
  }
  if (tag === "hr") return "---\n\n";
  if (tag === "img") return `![${node.getAttribute("alt") || ""}](${node.getAttribute("src") || ""})\n\n`;
  if (tag === "ul" || tag === "ol") {
    return Array.from(node.children)
      .map((li, i) => {
        const isChecklist = li.classList.contains("cl-item");
        const prefix = isChecklist
          ? `${indent}- [${li.dataset.checked === "true" ? "x" : " "}] `
          : tag === "ol"
          ? `${indent}${i + 1}. `
          : `${indent}- `;
        const nested = Array.from(li.children)
          .filter((c) => c.tagName === "UL" || c.tagName === "OL")
          .map((c) => blockToMarkdown(c, listDepth + 1))
          .join("");
        const ownText = Array.from(li.childNodes)
          .filter((c) => !(c.tagName === "UL" || c.tagName === "OL"))
          .map(inline)
          .join("")
          .trim();
        return `${prefix}${ownText}\n${nested}`;
      })
      .join("") + "\n";
  }
  if (node.classList?.contains("callout")) {
    const icon = node.querySelector(".callout-icon")?.textContent || "";
    const text = node.querySelector(".callout-text")?.textContent || inline(node);
    return `> ${icon} ${text.trim()}\n\n`;
  }
  if (tag === "table") {
    const rows = Array.from(node.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.children).map((cell) => inline(cell).trim() || " ")
    );
    if (rows.length === 0) return "";
    const header = `| ${rows[0].join(" | ")} |`;
    const divider = `| ${rows[0].map(() => "---").join(" | ")} |`;
    const body = rows.slice(1).map((r) => `| ${r.join(" | ")} |`).join("\n");
    return `${header}\n${divider}\n${body}\n\n`;
  }
  if (tag === "p" || tag === "div") {
    const text = inline(node).trim();
    return text ? `${text}\n\n` : "";
  }
  // Unknown block-level tag — recurse into children rather than dropping content.
  return Array.from(node.childNodes).map((c) => blockToMarkdown(c, listDepth)).join("");
}

export function htmlToMarkdown(html) {
  const container = document.createElement("div");
  container.innerHTML = html || "";
  return Array.from(container.childNodes)
    .map((n) => blockToMarkdown(n))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToPlainText(html) {
  const container = document.createElement("div");
  container.innerHTML = html || "";
  const blocks = [];
  const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "tr"]);

  function walk(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (BLOCK_TAGS.has(tag)) {
      const text = node.textContent.replace(/\u00a0/g, " ").trim();
      if (text) blocks.push(text);
      return; // textContent already captured everything below this node
    }
    Array.from(node.childNodes).forEach(walk);
  }
  Array.from(container.childNodes).forEach(walk);

  return blocks.join("\n\n") || (container.textContent || "").replace(/\u00a0/g, " ").trim();
}

function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(title) {
  return (title || "Untitled").replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80);
}

export function exportNote(note, format) {
  const name = safeFilename(note.title);
  if (format === "md") {
    const md = `# ${note.title || "Untitled"}\n\n${htmlToMarkdown(note.content)}`;
    downloadBlob(`${name}.md`, md, "text/markdown");
  } else if (format === "txt") {
    downloadBlob(`${name}.txt`, `${note.title || "Untitled"}\n\n${htmlToPlainText(note.content)}`, "text/plain");
  } else if (format === "html") {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${note.title || "Untitled"}</title></head><body><h1>${note.title || "Untitled"}</h1>${note.content || ""}</body></html>`;
    downloadBlob(`${name}.html`, doc, "text/html");
  } else if (format === "json") {
    downloadBlob(
      `${name}.json`,
      JSON.stringify({ title: note.title, content: note.content, tags: note.tags, createdAt: note.createdAt, updatedAt: note.updatedAt }, null, 2),
      "application/json"
    );
  }
}
