import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import TemplateMenu from "../../components/TemplateMenu.jsx";
import { useApiQuery } from "../../hooks/useApiQuery";
import { collectWriting, collectionPage, collectionParams, collectionState, recordDate, recordPath, writingText } from "../../utils/noteCollection.js";
import "./notes.css";

const SCOPE_COPY = {
  all: { title: "All notes", eyebrow: "YOUR WRITING", description: "A considered collection of your ideas, documents, and working notes.", empty: "Your writing belongs here", emptyDesc: "Capture a thought or begin a document. Organize it as your ideas develop." },
  favorites: { title: "Favorites", eyebrow: "WITHIN REACH", description: "Important notes and journal entries, ready to return to.", empty: "Keep important writing close", emptyDesc: "Mark a note or journal entry as a favorite to find it here." },
  archive: { title: "Archive", eyebrow: "PRESERVED", description: "Writing set aside from active work, with its original context intact.", empty: "Nothing archived", emptyDesc: "Archived notes and journal entries stay here until you restore or delete them." },
  trash: { title: "Trash", eyebrow: "RECOVERABLE RECORDS", description: "Review deleted writing before deciding what to restore or remove permanently.", empty: "Trash is empty", emptyDesc: "Deleted notes and journal entries remain here until you permanently remove them." },
  folder: { title: "Folder", eyebrow: "COLLECTION", description: "Writing organized inside this folder.", empty: "This folder is empty", emptyDesc: "Create a note here or move existing writing into this folder." },
  tag: { title: "Tag", eyebrow: "CONNECTED WRITING", description: "Follow a shared theme across your notes and journal entries.", empty: "No tagged writing", emptyDesc: "Records carrying this tag will appear here." },
  search: { title: "Search your writing", eyebrow: "FIND YOUR CONTEXT", description: "Search accessible notes and journal entries by title, content, tags, or attachment name.", empty: "Find the thought you need", emptyDesc: "Search a phrase, a topic, a name, or a document." },
};

