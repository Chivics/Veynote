import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import LibraryCover from "../../components/library/LibraryCover.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import { useApiQuery } from "../../hooks/useApiQuery";
import "./readingWorkspace.css";

const config = LIBRARY_CONFIG.reading;
const views = ["All", "Saved", "Highlights", "Books", "Articles", "Finished", "Grouped by Status"];
const formats = [
  { label:"Book", detail:"A book or manuscript you want to read and remember.", category:"Book", icon:"book" },
  { label:"Article or essay", detail:"A shorter piece worth preserving in context.", category:"Article", icon:"note" },
  { label:"Research paper", detail:"A paper with sources, findings and questions.", category:"Research paper", icon:"search" },
];
const activeStatuses = new Set(["In progress"]);
const readingPath = item => `/notes/library/reading/${item.id}`;
const progressOf = item => {
  const read = Number(item.properties?.pagesRead), total = Number(item.properties?.totalPages);
  if (total > 0 && Number.isFinite(read)) return Math.max(0, Math.min(100, Math.round(read / total * 100)));
  return Math.max(0, Math.min(100, Number(item.properties?.progress) || 0));
};
const dateOf = item => new Date(item.updatedAt || item.createdAt || 0).getTime() || 0;

function ReadingRecord({ item, compact = false }) {
  const progress = progressOf(item);
  const score = Number(item.properties?.score);
  return <Link to={readingPath(item)} className={`reading-record${compact ? " is-compact" : ""}`}>
    <LibraryCover item={item} config={config} configKey="reading" compact className="reading-record-cover" />
    <span className="reading-record-copy"><small>{item.category || "READING"}{item.status && ` · ${item.status}`}</small><strong>{item.title}</strong><span>{item.properties?.author || "Author not added"}</span>{Number.isFinite(score) && score > 0 && <b>★ {score}/10</b>}{progress > 0 && <span className="reading-record-progress"><span><i style={{ width:`${progress}%` }} /></span><small>{progress}% read</small></span>}</span>
    <NavigationIcon name="chevron" size={17} />
  </Link>;
}

