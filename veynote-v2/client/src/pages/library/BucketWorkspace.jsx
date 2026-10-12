import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import LibraryCover from "../../components/library/LibraryCover.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import { useApiQuery } from "../../hooks/useApiQuery";
import "./bucketWorkspace.css";

const config = LIBRARY_CONFIG.bucket;
const tabs = [["all", "Everything"], ["not-started", "To experience"], ["in-progress", "In motion"], ["completed", "Completed"]];
const pathFor = item => `/notes/library/bucket/${item.id}`;
const dayLabel = value => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }) : "";
const isComplete = item => item.status === "Completed" || Boolean(item.properties?.completed);

function ExperienceCard({ item }) {
  const target = dayLabel(item.properties?.targetDate);
  return <Link to={pathFor(item)} className="bucket-card">
    <LibraryCover item={item} config={config} configKey="bucket" compact className="bucket-card-cover" />
    <span className="bucket-card-body"><small>{item.category || "Life experience"}{item.status && ` · ${item.status}`}</small><strong>{item.title}</strong><span>{item.properties?.location || item.properties?.motivation || "An experience worth keeping close."}</span><span className="bucket-card-footer">{target ? <span><NavigationIcon name="calendar" size={14} /> {target}</span> : <span>{isComplete(item) ? "A memory made" : "Time is yours to choose"}</span>}<NavigationIcon name="chevron" size={16} /></span></span>
  </Link>;
}

