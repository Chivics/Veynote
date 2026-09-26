import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { useApiQuery } from "../../hooks/useApiQuery";

const SCOPE_COPY = {
  all: { title: "All notes", eyebrow: "YOUR RECORDS", description: "Every thought, document, and entry in one calm, searchable workspace.", empty: "No notes yet", emptyDesc: "Your written records will appear here." },
  favorites: { title: "Favorites", eyebrow: "WITHIN REACH", description: "The notes and records you marked as important.", empty: "No favorites yet", emptyDesc: "Mark a note as a favorite to keep it within easy reach." },
  archive: { title: "Archive", eyebrow: "PRESERVED", description: "Content removed from active work while keeping its history intact.", empty: "Nothing archived", emptyDesc: "Archived notes remain safe here until you restore or delete them." },
  trash: { title: "Trash", eyebrow: "RECENTLY DELETED", description: "Deleted records remain recoverable until you permanently remove them.", empty: "Trash is empty", emptyDesc: "Deleted records will appear here with their original context." },
  folder: { title: "Folder", eyebrow: "COLLECTION", description: "Everything organized inside this folder.", empty: "This folder is empty", emptyDesc: "Create a note here or move an existing record into this folder." },
  tag: { title: "Tag", eyebrow: "CONNECTED RECORDS", description: "Notes connected by a shared tag.", empty: "No tagged notes", emptyDesc: "Records carrying this tag will appear here." },
  search: { title: "Search", eyebrow: "FIND ANYTHING", description: "Search titles, writing, and tags across your accessible notes.", empty: "No matching records", emptyDesc: "Try another phrase or a broader keyword." },
};

function stripHtml(value) { return value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || ""; }
function noteDate(note) { return new Date(note.updatedAt || note.entryDate); }

