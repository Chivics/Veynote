import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import TemplateMenu from "../../components/TemplateMenu.jsx";
import NoteQuickPreview from "../../components/NoteQuickPreview.jsx";
import NoteActionsMenu from "../../components/NoteActionsMenu.jsx";
import SearchWorkspace from "./SearchWorkspace.jsx";
import { LibraryFavoritesSection, useLibraryFavorites } from "./LibraryFavoritesSection.jsx";
import { useApiQuery } from "../../hooks/useApiQuery";
import { collectWriting, collectionPage, collectionParams, collectionState, noteExcerpt, noteWordCount, recordDate, recordPath } from "../../utils/noteCollection.js";
import { applyNoteAcknowledgements, reconcileNoteAcknowledgements } from "../../utils/noteAcknowledgements.js";
import "./notes.css";
import "./collectionWorkspace.css";

const SCOPE_COPY = {
  all: { title: "All Notes", eyebrow: "YOUR BODY OF WORK", description: "Everything you’ve written, organized without the clutter.", empty: "Your writing belongs here", emptyDesc: "Capture a thought or begin a document. Organize it as your ideas develop." },
  favorites: { title: "Favorites", eyebrow: "WITHIN REACH", description: "The writing and Library records you want to return to, each with its own context.", empty: "Keep important work close", emptyDesc: "Favorite a note, journal entry, or Library record to gather it here." },
  shared: { title: "Shared", eyebrow: "CONTROLLED ACCESS", description: "Every active view-only link, gathered so access stays deliberate and easy to withdraw.", empty: "Your writing is private", emptyDesc: "Create a view-only link from a document when you are ready to share it." },
  archive: { title: "Archive", eyebrow: "PRESERVED", description: "Writing set aside from active work, with its original context intact.", empty: "Nothing archived", emptyDesc: "Archived notes and journal entries stay here until you restore or delete them." },
  trash: { title: "Trash", eyebrow: "RECOVERABLE RECORDS", description: "Review deleted writing before deciding what to restore or remove permanently.", empty: "Trash is empty", emptyDesc: "Deleted notes and journal entries remain here until you permanently remove them." },
  folder: { title: "Folder", eyebrow: "COLLECTION", description: "Writing organized inside this folder.", empty: "This folder is empty", emptyDesc: "Create a note here or move existing writing into this folder." },
  tag: { title: "Tag", eyebrow: "CONNECTED WRITING", description: "Follow a shared theme across your notes and journal entries.", empty: "No tagged writing", emptyDesc: "Records carrying this tag will appear here." },
  search: { title: "Search your writing", eyebrow: "FIND YOUR CONTEXT", description: "Search accessible notes and journal entries by title, content, tags, or attachment name.", empty: "Find the thought you need", emptyDesc: "Search a phrase, a topic, a name, or a document." },
};

