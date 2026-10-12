import { useState, useRef, useEffect, useId } from "react";
import NavigationIcon from "./layout/NavigationIcon";
import { BULLET_STYLES, NUMBERED_STYLES } from "../utils/editorListStyles.js";
import { safeLinkDestination } from "../utils/linkify.js";
import "./editorToolbar.css";

const FONT_SIZES = [12,14,16,18,20,22,24,28,32,36,40,48,56,64];
const FONTS = [["Sans","Inter, sans-serif"],["Serif","Georgia, serif"],["Mono","monospace"]];
const COLORS = [["Default","inherit"],["Violet","#8d7eff"],["Blue","#5fa8ff"],["Green","#258b67"],["Gold","#a07927"],["Red","#c94558"]];
const HIGHLIGHTS = [["None","transparent"],["Violet","#8d7eff33"],["Blue","#5fa8ff33"],["Green","#38d39f33"],["Gold","#f5b94255"],["Rose","#ff687833"]];
const TEXT_STYLES = [["Paragraph","P"],...Array.from({length:6},(_,i) => [`Heading ${i+1}`,`H${i+1}`]),["Quote","BLOCKQUOTE"],["Code block","PRE"]];

function Tool({ label, children, onClick, className="", ...props }) {
  return <button type="button" className={`editor-tool ${className}`} title={label} aria-label={label} onMouseDown={event => event.preventDefault()} onClick={onClick} {...props}>{children}</button>;
}