function RecordCard({ note, scope, view, onFavorite, onRestore, onUnarchive, onDelete }) {
  const body = stripHtml(note.content);
  const trashed = scope === "trash";
  const stamp = trashed ? note.trashedAt || note.updatedAt : note.updatedAt || note.entryDate;
  const preview = <>
    <div className="note-record-top"><span className="type-pill">{note.kind === "JOURNAL" ? "Journal" : note.isPinned && !trashed ? "Pinned note" : "Note"}</span><time dateTime={stamp}>{trashed ? "Deleted " : ""}{new Date(stamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time></div>
    <h2>{note.title || "Untitled note"}</h2><p>{body.slice(0, 190) || "No writing has been added yet."}</p>
  </>;
  return <article className={`note-record ${view === "list" ? "is-list" : ""} ${trashed || scope === "archive" ? "is-recovery" : ""}`}>
    {trashed ? <div className="note-record-content">{preview}</div> : <Link to={note.kind === "JOURNAL" ? `/journal/entries/${note.id}` : `/notes/${note.id}`}>{preview}</Link>}
    <footer>
      <div>{trashed ? <span><NavigationIcon name="folder" size={13} />From {note.folder?.name || (note.kind === "JOURNAL" ? "Journal" : "Notes")}</span> : note.folder && <span><NavigationIcon name="folder" size={13} />{note.folder.name}</span>}{note.tags?.slice(0, 3).map(tag => <i key={tag}>#{tag}</i>)}</div>
      {scope === "trash" ? <div className="note-record-actions"><button type="button" onClick={() => onRestore(note)}>Restore</button><button type="button" className="is-danger" onClick={() => onDelete(note)}>Delete permanently</button></div> : scope === "archive" ? <div className="note-record-actions"><button type="button" onClick={() => onUnarchive(note)}>Restore from archive</button></div> : <button type="button" className={`favorite-control ${note.isFavorite ? "is-active" : ""}`} onClick={() => onFavorite(note)} aria-label={note.isFavorite ? "Remove from favorites" : "Add to favorites"}><NavigationIcon name="heart" size={17} /></button>}
    </footer>
  </article>;
}

export default function NoteListPage({ scope }) {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [folder, setFolder] = useState(null);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [searchQuery, setSearchQuery] = useState(q);
  const [filterText, setFilterText] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState("grid");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");
  const copy = SCOPE_COPY[scope];
  const folderId = params.folderId;
  const tag = params.tag;

  useEffect(() => { if (scope === "search") setQ(searchParams.get("q") || ""); }, [scope, searchParams]);
  useEffect(() => { const timer = setTimeout(() => setSearchQuery(q), 200); return () => clearTimeout(timer); }, [q]);
  const query = { scope: ["favorites", "archive", "trash"].includes(scope) ? scope : "all" };
  if (["favorites", "archive", "trash", "tag", "search"].includes(scope)) query.kind = "ALL";
  if (scope === "folder") query.folderId = folderId;
  if (scope === "tag") query.tag = tag;
  if (scope === "search") query.q = searchQuery;
  const result = useApiQuery("/notes", query);
  const notes = result.data?.notes ?? null;

  useEffect(() => {
    let active = true;
    if (scope === "folder") {
      setFolder(api.peek("/folders")?.folders.find(item => item.id === folderId) || null);
      api.get("/folders").then(data => { if (active) setFolder(data.folders.find(item => item.id === folderId)); }).catch(() => {});
    }
    return () => { active = false; };
  }, [scope, folderId]);

  const visibleNotes = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    const filtered = (notes || []).filter(note => !needle || `${note.title || ""} ${stripHtml(note.content)} ${(note.tags || []).join(" ")}`.toLowerCase().includes(needle));
    return [...filtered].sort((a, b) => {
      if (sort === "title") return (a.title || "").localeCompare(b.title || "");
      if (sort === "created") return new Date(b.entryDate) - new Date(a.entryDate);
      return noteDate(b) - noteDate(a);
    });
  }, [notes, filterText, sort]);

  async function runAction(action, success) {
    setActionError(""); setActionFeedback("");
    try { await action(); setActionFeedback(success); result.refresh().catch(error => setActionError(`The change was saved, but this collection could not refresh: ${error.message}`)); }
    catch (error) { setActionError(error.message || "The record could not be updated. Please try again."); }
  }
  function toggleFavorite(note) { return runAction(() => api.patch(`/notes/${note.id}`, { isFavorite: !note.isFavorite }), note.isFavorite ? "Removed from favorites." : "Added to favorites."); }
  function restoreNote(note) { return runAction(() => api.post(`/notes/${note.id}/restore`), "Record restored from Trash."); }
  function unarchiveNote(note) { return runAction(() => api.patch(`/notes/${note.id}`, { isArchived: false }), "Record restored from Archive."); }
  async function deleteForever() {
    if (!pendingDelete) return;
    setDeleting(true);
    try { await api.delete(`/notes/${pendingDelete.id}`); setPendingDelete(null); setActionError(""); setActionFeedback("Record permanently deleted."); result.refresh().catch(error => setActionError(`The record was deleted, but this collection could not refresh: ${error.message}`)); }
    catch (error) { setActionError(error.message || "The note could not be deleted."); }
    finally { setDeleting(false); }
  }

  const title = scope === "folder" ? folder?.name || "Folder" : scope === "tag" ? `#${tag}` : copy.title;
  const searchValue = scope === "search" ? q : filterText;
  const setSearchValue = value => {
    if (scope === "search") { setQ(value); setSearchParams(value ? { q: value } : {}, { replace: true }); }
    else setFilterText(value);
  };
  const hasFilter = Boolean(searchValue.trim());

  return <div className="note-collection">
    <header className="product-page-header">
      <div><span className="eyebrow">{copy.eyebrow}</span><h1 className="page-title">{title}</h1><p>{copy.description}</p></div>
      <Link to={scope === "archive" || scope === "trash" ? "/notes/all" : "/notes/new"} className="btn-primary"><NavigationIcon name={scope === "archive" || scope === "trash" ? "note" : "plus"} size={16} /> {scope === "archive" || scope === "trash" ? "All notes" : "New note"}</Link>
    </header>

    {scope === "trash" && <div className="retention-notice"><NavigationIcon name="clock" size={18} /><div><strong>Recoverable until you delete permanently</strong><span>Restore anything you still need. Permanent deletion cannot be undone.</span></div></div>}
    {result.error && <div className="inline-error" role="alert"><span>{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {actionError && <div className="inline-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError("")}>Dismiss</button></div>}
    {actionFeedback && <div className="collection-feedback" role="status"><span>{actionFeedback}</span><button type="button" onClick={() => setActionFeedback("")} aria-label="Dismiss confirmation">×</button></div>}

    <div className="collection-toolbar">
      <label><NavigationIcon name="search" size={17} /><input value={searchValue} onChange={event => setSearchValue(event.target.value)} placeholder={scope === "search" ? "Search title, writing, or tags…" : "Filter this collection…"} autoFocus={scope === "search"} /></label>
      <select aria-label="Sort notes" value={sort} onChange={event => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="title">Title A–Z</option></select>
      <div className="view-switcher" aria-label="View"><button type="button" className={view === "grid" ? "is-active" : ""} onClick={() => setView("grid")} aria-label="Grid view">▦</button><button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")} aria-label="List view">☷</button></div>
    </div>

    <div className="collection-summary"><span>{notes ? `${visibleNotes.length} ${visibleNotes.length === 1 ? "record" : "records"}` : "Preparing records"}</span>{filterText && notes && <small>{notes.length - visibleNotes.length} hidden by filter</small>}</div>

    {notes !== null && (visibleNotes.length === 0 ? <EmptyState icon={scope === "trash" ? "⌫" : "✦"} title={hasFilter ? "No matching records" : copy.empty} description={hasFilter ? "Clear the filter or try a different phrase." : copy.emptyDesc} action={hasFilter ? <button className="btn-outline" onClick={() => setSearchValue("")}>Clear search</button> : undefined} /> : <div className={`note-records ${view === "list" ? "is-list" : ""}`}>{visibleNotes.map(note => <RecordCard key={note.id} note={note} scope={scope} view={view} onFavorite={toggleFavorite} onRestore={restoreNote} onUnarchive={unarchiveNote} onDelete={setPendingDelete} />)}</div>)}

    <ConfirmDialog open={Boolean(pendingDelete)} title="Delete this note permanently?" description={`“${pendingDelete?.title || "Untitled note"}” will be removed immediately and cannot be restored.`} confirmLabel="Delete permanently" busy={deleting} onClose={() => !deleting && setPendingDelete(null)} onConfirm={deleteForever} />
  </div>;
}
