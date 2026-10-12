import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import DocumentContent from "./DocumentContent";
import NavigationIcon from "./layout/NavigationIcon";
import { noteWordCount, recordDate, recordPath } from "../utils/noteCollection";

// Collections only carry metadata. Fetch the full body when the reader asks
// for a preview, keeping large manuscripts out of ordinary navigation.
export default function NoteQuickPreview({ note, busy, error, feedback, onAction, onClose }) {
  const dialog = useRef(null);
  const heading = useId();
  const accessible = Boolean(note && !note.isLocked && !note.isWill && !note.isTrashed);
  const longDocument = note?.content === undefined && noteWordCount(note) > 15000;
  const [document, setDocument] = useState(null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    const node = dialog.current;
    if (accessible && !node.open) node.showModal();
    if (!accessible && node.open) node.close();
  }, [accessible]);
  useEffect(() => {
    if (!accessible) { setDocument(null); setLoadError(""); return; }
    if (note.content !== undefined) { setDocument(note); setLoadError(""); return; }
    if (longDocument) { setDocument({ content: "" }); setLoadError(""); return; }
    let active = true;
    setDocument(api.peek(`/notes/${note.id}`)?.note || null);
    setLoadError("");
    api.get(`/notes/${note.id}`).then(response => { if (active) setDocument(response.note); })
      .catch(failure => { if (active) setLoadError(`The document preview could not open. ${failure.message}`); });
    return () => { active = false; };
  }, [note?.id, accessible, longDocument]);
  const words = noteWordCount(note);
  function backdrop(event) {
    if (event.target !== event.currentTarget) return;
    const rect = dialog.current.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }
  return <dialog ref={dialog} className="note-quick-preview" aria-labelledby={heading} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose} onClick={backdrop}>
    {accessible && <>
      <header className="note-preview-toolbar"><span><NavigationIcon name="note" size={17} /> Quick preview</span><button type="button" autoFocus aria-label="Close note preview" onClick={onClose}><NavigationIcon name="close" size={21} /></button></header>
      <div className="note-preview-scroll" tabIndex={0} aria-label="Document preview">
        <div className="note-preview-heading"><span className="eyebrow">{note.kind === "JOURNAL" ? "Journal entry" : "Your writing"} · {note.folder?.name || "Unfiled"}</span><h2 id={heading}>{note.title || "Untitled note"}</h2><div className="note-preview-meta"><span>{words.toLocaleString()} words</span>{words > 0 && <span>{Math.max(1, Math.ceil(words / 220))} min read</span>}<span><NavigationIcon name={note.shareEnabled ? "account" : "lock"} size={13} />{note.shareEnabled ? "Shared link enabled" : "Private"}</span></div></div>
        {note.tags?.length > 0 && <div className="note-preview-tags">{note.tags.map(tag => <Link key={tag} to={`/notes/tags/${encodeURIComponent(tag)}`} onClick={onClose}>#{tag}</Link>)}</div>}
        {document?.content ? <DocumentContent className="note-preview-document" html={document.content} /> : longDocument ? <div className="note-preview-empty"><p>{note.contentPreview || "A long document ready to continue."}</p><p>Open the editor to read and navigate the full manuscript.</p></div> : loadError ? <p className="note-preview-empty" role="alert">{loadError}</p> : !document ? <p className="note-preview-empty" role="status">Opening document preview…</p> : <p className="note-preview-empty">This document is ready for its first words.</p>}
        <dl className="note-preview-dates"><div><dt>Created</dt><dd>{recordDate(note.createdAt, { year:"numeric" })}</dd></div><div><dt>Last updated</dt><dd>{recordDate(note.updatedAt || note.createdAt, { year:"numeric" })}</dd></div></dl>
      </div>
      {error && <p className="note-preview-feedback is-error" role="alert">{error}</p>}
      {feedback && <p className="note-preview-feedback" role="status">{feedback}</p>}
      <footer className="note-preview-footer"><div><button type="button" aria-pressed={Boolean(note.isPinned)} aria-label={note.isPinned ? "Unpin note" : "Pin note"} disabled={busy} onClick={() => onAction(note,"pin")}><NavigationIcon name="pin" size={19} /><span>{note.isPinned ? "Pinned" : "Pin"}</span></button><button type="button" aria-pressed={Boolean(note.isFavorite)} aria-label={note.isFavorite ? "Remove note from favorites" : "Add note to favorites"} disabled={busy} onClick={() => onAction(note,"favorite")}><NavigationIcon name="heart" size={19} /><span>Favorite</span></button></div><Link to={recordPath(note)} className="btn-primary" onClick={onClose}>Open editor <NavigationIcon name="chevron" size={16} /></Link></footer>
    </>}
  </dialog>;
}
