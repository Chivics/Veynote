import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client.js";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import NoteQuickPreview from "../../components/NoteQuickPreview.jsx";
import { useApiQuery } from "../../hooks/useApiQuery.js";
import { collectionPage, recordDate } from "../../utils/noteCollection.js";
import { filterSearchRecords, highlightSearchText, searchExcerpt, searchMatchSource, searchRecordHref } from "../../utils/notesSearch.js";
import "./notes.css";
import "./collectionWorkspace.css";
import "./searchWorkspace.css";

function Highlight({ text, query }) {
  return highlightSearchText(text, query).map((part, index) => part.match
    ? <mark key={index}>{part.text}</mark>
    : <span key={index}>{part.text}</span>);
}

function SearchResult({ note, query, onPreview }) {
  const source = searchMatchSource(note, query);
  const date = note.updatedAt || note.createdAt;
  return <article className="search-result">
    <div className="search-result-symbol"><NavigationIcon name={note.kind === "JOURNAL" ? "book" : "note"} size={21} /></div>
    <div className="search-result-content">
      <div className="search-result-overline"><span>{note.kind === "JOURNAL" ? "Journal" : "Note"}</span><span className="search-result-separator" aria-hidden="true">·</span><span>{note.folder?.name || "Unfiled"}</span>{note.isPinned && <span className="search-result-pinned"><NavigationIcon name="pin" size={12} /> Pinned</span>}</div>
      <Link className="search-result-title" to={searchRecordHref(note)}><span><Highlight text={note.title || "Untitled note"} query={query} /></span><NavigationIcon name="chevron" size={17} /></Link>
      <p className="search-result-excerpt"><Highlight text={searchExcerpt(note, query)} query={query} /></p>
      <div className="search-result-meta"><span className="search-result-match"><NavigationIcon name={source.startsWith("Attachment") ? "files" : source.startsWith("Tag") ? "tag" : "search"} size={14} /><span><Highlight text={source} query={query} /></span></span>{note.tags?.slice(0, 2).map(tag => <Link key={tag} to={`/notes/tags/${encodeURIComponent(tag)}`}>#{tag}</Link>)}</div>
    </div>
    <div className="search-result-end"><time dateTime={date}>{recordDate(date, { year:"numeric" })}</time><button type="button" onClick={event => onPreview(note, event.currentTarget)} aria-label={`Preview ${note.title || "untitled note"}`}><NavigationIcon name="preview" size={18} />Preview</button></div>
  </article>;
}

export default function SearchWorkspace() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const kind = ["NOTE", "JOURNAL"].includes(params.get("kind")) ? params.get("kind") : "ALL";
  const focus = ["pinned", "shared"].includes(params.get("focus")) ? params.get("focus") : "all";
  const when = ["week", "month", "year"].includes(params.get("when")) ? params.get("when") : "all";
  const sort = ["updated", "title"].includes(params.get("sort")) ? params.get("sort") : "best";
  const view = params.get("view") === "grid" ? "grid" : "list";
  const folder = params.get("folder") || "";
  const tag = params.get("tag") || "";
  const requestedPage = Math.max(1, Number(params.get("page")) || 1);
  const [settledQuery, setSettledQuery] = useState(q.trim());
  const [filtersExpanded, setFiltersExpanded] = useState(Boolean(folder || tag || when !== "all" || focus !== "all"));
  const [previewId, setPreviewId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");
  const inputRef = useRef(null);
  const previewOpener = useRef(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledQuery(q.trim()), 230);
    return () => window.clearTimeout(timer);
  }, [q]);
  const result = useApiQuery("/notes", { scope:"all", kind:"ALL", ...(settledQuery && { q:settledQuery }) });
  const records = result.data?.notes || [];
  const filters = { q, kind, focus, when, sort, folder, tag };
  const queryReady = q.trim() === settledQuery;
  const refined = useMemo(() => filterSearchRecords(records, filters), [records, q, kind, focus, when, sort, folder, tag]);
  const page = collectionPage(refined, requestedPage);
  const base = useMemo(() => filterSearchRecords(records, { q, kind:"ALL", focus:"all", when, sort:"best", folder, tag }), [records, q, when, folder, tag]);
  const counts = { ALL:base.length, NOTE:base.filter(note => note.kind !== "JOURNAL").length, JOURNAL:base.filter(note => note.kind === "JOURNAL").length };
  const folderOptions = [...new Map(records.filter(note => note.folder).map(note => [note.folderId, note.folder.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const tagOptions = [...new Set(records.flatMap(note => note.tags || []))].sort((a, b) => a.localeCompare(b));
  const previewNote = records.find(note => note.id === previewId);
  const hasRefinement = kind !== "ALL" || focus !== "all" || when !== "all" || Boolean(folder || tag);

  function patch(patchValues) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(patchValues)) {
        if (!value || value === "ALL" || value === "all" || value === "best" || value === "list") next.delete(key);
        else next.set(key, String(value));
      }
      if (Object.keys(patchValues).some(key => key !== "page")) next.delete("page");
      return next;
    }, { replace:true });
  }
  function closePreview() {
    setPreviewId(null);
    requestAnimationFrame(() => (previewOpener.current?.isConnected ? previewOpener.current : inputRef.current)?.focus());
  }
  async function runAction(note, action) {
    if (busyId) return;
    setBusyId(note.id); setActionError(""); setActionFeedback("");
    try {
      await api.patch(`/notes/${note.id}`, action === "pin" ? { isPinned:!note.isPinned } : { isFavorite:!note.isFavorite });
      setActionFeedback(action === "pin" ? (note.isPinned ? "Unpinned." : "Pinned for easy return.") : (note.isFavorite ? "Removed from favorites." : "Added to favorites."));
      try { await result.refresh(); }
      catch (error) { setActionError(`The change was saved, but search results could not refresh. ${error.message}`); }
    } catch (error) { setActionError(`The note was not updated. ${error.message}`); }
    finally { setBusyId(null); }
  }

  return <div className="notes-search-workspace notes-surface">
    <header className="product-page-header search-workspace-header"><div><span className="eyebrow">FIND YOUR CONTEXT</span><h1 className="page-title">Find the thread.</h1><p>Search your accessible notes and journal entries by title, writing, tag, or attachment name.</p></div><Link to="/notes/new" className="btn-primary"><NavigationIcon name="plus" size={17} />New note</Link></header>
    <form className="search-workspace-query" role="search" onSubmit={event => { event.preventDefault(); setSettledQuery(q.trim()); }}><NavigationIcon name="search" size={23} /><input ref={inputRef} autoComplete="off" aria-label="Search your writing" placeholder="Search an idea, phrase, tag, or file…" value={q} onChange={event => patch({ q:event.target.value })} onKeyDown={event => { if (event.key === "Escape" && q) patch({ q:"" }); }} />{q && <button type="button" className="search-workspace-clear" onClick={() => { patch({ q:"" }); inputRef.current?.focus(); }} aria-label="Clear search"><NavigationIcon name="close" size={17} /></button>}<button type="submit" className="search-workspace-submit">Search <NavigationIcon name="chevron" size={16} /></button></form>
    <div className="search-workspace-controls"><div className="search-workspace-types" role="group" aria-label="Writing type">{[["ALL","All writing"],["NOTE","Notes"],["JOURNAL","Journal"]].map(([value,label]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => patch({ kind:value })}>{label}<span>{queryReady && result.data ? counts[value] : "—"}</span></button>)}</div><div className="search-workspace-view-controls"><button type="button" className="search-workspace-filter-toggle" aria-expanded={filtersExpanded} aria-controls="search-workspace-filters" onClick={() => setFiltersExpanded(value => !value)}><NavigationIcon name="filter" size={17} />Filters{hasRefinement && <i aria-label="Active filters" />}</button><select aria-label="Sort search results" value={sort} onChange={event => patch({ sort:event.target.value })}><option value="best">Best match</option><option value="updated">Recently updated</option><option value="title">Title A–Z</option></select><div className="search-workspace-layout" role="group" aria-label="Result layout"><button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => patch({ view:"list" })}><NavigationIcon name="list" size={18} /></button><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => patch({ view:"grid" })}><NavigationIcon name="grid" size={18} /></button></div></div></div>
    <div id="search-workspace-filters" className="search-workspace-filters" hidden={!filtersExpanded}><span className="eyebrow">NARROW YOUR SEARCH</span><div className="search-workspace-facet-row"><label>Folder<select value={folder} onChange={event => patch({ folder:event.target.value })}><option value="">Every folder</option><option value="unfiled">Unfiled</option>{folder && folder !== "unfiled" && !folderOptions.some(([id]) => id === folder) && <option value={folder}>Selected folder</option>}{folderOptions.map(([id,name]) => <option value={id} key={id}>{name}</option>)}</select></label><label>Tag<select value={tag} onChange={event => patch({ tag:event.target.value })}><option value="">Any tag</option>{tag && !tagOptions.includes(tag) && <option value={tag}>#{tag}</option>}{tagOptions.map(value => <option key={value} value={value}>#{value}</option>)}</select></label><label>Updated<select value={when} onChange={event => patch({ when:event.target.value })}><option value="all">Any time</option><option value="week">Past 7 days</option><option value="month">Past 30 days</option><option value="year">Past year</option></select></label></div><div className="search-workspace-focus" role="group" aria-label="Search focus"><button type="button" aria-pressed={focus === "all"} onClick={() => patch({ focus:"all" })}>All access</button><button type="button" aria-pressed={focus === "pinned"} onClick={() => patch({ focus:"pinned" })}><NavigationIcon name="pin" size={14} />Pinned</button><button type="button" aria-pressed={focus === "shared"} onClick={() => patch({ focus:"shared" })}><NavigationIcon name="share" size={14} />Shared links</button>{hasRefinement && <button type="button" className="search-workspace-reset" onClick={() => patch({ kind:"ALL", focus:"all", when:"all", folder:"", tag:"" })}>Clear filters</button>}</div></div>
    {result.error && result.data && <div className="inline-error" role="alert"><span>Showing cached writing. {result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    <div className="search-workspace-result-heading"><div><span className="eyebrow">{q.trim() ? "SEARCH RESULTS" : "YOUR WRITING"}</span><h2>{q.trim() ? `Results for “${q.trim()}”` : "Pick up a thread"}</h2></div><span role="status">{queryReady && result.data ? `${refined.length} ${refined.length === 1 ? "record" : "records"}` : "Searching…"}</span></div>
    {!queryReady || (!result.data && result.fetching) ? <div className="search-workspace-loading" role="status" aria-label="Searching your writing"><span /><span /><span /></div> : !result.data && result.error ? <section className="search-workspace-empty" role="alert"><div className="search-workspace-empty-mark"><NavigationIcon name="search" size={29} /></div><div><span className="eyebrow">SEARCH UNAVAILABLE</span><h2>Your writing could not be opened.</h2><p>{result.error.message}</p><div className="search-workspace-empty-actions"><button type="button" onClick={() => result.refresh().catch(() => {})}>Try again</button></div></div></section> : refined.length > 0 ? <>
      <div className={`search-workspace-results is-${view}`}>{page.records.map(note => <SearchResult key={note.id} note={note} query={q.trim()} onPreview={(record, opener) => { previewOpener.current = opener; setPreviewId(record.id); setActionError(""); setActionFeedback(""); }} />)}</div>
      {page.pages > 1 && <nav className="notes-pagination" aria-label="Search result pages"><span>Page {page.page} of {page.pages}</span><div><button type="button" disabled={page.page === 1} onClick={() => patch({ page:page.page - 1 })}>Previous</button><button type="button" disabled={page.page === page.pages} onClick={() => patch({ page:page.page + 1 })}>Next</button></div></nav>}
    </> : <section className="search-workspace-empty"><div className="search-workspace-empty-mark"><NavigationIcon name={q.trim() ? "search" : "note"} size={29} /></div><div><span className="eyebrow">{q.trim() ? "ANOTHER PATH MAY HELP" : "A SPACE FOR WHAT MATTERS"}</span><h2>{q.trim() ? "No matching writing yet." : "Your next thought starts here."}</h2><p>{q.trim() ? "Try a shorter phrase, a different writing type, or remove a filter. Protected records stay outside ordinary search." : "Create a note or journal entry. Your writing will become searchable here as it grows."}</p><div className="search-workspace-empty-actions">{q.trim() ? <button type="button" onClick={() => { patch({ q:"", kind:"ALL", focus:"all", when:"all", folder:"", tag:"" }); inputRef.current?.focus(); }}>Clear search and filters</button> : <Link className="btn-primary" to="/notes/new"><NavigationIcon name="plus" size={16} />Create a note</Link>}<Link to="/notes/archive">Explore Archive <NavigationIcon name="chevron" size={15} /></Link></div></div></section>}
    <div className="search-workspace-footnote"><NavigationIcon name="shield" size={16} /><span>Locked Notes and Will & Inheritance stay outside ordinary search. Browse <Link to="/notes/archive">Archive</Link> separately.</span></div>
    <NoteQuickPreview note={previewNote} busy={busyId === previewId} error={actionError} feedback={actionFeedback} onAction={runAction} onClose={closePreview} />
  </div>;
}
