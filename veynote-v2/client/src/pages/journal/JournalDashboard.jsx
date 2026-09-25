import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { computeStreaks, dayKey, MOODS, stripHtml, useJournalEntries } from "./journalUtils";

const prompts = [
  "What felt important today, even if it looked small?",
  "What did today teach you about yourself?",
  "Which moment would you want to remember a year from now?",
  "What are you carrying into tomorrow?",
];

export default function JournalDashboard() {
  const { user } = useAuth();
  const { entries, error, refresh } = useJournalEntries();
  const prompt = prompts[new Date().getDate() % prompts.length];
  const today = entries?.find(entry => dayKey(entry.entryDate) === dayKey(new Date()));
  const streak = computeStreaks(entries || []);
  const recent = (entries || []).filter(entry => entry.id !== today?.id).slice(0, 4);
  const firstName = user?.name?.split(" ")[0] || "there";

  return <div className="journal-page journal-home">
    <header className="product-page-header journal-hero-header">
      <div><span className="eyebrow">PERSONAL JOURNAL</span><h1 className="page-title">A quieter place to notice.</h1><p>Record the day, preserve context, and see how your story changes over time.</p></div>
      <Link className="btn-primary" to="/journal/new"><NavigationIcon name="plus" size={16} /> New entry</Link>
    </header>

    {error && <div className="inline-error"><span>{error}</span><button onClick={refresh}>Retry</button></div>}
    <>
      <section className="journal-capture-stage">
        <div className="journal-date-rail"><span>{new Date().toLocaleDateString(undefined, { month: "short" })}</span><strong>{new Date().getDate()}</strong><small>{new Date().toLocaleDateString(undefined, { weekday: "long" })}</small></div>
        <div className="journal-capture-copy"><span className="eyebrow">{today ? "CONTINUE TODAY" : `GOOD ${new Date().getHours() < 12 ? "MORNING" : new Date().getHours() < 18 ? "AFTERNOON" : "EVENING"}, ${firstName.toUpperCase()}`}</span><h2>{today?.title || prompt}</h2><p>{today ? stripHtml(today.content).slice(0, 190) || "Your entry is ready for the rest of the story." : "Write without arranging everything first. Veynote will keep the date, mood, context, and history together."}</p><Link to={today ? `/journal/entries/${today.id}` : "/journal/new"}>{today ? "Continue writing" : "Begin today’s entry"} <NavigationIcon name="chevron" size={14} /></Link></div>
        <div className="journal-streak"><span>Continuity</span><strong>{entries === null ? "—" : streak.current}</strong><small>day{streak.current === 1 ? "" : "s"} current</small><i /><p>{entries === null ? "Checking your history…" : `${streak.longest} longest · ${streak.total} days recorded`}</p></div>
      </section>

      <section className="journal-overview-grid">
        <Link to="/journal/timeline" className="journal-overview-card"><span><NavigationIcon name="clock" size={19} /></span><div><small>YOUR HISTORY</small><h2>Timeline</h2><p>Return to moments in the order they happened.</p></div><NavigationIcon name="chevron" size={16} /></Link>
        <Link to="/journal/insights" className="journal-overview-card"><span><NavigationIcon name="chart" size={19} /></span><div><small>PATTERNS WITH EVIDENCE</small><h2>Insights</h2><p>Understand writing rhythm and recorded moods.</p></div><NavigationIcon name="chevron" size={16} /></Link>
        <Link to="/journal/calendar" className="journal-overview-card"><span><NavigationIcon name="calendar" size={19} /></span><div><small>DAYS IN CONTEXT</small><h2>Calendar</h2><p>See consistency without turning reflection into a score.</p></div><NavigationIcon name="chevron" size={16} /></Link>
      </section>

      <section className="journal-recent-section">
        <div className="section-heading"><div><span className="eyebrow">RECENT MEMORY</span><h2>Previous entries</h2></div><Link to="/journal/timeline">Open timeline <NavigationIcon name="chevron" size={13} /></Link></div>
        {recent.length ? <div className="journal-entry-list">{recent.map(entry => <Link key={entry.id} to={`/journal/entries/${entry.id}`} className="journal-entry-row"><time><strong>{new Date(entry.entryDate).getDate()}</strong><span>{new Date(entry.entryDate).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span></time><div><h3>{entry.title || "Untitled reflection"}</h3><p>{stripHtml(entry.content).slice(0, 150) || "A quiet entry without preview text."}</p><small>{MOODS[entry.mood]?.symbol} {MOODS[entry.mood]?.label || "No mood recorded"}</small></div><NavigationIcon name="chevron" size={16} /></Link>)}</div> : entries === null ? <p className="journal-inline-status" role="status">Checking recent entries…</p> : <div className="journal-empty"><span>✦</span><h2>Your history begins with one honest entry.</h2><p>No streak pressure and no performance score. Record what matters when it matters.</p><Link className="btn-primary" to="/journal/new">Write the first entry</Link></div>}
      </section>
    </>
  </div>;
}
