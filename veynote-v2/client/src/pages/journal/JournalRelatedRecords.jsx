import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { useApiQuery } from "../../hooks/useApiQuery";
import { entryDayDate, journalExcerpt } from "./journalUtils";
import { useJournalEntries } from "./useJournalEntries";
import "./journalPracticeWorkspace.css";
import "./journalRelationships.css";

const ICONS={note:"note",journal:"book",task:"tasks",library:"book",trade:"chart",business:"brief"};
const SCOPES=[["all","All work"],["writing","Notes"],["tasks","Tasks"],["library","Library"],["trading","Trading"],["business","Business"]];
const normalTags=item=>(item?.tags||[]).map(tag=>typeof tag==="string"?tag:tag.name).filter(tag=>tag&&!/^(journal|review):/i.test(tag));

export default function JournalRelatedRecords(){
  const journal=useJournalEntries();
  const [selectedId,setSelectedId]=useState(""); const [scope,setScope]=useState("all"); const [phrase,setPhrase]=useState("");
  useEffect(()=>{if(!selectedId&&journal.entries?.length)setSelectedId(journal.entries[0].id);},[journal.entries,selectedId]);
  const selected=(journal.entries||[]).find(item=>item.id===selectedId)||null;
  const explicit=selected?.journalData?.relatedRecords||[];
  const explicitKeys=new Set(explicit.map(item=>`${item.type}:${item.id}`));
  const suggested=normalTags(selected)[0]||String(selected?.title||"").trim().split(/\s+/).find(word=>word.length>3)||"";
  useEffect(()=>{setPhrase(suggested);setScope("all");},[selectedId,suggested]);
  const settled=phrase.trim().slice(0,120); const result=useApiQuery("/search",{q:settled,scope});
  const records=useMemo(()=>(result.data?.results||[]).filter(item=>!(item.type==="journal"&&item.id===selectedId)&&!explicitKeys.has(`${item.type}:${item.id}`)),[result.data,selectedId,explicit]);
  const counts=result.data?.counts||{};
  return <main className="journal-page journal-relationships">
    <header className="product-page-header"><div><span className="eyebrow">JOURNAL · RELATED RECORDS</span><h1 className="page-title">The work around the memory.</h1><p>Trace a subject across writing, commitments, research, trading decisions, and business relationships while every source remains in its own workspace.</p></div><Link className="btn-outline" to="/journal/timeline">Open timeline</Link></header>
    {(journal.error||result.error)&&<div className="inline-error" role="alert"><span>{journal.error||result.error?.message}</span><button type="button" onClick={()=>{journal.refresh();result.refresh().catch(()=>{});}}>Retry</button></div>}
    <div className="journal-relationship-layout">
      <aside className="journal-relationship-source"><span className="eyebrow">SOURCE RECORD</span><h2>Choose the journal context.</h2><p>Veynote uses an intentional subject or phrase to find accessible work without crossing Vault, Trash, or workspace membership boundaries.</p><label>Journal record<select value={selectedId} onChange={event=>setSelectedId(event.target.value)}><option value="">Choose a record</option>{(journal.entries||[]).map(entry=><option key={entry.id} value={entry.id}>{entry.title||`${entry.journalType||"Daily"} record`}</option>)}</select></label>{selected&&<article><time>{entryDayDate(selected.entryDate||selected.updatedAt).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</time><strong>{selected.title||"Untitled journal record"}</strong><p>{journalExcerpt(selected).slice(0,180)||"No preview text recorded."}</p><div>{normalTags(selected).map(tag=><button key={tag} type="button" className={phrase===tag?"is-active":""} onClick={()=>setPhrase(tag)}>#{tag}</button>)}</div><Link to={`/journal/entries/${selected.id}`}>Open source record <NavigationIcon name="chevron" size={13}/></Link></article>}</aside>
      <section className="journal-relationship-index">{explicit.length>0&&<section className="journal-explicit-relations" aria-label="Saved relationships"><header><div><span className="eyebrow">SAVED RELATIONSHIPS</span><h2>Records intentionally connected.</h2></div><strong>{explicit.length}</strong></header><div>{explicit.map(item=><Link key={`${item.type}-${item.id}`} to={item.href}><span><NavigationIcon name={ICONS[item.type]||"link"} size={16}/></span><div><small>{item.workspace||item.type}</small><strong>{item.title||"Untitled record"}</strong></div><NavigationIcon name="chevron" size={14}/></Link>)}</div></section>}<div className="journal-relationship-search"><NavigationIcon name="search" size={18}/><input value={phrase} onChange={event=>setPhrase(event.target.value)} placeholder="Search a subject, person, project, or decision…"/><span>{records.length} discovered</span></div><nav aria-label="Relationship workspace filters">{SCOPES.map(([key,label])=><button key={key} type="button" className={scope===key?"is-active":""} onClick={()=>setScope(key)}>{label}{key!=="all"&&<small>{counts[key]||0}</small>}</button>)}</nav>
        {journal.entries===null||(result.fetching&&!result.data)?<div className="journal-review-pending" role="status"><span/><span/><span/></div>:settled.length<2?<Empty title="Choose a useful relationship key." text="Add a subject to the journal record or search for a person, project, market, customer, or decision represented elsewhere in Veynote."/>:records.length?<div className="journal-relationship-results">{records.map(item=><Link key={`${item.type}-${item.id}`} to={item.href}><span><NavigationIcon name={ICONS[item.type]||"link"} size={17}/></span><div><small>{item.workspace} · {item.meta||"Record"}</small><strong>{item.title||"Untitled record"}</strong><p>{item.context||"Open the source record."}</p></div><time>{new Date(item.updatedAt).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</time><NavigationIcon name="chevron" size={14}/></Link>)}</div>:<Empty title="No connected records found." text="Try another subject or broader workspace scope. Relationships appear from real accessible records, never invented suggestions."/>}
      </section>
    </div><footer className="journal-relationship-privacy"><NavigationIcon name="shield" size={17}/><span>Protected records, deleted items, and inaccessible organisation data remain outside relationship discovery.</span></footer>
  </main>;
}
function Empty({title,text}){return <div className="journal-relationship-empty"><NavigationIcon name="link" size={27}/><h2>{title}</h2><p>{text}</p></div>}
