import { useEffect, useId, useRef, useState } from "react";
import NavigationIcon from "./layout/NavigationIcon";
import "./documentInsights.css";

const TABS = ["Overview", "Statistics", "Structure", "Activity", "Versions"];
const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
const date = value => value && Number.isFinite(+new Date(value)) ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not saved yet";
function Metrics({ rows }) { return <dl className="insights-metrics">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }

export default function DocumentInsights({ open, onClose, stats, note = {}, attachmentCount = 0, saveStatus, onOpenHistory, onNavigateHeading, editingSeconds }) {
  const dialog = useRef(null), opener = useRef(null), tabs = useRef([]), heading = useId(), panel = useId();
  const [active, setActive] = useState("Overview");
  useEffect(() => {
    const node = dialog.current;
    if (open && !node.open) { opener.current = document.activeElement; node.showModal(); }
    else if (!open && node.open) { node.close(); if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); }
    return () => { if (node.open) node.close(); };
  }, [open]);
  function close() { dialog.current?.close(); onClose(); if (opener.current?.isConnected) opener.current.focus({ preventScroll: true }); }
  function chooseTab(event, index) {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = TABS.length - 1;
    if (next !== undefined) { event.preventDefault(); setActive(TABS[next]); tabs.current[next]?.focus(); }
  }
  const outline = stats.headingsOutline || [];
  return <dialog ref={dialog} className="document-insights" aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
    if (event.target !== dialog.current) return;
    const rect = dialog.current.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }}>
    <header className="insights-header"><div><span className="eyebrow">YOUR WRITING, IN PERSPECTIVE</span><h2 id={heading}>Document insights</h2><p>{note.title || "Untitled document"}</p></div><button autoFocus type="button" aria-label="Close document insights" onClick={close}><NavigationIcon name="close" size={21} /></button></header>
    <div className="insights-tabs" role="tablist" aria-label="Document inspector">{TABS.map((tab, index) => <button key={tab} ref={node => tabs.current[index] = node} id={`${panel}-${tab}`} type="button" role="tab" tabIndex={active === tab ? 0 : -1} aria-selected={active === tab} aria-controls={panel} onKeyDown={event => chooseTab(event, index)} onClick={() => setActive(tab)}>{tab}</button>)}</div>
    <section className="insights-content" id={panel} role="tabpanel" tabIndex={0} aria-labelledby={`${panel}-${active}`}>
      {active === "Overview" && <><div className="insights-wordmark"><strong>{number(stats.words)}</strong><span>words in this document</span><div><span>{stats.readingMinutes || 0} min read</span><i /><span>{stats.speakingMinutes || 0} min to speak</span></div></div><Metrics rows={[["Headings", number(stats.headings)], ["Paragraphs", number(stats.paragraphs)], ["Images", number(stats.images)], ["Attachments", number(attachmentCount)]]} /><div className="insights-privacy"><NavigationIcon name={note.isLocked ? "shield" : "lock"} size={19} /><div><strong>{note.isLocked ? "Protected document" : note.shareEnabled ? "Share link enabled" : "Private writing"}</strong><p>{note.isLocked ? "These insights stay within this document’s access boundary." : "Statistics are calculated here from your writing. No AI request is made."}</p></div></div></>}
      {active === "Statistics" && <><span className="insights-section-label">The shape of your writing</span><Metrics rows={[["Words", number(stats.words)], ["Characters", number(stats.characters)], ["Without spaces", number(stats.charactersNoSpaces)], ["Sentences", number(stats.sentences)], ["Paragraphs", number(stats.paragraphs)], ["Reading time", `${stats.readingMinutes || 0} min`], ["Speaking time", `${stats.speakingMinutes || 0} min`], ["Average word", `${number(stats.averageWordLength)} characters`], ["Average sentence", `${number(stats.averageSentenceLength)} words`], ["Average paragraph", `${number(stats.averageParagraphLength)} words`]]} />{[["Longest sentence", stats.longestSentence], ["Shortest sentence", stats.shortestSentence]].map(([label, sentence]) => sentence && <div className="insights-sentence" key={label}><span>{label} · {sentence.words} words</span><p>{sentence.text}</p></div>)}<p className="insights-method">Words and sentences use language-aware boundaries where supported. Reading assumes 220 words/minute; speaking assumes 130. These are estimates, not quality scores.</p></>}
      {active === "Structure" && <><span className="insights-section-label">Document outline</span>{outline.length ? <nav className="insights-outline" aria-label="Document headings">{outline.map((item, index) => <button type="button" key={index} style={{ "--heading-level": item.level }} onClick={() => { close(); onNavigateHeading?.(index); }}><span>H{item.level}</span><strong>{item.text || "Untitled heading"}</strong><NavigationIcon name="chevron" size={14} /></button>)}</nav> : <div className="insights-empty"><NavigationIcon name="note" size={24} /><h3>A little structure goes a long way.</h3><p>Add headings to create an outline you can navigate.</p></div>}<Metrics rows={[["Links", number(stats.links)], ["Images", number(stats.images)], ["Attached files", number(attachmentCount)], ["Checklist items", number(stats.tasks)], ["Completed", stats.tasks ? `${stats.tasksDone}/${stats.tasks} · ${stats.checklistCompletion}%` : "No checklist yet"]]} />{stats.tasks > 0 && <div className="insights-checklist-track" role="progressbar" aria-label="Completed checklist items" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.checklistCompletion}><span style={{ width: `${stats.checklistCompletion}%` }} /></div>}</>}
      {active === "Activity" && <><span className="insights-section-label">Your document record</span><Metrics rows={[["Created", date(note.createdAt)], ["Last saved edit", date(note.updatedAt)], ["Save state", ({ idle: "Not saved yet", pending: "Changes awaiting save", saving: "Saving", saved: "Saved", offline: "Offline · not synced", error: "Save failed", conflict: "Conflict · review required" })[saveStatus] || "Not available"], ["Document markup", `${number((stats.documentBytes || 0) / 1024)} KB`], ["Editing duration", Number.isFinite(editingSeconds) ? `${number(editingSeconds / 60)} min recorded` : "Not tracked"]]} /><p className="insights-method">Size covers document markup only, excluding attached files. Unsaved changes are reflected in statistics; dates reflect backend acknowledgements. Editing duration is never inferred from the age of a document.</p></>}
      {active === "Versions" && <div className="insights-versions"><span className="insights-version-icon"><NavigationIcon name="clock" size={26} /></span><h3>Your earlier work, preserved.</h3><p>Inspect previous writing and restore a version. Restoring preserves the current document in its history.</p>{onOpenHistory ? <button type="button" className="btn-primary" onClick={() => { close(); onOpenHistory(); }}>Open version history<NavigationIcon name="chevron" size={16} /></button> : <p className="insights-method">Save this document to start its version history.</p>}</div>}
    </section>
    <footer className="insights-footer"><NavigationIcon name="chart" size={14} />Calculated from this document · no external analysis</footer>
  </dialog>;
}
