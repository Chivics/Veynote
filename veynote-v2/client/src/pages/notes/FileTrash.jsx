import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import "./fileTrash.css";

function deletedDate(value) {
  if (!value) return "Recently deleted";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently deleted" : new Intl.DateTimeFormat(undefined, { day:"numeric", month:"short", year:"numeric", hour:"numeric", minute:"2-digit" }).format(date);
}

export default function FileTrash() {
  const result = useApiQuery("/files/trash");
  const items = result.data?.items || [];
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function act(item, permanent = false) {
    if (busy) return;
    setBusy(item.id); setError(""); setFeedback("");
    try {
      const path = item.source === "attachment" ? `/files/trash/attachments/${item.id}` : `/files/trash/${item.id}`;
      if (permanent) await api.delete(`${path}/permanent`);
      else await api.patch(`${path}/restore`);
      setPending(null);
      setFeedback(permanent ? `“${item.name}” was permanently deleted.` : `“${item.name}” was restored to ${item.originalPath || "Files"}.${item.source === "attachment" ? " Reinsert it in the document if you want it inline again." : ""}`);
      try { await result.refresh(); }
      catch (failure) { setError(`The change was saved, but Files Trash could not refresh. ${failure.message}`); }
    } catch (failure) {
      setError(failure.message || (permanent ? "The item could not be permanently deleted." : "The item could not be restored."));
    } finally { setBusy(null); }
  }

  return <div className="file-trash-workspace notes-surface">
    <header className="product-page-header"><div><span className="eyebrow">NOTES / FILES / RECOVERY</span><h1 className="page-title">Files Trash</h1><p>Recover files, folder structures, and attachments removed from writing.</p></div><div className="product-page-actions"><Link to="/notes/files" className="btn-primary"><NavigationIcon name="files" size={17} /> Browse Files</Link></div></header>
    <div className="file-trash-intro"><span className="file-trash-mark"><NavigationIcon name="shield" size={27} /></span><div><strong>Recovery stays in your control.</strong><p>There is no automatic deletion period. Restore a folder to recover its hierarchy, or a document attachment to return it to that record. Permanent deletion cannot be undone.</p></div><span className="file-trash-total">{result.data ? `${items.length} ${items.length === 1 ? "item" : "items"}` : "Recovery"}</span></div>
    {result.error && <div className="inline-error" role="alert"><span>{result.data ? "Cached items remain visible. " : "Files Trash could not be opened. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div>}
    {feedback && <div className="file-trash-feedback" role="status"><NavigationIcon name="check" size={17} /><span>{feedback}</span><button type="button" onClick={() => setFeedback("")} aria-label="Dismiss confirmation"><NavigationIcon name="close" size={15} /></button></div>}
    <section className="file-trash-list" aria-label="Deleted files and folders">
      <header><span className="eyebrow">RECOVERABLE CONTENT</span><h2>Decide what stays.</h2></header>
      {result.data && !items.length && <div className="file-trash-empty"><span><NavigationIcon name="files" size={34} /></span><h3>No files waiting for recovery.</h3><p>Removed files, folders, and document attachments will appear here. Your active Files workspace is ready for new work.</p><Link to="/notes/files">Return to Files <NavigationIcon name="chevron" size={15} /></Link></div>}
      {items.map(item => <article className="file-trash-item" key={item.id} aria-busy={busy === item.id || undefined}>
        <span className="file-trash-item-icon"><NavigationIcon name={item.isDirectory ? "folder" : item.source === "attachment" ? "note" : "files"} size={25} /></span>
        <div className="file-trash-item-copy"><span className="eyebrow">{item.isDirectory ? "FOLDER & CONTENTS" : item.source === "attachment" ? "DOCUMENT ATTACHMENT" : item.mimeType || "FILE"}</span><h3>{item.name}</h3><p>From {item.originalPath || "Files"} <span aria-hidden="true">·</span> Deleted {deletedDate(item.deletedAt)}</p>{item.parentTrashed && <p className="file-trash-parent-context">Restore the document first in <Link to="/notes/trash">Notes Trash</Link>.</p>}</div>
        <div className="file-trash-item-actions"><button type="button" disabled={Boolean(busy) || item.parentTrashed} onClick={() => act(item)}><NavigationIcon name="restore" size={16} /> Restore</button><button type="button" disabled={Boolean(busy)} className="is-danger" onClick={() => { setError(""); setPending(item); }}><NavigationIcon name="trash" size={16} /> Delete permanently</button></div>
      </article>)}
    </section>
    <ConfirmDialog open={Boolean(pending)} title={`Delete “${pending?.name || "item"}” permanently?`} description={pending?.isDirectory ? "The folder, every subfolder, and every file inside it will be removed from Veynote. This cannot be undone." : "This file will be removed from Veynote and cannot be restored."} error={error} confirmLabel="Delete permanently" busy={busy === pending?.id} onClose={() => { setPending(null); setError(""); }} onConfirm={() => pending && act(pending, true)} />
  </div>;
}
