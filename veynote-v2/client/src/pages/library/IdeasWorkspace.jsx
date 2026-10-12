import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import { useApiQuery } from "../../hooks/useApiQuery";
import "./ideasWorkspace.css";

const config = LIBRARY_CONFIG.ideas;
const stages = ["New", "Exploring", "In progress", "Archived"];
const dateOf = item => new Date(item.updatedAt || item.createdAt || 0).getTime() || 0;
const excerpt = (text, limit = 170) => text?.trim().length > limit ? `${text.trim().slice(0, limit).trimEnd()}…` : text?.trim();
const pathFor = item => `/notes/library/ideas/${item.id}`;

function IdeaRow({ item, index }) {
  const summary = excerpt(item.properties?.summary || item.notes);
  return <Link className="ideas-row" to={pathFor(item)}>
    <span className="ideas-row-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
    <span className="ideas-row-main"><span className="ideas-row-meta">{item.category || "Unsorted idea"}{item.priority === "High" && <b>Priority</b>}</span><strong>{item.title}</strong><span className="ideas-row-summary">{summary || "Open the record to develop the thought behind this idea."}</span></span>
    <span className="ideas-row-progress"><small>{item.status || "New"}</small><span>{item.properties?.nextStep ? `Next · ${excerpt(item.properties.nextStep, 68)}` : item.properties?.source ? `From · ${excerpt(item.properties.source, 68)}` : "Add a next step"}</span></span>
    <NavigationIcon name="chevron" size={17} />
  </Link>;
}

