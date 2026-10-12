import { Link } from "react-router-dom";
import NavigationIcon from "./layout/NavigationIcon.jsx";
import "./protectedNoteTrash.css";

// Collection access discovers opaque references only. The existing editor
// still requires a separate, note-specific proof before content or recovery.
export default function ProtectedNoteTrash({ notes }) {
  return <section className="protected-note-trash" aria-labelledby="protected-trash-title">
    <div className="protected-trash-explanation"><NavigationIcon name="shield" size={23} /><div><h2 id="protected-trash-title">Recovery, with protection intact.</h2><p>Inspect one document at a time to restore it or confirm permanent deletion. Every document keeps its independent access boundary. No automatic deletion period is configured.</p></div></div>
    {notes.length === 0 ? <div className="protected-trash-empty"><NavigationIcon name="trash" size={27} /><h3>Your protected Trash is empty.</h3><p>Locked notes moved to Trash will appear here without revealing their titles or contents.</p></div> : <div className="protected-note-references">{notes.map((note, index) => <Link key={note.id} to={note.kind === "JOURNAL" ? `/journal/entries/${note.id}` : `/notes/${note.id}`} className="protected-note-reference" aria-label={`Inspect and recover locked ${note.kind === "JOURNAL" ? "journal entry" : "note"} ${index + 1}`}>
      <span className="protected-reference-symbol"><NavigationIcon name="lock" size={21} /></span><div><span className="eyebrow">{note.kind === "JOURNAL" ? "Protected journal entry" : "Protected note"} · Trash</span><h3>Locked {note.kind === "JOURNAL" ? "journal entry" : "note"}</h3><p>Authenticate to inspect and recover this document.</p></div><span className="protected-reference-action">Inspect &amp; recover<NavigationIcon name="chevron" size={16} /></span>
    </Link>)}</div>}
  </section>;
}
