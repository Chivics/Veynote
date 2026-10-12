import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import NavigationIcon from "./layout/NavigationIcon.jsx";
import "./noteComments.css";

const timeLabel = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently" : new Intl.DateTimeFormat(undefined, { dateStyle:"medium", timeStyle:"short" }).format(date);
};

export default function NoteComments({ open, noteId, quote = "", onClose }) {
  const dialogRef = useRef(null);
  const requestSequence = useRef(0);
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [quotedText, setQuotedText] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    if (!noteId) return;
    const sequence = ++requestSequence.current;
    setLoading(true); setError("");
    try {
      const next = await api.get(`/notes/${noteId}/comments`, { status, page }, { force:true });
      if (sequence === requestSequence.current) {
        if (page > next.pages) setPage(next.pages);
        else setData(next);
      }
    }
    catch (failure) { if (sequence === requestSequence.current) setError(`Discussion could not be opened. ${failure.message}`); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [noteId, page, status]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) { requestSequence.current++; dialog.close(); }
  }, [open]);
  useEffect(() => { if (open) { setQuotedText(quote); setDraft(""); } }, [open, quote]);
  useEffect(() => { if (open && noteId) load(); }, [open, noteId, load]);
  useEffect(() => { setPage(1); setData(null); }, [noteId]);

  async function create(event) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy("create"); setError("");
    try {
      await api.post(`/notes/${noteId}/comments`, { body:draft.trim(), quote:quotedText });
      setDraft(""); setQuotedText("");
      if (status === "open" && page === 1) await load();
      else { setStatus("open"); setPage(1); setData(null); }
    } catch (failure) { setError(`Your comment was not saved. ${failure.message}`); }
    finally { setBusy(""); }
  }

  async function update(comment, patch) {
    if (busy) return;
    setBusy(comment.id); setError("");
    try {
      await api.patch(`/notes/${noteId}/comments/${comment.id}`, patch);
      setEditing(null);
      await load();
    } catch (failure) { setError(`The comment was not updated. ${failure.message}`); }
    finally { setBusy(""); }
  }

  async function remove(comment) {
    if (busy) return;
    setBusy(comment.id); setError("");
    try {
      await api.delete(`/notes/${noteId}/comments/${comment.id}`);
      setDeleting(null);
      await load();
    } catch (failure) { setError(`The comment was not removed. ${failure.message}`); }
    finally { setBusy(""); }
  }

  return <dialog ref={dialogRef} className="note-comments-panel" aria-label="Document discussion" onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <div className="note-comments-frame">
      <header className="note-comments-header"><div><span className="eyebrow">DOCUMENT / DISCUSSION</span><h2>Thoughts in context.</h2><p>Keep questions, review notes, and decisions beside the writing.</p></div><button type="button" onClick={onClose} aria-label="Close discussion"><NavigationIcon name="close" size={19} /></button></header>
      <div className="note-comments-tabs" role="group" aria-label="Discussion status">
        {["open", "resolved", "all"].map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => { if (value !== status) { setData(null); setStatus(value); setPage(1); } }} className={status === value ? "is-active" : ""}>{value === "open" ? "Open" : value === "resolved" ? "Resolved" : "All"}</button>)}
        <span>{data ? `${data.openCount} open` : "Discussion"}</span>
      </div>
      <div className="note-comments-scroll">
        <form className="note-comment-composer" onSubmit={create}>
          <label htmlFor="note-comment-draft">Add to the discussion</label>
          {quotedText && <div className="note-comment-quote-draft"><span>SELECTED WRITING</span><p>{quotedText}</p><button type="button" onClick={() => setQuotedText("")} aria-label="Remove quoted writing"><NavigationIcon name="close" size={15} /></button></div>}
          <textarea id="note-comment-draft" value={draft} maxLength={4000} rows={3} onChange={event => setDraft(event.target.value)} placeholder="Capture a question, decision, or review note…" />
          <div><span>{draft.length}/4,000</span><button type="submit" disabled={!draft.trim() || Boolean(busy)}><NavigationIcon name="plus" size={16} /> {busy === "create" ? "Saving…" : "Add comment"}</button></div>
        </form>
        {error && <div className="note-comments-error" role="alert"><span>{error}</span><button type="button" onClick={() => { setError(""); load(); }}>Retry</button></div>}
        <div className="note-comments-list-heading"><span className="eyebrow">{status === "open" ? "ACTIVE THREADS" : status === "resolved" ? "REVIEWED THREADS" : "ALL THREADS"}</span><span>{data ? `${data.total} ${data.total === 1 ? "comment" : "comments"}` : "Your discussion"}</span></div>
        {loading && !data && <p className="note-comments-wait">Opening the discussion…</p>}
        {data && data.comments.length === 0 && <div className="note-comments-empty"><span><NavigationIcon name="comment" size={27} /></span><h3>{status === "resolved" ? "Nothing resolved yet." : "A clear space to think together."}</h3><p>{status === "resolved" ? "Resolve a comment when its question or review is complete." : "Comments stay separate from the document, so your writing remains focused."}</p></div>}
        {data?.comments.map(comment => <article key={comment.id} className={`note-comment-card${comment.resolvedAt ? " is-resolved" : ""}`} aria-busy={busy === comment.id || undefined}>
          <div className="note-comment-card-head"><span className="note-comment-avatar" aria-hidden="true">{comment.authorName?.trim().slice(0,1).toUpperCase() || "V"}</span><div><strong>{comment.authorName}</strong><span>{timeLabel(comment.createdAt)}</span></div>{comment.resolvedAt && <span className="note-comment-resolved"><NavigationIcon name="check" size={14} /> Resolved</span>}</div>
          {comment.quote && <blockquote>{comment.quote}</blockquote>}
          {editing === comment.id ? <div className="note-comment-edit"><textarea aria-label="Edit comment" rows={3} maxLength={4000} value={editDraft} onChange={event => setEditDraft(event.target.value)} /><div><button type="button" onClick={() => setEditing(null)}>Cancel</button><button type="button" disabled={!editDraft.trim() || Boolean(busy)} onClick={() => update(comment, { body:editDraft.trim() })}>Save edit</button></div></div> : <p>{comment.body}</p>}
          {deleting === comment.id ? <div className="note-comment-delete"><span>Delete this comment permanently?</span><button type="button" onClick={() => setDeleting(null)}>Cancel</button><button type="button" disabled={Boolean(busy)} onClick={() => remove(comment)}>Delete</button></div> : <div className="note-comment-card-actions"><button type="button" disabled={Boolean(busy)} onClick={() => update(comment, { resolved:!comment.resolvedAt })}>{comment.resolvedAt ? "Reopen" : "Resolve"}</button><button type="button" disabled={Boolean(busy)} onClick={() => { setEditing(comment.id); setEditDraft(comment.body); }}>Edit</button><button type="button" disabled={Boolean(busy)} onClick={() => setDeleting(comment.id)}>Delete</button></div>}
        </article>)}
        {data && data.pages > 1 && <nav className="note-comments-pages" aria-label="Discussion pages"><span>Page {page} of {data.pages}</span><div><button type="button" disabled={page === 1 || Boolean(busy)} onClick={() => { setData(null); setPage(page - 1); }}>Previous</button><button type="button" disabled={page >= data.pages || Boolean(busy)} onClick={() => { setData(null); setPage(page + 1); }}>Next</button></div></nav>}
      </div>
    </div>
  </dialog>;
}
