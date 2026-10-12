import { useMemo } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { useApiQuery } from "../../hooks/useApiQuery";
import { entryDayDate, journalExcerpt } from "./journalUtils";
import { useJournalEntries } from "./useJournalEntries";
import "./journalPracticeWorkspace.css";

const normalTags = item => (item.tags || []).filter(tag => !/^(journal|review):/i.test(tag));

export default function JournalRelatedRecords() {
  const journal = useJournalEntries();
  const writing = useApiQuery("/notes", { scope:"all", kind:"NOTE", view:"summary" });
  const relationships = useMemo(() => {
    const notes = writing.data?.notes || [];
    return (journal.entries || []).map(entry => {
      const tags = new Set(normalTags(entry).map(tag => tag.toLocaleLowerCase()));
      const related = tags.size ? notes.filter(note => normalTags(note).some(tag => tags.has(tag.toLocaleLowerCase()))).slice(0,4) : [];
      return { entry, related };
    }).filter(item => item.related.length).sort((a,b) => new Date(b.entry.updatedAt) - new Date(a.entry.updatedAt));
  }, [journal.entries, writing.data]);
  const loading = journal.entries === null || writing.loading;
  const error = journal.error || writing.error?.message;
  return <main className="journal-page journal-practice-workspace journal-related-workspace">
    <header className="product-page-header journal-practice-header"><div><span className="eyebrow">RELATED RECORDS</span><h1 className="page-title">The work around the memory.</h1><p>Shared subjects connect journal entries to notes without duplicating either record. Open the source to inspect its full context and history.</p></div><Link className="btn-outline" to="/journal/timeline">Open timeline</Link></header>
    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => { journal.refresh(); writing.refresh(); }}>Retry</button></div>}
    <section className="journal-related-ledger"><div><span className="eyebrow">CONNECTION INDEX</span><strong>{loading ? "—" : relationships.length}</strong><p>journal records currently share one or more subjects with your wider writing.</p></div><div><NavigationIcon name="tag" size={19} /><span><strong>Subjects form the bridge</strong><small>Add the same meaningful subject to a journal entry and note to relate them here.</small></span></div></section>
    {loading ? <div className="journal-review-pending"><span /><span /><span /></div> : relationships.length ? <div className="journal-related-groups">{relationships.map(({entry,related}) => <section key={entry.id}><header><div><time>{entryDayDate(entry.entryDate || entry.updatedAt).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</time><h2>{entry.title || "Journal entry"}</h2><p>{journalExcerpt(entry).slice(0,150)}</p></div><Link to={`/journal/entries/${entry.id}`}>Open entry <NavigationIcon name="chevron" size={13} /></Link></header><div>{related.map(note => <Link key={note.id} to={`/notes/${note.id}`}><NavigationIcon name="note" size={18} /><span><strong>{note.title || "Untitled note"}</strong><small>{journalExcerpt(note).slice(0,100) || "Open related writing"}</small></span><NavigationIcon name="chevron" size={14} /></Link>)}</div></section>)}</div> : <div className="journal-practice-empty"><NavigationIcon name="link" size={28} /><h2>Related work will gather here.</h2><p>Use shared subjects on journal entries and notes. Veynote keeps the original records separate while making their relationship discoverable.</p><Link className="btn-primary" to="/journal/new">Write an entry</Link></div>}
  </main>;
}
