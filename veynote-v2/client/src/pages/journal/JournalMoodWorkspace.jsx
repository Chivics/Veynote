import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { entryDayDate, journalExcerpt, MOODS } from "./journalUtils";
import { useJournalEntries } from "./useJournalEntries";
import "./journalPracticeWorkspace.css";

const createPath = "/journal/new?template=mood-check-in&tag=Journal%3AMood";

export default function JournalMoodWorkspace() {
  const { entries, error, refresh } = useJournalEntries({ type:"mood" });
  const ordered = entries && [...entries].sort((a,b) => new Date(b.entryDate || b.updatedAt) - new Date(a.entryDate || a.updatedAt));
  const distribution = (ordered || []).reduce((map, entry) => {
    const key = entry.mood || "unlabelled";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
  const peak = Math.max(1, ...Object.values(distribution));
  const withIntensity = (ordered || []).filter(entry => Number(entry.journalData?.intensity));
  const withEnergy = (ordered || []).filter(entry => Number(entry.journalData?.energy));
  const average = (items, key) => items.length ? (items.reduce((sum,item)=>sum + Number(item.journalData[key]),0) / items.length).toFixed(1) : "—";
  return <main className="journal-page journal-practice-workspace">
    <header className="product-page-header journal-practice-header">
      <div><span className="eyebrow">MOOD & ENERGY</span><h1 className="page-title">Emotional context, without diagnosis.</h1><p>Record intensity, contributing events, and what helped. Veynote reflects only what you choose to document.</p></div>
      <Link className="btn-primary" to={createPath}><NavigationIcon name="plus" size={16} /> New check-in</Link>
    </header>
    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={refresh}>Retry</button></div>}
    <section className="journal-mood-composition">
      <div className="journal-mood-summary"><span className="eyebrow">RECORDED CONTEXT</span><strong>{entries === null ? "—" : ordered.length}</strong><p>check-ins preserved with their original date, writing, mood label, and document history.</p><div className="journal-mood-averages"><span><b>{average(withIntensity,"intensity")}</b><small>average intensity</small></span><span><b>{average(withEnergy,"energy")}</b><small>average energy</small></span></div><Link to="/journal/insights">Open longer-term insights <NavigationIcon name="chevron" size={14} /></Link></div>
      <div className="journal-mood-distribution" aria-label="Mood distribution">
        <header><span>Distribution</span><small>{ordered?.length || 0} record sample</small></header>
        {Object.keys(distribution).length ? Object.entries(distribution).sort((a,b)=>b[1]-a[1]).map(([key,count]) => <div key={key}><span>{MOODS[key]?.symbol || "○"}</span><strong>{MOODS[key]?.label || "Unlabelled"}</strong><i><b style={{ width:`${count / peak * 100}%` }} /></i><small>{count}</small></div>) : <p>{entries === null ? "Checking your history…" : "Your first check-in will establish the baseline."}</p>}
      </div>
    </section>
    <section className="journal-practice-history">
      <div className="section-heading"><div><span className="eyebrow">HISTORY IN CONTEXT</span><h2>Check-ins and contributing events</h2></div><Link to="/journal/timeline">Full timeline</Link></div>
      {ordered?.length ? <div className="journal-practice-list">{ordered.map(entry => <Link key={entry.id} to={`/journal/entries/${entry.id}`}><span className="journal-practice-symbol">{MOODS[entry.mood]?.symbol || "○"}</span><span><small>{entryDayDate(entry.entryDate || entry.updatedAt).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</small><strong>{entry.title || "Mood check-in"}</strong><p>{journalExcerpt(entry).slice(0,170) || "Open the original check-in."}</p></span><NavigationIcon name="chevron" size={16} /></Link>)}</div> : entries === null ? <div className="journal-review-pending"><span /><span /><span /></div> : <div className="journal-practice-empty"><NavigationIcon name="sun" size={27} /><h2>Record the first point of context.</h2><p>A mood label is optional. The writing, events, and support you record around it remain the useful evidence.</p><Link className="btn-primary" to={createPath}>Begin a check-in</Link></div>}
    </section>
    <aside className="journal-practice-method"><NavigationIcon name="shield" size={18} /><div><strong>Private, descriptive, and yours.</strong><p>This workspace summarizes your own entries. It does not diagnose mental health or infer causes you did not record.</p></div></aside>
  </main>;
}