// Close the native modal before applying a command: the document must no longer
// be inert. The editor's saved range restores pointer and keyboard selections.
export default function EditorToolbar({ editorRef, formatState, historyState, onOpenInsertMenu }) {
  const [panel,setPanel] = useState(null), [feedback,setFeedback] = useState("");
  const [link,setLink] = useState("");
  const dialog = useRef(null), timer = useRef(null);
  const heading = useId();
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (panel && !dialog.current.open) dialog.current.showModal();
    if (!panel && dialog.current.open) dialog.current.close();
    if (panel === "link") dialog.current.querySelector(".writing-link-form input")?.focus();
    else if (panel === "styles") dialog.current.querySelector('.writing-style-list button[aria-pressed="true"], .writing-style-list button')?.focus();
    else if (panel) dialog.current.querySelector(".writing-format-body button")?.focus();
  },[panel]);
  function close() { dialog.current?.close(); setPanel(null); }
  function open(name) { setLink(""); setPanel(name); }
  function apply(action) { close(); const result = action(); if (result === false) showFeedback("Place the cursor in your document and try again."); }
  function showFeedback(message) { setFeedback(message); clearTimeout(timer.current); timer.current = setTimeout(() => setFeedback(""), 4500); }
  function exec(command,arg) { const result = editorRef.current?.exec(command,arg); if (result === false) showFeedback("Place the cursor in your document and try again."); return result; }
  function setList(kind, style) { apply(() => editorRef.current?.setList(kind, style)); }
  function inlineCode() { apply(() => { const done = editorRef.current?.inlineCode(); if (!done) showFeedback("Select text within one paragraph to make it inline code."); return undefined; }); }
  function inline(property,value) {
    apply(() => {
      if (!editorRef.current?.applyInlineStyle(property,value)) {
        showFeedback("Select the text you want to format, then choose a style.");
      }
    });
  }
  function block(property,value) { apply(() => editorRef.current?.applyBlockStyle(property,value)); }
  const titles = { styles:"Text style", lists:"Lists & checklists", typography:"Typography & layout", link:"Add a link" };
  const activeStyle = TEXT_STYLES.find(([, value]) => value === formatState?.block)?.[0] || "Paragraph";
  return <>
    <div className="editor-toolbar writing-toolbar print:hidden" role="group" aria-label="Writing tools">
      {feedback && <div className="editor-toolbar-feedback" role="status">{feedback}</div>}
      <Tool label={`Text style: ${activeStyle}`} className="editor-labelled-tool editor-style-tool" onClick={() => open("styles")} aria-haspopup="dialog" aria-expanded={panel === "styles"}><span className="editor-style-word">{activeStyle}</span><span className="editor-style-short" aria-hidden="true">H</span><NavigationIcon name="down" size={13} /></Tool>
      <span className="writing-tool-divider" aria-hidden="true" />
      <Tool label="Undo" className="editor-history-tool" disabled={!historyState?.canUndo} onClick={() => exec("undo")}><NavigationIcon name="undo" size={19} /></Tool>
      <Tool label="Redo" className="editor-history-tool" disabled={!historyState?.canRedo} onClick={() => exec("redo")}><NavigationIcon name="redo" size={19} /></Tool>
      <span className="writing-tool-divider" aria-hidden="true" />
      <Tool label="Bold" aria-pressed={Boolean(formatState?.bold)} onClick={() => exec("bold")}><b>B</b></Tool>
      <Tool label="Italic" aria-pressed={Boolean(formatState?.italic)} onClick={() => exec("italic")}><i>I</i></Tool>
      <Tool label="Underline" className="editor-underline-tool" aria-pressed={Boolean(formatState?.underline)} onClick={() => exec("underline")}><u>U</u></Tool>
      <span className="writing-tool-divider" aria-hidden="true" />
      <Tool label="Lists and checklists" className="editor-labelled-tool editor-list-tool" onClick={() => open("lists")} aria-haspopup="dialog" aria-expanded={panel === "lists"} aria-pressed={Boolean(formatState?.list)}><NavigationIcon name="list" size={18} /><span>Lists</span><NavigationIcon name="down" size={13} /></Tool>
      <Tool label="Typography and layout" className="editor-labelled-tool" onClick={() => open("typography")} aria-haspopup="dialog" aria-expanded={panel === "typography"}><span>Aa</span><NavigationIcon name="down" size={13} /></Tool>
      <Tool label="Add link" className="editor-link-tool" onClick={() => open("link")} aria-haspopup="dialog" aria-expanded={panel === "link"}><NavigationIcon name="link" size={19} /></Tool>
      <Tool label="Insert block" className="editor-labelled-tool editor-insert-tool" onClick={event => onOpenInsertMenu(event.currentTarget)}><NavigationIcon name="plus" size={18} /><span>Insert</span></Tool>
    </div>
    <dialog ref={dialog} className={`writing-format-dialog ${panel === "styles" ? "is-style-list" : ""}`} aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }} onClose={() => setPanel(null)} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = dialog.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
      <header><h2 id={heading}>{titles[panel] || "Writing tools"}</h2><button type="button" aria-label="Close writing tools" onClick={close}><NavigationIcon name="close" size={20} /></button></header>
      <div className="writing-format-body">
        {panel === "styles" && <div className="writing-style-list">{TEXT_STYLES.map(([label,value]) => <button type="button" key={value} aria-pressed={formatState?.block === value} onClick={() => apply(() => editorRef.current?.exec("formatBlock",value))}><span className="writing-style-symbol">{value === "BLOCKQUOTE" ? "“" : value === "PRE" ? "</>" : value}</span><span>{label}</span></button>)}</div>}
        {panel === "lists" && <div className="writing-list-editor">
          <p className="writing-list-intro">Choose a marker. Your list remains part of the document and survives every save.</p>
          <section><h3>Bullet</h3><div className="writing-list-options">{BULLET_STYLES.map(option => <button key={option.value} type="button" aria-pressed={formatState?.list?.kind === "bullet" && formatState.list.style === option.value} onClick={() => setList("bullet", option.value)}><span aria-hidden="true">{option.sample}</span>{option.label}</button>)}</div></section>
          <section><h3>Numbered</h3><div className="writing-list-options">{NUMBERED_STYLES.map(option => <button key={option.value} type="button" aria-pressed={formatState?.list?.kind === "numbered" && formatState.list.style === option.value} onClick={() => setList("numbered", option.value)}><span aria-hidden="true">{option.sample}</span>{option.label}</button>)}</div></section>
          <section><h3>Tasks</h3><div className="writing-list-options"><button type="button" aria-pressed={formatState?.list?.kind === "checklist"} onClick={() => setList("checklist", "checklist")}><span aria-hidden="true">☐</span>Checklist</button></div></section>
          <p className="writing-list-hint">Tab nests an item · Shift+Tab moves it out · Enter on an empty task ends the list.</p>
        </div>}
        {panel === "typography" && <>
          <section className="writing-mobile-structure"><h3>Document structure</h3><div className="writing-format-options">{TEXT_STYLES.map(([label,value]) => <button type="button" key={value} aria-pressed={formatState?.block === value} onClick={() => apply(() => editorRef.current?.exec("formatBlock",value))}>{label}</button>)}</div></section>
          <section><h3>Font family <small>Selected text</small></h3><div className="writing-format-options">{FONTS.map(([label,value]) => <button type="button" key={label} style={{fontFamily:value}} onClick={() => inline("fontFamily",value)}>{label}</button>)}</div></section>
          <section><h3>Text size <small>Pixels</small></h3><div className="writing-format-options is-sizes">{FONT_SIZES.map(size => <button type="button" key={size} aria-label={`Text size ${size} pixels`} onClick={() => inline("fontSize",`${size}px`)}>{size}</button>)}</div></section>
          <section><h3>Text color</h3><div className="writing-color-options">{COLORS.map(([label,color]) => <button type="button" key={label} aria-label={`${label} text color`} title={label} onClick={() => inline("color",color)}><span style={{backgroundColor:color === "inherit" ? "rgb(var(--ink))" : color}} /></button>)}</div></section>
          <section><h3>Highlight</h3><div className="writing-color-options">{HIGHLIGHTS.map(([label,color]) => <button type="button" key={label} aria-label={`${label} highlight`} title={label} onClick={() => inline("backgroundColor",color)}><span style={{backgroundColor:color}}>{label === "None" ? "—" : ""}</span></button>)}</div></section>
          <section><h3>Paragraph alignment</h3><div className="writing-format-options">{["left","center","right","justify"].map(align => <button type="button" key={align} onClick={() => block("textAlign",align)}>{align !== "justify" && <NavigationIcon name={`align-${align}`} size={18} />}{align[0].toUpperCase()+align.slice(1)}</button>)}</div></section>
          <section><h3>Line spacing</h3><div className="writing-format-options">{[["Tight","1.3"],["Natural","1.8"],["Relaxed","2.4"]].map(([label,value]) => <button type="button" key={label} onClick={() => block("lineHeight",value)}>{label}</button>)}</div></section>
          <section><h3>Paragraph spacing</h3><div className="writing-format-options">{[["None","0px"],["Small","8px"],["Large","20px"]].map(([label,value]) => <button type="button" key={label} onClick={() => block("marginBottom",value)}>{label}</button>)}</div></section>
          <section><h3>Structure & emphasis</h3><div className="writing-format-options"><button type="button" aria-pressed={Boolean(formatState?.bold)} onClick={() => apply(() => exec("bold"))}>Bold</button><button type="button" aria-pressed={Boolean(formatState?.italic)} onClick={() => apply(() => exec("italic"))}>Italic</button><button type="button" onClick={() => setPanel("link")}>Add link</button><button type="button" onClick={() => setList("bullet", "disc")}>Bullet list</button><button type="button" onClick={() => setList("numbered", "decimal")}>Numbered list</button><button type="button" onClick={() => setList("checklist", "checklist")}>Checklist</button><button type="button" aria-pressed={Boolean(formatState?.underline)} onClick={() => apply(() => exec("underline"))}>Underline</button><button type="button" aria-pressed={Boolean(formatState?.strike)} onClick={() => apply(() => exec("strikeThrough"))}>Strikethrough</button><button type="button" onClick={inlineCode}>Inline code</button><button type="button" aria-pressed={formatState?.block === "PRE"} onClick={() => apply(() => exec("formatBlock", "PRE"))}>Code block</button><button type="button" onClick={() => apply(() => editorRef.current?.insertHTML('<hr class="editor-divider"/><div><br></div>'))}>Divider</button></div></section>
        </>}
        {panel === "link" && <form className="writing-link-form" onSubmit={event => {
          event.preventDefault();
          const destination = safeLinkDestination(link);
          if (!destination) { showFeedback("Use an https, http, or email link."); return; }
          apply(() => exec("createLink", destination));
        }}><label htmlFor={`${heading}-url`}>Link destination</label><input id={`${heading}-url`} type="text" inputMode="url" required value={link} onChange={event => setLink(event.target.value)} placeholder="https://example.com" /><p>Select text in your document first. The link will be applied to that selection. Web addresses without a protocol open securely with https.</p><button type="submit" className="btn-primary">Apply link</button></form>}
      </div>
    </dialog>
  </>;
}
