function calloutHTML(variant, icon) {
  return (
    `<div class="callout callout-${variant}"><span class="callout-icon" contenteditable="false">${icon}</span>` +
    `<span class="callout-text" data-focus-target>Type something…</span></div><p><br></p>`
  );
}

export const INSERT_GROUPS = ["Writing", "Structure", "Callouts", "Media & files"];

// Both the toolbar Insert button and the slash menu use this catalog. Every
// visible entry either calls a supported editor method or opens a file picker.
export const INSERT_BLOCKS = [
  { key: "text", group: "Writing", label: "Paragraph", description: "Continue with plain text", icon: "¶", keywords: "text body plain", action: ed => ed.exec("formatBlock", "P") },
  ...Array.from({ length: 6 }, (_, index) => ({
    key: `h${index + 1}`, group: "Writing", label: `Heading ${index + 1}`,
    description: index === 0 ? "A main section title" : "A section within your document",
    icon: `H${index + 1}`, keywords: `h${index + 1} title subheading`,
    action: ed => ed.exec("formatBlock", `H${index + 1}`),
  })),
  { key: "bullet", group: "Writing", label: "Bullet list", description: "An unordered list", icon: "•", keywords: "bullets unordered", action: ed => ed.setList("bullet", "disc") },
  { key: "numbered", group: "Writing", label: "Numbered list", description: "A sequence of steps", icon: "1.", keywords: "ordered steps numbers", action: ed => ed.setList("numbered", "decimal") },
  { key: "checklist", group: "Writing", label: "Checklist", description: "Tasks you can tick off", icon: "☑", keywords: "todo to-do task checkbox", action: ed => ed.setList("checklist", "checklist") },
  { key: "quote", group: "Structure", label: "Quote", description: "Set a passage apart", icon: "❝", keywords: "blockquote citation", action: ed => ed.exec("formatBlock", "BLOCKQUOTE") },
  { key: "code", group: "Structure", label: "Code block", description: "Write a formatted snippet", icon: "{ }", keywords: "pre monospace snippet", action: ed => ed.exec("formatBlock", "PRE") },
  { key: "divider", group: "Structure", label: "Divider", description: "Separate sections", icon: "—", keywords: "rule line separator", action: ed => ed.insertHTML('<hr class="editor-divider"/><div><br></div>') },
  { key: "table", group: "Structure", label: "Table", description: "Organize information in cells", icon: "▦", keywords: "grid rows columns", action: ed => ed.insertBlock(
    '<table class="note-table"><tbody>' +
    '<tr><td data-focus-target>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>' +
    '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>' +
    '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>' +
    '</tbody></table><p><br></p>'
  ) },
  { key: "callout-info", group: "Callouts", label: "Info callout", description: "Give a detail more attention", icon: "💡", keywords: "note tip information", action: ed => ed.insertBlock(calloutHTML("info", "💡")) },
  { key: "callout-warning", group: "Callouts", label: "Warning callout", description: "Flag something to watch", icon: "⚠️", keywords: "caution alert", action: ed => ed.insertBlock(calloutHTML("warning", "⚠️")) },
  { key: "callout-success", group: "Callouts", label: "Success callout", description: "Mark a positive outcome", icon: "✅", keywords: "done complete", action: ed => ed.insertBlock(calloutHTML("success", "✅")) },
  { key: "callout-important", group: "Callouts", label: "Important callout", description: "Emphasize a key point", icon: "❗", keywords: "critical priority", action: ed => ed.insertBlock(calloutHTML("important", "❗")) },
  { key: "image", group: "Media & files", label: "Image", description: "Add a photo or illustration", icon: "image", keywords: "picture photo visual upload", needsFilePicker: "image" },
  { key: "file", group: "Media & files", label: "File", description: "Attach a document", icon: "file", keywords: "attachment document upload pdf", needsFilePicker: "file" },
];

export function searchInsertBlocks(query = "") {
  const normalized = String(query).trim().toLowerCase();
  if (!normalized) return INSERT_BLOCKS;
  const terms = normalized.split(/\s+/);
  return INSERT_BLOCKS.map((block, index) => ({ block, index }))
    .filter(({ block }) => terms.every(term => `${block.label} ${block.key} ${block.keywords} ${block.description}`.toLowerCase().includes(term)))
    .sort((a, b) => {
      const score = block => block.label.toLowerCase().startsWith(normalized) ? 0 : block.key.startsWith(normalized) ? 1 : 2;
      return score(a.block) - score(b.block) || a.index - b.index;
    })
    .map(({ block }) => block);
}