export default function IdeasWorkspace() {
  const navigate = useNavigate();
  const query = useApiQuery("/library/ideas");
  const all = query.data?.items ?? null;
  const [params, setParams] = useSearchParams();
  const stage = stages.includes(params.get("stage")) ? params.get("stage") : "All";
  const category = config.categoryOptions.includes(params.get("category")) ? params.get("category") : "All categories";
  const search = params.get("q") || "";
  const sort = ["recent", "title", "priority"].includes(params.get("sort")) ? params.get("sort") : "recent";
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [captureCategory, setCaptureCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const dialog = useRef(null);
  const titleInput = useRef(null);

  const items = useMemo(() => {
    if (!all) return null;
    const needle = search.trim().toLocaleLowerCase();
    return all.filter(item => {
      if (stage !== "All" && item.status !== stage) return false;
      if (category !== "All categories" && item.category !== category) return false;
      if (needle && ![item.title, item.category, item.status, item.properties?.summary, item.properties?.nextStep, item.properties?.source, item.notes].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle)) return false;
      return true;
    }).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "priority" ? ({ High: 3, Medium: 2, Low: 1 }[b.priority] || 0) - ({ High: 3, Medium: 2, Low: 1 }[a.priority] || 0) || dateOf(b) - dateOf(a) : dateOf(b) - dateOf(a));
  }, [all, stage, category, search, sort]);
  const focus = all?.find(item => item.status === "Exploring" || item.status === "In progress") || all?.[0];
  const count = value => all ? all.filter(item => item.status === value).length : "—";
  const filtered = Boolean(search.trim() || stage !== "All" || category !== "All categories");

  function setParam(key, value) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (!value || value === "All" || value === "All categories" || value === "recent") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }
  function openCreate() { setTitle(""); setSummary(""); setCaptureCategory(""); setError(""); setCreating(true); }
  function closeCreate() { if (!busy) setCreating(false); }
  useEffect(() => {
    if (params.get("new") !== "1") return;
    openCreate();
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("new"); return next; }, { replace: true });
  }, [params, setParams]);
  useEffect(() => {
    if (creating && !dialog.current?.open) { dialog.current?.showModal(); titleInput.current?.focus(); }
    if (!creating && dialog.current?.open) dialog.current.close();
  }, [creating]);
  async function createIdea(event) {
    event.preventDefault();
    if (!title.trim() || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const { item } = await api.post("/library/ideas", { title: title.trim(), summary: summary.trim() || null, category: captureCategory || null, status: "New" });
      setCreating(false);
      navigate(`${pathFor(item)}?edit=1`);
    } catch (failure) { setError(failure.message || "Your idea could not be saved. Try again."); }
    finally { setBusy(false); inFlight.current = false; }
  }

  return <main className="ideas-workspace">
    <header className="ideas-header product-page-header"><div><span className="eyebrow">THE THINKING COLLECTION</span><h1 className="page-title">Ideas <em>Keep the spark.</em></h1><p>Capture an early thought, trace where it came from, and give its next useful step a place to grow.</p></div><button className="btn-primary" type="button" onClick={openCreate}><NavigationIcon name="plus" size={17} /> Capture an idea</button></header>

    <section className="ideas-overview" aria-label="Idea overview">
      <div className="ideas-focus">{focus ? <Link to={pathFor(focus)}><span className="eyebrow">A THOUGHT IN FOCUS</span><span className="ideas-focus-category">{focus.category || "Unsorted idea"} · {focus.status || "New"}</span><strong>{focus.title}</strong><p>{excerpt(focus.properties?.summary || focus.notes, 230) || "Give this idea more shape as your thinking develops."}</p><span className="ideas-focus-next">{focus.properties?.nextStep ? `NEXT MOVE · ${excerpt(focus.properties.nextStep, 100)}` : "OPEN AND DEVELOP THE IDEA"} <NavigationIcon name="chevron" size={16} /></span></Link> : <div><span className="eyebrow">THE FIRST IDEA</span><strong>Give an idea room to become something.</strong><p>Start with a title and a thought. The rest can become clearer over time.</p><button type="button" onClick={openCreate}>Capture your first idea <NavigationIcon name="chevron" size={16} /></button></div>}</div>
      <div className="ideas-journey"><span className="eyebrow">FROM THOUGHT TO ACTION</span><p>Keep each idea moving at its own pace.</p><div className="ideas-journey-stages"><div><strong>{all?.length ?? "—"}</strong><span>captured</span></div><div><strong>{count("Exploring")}</strong><span>exploring</span></div><div><strong>{count("In progress")}</strong><span>in progress</span></div></div></div>
    </section>

    <section className="ideas-collection" aria-label="Saved ideas"><div className="ideas-section-head"><div><span className="eyebrow">YOUR THINKING</span><h2>The idea ledger</h2></div><p>Return to the thoughts that merit another look.</p></div>
      <nav className="ideas-stages" aria-label="Idea stages"><button type="button" aria-current={stage === "All" ? "page" : undefined} onClick={() => setParam("stage", "All")}>All ideas <span>{all?.length ?? "—"}</span></button>{stages.map(value => <button type="button" key={value} aria-current={stage === value ? "page" : undefined} onClick={() => setParam("stage", value)}>{value} <span>{count(value)}</span></button>)}</nav>
      <div className="ideas-tools"><label className="ideas-search"><NavigationIcon name="search" size={18} /><input type="search" aria-label="Search ideas" placeholder="Search thoughts, sources or next steps" value={search} onChange={event => setParam("q", event.target.value)} /></label><label><span className="sr-only">Filter idea category</span><select aria-label="Filter idea category" value={category} onChange={event => setParam("category", event.target.value)}><option>All categories</option>{config.categoryOptions.map(option => <option key={option}>{option}</option>)}</select></label><label><span className="sr-only">Sort ideas</span><select aria-label="Sort ideas" value={sort} onChange={event => setParam("sort", event.target.value)}><option value="recent">Recently updated</option><option value="title">Title A–Z</option><option value="priority">Priority first</option></select></label></div>
      {query.error && <div className="ideas-error inline-error" role="alert"><span>{all ? "Saved ideas remain visible. " : "Your ideas could not be loaded. "}{query.error.message}</span><button type="button" onClick={() => query.refresh().catch(() => {})}>Retry</button></div>}
      {items === null ? !query.error && <p className="ideas-pending" role="status">Opening your idea collection…</p> : items.length ? <div className="ideas-ledger">{items.map((item, index) => <IdeaRow item={item} index={index} key={item.id} />)}</div> : <div className="ideas-empty"><NavigationIcon name={filtered ? "search" : "note"} size={31} /><span className="eyebrow">{filtered ? "NO MATCHING IDEAS" : "THE NEXT IDEA STARTS HERE"}</span><h2>{filtered ? "Nothing in this view yet." : "Good thinking deserves to be kept."}</h2><p>{filtered ? "Adjust your search or filters to see your saved ideas." : "Capture a thought before it disappears. You can organize and develop it later."}</p>{filtered ? <button className="btn-outline" type="button" onClick={() => setParams(previous => { const next = new URLSearchParams(previous); for (const key of ["q", "stage", "category"]) next.delete(key); return next; }, { replace: true })}>Show all ideas</button> : <button className="btn-primary" type="button" onClick={openCreate}>Capture an idea</button>}</div>}
    </section>

    <dialog className="ideas-dialog" ref={dialog} aria-labelledby="ideas-dialog-title" onCancel={event => { event.preventDefault(); closeCreate(); }} onClick={event => { if (event.target === event.currentTarget) closeCreate(); }}><form onSubmit={createIdea}><header><div><span className="eyebrow">QUICK CAPTURE · IDEAS</span><h2 id="ideas-dialog-title">Start with the thought.</h2><p>Save the spark now. Develop its source, next step and outcome in the record.</p></div><button type="button" aria-label="Close" onClick={closeCreate} disabled={busy}><NavigationIcon name="close" size={18} /></button></header><div className="ideas-dialog-body"><label><span>What is the idea? <b aria-hidden="true">*</b></span><input ref={titleInput} value={title} onChange={event => setTitle(event.target.value)} maxLength={191} placeholder="Give the thought a useful name" required disabled={busy} /></label><label><span>The thought behind it <small>optional</small></span><textarea value={summary} onChange={event => setSummary(event.target.value)} maxLength={15000} placeholder="A sentence or two is enough to remember why it matters." rows={4} disabled={busy} /></label><label><span>Where does it belong? <small>optional</small></span><select value={captureCategory} onChange={event => setCaptureCategory(event.target.value)} disabled={busy}><option value="">Decide later</option>{config.categoryOptions.map(option => <option key={option}>{option}</option>)}</select></label></div>{error && <p className="ideas-dialog-error" role="alert">{error}</p>}<footer><span>Private to your Library. Continue developing after capture.</span><button type="submit" className="btn-primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : "Save & develop"}<NavigationIcon name="chevron" size={16} /></button></footer></form></dialog>
  </main>;
}
