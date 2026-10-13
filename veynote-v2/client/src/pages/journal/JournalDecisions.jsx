import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { entryDayDate, journalExcerpt } from "./journalUtils";
import { useJournalEntries } from "./useJournalEntries";
import "./journalDecisions.css";

const STATUSES = ["All", "Considering", "Decided", "In progress", "Reviewed"];
const createPath = "/journal/new?template=decision-journal&tag=Journal%3ADecision";
const dateKey = value => value ? String(value).slice(0, 10) : "";

function statusOf(entry) {
  return entry.journalData?.status || "Considering";
}

function reviewState(entry, today) {
  const reviewDate = dateKey(entry.journalData?.reviewDate);
  if (!reviewDate || statusOf(entry) === "Reviewed") return null;
  return reviewDate < today ? "overdue" : reviewDate === today ? "today" : "scheduled";
}

function DecisionRow({ entry, today }) {
  const context = entry.journalData || {};
  const review = reviewState(entry, today);
  const confidence = Number.isFinite(Number(context.confidence)) ? Number(context.confidence) : null;
  return <Link className="decision-record" to={`/journal/entries/${entry.id}`}>
    <span className="decision-record-date">
      <strong>{entryDayDate(entry.entryDate || entry.createdAt).getDate()}</strong>
      <small>{entryDayDate(entry.entryDate || entry.createdAt).toLocaleDateString(undefined, { month:"short", year:"2-digit" })}</small>
    </span>
    <span className="decision-record-copy">
      <span className="decision-record-overline"><b data-status={statusOf(entry)}>{statusOf(entry)}</b>{context.selectedOption && <small>Selected · {context.selectedOption}</small>}</span>
      <strong>{entry.title || "Untitled decision"}</strong>
      <p>{journalExcerpt(entry).slice(0, 170) || "Open the record to review its context, alternatives, reasoning, and evidence."}</p>
    </span>
    <span className="decision-record-evidence">
      <span><small>Confidence</small><strong>{confidence === null ? "—" : `${confidence}%`}</strong></span>
      <span className={review ? `is-${review}` : ""}><small>Review</small><strong>{context.reviewDate ? new Date(`${dateKey(context.reviewDate)}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "Not set"}</strong></span>
    </span>
    <NavigationIcon name="chevron" size={16} />
  </Link>;
}

export default function JournalDecisions() {
  const { entries, error, refresh } = useJournalEntries({ type:"decision" });
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const decisions = useMemo(() => [...(entries || [])].sort((a,b) => new Date(b.entryDate || b.updatedAt) - new Date(a.entryDate || a.updatedAt)), [entries]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return decisions.filter(entry => (status === "All" || statusOf(entry) === status) && (!needle || `${entry.title || ""} ${journalExcerpt(entry)} ${entry.journalData?.selectedOption || ""}`.toLowerCase().includes(needle)));
  }, [decisions, query, status]);
  const confidence = decisions.map(entry => Number(entry.journalData?.confidence)).filter(Number.isFinite);
  const avgConfidence = confidence.length ? Math.round(confidence.reduce((sum,value) => sum + value, 0) / confidence.length) : null;
  const due = decisions.filter(entry => ["overdue","today"].includes(reviewState(entry,today))).length;
  const open = decisions.filter(entry => !["Reviewed"].includes(statusOf(entry))).length;
  const reviewed = decisions.filter(entry => statusOf(entry) === "Reviewed").length;

  return <main className="journal-page journal-decisions">
    <header className="decision-hero">
      <div><span className="eyebrow">DECISION PROVENANCE</span><h1>Preserve the reasoning before the outcome changes the story.</h1><p>A disciplined record of context, alternatives, confidence, commitment, and later evidence. Every decision keeps its original writing and revision history.</p></div>
      <Link className="btn-primary" to={createPath}><NavigationIcon name="plus" size={16}/> Record a decision</Link>
    </header>

    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={refresh}>Retry</button></div>}

    <section className="decision-briefing" aria-label="Decision portfolio summary">
      <div className="decision-briefing-lead"><span className="eyebrow">DECISION PORTFOLIO</span><strong>{entries === null ? "—" : decisions.length}</strong><p>durable records with their contemporary reasoning intact.</p></div>
      <div><span>Open loops</span><strong>{entries === null ? "—" : open}</strong><small>considering, decided, or in progress</small></div>
      <div className={due ? "has-attention" : ""}><span>Review attention</span><strong>{entries === null ? "—" : due}</strong><small>due today or overdue</small></div>
      <div><span>Avg. confidence</span><strong>{avgConfidence === null ? "—" : `${avgConfidence}%`}</strong><small>stated before the outcome</small></div>
      <div><span>Reviewed</span><strong>{entries === null ? "—" : reviewed}</strong><small>outcomes examined</small></div>
    </section>

    <section className="decision-method" aria-labelledby="decision-method-title">
      <div><span className="eyebrow">A BETTER RECORD</span><h2 id="decision-method-title">Judge process separately from luck.</h2><p>Good outcomes can follow weak reasoning, and strong decisions can still produce poor outcomes. Veynote preserves both sides.</p><Link to="/journal/calibration">Open confidence calibration <NavigationIcon name="chevron" size={14}/></Link></div>
      <ol>{[
        ["01","Frame","Context, constraints, and the question that must be answered."],
        ["02","Compare","Options, assumptions, evidence, and risks considered."],
        ["03","Commit","Selected path, confidence, owner, and expected result."],
        ["04","Review","Actual outcome, surprise, lesson, and future adjustment."],
      ].map(([index,label,copy]) => <li key={label}><span>{index}</span><strong>{label}</strong><small>{copy}</small></li>)}</ol>
    </section>

    <section className="decision-ledger">
      <header><div><span className="eyebrow">AUDITABLE HISTORY</span><h2>Decision ledger</h2></div><span>{filtered.length} shown</span></header>
      <div className="decision-toolbar">
        <label><NavigationIcon name="search" size={16}/><input aria-label="Search decisions" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search decisions, reasoning or selected option"/></label>
        <div role="group" aria-label="Decision status">{STATUSES.map(value => <button type="button" key={value} aria-pressed={status === value} onClick={()=>setStatus(value)}>{value}</button>)}</div>
      </div>
      {entries === null ? <div className="decision-loading" role="status"><span/><span/><span/></div> : filtered.length ? <div className="decision-records">{filtered.map(entry => <DecisionRow entry={entry} today={today} key={entry.id}/>)}</div> : decisions.length ? <div className="decision-empty"><NavigationIcon name="filter" size={22}/><h3>No decisions match this view.</h3><p>Clear the search or choose another status without changing the underlying record.</p><button type="button" className="btn-outline" onClick={()=>{setQuery("");setStatus("All");}}>Clear filters</button></div> : <div className="decision-empty is-first"><NavigationIcon name="tasks" size={26}/><h3>Record the reasoning while it is still honest.</h3><p>Capture the options, evidence, assumptions, risks, confidence, and review date before the outcome is known.</p><Link className="btn-primary" to={createPath}>Create the first decision</Link></div>}
    </section>

    <aside className="decision-integrity"><NavigationIcon name="shield" size={18}/><div><strong>Original reasoning remains recoverable.</strong><p>Later updates belong in the outcome and review. Version history preserves what you knew and believed when the decision was made.</p></div></aside>
  </main>;
}
