// The same option list drives both the toolbar's "+" Insert menu and the
// "/" slash command popup, so choosing "Heading" from either place does
// exactly the same thing — one implementation, two entry points.

function calloutHTML(variant, icon) {
  return (
    `<div class="callout callout-${variant}"><span class="callout-icon" contenteditable="false">${icon}</span>` +
    `<span class="callout-text" data-focus-target>Type something…</span></div><p><br></p>`
  );
}

export const INSERT_BLOCKS = [
  { key: "text", label: "Text", icon: "¶", action: (ed) => ed.exec("formatBlock", "P") },
  { key: "heading", label: "Heading", icon: "H2", action: (ed) => ed.exec("formatBlock", "H2") },
  { key: "subheading", label: "Subheading", icon: "H3", action: (ed) => ed.exec("formatBlock", "H3") },
  { key: "bullet", label: "Bullet list", icon: "☰", action: (ed) => ed.exec("insertUnorderedList") },
  { key: "numbered", label: "Numbered list", icon: "☰1", action: (ed) => ed.exec("insertOrderedList") },
  {
    key: "checklist",
    label: "Checklist",
    icon: "☑",
    action: (ed) =>
      ed.insertHTML(
        '<div class="cl-item" data-checked="false"><span class="cl-box" contenteditable="false">☐</span><span>New item</span></div><div><br></div>'
      ),
  },
  { key: "quote", label: "Quote", icon: "❝", action: (ed) => ed.exec("formatBlock", "BLOCKQUOTE") },
  { key: "code", label: "Code", icon: "{ }", action: (ed) => ed.exec("formatBlock", "PRE") },
  { key: "divider", label: "Divider", icon: "—", action: (ed) => ed.insertHTML('<hr class="editor-divider"/><div><br></div>') },
  { key: "table", label: "Table", icon: "▦", action: (ed) => ed.insertBlock(
    '<table class="note-table"><tbody>' +
    '<tr><td data-focus-target>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>' +
    '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>' +
    '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>' +
    '</tbody></table><p><br></p>'
  ) },
  { key: "callout-info", label: "Callout: Info", icon: "💡", action: (ed) => ed.insertBlock(calloutHTML("info", "💡")) },
  { key: "callout-warning", label: "Callout: Warning", icon: "⚠️", action: (ed) => ed.insertBlock(calloutHTML("warning", "⚠️")) },
  { key: "callout-success", label: "Callout: Success", icon: "✅", action: (ed) => ed.insertBlock(calloutHTML("success", "✅")) },
  { key: "callout-important", label: "Callout: Important", icon: "❌", action: (ed) => ed.insertBlock(calloutHTML("important", "❌")) },
  // "image" and "file" are handled specially by NoteEditor (they open a
  // file picker + upload), so they're marked here rather than given an
  // `action` — the menu component checks for `needsFilePicker`.
  { key: "image", label: "Image", icon: "🖼", needsFilePicker: "image" },
  { key: "file", label: "File", icon: "📎", needsFilePicker: "file" },
];

const MENU_WIDTH = 190;
const MENU_HEIGHT_ESTIMATE = 420; // roughly 13 rows tall — used only for viewport clamping

export default function InsertMenu({ x, y, onPick, onClose }) {
  // Clamp so the menu never renders partially (or fully) off-screen —
  // important on phones where the caret can sit near any screen edge.
  const clampedX = Math.min(Math.max(8, x), window.innerWidth - MENU_WIDTH - 8);
  const clampedY = Math.min(Math.max(8, y), window.innerHeight - Math.min(MENU_HEIGHT_ESTIMATE, window.innerHeight - 16));

  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={onClose} />
      <div
        style={{ position: "fixed", left: clampedX, top: clampedY, width: MENU_WIDTH, maxHeight: "80vh" }}
        className="z-40 bg-app-panel border border-app-border rounded-xl shadow-2xl overflow-y-auto py-1.5"
      >
        {INSERT_BLOCKS.map((b) => (
          <button
            key={b.key}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(b);
            }}
            className="w-full flex items-center gap-2.5 text-left px-3 py-2 max-sm:py-3 text-[12px] max-sm:text-[13px] text-ink hover:bg-app-panel2"
          >
            <span className="w-5 text-center text-ink-muted text-[11px]">{b.icon}</span>
            {b.label}
          </button>
        ))}
      </div>
    </>
  );
}