function RecordCard({ note, scope, onAction, onDelete, onUnshare, onPreview, busy }) {
  const trashed = scope === "trash";
  const date = trashed ? note.trashedAt || note.updatedAt : note.updatedAt || note.createdAt;
  const text = noteExcerpt(note);
  const words = noteWordCount(note);
  const body = <>
    <div className="notes-record-primary"><span className="notes-record-symbol"><NavigationIcon name={note.kind === "JOURNAL" ? "book" : "note"} size={20} /></span><div><div className="notes-record-kind">{note.kind === "JOURNAL" ? "Journal" : "Note"}{note.isPinned && !trashed && <span><NavigationIcon name="pin" size={12} /> Pinned</span>}{note.isArchived && ["favorites", "tag"].includes(scope) && <span>Archived</span>}</div><h2>{note.title || "Untitled note"}</h2><p>{text.slice(0, 240) || "No writing added yet."}</p><small className="notes-document-length">{words.toLocaleString()} words{words > 0 && ` · ${Math.max(1, Math.ceil(words / 220))} min read`}</small></div></div>
    <div className="notes-record-collection"><span><NavigationIcon name="folder" size={14} />{note.folder?.name || (note.kind === "JOURNAL" ? "Journal" : "Unfiled")}</span><div>{note.tags?.slice(0, 2).map(tag => <span className="notes-record-tag" key={tag}>#{tag}</span>)}</div></div>
    <div className="notes-record-status"><time dateTime={date}>{trashed ? "Deleted " : ""}{recordDate(date, { year: "numeric" })}</time><span className={note.shareEnabled ? "is-shared" : ""}><NavigationIcon name={trashed ? "shield" : note.shareEnabled ? "account" : "lock"} size={13} />{trashed ? "Recoverable" : note.shareEnabled ? "Shared link" : "Private"}</span></div>
  </>;
  return <article className="notes-writing-record" aria-busy={busy || undefined}>
    <Link className="notes-record-body" to={recordPath(note)} aria-label={trashed ? `Review deleted ${note.title || "untitled note"}` : undefined}>{body}</Link>
    <div className="notes-writing-actions">
      {scope === "trash" ? <>
        <button type="button" disabled={busy} onClick={() => onAction(note, "restore")}>Restore</button>
        <button type="button" disabled={busy} className="is-danger" onClick={() => onDelete(note)} aria-label={`Delete ${note.title || "untitled note"} permanently`}><NavigationIcon name="trash" size={17} /></button>
      </> : scope === "archive" ? <>
        <button type="button" disabled={busy} onClick={() => onAction(note, "unarchive")}>Restore</button>
        <button type="button" disabled={busy} onClick={() => onDelete(note)} aria-label={`Move ${note.title || "untitled note"} to Trash`}><NavigationIcon name="trash" size={17} /></button>
      </> : scope === "shared" ? <>
        <button type="button" aria-haspopup="dialog" aria-label={`Preview ${note.title || "untitled note"}`} onClick={() => onPreview(note)}><NavigationIcon name="preview" size={19} /></button>
        <button type="button" disabled={busy} className="is-danger" onClick={() => onUnshare(note)}><NavigationIcon name="close" size={16} /> Revoke</button>
      </> : <>
        <button type="button" aria-haspopup="dialog" aria-label={`Preview ${note.title || "untitled note"}`} onClick={() => onPreview(note)}><NavigationIcon name="preview" size={19} /></button>
        <button type="button" disabled={busy} className={`notes-favorite ${note.isFavorite ? "is-active" : ""}`} aria-pressed={Boolean(note.isFavorite)} aria-label={`${note.isFavorite ? "Remove" : "Add"} ${note.title || "untitled note"} ${note.isFavorite ? "from" : "to"} favorites`} onClick={() => onAction(note, "favorite")}><NavigationIcon name="heart" size={19} /></button>
        <NoteActionsMenu note={note} busy={busy} onAction={onAction} onDelete={onDelete} />
      </>}
    </div>
  </article>;
}

export default function NoteListPage({ scope }) {
  const { folderId, tag } = useParams();
  if (scope === "search") return <SearchWorkspace />;
  if (scope === "favorites") return <FavoritesCollection />;
  return <NoteCollection key={`${scope}:${folderId || ""}:${tag || ""}`} scope={scope} folderId={folderId} tag={tag} />;
}

function FavoritesCollection() {
  const libraryResult = useLibraryFavorites();
  return <NoteCollection scope="favorites" libraryResult={libraryResult} />;
}

function NoteCollection({ scope, folderId, tag, libraryResult }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = collectionState(searchParams, scope);
  const defaultKind = ["all", "folder"].includes(scope) ? "NOTE" : "ALL";
  const [filtersExpanded, setFiltersExpanded] = useState(() => Boolean(filters.folder || filters.tag || filters.kind !== defaultKind));
  const [previewRecord, setPreviewRecord] = useState(null);
  const filtersId = useId();
  const previewOpener = useRef(null);
  const [searchQuery, setSearchQuery] = useState(filters.q);
  useEffect(() => { const timer = setTimeout(() => setSearchQuery(filters.q), 220); return () => clearTimeout(timer); }, [filters.q]);
  const [folder, setFolder] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingUnshare, setPendingUnshare] = useState(null);
  const [busy, setBusy] = useState(new Set());
  const [acknowledged, setAcknowledged] = useState({});
  const [actionError, setActionError] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");
  const [undoAction, setUndoAction] = useState(null);
  const pending = useRef(new Set()), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const copy = SCOPE_COPY[scope];
  const query = { scope: ["favorites", "shared", "archive", "trash", "tag"].includes(scope) ? scope : "all", view: "summary", ...(scope === "tag" ? { kind: "ALL" } : filters.kind !== "NOTE" && { kind: filters.kind }) };
  if (scope === "folder") query.folderId = folderId;
  if (scope === "tag") query.tag = tag;
  if (searchQuery.trim()) query.q = searchQuery.trim();
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

  // Retain acknowledged writes through a failed refresh, including Undo after
  // a record has already left the cached collection. Fresh backend state can
  // reconcile them later without requiring a page reload.
  useEffect(() => {
    if (!notes) return;
    setAcknowledged(previous => reconcileNoteAcknowledgements(notes, previous));
  }, [notes]);
  const records = useMemo(() => applyNoteAcknowledgements(notes || [], acknowledged), [notes, acknowledged]);
  const visibleNotes = useMemo(() => collectWriting(records, filters, Boolean(searchQuery.trim())).filter(note => scope !== "favorites" || note.isFavorite), [records, filters.q, filters.sort, filters.kind, filters.folder, filters.tag, filters.focus, scope, searchQuery]);
  const page = collectionPage(visibleNotes, filters.page);
  const folderOptions = [...new Map((notes || []).filter(note => note.folder).map(note => [note.folderId, note.folder.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const tagOptions = [...new Set((notes || []).flatMap(note => note.tags || []))].sort((a, b) => a.localeCompare(b));
  const hasFilter = Boolean(filters.q.trim() || filters.folder || filters.tag || filters.focus !== "all" || filters.kind !== (["all","folder"].includes(scope) ? "NOTE" : "ALL"));
  const resetFilters = () => patchFilters({ q:"", folder:"", tag:"", focus:null, kind:scope === "all" || scope === "folder" ? "NOTE" : "ALL" });
  const contextualRecords = useMemo(() => collectWriting(records, { ...filters, focus:"all" }, Boolean(searchQuery.trim())), [records, filters.q, filters.sort, filters.kind, filters.folder, filters.tag, scope, searchQuery]);
  const viewCounts = { all:contextualRecords.length, pinned:contextualRecords.filter(note => note.isPinned).length, shared:contextualRecords.filter(note => note.shareEnabled).length };
  const tagCounts = { notes: records.filter(note => note.kind !== "JOURNAL").length, journal: records.filter(note => note.kind === "JOURNAL").length, archived: records.filter(note => note.isArchived).length };
  const advancedCount = Number(Boolean(filters.folder)) + Number(Boolean(filters.tag)) + Number(filters.kind !== defaultKind);
  const showFilters = filtersExpanded;
  const favoriteLibraryItems = libraryResult?.data?.items || [];
  const favoriteLibraryPending = scope === "favorites" && !libraryResult?.data && !libraryResult?.error;
  // Keep the Library section mounted as its last item is removed so its
  // acknowledgement is not lost to a layout swap.
  const leadLibrary = scope === "favorites" && records.length === 0;
  const showCollectionTools = !leadLibrary && (!notes || records.length > 0 || hasFilter || scope === "search" || favoriteLibraryItems.length > 0);
  const previewNote = previewRecord && records.find(note => note.id === previewRecord);
  function closePreview() {
    setPreviewRecord(null);
    requestAnimationFrame(() => {
      if (!mounted.current) return;
      if (previewOpener.current?.isConnected) previewOpener.current.focus();
      else document.querySelector('.notes-search-control input')?.focus();
    });
  }

  async function runAction(note, action, undoing = false) {
    if (pending.current.has(note.id)) return;
    pending.current.add(note.id); setBusy(new Set(pending.current)); setActionError(""); if (!undoing) setActionFeedback("");
    try {
      if (action === "favorite") await api.patch(`/notes/${note.id}`, { isFavorite: !note.isFavorite });
      else if (action === "pin") await api.patch(`/notes/${note.id}`, { isPinned: !note.isPinned });
      else if (action === "restore") await api.post(`/notes/${note.id}/restore`);
      else if (action === "unarchive") await api.patch(`/notes/${note.id}`, { isArchived: false });
      else if (action === "archive") await api.patch(`/notes/${note.id}`, { isArchived: true });
      else if (action === "unshare") await api.delete(`/notes/${note.id}/share`);
      else await api.delete(`/notes/${note.id}${scope === "trash" ? "/permanent" : ""}`);
      if (!mounted.current) return;
      const patch = action === "favorite" ? { isFavorite: !note.isFavorite } : action === "pin" ? { isPinned: !note.isPinned } : ["tag", "favorites"].includes(scope) && action === "archive" ? { isArchived: true } : ["tag", "favorites"].includes(scope) && action === "unarchive" ? { isArchived: false } : undoing && action === "restore" ? { isTrashed: false, shareEnabled: false, shareToken: null } : undoing && action === "unarchive" ? { isArchived: false } : null;
      setAcknowledged(previous => ({ ...previous, [note.id]: patch ? { record: note, patch } : { removed: true } }));
      setActionFeedback(action === "favorite" ? `${note.isFavorite ? "Removed from" : "Added to"} favorites.` : action === "pin" ? `${note.isPinned ? "Unpinned" : "Pinned"} this document.` : action === "unshare" ? "Public access revoked. The previous link no longer works." : action === "restore" ? "Restored from Trash. Previous share links remain revoked." : action === "unarchive" ? "Restored to active writing." : action === "archive" ? "Moved to Archive. Your writing is preserved." : scope === "trash" ? "Record permanently deleted." : "Moved to Trash. Your writing and attachments are recoverable.");
      setUndoAction(undoing ? null : action === "delete" && scope !== "trash" ? { note, action: "restore" } : action === "archive" ? { note, action: "unarchive" } : action === "unarchive" ? { note, action: "archive" } : null);
      setPendingDelete(null);
      setPendingUnshare(null);
      if (action === "delete" || (action === "archive" && !["tag", "favorites"].includes(scope))) closePreview();
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
  const createPath = scope === "folder" ? `/notes/new?folder=${encodeURIComponent(folderId)}` : scope === "tag" ? `/notes/new?tag=${encodeURIComponent(tag)}` : "/notes/new";
  const recordLabel = scope === "all" ? "document" : "record";
  return <div className={`note-collection notes-surface collection-workspace scope-${scope}`}>
    <header className="product-page-header"><div><span className="eyebrow">{copy.eyebrow}</span><h1 className="page-title">{title}</h1><p>{scope === "tag" ? `One theme across your writing. Open a connected record or create a note already filed under #${tag}.` : copy.description}</p></div><div className="product-page-actions">{["all", "folder"].includes(scope) && <TemplateMenu />}<Link className="btn-primary" to={["archive", "trash", "shared"].includes(scope) ? "/notes/all" : createPath}><NavigationIcon name={["archive", "trash", "shared"].includes(scope) ? "note" : "plus"} size={17} />{["archive", "trash", "shared"].includes(scope) ? "All notes" : scope === "tag" ? "New tagged note" : "New note"}</Link></div></header>
    {scope === "tag" && <div className="notes-tag-context" aria-label="Tag connections"><span className="notes-tag-context-mark" aria-hidden="true"><NavigationIcon name="tag" size={24} /></span><div><strong>{notes ? `${records.length} connected ${records.length === 1 ? "record" : "records"}` : "Connected writing"}</strong><p>{notes ? `${tagCounts.notes} ${tagCounts.notes === 1 ? "note" : "notes"} · ${tagCounts.journal} journal ${tagCounts.journal === 1 ? "entry" : "entries"}${tagCounts.archived ? ` · ${tagCounts.archived} preserved in Archive` : ""}` : "Notes and journal entries carrying this tag will appear here."}</p></div><Link to="/notes/tags">Manage tags <span aria-hidden="true">↗</span></Link></div>}
    {scope === "all" ? <div className="notes-collection-views" role="group" aria-label="Writing views">{[["all","All writing","note"],["pinned","Pinned","pin"],["shared","Shared links","account"]].map(([value,label,icon]) => <button type="button" key={value} aria-pressed={filters.focus === value} onClick={() => patchFilters({ focus:value === "all" ? null : value })}><NavigationIcon name={icon} size={16} />{label}<span>{notes ? viewCounts[value] : "—"}</span></button>)}<Link to="/notes/folders" className="notes-organize-link"><NavigationIcon name="folder" size={16} /> Organize</Link></div> : !["tag", "folder"].includes(scope) && <nav className="notes-collection-nav" aria-label="Writing collections"><div><Link to="/notes/all">All notes</Link><Link aria-current={scope === "favorites" ? "page" : undefined} to="/notes/favorites">Favorites</Link><Link aria-current={scope === "shared" ? "page" : undefined} to="/notes/shared">Shared</Link><Link to="/notes/folders">Folders</Link><Link to="/notes/tags">Tags</Link></div><div><Link aria-current={scope === "archive" ? "page" : undefined} to="/notes/archive"><NavigationIcon name="archive" size={15} />Archive</Link><Link aria-current={scope === "trash" ? "page" : undefined} to="/notes/trash"><NavigationIcon name="trash" size={15} />Trash</Link></div></nav>}
    {scope === "trash" && <div className="notes-retention"><NavigationIcon name="shield" size={20} /><div><strong>Your writing is recoverable.</strong><p>No automatic deletion period is configured. Restore a record to its original folder. Permanent deletion removes the record, its history and attachment access, and cannot be undone.</p></div></div>}
    {scope === "archive" && <div className="notes-retention"><NavigationIcon name="archive" size={20} /><div><strong>Set aside, with context preserved.</strong><p>Restore writing to your active workspace, or move it to Trash before permanent deletion.</p></div></div>}
    {scope === "shared" && <div className="notes-retention"><NavigationIcon name="share" size={20} /><div><strong>View-only access, under your control.</strong><p>Recipients can read the published document without signing in. Revoke a link at any time; editing, comments, account data, and protected records are never included.</p></div></div>}
    {leadLibrary && <LibraryFavoritesSection result={libraryResult} query={filters.q} onQueryChange={q => patchFilters({ q })} featured />}
    {scope === "favorites" && <div className="favorites-writing-heading"><div><span className="eyebrow">WRITING</span><h2>Words worth returning to.</h2><p>Notes and reflections remain one connected body of work.</p></div><span>{notes ? `${visibleNotes.length} saved ${visibleNotes.length === 1 ? "record" : "records"}` : "Your writing"}</span></div>}
    {result.error && <div className="inline-error" role="alert"><span>{notes ? "Your cached writing is still visible. " : "Your writing could not be opened. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {actionError && <div className="inline-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Refresh collection</button></div>}
    {actionFeedback && <div className="notes-action-feedback" role="status"><NavigationIcon name="check" size={17} /><span>{actionFeedback}</span>{undoAction && <button type="button" disabled={busy.has(undoAction.note.id)} className="notes-undo-action" onClick={() => runAction(undoAction.note, undoAction.action, true)}>Undo</button>}<button type="button" onClick={() => { setActionFeedback(""); setUndoAction(null); }} aria-label="Dismiss confirmation"><NavigationIcon name="close" size={16} /></button></div>}
    {showCollectionTools && <><div className="notes-collection-controls">
      <label className="notes-search-control"><NavigationIcon name="search" size={18} /><input aria-label={scope === "search" ? "Search your writing" : "Filter this collection"} placeholder={scope === "search" ? "Search writing, tags, or attachments…" : "Find a note in this collection…"} value={filters.q} onChange={event => patchFilters({ q: event.target.value })} />{filters.q && <button type="button" aria-label="Clear search" onClick={() => patchFilters({ q: "" })}><NavigationIcon name="close" size={16} /></button>}</label>
      <label className="notes-sort-control"><span className="sr-only">Sort writing</span><select value={filters.sort} onChange={event => patchFilters({ sort: event.target.value })}>{scope === "trash" && <option value="deleted">Recently deleted</option>}<option value="updated">Recently updated</option><option value="created">Recently created</option><option value="title">Title A–Z</option></select></label>
      <div className="notes-view-switcher" role="group" aria-label="Collection view">{["list", "grid"].map(view => <button key={view} type="button" aria-label={`${view === "list" ? "List" : "Grid"} view`} aria-pressed={filters.view === view} onClick={() => patchFilters({ view })}><NavigationIcon name={view} size={19} /></button>)}</div>
    </div>
    <div className="notes-collection-context"><span role="status">{notes ? `${visibleNotes.length} ${recordLabel}${visibleNotes.length === 1 ? "" : "s"}${hasFilter ? " in this view" : " in your collection"}` : "Your writing will appear here"}</span><button type="button" className="notes-filter-toggle" aria-expanded={showFilters} aria-controls={filtersId} onClick={() => setFiltersExpanded(value => !value)}><NavigationIcon name="filter" size={16} /> Filters{advancedCount > 0 && <b>{advancedCount}</b>}</button></div>
    <div className="notes-filter-row" id={filtersId} hidden={!showFilters}><label><span>Type</span><select aria-label="Writing type" value={filters.kind} onChange={event => patchFilters({ kind: event.target.value })}><option value="NOTE">Notes</option><option value="JOURNAL">Journal</option><option value="ALL">All writing</option></select></label>{scope !== "folder" && <label><span>Collection</span><select aria-label="Filter by folder" value={filters.folder} onChange={event => patchFilters({ folder: event.target.value })}><option value="">Every folder</option><option value="unfiled">Unfiled</option>{filters.folder && filters.folder !== "unfiled" && !folderOptions.some(([id]) => id === filters.folder) && <option value={filters.folder}>Selected folder</option>}{folderOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}{scope !== "tag" && <label><span>Tag</span><select aria-label="Filter by tag" value={filters.tag} onChange={event => patchFilters({ tag: event.target.value })}><option value="">Any tag</option>{filters.tag && !tagOptions.includes(filters.tag) && <option value={filters.tag}>{filters.tag}</option>}{tagOptions.map(tag => <option key={tag} value={tag}>#{tag}</option>)}</select></label>}{hasFilter && <button type="button" onClick={resetFilters}>Clear filters</button>}</div>
    </>}
    <section className={`notes-records-panel is-${filters.view}${notes && !visibleNotes.length && !hasFilter ? " is-empty" : ""}`} aria-label={title}>
      {filters.view === "list" && page.records.length > 0 && <div className="notes-record-columns" aria-hidden="true"><span>Title & context</span><span>Collection</span><span>{scope === "trash" ? "Deleted · access" : "Updated · access"}</span><span /></div>}
      <div className="notes-record-layout">{page.records.map(note => <RecordCard key={note.id} note={note} scope={scope} busy={busy.has(note.id)} onAction={runAction} onDelete={note => { setActionError(""); setPendingDelete(note); }} onUnshare={note => { setActionError(""); setPendingUnshare(note); }} onPreview={note => { previewOpener.current = document.activeElement; setActionError(""); setActionFeedback(""); setPreviewRecord(note.id); }} />)}</div>
      {notes && !visibleNotes.length && !favoriteLibraryPending && (scope === "favorites" && favoriteLibraryItems.length ? <div className="favorites-writing-empty"><NavigationIcon name="note" size={20} /><span>No favorite writing yet. Your Library selections are below.</span><Link to="/notes/all">Browse notes <NavigationIcon name="chevron" size={14} /></Link></div> : hasFilter ? <EmptyState icon={<NavigationIcon name={filters.focus === "pinned" ? "pin" : "search"} size={27} />} title={filters.focus === "pinned" ? "Keep key documents in view" : filters.focus === "shared" ? "A private collection, for now" : "No matching writing"} description={filters.focus === "pinned" ? "Preview a note and pin it to keep it within reach. Your other filters still apply." : filters.focus === "shared" ? "Documents with sharing enabled appear here. Share access is controlled from each document’s editor." : "Try a broader phrase, another type, or clear the filters."} action={<button type="button" className="btn-outline" onClick={resetFilters}>Clear filters</button>} /> : <div className={`notes-collection-empty is-${scope}`}>
        <div className="notes-collection-empty-mark" aria-hidden="true"><NavigationIcon name={scope === "favorites" ? "heart" : scope === "shared" ? "share" : scope === "archive" ? "archive" : scope === "trash" ? "trash" : scope === "folder" ? "folder" : scope === "tag" ? "tag" : scope === "search" ? "search" : "note"} size={31} /></div>
        <div className="notes-collection-empty-copy"><span className="eyebrow">{scope === "trash" ? "RECOVERY IS CLEAR" : scope === "archive" ? "ACTIVE WORK IS IN VIEW" : scope === "shared" ? "PRIVATE UNTIL YOU DECIDE" : scope === "favorites" ? "YOUR SHORTLIST STARTS HERE" : "A SPACE FOR WHAT MATTERS"}</span><h2>{copy.empty}</h2><p>{copy.emptyDesc}</p><div className="notes-collection-empty-actions"><Link className="btn-primary" to={["favorites", "shared", "archive", "trash", "search"].includes(scope) ? "/notes/all" : createPath}><NavigationIcon name={["favorites", "shared", "archive", "trash", "search"].includes(scope) ? "note" : "plus"} size={16} />{["favorites", "shared", "archive", "trash", "search"].includes(scope) ? "Browse all notes" : scope === "tag" ? "New tagged note" : "Create a note"}</Link>{scope === "all" && <Link to="/notes/folders">Explore folders <span aria-hidden="true">↗</span></Link>}</div></div>
      </div>)}
    </section>
    {page.pages > 1 && <nav className="notes-pagination" aria-label="Collection pages"><span>Page {page.page} of {page.pages}</span><div><button type="button" disabled={page.page === 1} onClick={() => patchFilters({ page: page.page - 1 })}>Previous</button><button type="button" disabled={page.page === page.pages} onClick={() => patchFilters({ page: page.page + 1 })}>Next</button></div></nav>}
    {scope === "trash" && <section className="notes-connected-trash" aria-label="Recovery in connected work"><div><span className="eyebrow">CONNECTED RECOVERY</span><h2>Other places to restore.</h2><p>Files, Library records, and tasks keep their own context while they wait for your decision.</p></div><div><Link to="/notes/files/trash"><NavigationIcon name="files" size={20} /><span><strong>Files Trash</strong><small>Files and folder structures</small></span><NavigationIcon name="chevron" size={16} /></Link><Link to="/notes/library/trash"><NavigationIcon name="book" size={20} /><span><strong>Library Trash</strong><small>Books, films, goals, and plans</small></span><NavigationIcon name="chevron" size={16} /></Link><Link to="/notes/tasks?view=trash"><NavigationIcon name="tasks" size={20} /><span><strong>Tasks Trash</strong><small>Commitments and checklists</small></span><NavigationIcon name="chevron" size={16} /></Link></div></section>}
    {scope === "favorites" && !leadLibrary && <LibraryFavoritesSection result={libraryResult} query={filters.q} />}
    <NoteQuickPreview note={previewNote} busy={Boolean(previewNote && busy.has(previewNote.id))} error={actionError} feedback={actionFeedback} onAction={runAction} onClose={closePreview} />
    <ConfirmDialog open={Boolean(pendingDelete)} title={scope === "trash" ? "Delete this writing permanently?" : "Move this writing to Trash?"} description={scope === "trash" ? `“${pendingDelete?.title || "Untitled note"}”, its versions and attachment access will be removed and cannot be restored.` : `“${pendingDelete?.title || "Untitled note"}” will leave this collection. You can restore it from Trash. Public share links will be revoked.`} error={actionError} confirmLabel={scope === "trash" ? "Delete permanently" : "Move to Trash"} busy={Boolean(pendingDelete && busy.has(pendingDelete.id))} onClose={() => { setPendingDelete(null); setActionError(""); }} onConfirm={() => pendingDelete && runAction(pendingDelete, "delete")} />
    <ConfirmDialog open={Boolean(pendingUnshare)} title="Revoke this public link?" description={`People using the current link to “${pendingUnshare?.title || "Untitled note"}” will immediately lose access. Your private document and its history remain unchanged.`} error={actionError} confirmLabel="Revoke access" busy={Boolean(pendingUnshare && busy.has(pendingUnshare.id))} onClose={() => { setPendingUnshare(null); setActionError(""); }} onConfirm={() => pendingUnshare && runAction(pendingUnshare, "unshare")} />
  </div>;
}
