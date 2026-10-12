import { useEffect, useId, useRef, useState } from "react";
import { exportNote } from "../utils/noteExport";
import NavigationIcon from "./layout/NavigationIcon";
import "./exportMenu.css";

const FORMATS = [
  { id: "md", label: "Markdown", suffix: ".md", detail: "Structured writing for other editors", icon: "note" },
  { id: "html", label: "HTML document", suffix: ".html", detail: "Readable document with headings and tables", icon: "files" },
  { id: "txt", label: "Plain text", suffix: ".txt", detail: "Words without visual formatting", icon: "list" },
  { id: "json", label: "Veynote data", suffix: ".json", detail: "Writing and document metadata", icon: "grid" },
];

export default function ExportMenu({ note, compact = false, triggerRef }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef(null), trigger = useRef(null), heading = useId();

  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    if (!open && dialog.current.open) dialog.current.close();
  }, [open]);

  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus(); }
  function download(format) {
    try { exportNote(note, format); close(); }
    catch (failure) { setError(failure.message || "We could not prepare this export. Your document is unchanged."); }
  }
  function printDocument() { close(); requestAnimationFrame(() => window.print()); }

  return <>
    <button ref={element => { trigger.current = element; if (triggerRef) triggerRef.current = element; }} type="button" className={`document-export-trigger${compact ? " is-compact" : ""}`} title="Export document" aria-label="Export document" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setError(""); setOpen(true); }}>
      <NavigationIcon name="download" size={18} />{!compact && <span>Export</span>}
    </button>
    <dialog ref={dialog} className="document-export-dialog" aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = dialog.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
      <header><div><span className="eyebrow">TAKE YOUR WORK WITH YOU</span><h2 id={heading}>Export document</h2><p>{note.title || "Untitled note"}</p></div><button autoFocus type="button" aria-label="Close export options" onClick={close}><NavigationIcon name="close" size={20} /></button></header>
      <div className="document-export-body">
        <span className="eyebrow">DOWNLOAD A COPY</span>
        <div className="document-export-formats">{FORMATS.map(format => <button type="button" key={format.id} onClick={() => download(format.id)}><span className="document-export-icon"><NavigationIcon name={format.icon} size={19} /></span><span className="document-export-copy"><strong>{format.label}</strong><small>{format.detail}</small></span><span className="document-export-suffix">{format.suffix}</span></button>)}</div>
        <button type="button" className="document-export-print" onClick={printDocument}><NavigationIcon name="files" size={19} /><span><strong>Print or save as PDF</strong><small>Use your browser’s print destination</small></span><NavigationIcon name="chevron" size={16} /></button>
        {error && <p className="document-export-error" role="alert">{error}</p>}
      </div>
      <footer><NavigationIcon name="shield" size={15} /><span>Attachments remain access controlled. Download them separately when you need an offline copy.</span></footer>
    </dialog>
  </>;
}
