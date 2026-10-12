import { useEffect, useId, useRef, useState } from "react";
import NavigationIcon from "./layout/NavigationIcon";
import "./noteActions.css";

// One discoverable management surface; destructive actions are confirmed by
// the owning collection. The menu never performs a mutation itself.
export default function NoteActionsMenu({ note, busy, onAction, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null), trigger = useRef(null), heading = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  function close() { ref.current?.close(); setOpen(false); trigger.current?.focus(); }
  function choose(action) { close(); action(); }
  function outside(event) {
    if (event.target !== ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }
  return <>
    <button ref={trigger} type="button" className="note-manage-trigger" disabled={busy} aria-haspopup="dialog" aria-expanded={open} aria-label={`Manage ${note.title || "untitled note"}`} onClick={() => setOpen(true)}><NavigationIcon name="more" size={20} /></button>
    <dialog ref={ref} className="note-actions-dialog" aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }} onClick={outside}>
      <header><div><span className="eyebrow">DOCUMENT ACTIONS</span><h2 id={heading}>{note.title || "Untitled note"}</h2></div><button type="button" autoFocus aria-label="Close document actions" onClick={close}><NavigationIcon name="close" size={20} /></button></header>
      <div className="note-actions-list">
        <button type="button" onClick={() => choose(() => onAction(note, "pin"))}><NavigationIcon name="pin" size={19} /><span>{note.isPinned ? "Unpin document" : "Pin document"}</span></button>
        <button type="button" onClick={() => choose(() => onAction(note, "favorite"))}><NavigationIcon name="heart" size={19} /><span>{note.isFavorite ? "Remove from favorites" : "Add to favorites"}</span></button>
        <button type="button" onClick={() => choose(() => onAction(note, note.isArchived ? "unarchive" : "archive"))}><NavigationIcon name="archive" size={19} /><span>{note.isArchived ? "Restore to active writing" : "Move to Archive"}<small>{note.isArchived ? "Continue working on this document" : "Set aside without deleting your writing"}</small></span></button>
        <button type="button" className="is-danger" onClick={() => choose(() => onDelete(note))}><NavigationIcon name="trash" size={19} /><span>Move to Trash<small>Recoverable until you delete it permanently</small></span></button>
      </div>
      <footer><NavigationIcon name="lock" size={14} /><span>{note.shareEnabled ? "Moving to Trash revokes the public link." : "Your document is private."}</span></footer>
    </dialog>
  </>;
}
