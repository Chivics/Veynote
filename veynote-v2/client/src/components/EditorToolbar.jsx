import { useState, useRef, useEffect } from "react";

const TEXT_COLORS = ["#f4f6f8", "#7c6cff", "#5fa8ff", "#38d39f", "#f5b942", "#ff6878", "#b6beca"];
const HIGHLIGHT_COLORS = ["#7c6cff33", "#5fa8ff33", "#38d39f33", "#f5b94233", "#ff687833"];
const FONT_SIZES = [
  { label: "Small", px: "12px" },
  { label: "Normal", px: "14px" },
  { label: "Comfort", px: "16px" },
  { label: "Large", px: "18px" },
  { label: "Display", px: "22px" },
  { label: "Extra large", px: "28px" },
];
const LINE_SPACINGS = [
  { label: "Tight", value: "1.3" },
  { label: "Normal", value: "1.8" },
  { label: "Relaxed", value: "2.4" },
];
const PARA_SPACINGS = [
  { label: "None", value: "0px" },
  { label: "Small", value: "8px" },
  { label: "Large", value: "20px" },
];

function ToolbarButton({ onMouseDown, children, title, active }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault(); // keep the editor's text selection alive
        onMouseDown();
      }}
      className={`editor-tool ${
        active ? "bg-app-panel2 text-ink" : "text-ink-muted hover:bg-app-panel2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Popover({ label, children, width = 180 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton onMouseDown={() => setOpen((o) => !o)} title={label}>
        {label}
      </ToolbarButton>
      {open && (
        <div
          style={{ width }}
          className="editor-popover"
          onMouseDown={(e) => e.preventDefault()} // don't steal the editor selection when clicking inside
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function LinkControls({ onApply, close }) {
  const [url, setUrl] = useState("");
  return <form className="editor-link-form" onSubmit={event => { event.preventDefault(); if (url.trim()) { onApply(url.trim()); close(); } }}><span>Link destination</span><input autoFocus type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com" /><button type="submit">Apply link</button></form>;
}

/**
 * The full formatting toolbar. Every control calls straight into the
 * PaginatedEditor's imperative API (passed as `editorRef`) — nothing
 * here is decorative; every button does exactly what it says.
 */
export default function EditorToolbar({ editorRef, onOpenInsertMenu }) {
  const [feedback, setFeedback] = useState("");
  function selectionRequired() { setFeedback("Select some text first."); window.setTimeout(() => setFeedback(""), 2200); }
  function exec(cmd, arg) {
    editorRef.current?.exec(cmd, arg);
  }

  return (
    <div className="editor-toolbar print:hidden">
      {feedback && <div className="editor-toolbar-feedback" role="status">{feedback}</div>}
      <ToolbarButton title="Insert block" onMouseDown={onOpenInsertMenu}>
        +
      </ToolbarButton>
      <div className="w-px bg-app-border mx-1 my-0.5 self-stretch" />

      <ToolbarButton title="Bold" onMouseDown={() => exec("bold")}>
        <b>B</b>
      </ToolbarButton>
      <ToolbarButton title="Italic" onMouseDown={() => exec("italic")}>
        <i>I</i>
      </ToolbarButton>
      <ToolbarButton title="Underline" onMouseDown={() => exec("underline")}>
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton title="Strikethrough" onMouseDown={() => exec("strikeThrough")}>
        <s>S</s>
      </ToolbarButton>

      <div className="w-px bg-app-border mx-1 my-0.5 self-stretch" />

      <Popover label="A" width={70}>
        {(close) => (
          <div className="flex flex-col gap-1">
            {FONT_SIZES.map((f) => (
              <button
                key={f.label}
                className="text-left text-[11px] px-2 py-1.5 rounded hover:bg-app-panel2 text-ink"
                style={{ fontSize: f.px }}
                onClick={() => {
                  const applied = editorRef.current?.applyInlineStyle("fontSize", f.px);
                  if (!applied) selectionRequired();
                  close();
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </Popover>

      <Popover label="🎨" width={140}>
        {(close) => (
          <div>
            <p className="text-[9px] text-ink-muted mb-1.5">TEXT COLOR</p>
            <div className="flex gap-1.5 flex-wrap">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  style={{ backgroundColor: c }}
                  className="w-5 h-5 rounded-full border border-app-border"
                  onClick={() => {
                    const applied = editorRef.current?.applyInlineStyle("color", c);
                    if (!applied) selectionRequired();
                    close();
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </Popover>

      <Popover label="🖍" width={150}>
        {(close) => (
          <div>
            <p className="text-[9px] text-ink-muted mb-1.5">HIGHLIGHT</p>
            <div className="flex gap-1.5 flex-wrap">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c}
                  style={{ backgroundColor: c }}
                  className="w-5 h-5 rounded-full border border-app-border"
                  onClick={() => {
                    const applied = editorRef.current?.applyInlineStyle("backgroundColor", c);
                    if (!applied) selectionRequired();
                    close();
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </Popover>

      <div className="w-px bg-app-border mx-1 my-0.5 self-stretch" />

      <ToolbarButton title="Align left" onMouseDown={() => editorRef.current?.applyBlockStyle("textAlign", "left")}>
        ⟸
      </ToolbarButton>
      <ToolbarButton title="Align center" onMouseDown={() => editorRef.current?.applyBlockStyle("textAlign", "center")}>
        ⟺
      </ToolbarButton>
      <ToolbarButton title="Align right" onMouseDown={() => editorRef.current?.applyBlockStyle("textAlign", "right")}>
        ⟹
      </ToolbarButton>

      <Popover label="↕" width={130}>
        {(close) => (
          <div>
            <p className="text-[9px] text-ink-muted mb-1.5">LINE SPACING</p>
            <div className="flex flex-col gap-1 mb-2">
              {LINE_SPACINGS.map((l) => (
                <button
                  key={l.label}
                  className="text-left text-[11px] px-2 py-1 rounded hover:bg-app-panel2"
                  onClick={() => {
                    editorRef.current?.applyBlockStyle("lineHeight", l.value);
                    close();
                  }}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-ink-muted mb-1.5">SPACE AFTER PARAGRAPH</p>
            <div className="flex flex-col gap-1">
              {PARA_SPACINGS.map((p) => (
                <button
                  key={p.label}
                  className="text-left text-[11px] px-2 py-1 rounded hover:bg-app-panel2"
                  onClick={() => {
                    editorRef.current?.applyBlockStyle("marginBottom", p.value);
                    close();
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Popover>

      <ToolbarButton title="Indent" onMouseDown={() => exec("indent")}>
        ⇥
      </ToolbarButton>
      <ToolbarButton title="Outdent" onMouseDown={() => exec("outdent")}>
        ⇤
      </ToolbarButton>

      <div className="w-px bg-app-border mx-1 my-0.5 self-stretch" />

      <ToolbarButton title="Heading" onMouseDown={() => exec("formatBlock", "H2")}>
        H2
      </ToolbarButton>
      <ToolbarButton title="Subheading" onMouseDown={() => exec("formatBlock", "H3")}>
        H3
      </ToolbarButton>
      <ToolbarButton title="Quote" onMouseDown={() => exec("formatBlock", "BLOCKQUOTE")}>
        ❝
      </ToolbarButton>
      <ToolbarButton title="Code block" onMouseDown={() => exec("formatBlock", "PRE")}>
        {"{ }"}
      </ToolbarButton>

      <div className="w-px bg-app-border mx-1 my-0.5 self-stretch" />

      <ToolbarButton title="Bullet list" onMouseDown={() => exec("insertUnorderedList")}>
        ☰
      </ToolbarButton>
      <ToolbarButton title="Numbered list" onMouseDown={() => exec("insertOrderedList")}>
        ☰1
      </ToolbarButton>
      <ToolbarButton
        title="Checklist"
        onMouseDown={() =>
          editorRef.current?.insertHTML('<div class="cl-item" data-checked="false"><span class="cl-box" contenteditable="false">☐</span><span>New item</span></div><div><br></div>')
        }
      >
        ☑
      </ToolbarButton>

      <div className="w-px bg-app-border mx-1 my-0.5 self-stretch" />

      <ToolbarButton
        title="Divider"
        onMouseDown={() => editorRef.current?.insertHTML('<hr class="editor-divider"/><div><br></div>')}
      >
        —
      </ToolbarButton>
      <Popover label="Link" width={230}>{close => <LinkControls close={close} onApply={url => exec("createLink", url)} />}</Popover>
    </div>
  );
}