export default function BucketWorkspace() {
  const navigate = useNavigate();
  const result = useApiQuery("/library/bucket_list");
  const items = result.data?.items ?? null;
  const [params, setParams] = useSearchParams();
  const view = tabs.some(([key]) => key === params.get("view")) ? params.get("view") : "all";
  const query = params.get("q") || "";
  const category = config.categoryOptions.includes(params.get("category")) ? params.get("category") : "all";
  const sort = ["recent", "target", "priority"].includes(params.get("sort")) ? params.get("sort") : "recent";
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Place to visit");
  const [location, setLocation] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef(null), fileInput = useRef(null), titleInput = useRef(null), inFlight = useRef(false);

  useEffect(() => {
    if (params.get("new") !== "1") return;
    openCreate();
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("new"); return next; }, { replace:true });
  }, [params, setParams]);
  useEffect(() => { const node = dialog.current; if (creating && !node?.open) node?.showModal(); if (!creating && node?.open) node.close(); }, [creating]);
  useEffect(() => { if (creating) titleInput.current?.focus(); }, [creating]);
  useEffect(() => {
    if (!cover) { setCoverPreview(""); return; }
    const url = URL.createObjectURL(cover); setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  function setParam(key, value) {
    setParams(previous => { const next = new URLSearchParams(previous); if (!value || value === "all" || value === "recent") next.delete(key); else next.set(key, value); return next; }, { replace:true });
  }
  function openCreate() {
    setTitle(""); setType("Place to visit"); setLocation(""); setTargetDate(""); setPriority("Medium"); setCover(null); setCreated(null); setError(""); setCreating(true);
  }
  function openRecord(record = created) { if (!record) return; setCreating(false); navigate(`${pathFor(record)}?edit=1`); }
  function closeCreate() { if (busy) return; if (created) openRecord(created); else setCreating(false); }
  function chooseCover(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) { setError("Choose a JPG, PNG, WebP, or AVIF image."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Choose an image smaller than 10 MB."); return; }
    setCover(file); setError("");
  }
  async function createRecord(event) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!title.trim() && !created) { setError("Give this experience a name first."); return; }
    inFlight.current = true; setBusy(true); setError("");
    try {
      let record = created;
      if (!record) {
        const response = await api.post("/library/bucket_list", { title:title.trim(), category:type, status:"Not started", priority, location:location.trim(), targetDate });
        record = response.item; setCreated(record);
      }
      if (cover) {
        try { await api.upload(`/library/bucket_list/${record.id}/cover`, cover); }
        catch (failure) { setError(`This experience was saved, but its image was not added. ${failure.message}`); return; }
      }
      openRecord(record);
    } catch (failure) { setError(failure.message || "This experience could not be saved."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const ordered = useMemo(() => {
    if (!items) return null;
    const needle = query.trim().toLocaleLowerCase();
    const rank = { High:0, Medium:1, Low:2 };
    return items.filter(item => {
      if (view === "completed" && !isComplete(item)) return false;
      if (view === "not-started" && (isComplete(item) || item.status === "In progress")) return false;
      if (view === "in-progress" && item.status !== "In progress") return false;
      if (category !== "all" && item.category !== category) return false;
      return !needle || `${item.title} ${item.category || ""} ${item.properties?.location || ""} ${item.properties?.motivation || ""}`.toLocaleLowerCase().includes(needle);
    }).sort((a,b) => sort === "target" ? (a.properties?.targetDate || "9999").localeCompare(b.properties?.targetDate || "9999") || a.title.localeCompare(b.title) : sort === "priority" ? (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || a.title.localeCompare(b.title) : new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }, [items, query, view, category, sort]);
  const planned = items?.filter(item => !isComplete(item) && item.status !== "In progress") || [];
  const moving = items?.filter(item => !isComplete(item) && item.status === "In progress") || [];
  const completed = items?.filter(isComplete) || [];
  const featured = moving[0] || planned[0] || items?.[0];

  return <div className="bucket-workspace">
    <header className="bucket-header product-page-header"><div><span className="eyebrow">LIBRARY / LIFE EXPERIENCES</span><h1 className="page-title">A life worth <em>living.</em></h1><p>Places to go, things to try, and moments you want to make real. Keep the reason as carefully as the destination.</p></div><button type="button" className="btn-primary" onClick={openCreate}><NavigationIcon name="plus" size={17} /> Add an experience</button></header>
    <section className="bucket-overview" aria-label="Bucket List overview"><div className="bucket-feature">{featured ? <Link to={pathFor(featured)}><LibraryCover item={featured} config={config} configKey="bucket" compact className="bucket-feature-cover" /><span className="bucket-feature-copy"><small>{isComplete(featured) ? "A MEMORY MADE" : featured.status === "In progress" ? "IN MOTION" : "ONE DAY, MADE REAL"}</small><strong>{featured.title}</strong><span>{featured.properties?.location || featured.category || "An experience with a place in your story"}</span><b>Open experience <NavigationIcon name="chevron" size={15} /></b></span></Link> : <div className="bucket-feature-empty"><NavigationIcon name="sun" size={32} /><span><small>THE FIRST POSSIBILITY</small><strong>Put a meaningful experience on the horizon.</strong><button type="button" onClick={openCreate}>Begin your list <NavigationIcon name="chevron" size={14} /></button></span></div>}</div><div className="bucket-overview-context"><span className="eyebrow">YOUR EXPERIENCE LEDGER</span><div><strong>{items?.length ?? "—"}</strong><span>aspirations recorded</span></div><div><strong>{items ? moving.length : "—"}</strong><span>in motion</span></div><div><strong>{items ? completed.length : "—"}</strong><span>memories made</span></div></div></section>
    <div className="bucket-section-head"><div><span className="eyebrow">THE LIFE LIST</span><h2>What lies ahead</h2></div><p>Give every ambition a place to grow, then remember how it happened.</p></div>
    <nav className="bucket-tabs" aria-label="Experience status">{tabs.map(([key,label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setParam("view",key)}>{label}<span>{items ? key === "completed" ? completed.length : key === "in-progress" ? moving.length : key === "not-started" ? planned.length : items.length : "—"}</span></button>)}</nav>
    <div className="bucket-tools"><label className="bucket-search"><NavigationIcon name="search" size={17} /><input aria-label="Search Bucket List" type="search" placeholder="Find a place, goal or experience" value={query} onChange={event => setParam("q",event.target.value)} /></label><label><span className="sr-only">Category</span><select value={category} onChange={event => setParam("category",event.target.value)}><option value="all">Every category</option>{config.categoryOptions.map(value => <option key={value}>{value}</option>)}</select></label><label><span className="sr-only">Sort experiences</span><select value={sort} onChange={event => setParam("sort",event.target.value)}><option value="recent">Recently updated</option><option value="target">Upcoming target</option><option value="priority">Highest priority</option></select></label></div>
    {result.error && <div className="inline-error" role="alert"><span>{items ? "Your saved experiences remain visible. " : "Your Bucket List could not be opened. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {ordered === null ? <p className="bucket-pending" role="status">Your experiences will appear here as they become available.</p> : ordered.length ? <div className="bucket-records" aria-label="Bucket List records">{ordered.map(item => <ExperienceCard key={item.id} item={item} />)}</div> : <section className="bucket-empty"><NavigationIcon name={items?.length ? "search" : "sun"} size={27} /><span className="eyebrow">{items?.length ? "A CLEAR FILTER" : "THE LIST BEGINS WITH ONE"}</span><h2>{items?.length ? "Nothing matches this view." : "What do you want to make possible?"}</h2><p>{items?.length ? "Try another category or status to see more of your experiences." : "A destination, an achievement, or a moment with someone important. Start with the one that comes to mind."}</p><button type="button" className="btn-outline" onClick={items?.length ? () => setParams(new URLSearchParams(), { replace:true }) : openCreate}>{items?.length ? "See every experience" : "Add your first experience"}</button></section>}
    <dialog ref={dialog} className="bucket-create-dialog" aria-labelledby="bucket-create-title" onCancel={event => { event.preventDefault(); closeCreate(); }} onClick={event => { if (event.target === event.currentTarget) closeCreate(); }}><form onSubmit={createRecord} noValidate><header><div><span className="eyebrow">ADD TO YOUR LIFE LIST</span><h2 id="bucket-create-title">Make room for possibility.</h2><p>Start with the experience. The rest can grow with your plans.</p></div><button type="button" aria-label="Close" disabled={busy} onClick={closeCreate}><NavigationIcon name="close" size={18} /></button></header><div className="bucket-create-body"><div className="bucket-create-fields"><label><span>Experience <b aria-hidden="true">*</b></span><input ref={titleInput} value={title} onChange={event => { setTitle(event.target.value); setError(""); }} maxLength={191} required disabled={busy || Boolean(created)} placeholder="What do you want to experience?" /></label><label><span>Kind of experience</span><select value={type} onChange={event => setType(event.target.value)} disabled={busy || Boolean(created)}>{config.categoryOptions.map(value => <option key={value}>{value}</option>)}</select></label><div className="bucket-create-pair"><label><span>Where <small>optional</small></span><input value={location} onChange={event => setLocation(event.target.value)} maxLength={500} disabled={busy || Boolean(created)} placeholder="City, country or setting" /></label><label><span>Target date <small>optional</small></span><input type="date" value={targetDate} onChange={event => setTargetDate(event.target.value)} disabled={busy || Boolean(created)} /></label></div><label><span>Priority</span><select value={priority} onChange={event => setPriority(event.target.value)} disabled={busy || Boolean(created)}><option>High</option><option>Medium</option><option>Low</option></select></label></div><div className="bucket-create-media"><div className="bucket-create-cover">{coverPreview ? <img src={coverPreview} alt="Selected experience cover preview" /> : <span><NavigationIcon name="image" size={28} /><strong>Give it a face.</strong><small>An image makes the aspiration easier to return to.</small></span>}</div><input ref={fileInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/avif" onChange={chooseCover} disabled={busy} /><div><button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>{cover ? "Replace image" : "Choose image"}</button>{cover && <button type="button" onClick={() => setCover(null)} disabled={busy}>Remove</button>}</div>{cover && <small>{cover.name}</small>}</div></div>{error && <p role="alert" className="bucket-create-error">{error}</p>}{created && <p role="status" className="bucket-create-saved">This experience is saved. You can retry its image or open the record now.</p>}<footer><span>{busy ? created ? "Adding the image…" : "Saving your experience…" : "Private to your Library"}</span><div>{created && <button type="button" className="bucket-create-open" onClick={() => openRecord()}>Open saved record</button>}<button className="btn-primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : created ? cover ? "Retry image" : "Open record" : "Create & continue"}<NavigationIcon name="chevron" size={15} /></button></div></footer></form></dialog>
  </div>;
}