function RecordCard({ note, scope, onAction, onDelete, busy }) {
  const trashed = scope === "trash";
  const date = trashed ? note.trashedAt || note.updatedAt : note.updatedAt || note.createdAt;
  const body = <>
    <div className="notes-record-primary"><span className="notes-record-symbol"><NavigationIcon name={note.kind === "JOURNAL" ? "book" : "note"} size={20} /></span><div><div className="notes-record-kind">{note.kind === "JOURNAL" ? "Journal" : "Note"}{note.isPinned && !trashed && <span><NavigationIcon name="pin" size={12} /> Pinned</span>}{note.isArchived && scope === "favorites" && <span>Archived</span>}</div><h2>{note.title || "Untitled note"}</h2><p>{writingText(note.content).slice(0, 180) || "No writing added yet."}</p></div></div>
    <div className="notes-record-collection"><span><NavigationIcon name="folder" size={14} />{note.folder?.name || (note.kind === "JOURNAL" ? "Journal" : "Unfiled")}</span><div>{note.tags?.slice(0, 2).map(tag => <span className="notes-record-tag" key={tag}>#{tag}</span>)}</div></div>
    <div className="notes-record-status"><time dateTime={date}>{trashed ? "Deleted " : ""}{recordDate(date, { year: "numeric" })}</time><span className={note.shareEnabled ? "is-shared" : ""}><NavigationIcon name={note.shareEnabled ? "account" : "lock"} size={13} />{note.shareEnabled ? "Shared link" : "Private"}</span></div>
  </>;
  return <article className="notes-writing-record" aria-busy={busy || undefined}>
    {trashed ? <div className="notes-record-body">{body}</div> : <Link className="notes-record-body" to={recordPath(note)}>{body}</Link>}
    <div className="notes-writing-actions">
      {scope === "trash" ? <><button type="button" disabled={busy} onClick={() => onAction(note, "restore")}>Restore</button><button type="button" disabled={busy} className="is-danger" onClick={() => onDelete(note)} aria-label={`Delete ${note.title || "untitled note"} permanently`}><NavigationIcon name="trash" size={17} /></button></> : scope === "archive" ? <><button type="button" disabled={busy} onClick={() => onAction(note, "unarchive")}>Restore</button><button type="button" disabled={busy} onClick={() => onDelete(note)} aria-label={`Move ${note.title || "untitled note"} to Trash`}><NavigationIcon name="trash" size={17} /></button></> : <button type="button" disabled={busy} className={`notes-favorite ${note.isFavorite ? "is-active" : ""}`} aria-pressed={note.isFavorite} aria-label={`${note.isFavorite ? "Remove" : "Add"} ${note.title || "untitled note"} ${note.isFavorite ? "from" : "to"} favorites`} onClick={() => onAction(note, "favorite")}><NavigationIcon name="heart" size={19} /></button>}
    </div>
  </article>;
}

export default function NoteListPage({ scope }) {
  const { folderId, tag } = useParams();
  return <NoteCollection key={`${scope}:${folderId || ""}:${tag || ""}`} scope={scope} folderId={folderId} tag={tag} />;
}

function NoteCollection({ scope, folderId, tag }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = collectionState(searchParams, scope);
  const [searchQuery, setSearchQuery] = useState(filters.q);
  useEffect(() => { const timer = setTimeout(() => setSearchQuery(filters.q), 220); return () => clearTimeout(timer); }, [filters.q]);
  const [folder, setFolder] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(new Set());
  const [acknowledged, setAcknowledged] = useState({});
  const [actionError, setActionError] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");
  const pending = useRef(new Set()), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const copy = SCOPE_COPY[scope];
  const query = { scope: ["favorites", "archive", "trash"].includes(scope) ? scope : "all", ...(filters.kind !== "NOTE" && { kind: filters.kind }) };
  if (scope === "folder") query.folderId = folderId;
  if (scope === "tag") query.tag = tag;
  if (scope === "search") query.q = searchQuery;
  const result = useApiQuery("/notes", query);
  const notes = result.data?.notes;
  const patchFilters = patch => setSearchParams(previous => collectionParams(previous, patch), { replace: true });

  useEffect(() => {
    if (scope !== "folder") return;
    let active = true;
    setFolder(api.peek("/folders")?.folders.find(item => item.id === folderId) || null);
    api.get("/folders").then(data => { if (active) setFolder(data.folders.find(item => item.id === folderId)); }).catch(error => { if (active) setActionError(`The folder name could not be opened. ${error.message}`); });
    return () => { active = false; };
  }, [scope, folderId]);

  const records = useMemo(() => (notes || []).filter(note => acknowledged[note.id] !== "removed").map(note => acknowledged[note.id] ? { ...note, ...acknowledged[note.id] } : note), [notes, acknowledged]);
  const visibleNotes = useMemo(() => collectWriting(records, filters, scope === "search").filter(note => scope !== "favorites" || note.isFavorite), [records, filters.q, filters.sort, filters.kind, filters.folder, filters.tag, scope]);
  const page = collectionPage(visibleNotes, filters.page);
  const folderOptions = [...new Map((notes || []).filter(note => note.folder).map(note => [note.folderId, note.folder.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const tagOptions = [...new Set((notes || []).flatMap(note => note.tags || []))].sort((a, b) => a.localeCompare(b));
  const hasFilter = Boolean(filters.q.trim() || filters.folder || filters.tag);

  async function runAction(note, action) {
    if (pending.current.has(note.id)) return;
    pending.current.add(note.id); setBusy(new Set(pending.current)); setActionError(""); setActionFeedback("");
    try {
      if (action === "favorite") await api.patch(`/notes/${note.id}`, { isFavorite: !note.isFavorite });
      else if (action === "restore") await api.post(`/notes/${note.id}/restore`);
      else if (action === "unarchive") await api.patch(`/notes/${note.id}`, { isArchived: false });
      else await api.delete(`/notes/${note.id}`);
      if (!mounted.current) return;
      setAcknowledged(previous => ({ ...previous, [note.id]: action === "favorite" ? { isFavorite: !note.isFavorite } : "removed" }));
      setActionFeedback(action === "favorite" ? `${note.isFavorite ? "Removed from" : "Added to"} favorites.` : action === "restore" ? "Restored from Trash. Archived records return to Archive." : action === "unarchive" ? "Restored to active writing." : scope === "trash" ? "Record permanently deleted." : "Moved to Trash. You can restore it there.");
      setPendingDelete(null);
      try {
        await result.refresh();
        if (mounted.current) setAcknowledged(previous => { const next = { ...previous }; delete next[note.id]; return next; });
      }
      catch (error) { if (mounted.current) setActionError(`The change was saved, but this collection could not refresh. ${error.message}`); }
    } catch (error) {
      if (mounted.current) setActionError(`The record was not updated. ${error.message}`);
    } finally {
      pending.current.delete(note.id); if (mounted.current) setBusy(new Set(pending.current));
    }
  }

  const title = scope === "folder" ? folder?.name || "Folder" : scope === "tag" ? `#${tag}` : copy.title;
  return <div className="note-collection notes-surface">
    <header className="product-page-header"><div><span className="eyebrow">{copy.eyebrow}</span><h1 className="page-title">{title}</h1><p>{copy.description}</p></div><div className="product-page-actions">{!["archive", "trash"].includes(scope) && <TemplateMenu />}<Link className="btn-primary" to={["archive", "trash"].includes(scope) ? "/notes/all" : `/notes/new${scope === "folder" ? `?folder=${encodeURIComponent(folderId)}` : ""}`}><NavigationIcon name={["archive", "trash"].includes(scope) ? "note" : "plus"} size={17} />{["archive", "trash"].includes(scope) ? "All notes" : "New note"}</Link></div></header>
    <nav className="notes-collection-nav" aria-label="Writing collections"><div><Link aria-current={scope === "all" ? "page" : undefined} to="/notes/all">All notes</Link><Link aria-current={scope === "favorites" ? "page" : undefined} to="/notes/favorites">Favorites</Link><Link to="/notes/folders">Folders</Link><Link aria-current={scope === "tag" ? "page" : undefined} to="/notes/tags">Tags</Link></div><div><Link aria-current={scope === "archive" ? "page" : undefined} to="/notes/archive"><NavigationIcon name="archive" size={15} />Archive</Link><Link aria-current={scope === "trash" ? "page" : undefined} to="/notes/trash"><NavigationIcon name="trash" size={15} />Trash</Link></div></nav>
    {scope === "trash" && <div className="notes-retention"><NavigationIcon name="shield" size={20} /><div><strong>Your writing is recoverable.</strong><p>No automatic deletion period is configured. Permanent deletion removes the record and its files and cannot be undone.</p></div></div>}
    {scope === "archive" && <div className="notes-retention"><NavigationIcon name="archive" size={20} /><div><strong>Set aside, with context preserved.</strong><p>Restore writing to your active workspace, or move it to Trash before permanent deletion.</p></div></div>}
    {result.error && <div className="inline-error" role="alert"><span>{notes ? "Your cached writing is still visible. " : "Your writing could not be opened. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {actionError && <div className="inline-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Refresh collection</button></div>}
    {actionFeedback && <div className="notes-action-feedback" role="status"><NavigationIcon name="check" size={17} /><span>{actionFeedback}</span><button type="button" onClick={() => setActionFeedback("")} aria-label="Dismiss confirmation"><NavigationIcon name="close" size={16} /></button></div>}
    <div className="notes-collection-controls">
      <label className="notes-search-control"><NavigationIcon name="search" size={18} /><input aria-label={scope === "search" ? "Search your writing" : "Filter this collection"} placeholder={scope === "search" ? "Search writing, tags, or attachments…" : "Find a note in this collection…"} value={filters.q} onChange={event => patchFilters({ q: event.target.value })} />{filters.q && <button type="button" aria-label="Clear search" onClick={() => patchFilters({ q: "" })}><NavigationIcon name="close" size={16} /></button>}</label>
      <label className="notes-sort-control"><span className="sr-only">Sort writing</span><select value={filters.sort} onChange={event => patchFilters({ sort: event.target.value })}><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="title">Title A–Z</option></select></label>
      <div className="notes-view-switcher" role="group" aria-label="Collection view">{["list", "grid"].map(view => <button key={view} type="button" aria-label={`${view === "list" ? "List" : "Grid"} view`} aria-pressed={filters.view === view} onClick={() => patchFilters({ view })}><NavigationIcon name={view} size={19} /></button>)}</div>
    </div>
    <div className="notes-filter-row"><label><span>Type</span><select aria-label="Writing type" value={filters.kind} onChange={event => patchFilters({ kind: event.target.value })}><option value="NOTE">Notes</option><option value="JOURNAL">Journal</option><option value="ALL">All writing</option></select></label>{scope !== "folder" && <label><span>Collection</span><select aria-label="Filter by folder" value={filters.folder} onChange={event => patchFilters({ folder: event.target.value })}><option value="">Every folder</option><option value="unfiled">Unfiled</option>{filters.folder && filters.folder !== "unfiled" && !folderOptions.some(([id]) => id === filters.folder) && <option value={filters.folder}>Selected folder</option>}{folderOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}{scope !== "tag" && <label><span>Tag</span><select aria-label="Filter by tag" value={filters.tag} onChange={event => patchFilters({ tag: event.target.value })}><option value="">Any tag</option>{filters.tag && !tagOptions.includes(filters.tag) && <option value={filters.tag}>{filters.tag}</option>}{tagOptions.map(tag => <option key={tag} value={tag}>#{tag}</option>)}</select></label>}{hasFilter && <button type="button" onClick={() => patchFilters({ q: "", folder: "", tag: "" })}>Clear filters</button>}<span className="notes-result-count" role="status">{notes ? `${visibleNotes.length} ${visibleNotes.length === 1 ? "record" : "records"}` : "Your writing will appear here"}</span></div>
    <section className={`notes-records-panel is-${filters.view}`} aria-label={title}>
      {filters.view === "list" && <div className="notes-record-columns" aria-hidden="true"><span>Title & context</span><span>Collection</span><span>{scope === "trash" ? "Deleted · access" : "Updated · access"}</span><span /></div>}
      <div className="notes-record-layout">{page.records.map(note => <RecordCard key={note.id} note={note} scope={scope} busy={busy.has(note.id)} onAction={runAction} onDelete={setPendingDelete} />)}</div>
      {notes && !visibleNotes.length && <EmptyState icon={<NavigationIcon name={scope === "trash" ? "trash" : "note"} size={27} />} title={hasFilter ? "No matching writing" : copy.empty} description={hasFilter ? "Try a broader phrase, another type, or clear the filters." : copy.emptyDesc} action={hasFilter ? <button type="button" className="btn-outline" onClick={() => patchFilters({ q: "", folder: "", tag: "" })}>Clear filters</button> : !["trash", "archive"].includes(scope) && <Link className="btn-outline" to="/notes/new">Create a note</Link>} />}
    </section>
    {page.pages > 1 && <nav className="notes-pagination" aria-label="Collection pages"><span>Page {page.page} of {page.pages}</span><div><button type="button" disabled={page.page === 1} onClick={() => patchFilters({ page: page.page - 1 })}>Previous</button><button type="button" disabled={page.page === page.pages} onClick={() => patchFilters({ page: page.page + 1 })}>Next</button></div></nav>}
    <ConfirmDialog open={Boolean(pendingDelete)} title={scope === "trash" ? "Delete this writing permanently?" : "Move this writing to Trash?"} description={scope === "trash" ? `“${pendingDelete?.title || "Untitled note"}” and its files will be removed and cannot be restored.` : `“${pendingDelete?.title || "Untitled note"}” will leave Archive. You can restore it from Trash.`} confirmLabel={scope === "trash" ? "Delete permanently" : "Move to Trash"} busy={Boolean(pendingDelete && busy.has(pendingDelete.id))} onClose={() => setPendingDelete(null)} onConfirm={() => pendingDelete && runAction(pendingDelete, "delete")} />
  </div>;
}