export default function ReadingWorkspace() {
  const navigate = useNavigate();
  const result = useApiQuery("/library/reading");
  const items = result.data?.items ?? null;
  const [params, setParams] = useSearchParams();
  const view = views.includes(params.get("view")) ? params.get("view") : "All";
  const query = params.get("q") || "";
  const sort = params.get("sort") || "updated";
  const layout = params.get("layout") === "list" ? "list" : "shelf";
  const [creating, setCreating] = useState(false);
  const [createStep, setCreateStep] = useState("format");
  const [createCategory, setCreateCategory] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [createAuthor, setCreateAuthor] = useState("");
  const [createCover, setCreateCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [createdRecord, setCreatedRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const dialog = useRef(null);
  const coverInput = useRef(null);
  const titleInput = useRef(null);
  const createInFlight = useRef(false);
  function openCreate() {
    setCreateStep("format"); setCreateCategory(""); setCreateTitle(""); setCreateAuthor("");
    setCreateCover(null); setCreatedRecord(null); setCreateError(""); setCreating(true);
  }
  useEffect(() => {
    if (params.get("new") !== "1") return;
    openCreate();
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("new"); return next; }, { replace:true });
  }, [params, setParams]);

  useEffect(() => {
    if (!createCover) { setCoverPreview(""); return; }
    const url = URL.createObjectURL(createCover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [createCover]);
  useEffect(() => {
    if (creating && createStep === "details") titleInput.current?.focus();
  }, [creating, createStep]);

  function setParam(key, value) { setParams(previous => { const next = new URLSearchParams(previous); if (!value || value === "All" || (key === "layout" && value === "shelf")) next.delete(key); else next.set(key, value); return next; }, { replace:true }); }
  useEffect(() => {
    const node = dialog.current;
    if (creating && !node?.open) node?.showModal();
    if (!creating && node?.open) node.close();
  }, [creating]);

  const ordered = useMemo(() => {
    if (!items) return null;
    const needle = query.trim().toLocaleLowerCase();
    return items.filter(item => {
      if (needle && !`${item.title} ${item.properties?.author || ""} ${item.properties?.genre || ""}`.toLocaleLowerCase().includes(needle)) return false;
      if (view === "Books" && item.category !== "Book") return false;
      if (view === "Articles" && !["Article", "Essay", "Research paper", "Newsletter"].includes(item.category)) return false;
      if (view === "Finished" && item.status !== "Done") return false;
      if (view === "Saved" && !item.isFavorite) return false;
      if (view === "Highlights" && !item.properties?.highlights?.trim()) return false;
      return true;
    }).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "rating" ? (Number(b.properties?.score) || 0) - (Number(a.properties?.score) || 0) || dateOf(b) - dateOf(a) : dateOf(b) - dateOf(a));
  }, [items, query, view, sort]);
  const focus = items?.find(item => activeStatuses.has(item.status)) || items?.[0];
  const inProgress = items?.filter(item => activeStatuses.has(item.status)).length;
  const finished = items?.filter(item => item.status === "Done").length;

  function openCreatedRecord(record = createdRecord) {
    if (!record) return;
    setCreating(false);
    navigate(`${readingPath(record)}?edit=1`);
  }

  function closeCreate() {
    if (busy) return;
    if (createdRecord) openCreatedRecord();
    else setCreating(false);
  }

  function chooseCover(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
      setCreateCover(null); setCreateError("Choose a JPG, PNG, WebP, or AVIF image."); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setCreateCover(null); setCreateError("Choose an image smaller than 10 MB."); return;
    }
    setCreateCover(file); setCreateError("");
  }

  async function createRecord(event) {
    event.preventDefault();
    if (createInFlight.current) return;
    const title = createTitle.trim();
    if (!title && !createdRecord) { setCreateError("Add a title before creating this record."); return; }
    createInFlight.current = true; setBusy(true); setCreateError("");
    try {
      let record = createdRecord;
      if (!record) {
        const { item } = await api.post("/library/reading", { title, author:createAuthor.trim(), category:createCategory, status:"Not started" });
        record = item;
        setCreatedRecord(item);
      }
      if (createCover) {
        try { await api.upload(`/library/reading/${record.id}/cover`, createCover); }
        catch (error) {
          setCreateError(`The record was saved, but its cover could not be added. ${error.message || "Try the upload again."}`);
          return;
        }
      }
      openCreatedRecord(record);
    } catch (error) { setCreateError(error.message || "This reading record could not be created."); }
    finally { createInFlight.current = false; setBusy(false); }
  }

  return <div className="reading-workspace">
    <header className="reading-workspace-header product-page-header"><div><span className="eyebrow">THE READING COLLECTION</span><h1 className="page-title">Read with <em>intention.</em></h1><p>Keep the books, articles and research that shape how you think. Record progress, reviews and the ideas you want to carry forward.</p></div><div className="product-page-actions"><button type="button" className="btn-primary" onClick={openCreate}><NavigationIcon name="plus" size={17} /> Add reading</button></div></header>

    <div className="reading-overview"><div className="reading-overview-feature">{focus ? <Link to={readingPath(focus)}><LibraryCover item={focus} config={config} configKey="reading" compact className="reading-feature-cover" /><span className="reading-feature-copy"><small>{activeStatuses.has(focus.status) ? "CONTINUE READING" : "RECENTLY IN YOUR COLLECTION"}</small><strong>{focus.title}</strong><span>{focus.properties?.author || focus.category || "Reading record"}</span><span className="reading-feature-open">Open reading record <NavigationIcon name="chevron" size={15} /></span></span></Link> : <div className="reading-feature-empty"><NavigationIcon name="book" size={30} /><span><small>YOUR NEXT CHAPTER</small><strong>Begin a collection of what changes your thinking.</strong></span></div>}</div><div className="reading-overview-context"><span className="eyebrow">THE COLLECTION AT A GLANCE</span><div><strong>{items?.length ?? "—"}</strong><span>saved to read</span></div><div><strong>{inProgress ?? "—"}</strong><span>in progress</span></div><div><strong>{finished ?? "—"}</strong><span>finished</span></div></div></div>

    <div className="reading-workspace-nav" role="group" aria-label="Reading collection views">{views.map(name => <button type="button" key={name} aria-pressed={view === name} onClick={() => setParam("view", name)}>{name}</button>)}<Link to="/notes/library/films">Films &amp; movies <NavigationIcon name="chevron" size={15} /></Link></div>

    <div className="reading-workspace-tools"><label className="reading-search"><NavigationIcon name="search" size={18} /><input type="search" value={query} onChange={event => setParam("q", event.target.value)} placeholder="Search titles, authors or genres" aria-label="Search reading collection" />{query && <button type="button" aria-label="Clear reading search" onClick={() => setParam("q", "")}><NavigationIcon name="close" size={15} /></button>}</label><label className="reading-sort"><span className="sr-only">Sort reading</span><select value={sort} onChange={event => setParam("sort", event.target.value)}><option value="updated">Recently updated</option><option value="title">Title A–Z</option><option value="rating">Highest rated</option></select></label><div className="reading-layout" role="group" aria-label="Reading layout"><button type="button" aria-label="Shelf view" aria-pressed={layout === "shelf"} onClick={() => setParam("layout", "shelf")}><NavigationIcon name="grid" size={17} /></button><button type="button" aria-label="List view" aria-pressed={layout === "list"} onClick={() => setParam("layout", "list")}><NavigationIcon name="list" size={17} /></button></div></div>

    {result.error && <div className="inline-error" role="alert"><span>{items ? "Your saved reading remains visible. " : "Your reading could not be loaded. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {ordered === null ? null : ordered.length === 0 ? <section className="reading-workspace-empty"><NavigationIcon name={query || view !== "All" ? "search" : "book"} size={28} /><span className="eyebrow">{query || view !== "All" ? "NO MATCHING RECORDS" : "A COLLECTION IN THE MAKING"}</span><h2>{query || view !== "All" ? "Try another view or search." : "Start with one thing worth reading."}</h2><p>{query || view !== "All" ? "Clear the filters to see everything you have saved." : "Add a book, article or research paper. Its progress, review and cover can grow with the record."}</p>{query || view !== "All" ? <button type="button" className="btn-outline" onClick={() => { setParams(new URLSearchParams(), { replace:true }); }}>Show all reading</button> : <button type="button" className="btn-primary" onClick={openCreate}>Add the first record</button>}</section> : view === "Grouped by Status" ? <div className="reading-status-board">{["Not started", "In progress", "Done"].map(status => <section key={status}><header><strong>{status}</strong><span>{ordered.filter(item => item.status === status).length}</span></header>{ordered.filter(item => item.status === status).map(item => <ReadingRecord key={item.id} item={item} compact />)}</section>)}</div> : <div className={`reading-records is-${layout}`} aria-label="Reading records">{ordered.map(item => <ReadingRecord key={item.id} item={item} />)}</div>}

    <dialog ref={dialog} className="reading-create-dialog" aria-labelledby="reading-create-title" onCancel={event => { event.preventDefault(); closeCreate(); }} onClick={event => { if (event.target === event.currentTarget) closeCreate(); }}>
      <div className="reading-create-progress" aria-label="Creation progress"><span className="is-current">01 <small>FORMAT</small></span><i /><span className={createStep === "details" ? "is-current" : ""}>02 <small>DETAILS</small></span></div>
      <div className="reading-create-head"><div><span className="eyebrow">ADD TO READING</span><h2 id="reading-create-title">{createStep === "format" ? "What are you reading?" : "Start with the essentials."}</h2><p>{createStep === "format" ? "Choose the kind of work you want to keep close." : "Give this work a name. You can add progress, reflections and more in its record."}</p></div><button type="button" aria-label="Close" onClick={closeCreate} disabled={busy}><NavigationIcon name="close" size={19} /></button></div>
      {createStep === "format" ? <div className="reading-create-choices">{formats.map(format => <button key={format.category} type="button" onClick={() => { setCreateCategory(format.category); setCreateStep("details"); setCreateError(""); }}><span><NavigationIcon name={format.icon} size={20} /></span><strong>{format.label}</strong><small>{format.detail}</small><NavigationIcon name="chevron" size={16} /></button>)}</div> : <form className="reading-create-form" onSubmit={createRecord} noValidate>
        <div className="reading-create-selection"><span><NavigationIcon name={formats.find(format => format.category === createCategory)?.icon || "book"} size={17} /> {createCategory}</span>{!createdRecord && <button type="button" onClick={() => { setCreateStep("format"); setCreateError(""); }}>Change format</button>}</div>
        <div className="reading-create-fields"><label><span>Title <b aria-hidden="true">*</b></span><input ref={titleInput} value={createTitle} onChange={event => { setCreateTitle(event.target.value); setCreateError(""); }} placeholder={createCategory === "Book" ? "The book you want to remember" : "Name this work"} autoComplete="off" maxLength={191} required disabled={busy || Boolean(createdRecord)} /></label><label><span>Author <small>optional</small></span><input value={createAuthor} onChange={event => setCreateAuthor(event.target.value)} placeholder="Who wrote it?" autoComplete="off" maxLength={500} disabled={busy || Boolean(createdRecord)} /></label></div>
        <div className="reading-create-cover"><div className="reading-create-cover-preview">{coverPreview ? <img src={coverPreview} alt="Selected cover preview" /> : <span><NavigationIcon name="book" size={30} /><small>COVER</small></span>}</div><div><strong>Cover image <small>optional</small></strong><p>Add an image now, or add one while editing the record.</p><input ref={coverInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={chooseCover} disabled={busy} /><div className="reading-create-cover-actions"><button type="button" onClick={() => coverInput.current?.click()} disabled={busy}>{createCover ? "Replace image" : "Choose image"}</button>{createCover && <button type="button" onClick={() => { setCreateCover(null); setCreateError(""); }} disabled={busy}>Remove</button>}</div>{createCover && <small className="reading-create-cover-file">{createCover.name}</small>}</div></div>
        {createError && <div role="alert" className="inline-error reading-create-error"><span>{createError}</span></div>}
        {createdRecord && <p className="reading-create-saved" role="status">Your record is saved. You can retry the cover or open it now.</p>}
        <footer className="reading-create-footer"><span>{busy ? createdRecord ? "Uploading your cover…" : "Creating your record…" : "Private to your Library"}</span><div>{createdRecord && <button type="button" className="reading-create-skip" onClick={() => openCreatedRecord()}>Open saved record</button>}<button type="submit" className="btn-primary" disabled={busy || !createTitle.trim()}>{busy ? "Saving…" : createdRecord ? createCover ? "Retry cover" : "Open record" : "Create & continue"} <NavigationIcon name="chevron" size={16} /></button></div></footer>
      </form>}
      {createStep === "format" && <footer className="reading-create-footnote">Your record stays private to your Library.</footer>}
    </dialog>
  </div>;
}
