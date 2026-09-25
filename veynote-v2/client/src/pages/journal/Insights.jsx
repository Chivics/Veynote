import { useMemo } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { computeStreaks, MOODS, stripHtml, useJournalEntries } from "./journalUtils";

export default function Insights() {
  const { entries, error, refresh } = useJournalEntries();
  const insight = useMemo(() => {
    const list = entries || [], streak = computeStreaks(list);
    const words = list.reduce((sum, item) => sum + stripHtml(item.content).split(/\s+/).filter(Boolean).length, 0);
    const moods = list.reduce((map, item) => { if (item.mood) map[item.mood] = (map[item.mood] || 0) + 1; return map; }, {});
    const months = list.reduce((map, item) => { const key = item.entryDate.slice(0, 7); map[key] = (map[key] || 0) + 1; return map; }, {});
    const maxMonth = Math.max(1, ...Object.values(months));
    return { streak, words, moods, months, maxMonth };
  }, [entries]);

  return <div className="journal-page">
    <header className="product-page-header"><div><span className="eyebrow">JOURNAL · INSIGHTS</span><h1 className="page-title">Patterns worth checking.</h1><p>Descriptive signals from your own entries, always shown with their sample size.</p></div><Link className="btn-outline" to="/journal/timeline">View source entries</Link></header>
    {error && <div className="inline-error"><span>{error}</span><button onClick={refresh}>Retry</button></div>}
    <>
      <section className="journal-insight-scoreboard"><article><span>Recorded days</span><strong>{entries === null ? "—" : insight.streak.total}</strong><small>across your journal history</small></article><article><span>Words preserved</span><strong>{entries === null ? "—" : insight.words.toLocaleString()}</strong><small>{entries === null ? "Checking your journal…" : `${entries.length ? Math.round(insight.words / entries.length) : 0} average per entry`}</small></article><article><span>Longest rhythm</span><strong>{entries === null ? "—" : insight.streak.longest}</strong><small>consecutive days</small></article><article><span>Current rhythm</span><strong>{entries === null ? "—" : insight.streak.current}</strong><small>consecutive days</small></article></section>
      <div className="journal-insights-grid">
        <section className="journal-insight-panel"><div className="section-heading"><div><span className="eyebrow">WRITING RHYTHM</span><h2>Entries by month</h2></div><small>{entries === null ? "Checking sample…" : `${entries.length} entry sample`}</small></div>{Object.keys(insight.months).length ? <div className="journal-month-bars">{Object.entries(insight.months).sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, count]) => <div key={month}><span>{count}</span><i style={{ height: `${Math.max(8, count / insight.maxMonth * 100)}%` }} /><small>{new Date(`${month}-15T12:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</small></div>)}</div> : entries === null ? <p className="journal-inline-status" role="status">Checking writing rhythm…</p> : <Empty />}</section>
        <section className="journal-insight-panel"><div className="section-heading"><div><span className="eyebrow">RECORDED CONTEXT</span><h2>Mood distribution</h2></div><small>{entries === null ? "Checking sample…" : `${Object.values(insight.moods).reduce((a, b) => a + b, 0)} labelled`}</small></div>{Object.keys(insight.moods).length ? <div className="journal-mood-list">{Object.entries(insight.moods).sort((a,b) => b[1]-a[1]).map(([key, count]) => <div key={key}><span>{MOODS[key]?.symbol || "○"}</span><strong>{MOODS[key]?.label || key}</strong><i><b style={{ width: `${count / Math.max(...Object.values(insight.moods)) * 100}%` }} /></i><small>{count}</small></div>)}</div> : entries === null ? <p className="journal-inline-status" role="status">Checking recorded moods…</p> : <Empty text="Add a mood to entries to see this context." />}</section>
      </div>
      <aside className="journal-method-note"><NavigationIcon name="shield" size={18} /><div><strong>How to read this page</strong><p>These are summaries of what you explicitly recorded. They do not diagnose wellbeing or claim that one pattern caused another.</p></div></aside>
    </>
  </div>;
}

function Empty({ text = "Write a few entries to reveal this view." }) { return <div className="journal-panel-empty"><span>✦</span><p>{text}</p></div>; }
