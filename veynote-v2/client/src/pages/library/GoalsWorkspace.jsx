import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import LibraryCover from "../../components/library/LibraryCover.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import { useApiQuery } from "../../hooks/useApiQuery";
import "./goalsWorkspace.css";

const config = LIBRARY_CONFIG.goals;
const collectionPath = `/library/${config.key.toLowerCase()}`;
const recordPath = item => `/notes/library/goals/${item.id}`;
const tabs = [["all", "All goals"], ["in-progress", "In progress"], ["not-started", "Not started"], ["on-hold", "On hold"], ["completed", "Completed"]];
const priorityRank = { High: 0, Medium: 1, Low: 2 };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function progressOf(item) {
  const raw = item.properties?.progress;
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(Number(raw))) return null;
  return Math.max(0, Math.min(100, Number(raw)));
}

function targetOf(item) {
  const value = item.properties?.target;
  return typeof value === "string" && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) ? value : null;
}

function dateLabel(value) {
  return value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "";
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function targetPhrase(value, today) {
  if (!value) return "No target date";
  if (value < today) return `Past target · ${dateLabel(value)}`;
  if (value === today) return "Due today";
  return `Target ${dateLabel(value)}`;
}

function GoalProgress({ item, compact = false }) {
  const progress = progressOf(item);
  return <div className={`goals-progress${compact ? " is-compact" : ""}`}>
    <div><span>Progress</span><strong>{progress === null ? "Not recorded" : `${progress}%`}</strong></div>
    <div className="goals-progress-track" role="progressbar" aria-label={`${item.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} aria-valuetext={progress === null ? "Not recorded" : `${progress}%`}><span style={{ width: `${progress ?? 0}%` }} /></div>
  </div>;
}

function GoalCard({ item, today }) {
  const target = targetOf(item);
  const isPast = target && target < today && item.status !== "Completed";
  return <Link to={recordPath(item)} className="goals-card">
    <span className="goals-card-top"><span className="goals-card-icon"><NavigationIcon name="heart" size={20} /></span><span className={`goals-card-priority${item.priority === "High" ? " is-high" : ""}`}>{item.priority ? `${item.priority} priority` : "Priority not set"}</span><NavigationIcon name="chevron" size={17} /></span>
    <span className="goals-card-category">{item.category || "Life goal"}</span>
    <strong className="goals-card-title">{item.title}</strong>
    <span className="goals-card-status">{item.status || "Status not set"}</span>
    <GoalProgress item={item} compact />
    <span className={`goals-card-target${isPast ? " is-past" : ""}`}><NavigationIcon name="calendar" size={15} />{targetPhrase(target, today)}</span>
  </Link>;
}

export default function GoalsWorkspace() {
  const navigate = useNavigate();
  const result = useApiQuery(collectionPath);
  const items = result.data?.items ?? null;
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("view");
  const view = tabs.some(([key]) => key === requestedView) ? requestedView : "all";
  const query = params.get("q") || "";
  const sort = ["recent", "target", "priority", "progress"].includes(params.get("sort")) ? params.get("sort") : "recent";
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("Personal");
  const [priorityDraft, setPriorityDraft] = useState("Medium");
  const [targetDraft, setTargetDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const dialog = useRef(null);
  const titleInput = useRef(null);
  const inFlight = useRef(false);
  const today = todayKey();

  const categories = useMemo(() => {
    const saved = (items || []).map(item => item.category).filter(Boolean);
    return [...new Set([...config.categoryOptions, ...saved])];
  }, [items]);
  const category = categories.includes(params.get("category")) ? params.get("category") : "all";

  useEffect(() => {
    if (params.get("new") !== "1") return;
    openCreate();
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("new"); return next; }, { replace: true });
  }, [params, setParams]);
  useEffect(() => {
    const node = dialog.current;
    if (creating && !node?.open) node?.showModal();
    if (!creating && node?.open) node.close();
  }, [creating]);
  useEffect(() => { if (creating) titleInput.current?.focus(); }, [creating]);

  function setParam(key, value) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (!value || value === "all" || value === "recent") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }
  function openCreate() {
    setTitle(""); setCategoryDraft("Personal"); setPriorityDraft("Medium"); setTargetDraft(""); setCreateError(""); setCreating(true);
  }
  function closeCreate() { if (!busy) setCreating(false); }
  async function createGoal(event) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!title.trim()) { setCreateError("Give your goal a name first."); titleInput.current?.focus(); return; }
    inFlight.current = true; setBusy(true); setCreateError("");
    try {
      const { item } = await api.post(collectionPath, { title: title.trim(), category: categoryDraft, priority: priorityDraft, status: "Not started", ...(targetDraft ? { target: targetDraft } : {}) });
      setCreating(false);
      navigate(`${recordPath(item)}?edit=1`);
    } catch (error) { setCreateError(error.message || "This goal could not be saved."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const active = items?.filter(item => item.status !== "Completed" && item.status !== "On hold") || [];
  const inProgress = items?.filter(item => item.status === "In progress") || [];
  const completed = items?.filter(item => item.status === "Completed") || [];
  const paused = items?.filter(item => item.status === "On hold") || [];
  const notStarted = items?.filter(item => item.status === "Not started") || [];
  const tracked = active.map(progressOf).filter(value => value !== null);
  const averageProgress = tracked.length ? Math.round(tracked.reduce((sum, value) => sum + value, 0) / tracked.length) : null;
  const pendingTargets = active.filter(targetOf).sort((a, b) => targetOf(a).localeCompare(targetOf(b)));
  const overdue = pendingTargets.filter(item => targetOf(item) < today);
  const focus = [...inProgress, ...active.filter(item => item.status !== "In progress")].sort((a, b) => {
    const statusDelta = Number(b.status === "In progress") - Number(a.status === "In progress");
    if (statusDelta) return statusDelta;
    const targetDelta = (targetOf(a) || "9999").localeCompare(targetOf(b) || "9999");
    return targetDelta || (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3);
  })[0] || paused[0] || completed[0];

  const ordered = useMemo(() => {
    if (!items) return null;
    const needle = query.trim().toLocaleLowerCase();
    return items.filter(item => {
      if (view === "in-progress" && item.status !== "In progress") return false;
      if (view === "not-started" && item.status !== "Not started") return false;
      if (view === "on-hold" && item.status !== "On hold") return false;
      if (view === "completed" && item.status !== "Completed") return false;
      if (category !== "all" && item.category !== category) return false;
      return !needle || `${item.title} ${item.category || ""} ${item.notes || ""}`.toLocaleLowerCase().includes(needle);
    }).sort((a, b) => {
      if (sort === "target") return (targetOf(a) || "9999").localeCompare(targetOf(b) || "9999") || a.title.localeCompare(b.title);
      if (sort === "priority") return (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3) || a.title.localeCompare(b.title);
      if (sort === "progress") return (progressOf(b) ?? -1) - (progressOf(a) ?? -1) || a.title.localeCompare(b.title);
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
  }, [items, query, view, category, sort]);

  const countFor = key => !items ? "—" : key === "in-progress" ? inProgress.length : key === "not-started" ? notStarted.length : key === "on-hold" ? paused.length : key === "completed" ? completed.length : items.length;

  return <div className="goals-workspace">
    <header className="goals-header product-page-header"><div><span className="eyebrow">LIBRARY / LIFE GOALS</span><h1 className="page-title">Make room for <em>becoming.</em></h1><p>Keep the outcomes that matter in view. Give each goal a direction, a target, and progress you can return to.</p></div><button type="button" className="btn-primary" onClick={openCreate}><NavigationIcon name="plus" size={17} /> Add a goal</button></header>

    <section className="goals-overview" aria-label="Life Goals overview"><div className="goals-feature">
      {items === null ? <div className="goals-feature-pending" role="status"><NavigationIcon name="heart" size={28} /><span>{result.error ? "Your goals are unavailable right now." : "Opening your goals…"}</span></div> : focus ? <Link to={recordPath(focus)} className="goals-feature-link"><LibraryCover item={focus} config={config} configKey="goals" compact className="goals-feature-cover" /><div className="goals-feature-content"><small>{focus.status === "Completed" ? "A GOAL REACHED" : focus.status === "On hold" ? "READY WHEN YOU ARE" : focus.status === "In progress" ? "CURRENTLY IN MOTION" : "A DIRECTION TO BEGIN"}</small><strong>{focus.title}</strong><span>{focus.category || "Life goal"}{focus.priority ? ` · ${focus.priority} priority` : ""}</span><GoalProgress item={focus} /><b>Open goal <NavigationIcon name="chevron" size={16} /></b></div></Link> : <div className="goals-feature-empty"><span className="goals-feature-symbol"><NavigationIcon name="heart" size={27} /></span><span className="eyebrow">THE FIRST DIRECTION</span><strong>One meaningful goal is enough to begin.</strong><p>Start with an outcome you want to work toward. You can shape the details as you go.</p><button type="button" onClick={openCreate}>Create your first goal <NavigationIcon name="chevron" size={15} /></button></div>}
    </div><div className="goals-overview-stats"><span className="eyebrow">YOUR GOAL LANDSCAPE</span><div><strong>{items?.length ?? "—"}</strong><span>goals recorded</span></div><div><strong>{items ? inProgress.length : "—"}</strong><span>in progress</span></div><div><strong>{items ? completed.length : "—"}</strong><span>completed</span></div><div className="goals-overview-average"><strong>{items ? averageProgress === null ? "—" : `${averageProgress}%` : "—"}</strong><span>average active progress{items && tracked.length ? ` · ${tracked.length} tracked` : ""}</span></div></div></section>

    {active.length > 0 && <section className="goals-review" aria-label="Goal review"><div className="goals-review-heading"><div><span className="eyebrow">A MOMENT TO REVIEW</span><h2>Keep the next step visible.</h2></div><p>{overdue.length ? `${overdue.length} open ${overdue.length === 1 ? "goal has" : "goals have"} passed its target date.` : pendingTargets.length ? "Your nearest target dates are here when you plan your next move." : "Add a target date to give your active goals a time horizon."}</p></div><div className="goals-review-grid"><div className="goals-review-progress"><span className="eyebrow">PROGRESS RECORDED</span><strong>{averageProgress === null ? "—" : `${averageProgress}%`}</strong><div className="goals-progress-track" role="progressbar" aria-label="Average active goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={averageProgress ?? 0} aria-valuetext={averageProgress === null ? "Not recorded" : `${averageProgress}%`}><span style={{ width: `${averageProgress ?? 0}%` }} /></div><p>{tracked.length ? `Across ${tracked.length} active ${tracked.length === 1 ? "goal" : "goals"} with progress recorded.` : "Open a goal to record how far you have come."}</p></div><div className="goals-review-targets"><span className="eyebrow">NEXT TARGETS</span>{pendingTargets.length ? <div>{pendingTargets.slice(0, 3).map(item => { const target = targetOf(item); return <Link key={item.id} to={recordPath(item)}><span><strong>{item.title}</strong><small>{item.category || item.status || "Life goal"}</small></span><span className={target < today ? "is-past" : ""}>{target < today ? `Past · ${dateLabel(target)}` : dateLabel(target)}<NavigationIcon name="chevron" size={14} /></span></Link>; })}</div> : <p>No active goals have a target date yet.</p>}</div></div></section>}

    <section className="goals-collection" aria-label="Your goals"><div className="goals-section-head"><div><span className="eyebrow">YOUR LIFE GOALS</span><h2>The goals you are growing</h2></div><p>Review the distance travelled and choose what to move forward.</p></div><nav className="goals-tabs" aria-label="Goal status">{tabs.map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setParam("view", key)}>{label}<span>{countFor(key)}</span></button>)}</nav><div className="goals-tools"><label className="goals-search"><NavigationIcon name="search" size={17} /><input type="search" aria-label="Search Life Goals" placeholder="Search goals and notes" value={query} onChange={event => setParam("q", event.target.value)} /></label><label><span className="sr-only">Goal category</span><select value={category} onChange={event => setParam("category", event.target.value)}><option value="all">Every category</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label><span className="sr-only">Sort goals</span><select value={sort} onChange={event => setParam("sort", event.target.value)}><option value="recent">Recently updated</option><option value="target">Nearest target</option><option value="priority">Highest priority</option><option value="progress">Most progress</option></select></label></div>
      {result.error && <div className="inline-error" role="alert"><span>{items ? "Your saved goals remain visible. " : "Your Life Goals could not be opened. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
      {ordered === null ? !result.error && <p className="goals-pending" role="status">Opening your goals…</p> : ordered.length ? <div className="goals-records">{ordered.map(item => <GoalCard key={item.id} item={item} today={today} />)}</div> : <div className="goals-empty"><NavigationIcon name={items?.length ? "search" : "heart"} size={28} /><span className="eyebrow">{items?.length ? "A CLEAR VIEW" : "BEGIN WITH A DIRECTION"}</span><h2>{items?.length ? "No goals match this view." : "What do you want to grow toward?"}</h2><p>{items?.length ? "Try another status, category, or search to find the goals you saved." : "Name one outcome that matters to you. The path can become clearer as you make progress."}</p><button type="button" className="btn-outline" onClick={items?.length ? () => setParams(new URLSearchParams(), { replace: true }) : openCreate}>{items?.length ? "See all goals" : "Add your first goal"}</button></div>}
    </section>

    <dialog ref={dialog} className="goals-create-dialog" aria-labelledby="goals-create-title" onCancel={event => { event.preventDefault(); closeCreate(); }} onClick={event => { if (event.target === event.currentTarget) closeCreate(); }}><form onSubmit={createGoal} noValidate><header><div><span className="eyebrow">A NEW LIFE GOAL</span><h2 id="goals-create-title">Start with the outcome.</h2><p>Name the goal now. You can add your reason and update progress in its record.</p></div><button type="button" aria-label="Close" disabled={busy} onClick={closeCreate}><NavigationIcon name="close" size={18} /></button></header><div className="goals-create-fields"><label className="goals-create-title"><span>What do you want to achieve? <b aria-hidden="true">*</b></span><input ref={titleInput} value={title} onChange={event => { setTitle(event.target.value); setCreateError(""); }} maxLength={191} required disabled={busy} placeholder="Write the outcome in your own words" /></label><div className="goals-create-options"><label><span>Life area</span><select value={categoryDraft} onChange={event => setCategoryDraft(event.target.value)} disabled={busy}>{config.categoryOptions.map(value => <option key={value}>{value}</option>)}</select></label><label><span>Priority</span><select value={priorityDraft} onChange={event => setPriorityDraft(event.target.value)} disabled={busy}>{config.priorityOptions.map(value => <option key={value}>{value}</option>)}</select></label><label><span>Target date <small>optional</small></span><input type="date" value={targetDraft} onChange={event => setTargetDraft(event.target.value)} disabled={busy} /></label></div></div>{createError && <p className="goals-create-error" role="alert">{createError}</p>}<footer><span><NavigationIcon name="lock" size={14} /> Private to your Library</span><button type="submit" className="btn-primary" disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create & continue"}<NavigationIcon name="chevron" size={16} /></button></footer></form></dialog>
  </div>;
}
