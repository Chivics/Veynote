import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import NavigationIcon from "../components/layout/NavigationIcon.jsx";
import { useApiQuery } from "../hooks/useApiQuery.js";
import "./sharingCenter.css";

const FILTERS = [["all","All review work"],["public","Public links"],["discussion","Discussions"]];
const dateLabel = value => new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));

function CommentSignal({ comment }) {
  return <div className={`sharing-comment${comment.resolvedAt ? " is-resolved" : ""}`}><span>{comment.authorName.slice(0,1).toUpperCase()}</span><div><strong>{comment.authorName}</strong><p>{comment.body}</p><small>{comment.resolvedAt ? "Resolved" : "Open"} · {dateLabel(comment.createdAt)}</small></div></div>;
}

export default function SharingCenter() {
  const [params,setParams]=useSearchParams();
  const status=FILTERS.some(([key])=>key===params.get("view"))?params.get("view"):"all";
  const q=params.get("q")||"";
  const [query,setQuery]=useState(q);
  const result=useApiQuery("/sharing",{status,...(q&&{q})});
  const [pending,setPending]=useState(null); const [busy,setBusy]=useState(""); const [error,setError]=useState(""); const [notice,setNotice]=useState("");
  const documents=result.data?.documents||[]; const summary=result.data?.summary;
  const newest=useMemo(()=>documents.flatMap(note=>note.recentComments.map(comment=>({...comment,noteId:note.id,noteTitle:note.title}))).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5),[documents]);
  const choose=(key,value)=>{const next=new URLSearchParams(params);if(value)next.set(key,value);else next.delete(key);setParams(next,{replace:true});};
  const submit=event=>{event.preventDefault();choose("q",query.trim());};
  async function revoke(){if(!pending||busy)return;setBusy(pending.id);setError("");try{await api.delete(`/notes/${pending.id}/share`);setPending(null);setNotice(`Public access to “${pending.title}” was revoked.`);await result.refresh();}catch(failure){setError(failure.message);}finally{setBusy("");}}
  async function copy(path){try{await navigator.clipboard.writeText(new URL(path,location.origin).href);setNotice("Public link copied.");}catch{setNotice("Copy was blocked. Open the public view and copy its address from the browser.");}}
  return <main className="sharing-center">
    <header className="sharing-hero"><div><span className="eyebrow">SHARING & REVIEW</span><h1>Control the work<br/><em>others can see.</em></h1><p>Public access and document discussion stay together, while private writing and protected records remain outside this workspace.</p></div><Link to="/notes/all"><NavigationIcon name="note" size={16}/> Choose a document</Link></header>
    <section className="sharing-metrics" aria-label="Sharing summary"><div><span>PUBLIC LINKS</span><strong>{summary?.publicDocuments??"—"}</strong><small>currently accessible</small></div><div><span>IN DISCUSSION</span><strong>{summary?.documentsInDiscussion??"—"}</strong><small>documents with context</small></div><div><span>OPEN THREADS</span><strong>{summary?.openComments??"—"}</strong><small>still need review</small></div><div><span>RESOLVED</span><strong>{summary?.resolvedComments??"—"}</strong><small>decisions retained</small></div></section>
    <div className="sharing-tools"><nav aria-label="Sharing views">{FILTERS.map(([key,label])=><button key={key} aria-pressed={status===key} onClick={()=>choose("view",key==="all"?"":key)}>{label}</button>)}</nav><form onSubmit={submit}><NavigationIcon name="search" size={16}/><input aria-label="Search shared and discussed documents" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a document…"/>{query&&<button type="button" aria-label="Clear search" onClick={()=>{setQuery("");choose("q","");}}><NavigationIcon name="close" size={14}/></button>}</form></div>
    {notice&&<div className="sharing-notice" role="status"><NavigationIcon name="check" size={16}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss"><NavigationIcon name="close" size={14}/></button></div>}
    {result.error&&<div className="inline-error" role="alert"><span>{result.error.message}</span><button onClick={()=>result.refresh()}>Retry</button></div>}
    {!result.data&&!result.error?<div className="sharing-loading"><i/><i/><span>Reviewing access and discussion…</span></div>:documents.length?<div className="sharing-layout"><section className="sharing-register" aria-label="Documents under review"><header><div><span className="eyebrow">ACCESS REGISTER</span><h2>{documents.length} {documents.length===1?"document":"documents"}</h2></div><small>Owner-controlled access</small></header>{documents.map(note=><article className="sharing-record" key={note.id}><div className="sharing-record-mark"><NavigationIcon name={note.kind==="JOURNAL"?"book":"note"} size={18}/></div><div className="sharing-record-copy"><span>{note.kind==="JOURNAL"?"JOURNAL RECORD":"DOCUMENT"} · UPDATED {dateLabel(note.updatedAt)}</span><Link to={note.kind==="JOURNAL"?`/journal/entries/${note.id}`:`/notes/${note.id}`}>{note.title||"Untitled document"}</Link><p>{note.preview||"No preview available."}</p><small>{note.wordCount.toLocaleString()} words · {note.openCommentCount} open · {note.commentCount} total comments</small></div><div className="sharing-record-access"><span className={note.shareEnabled?"is-public":"is-private"}><i/>{note.shareEnabled?"Public link active":"Private"}</span><div>{note.shareEnabled&&<><button onClick={()=>copy(note.publicPath)}><NavigationIcon name="link" size={14}/> Copy link</button><Link to={note.publicPath} target="_blank"><NavigationIcon name="preview" size={14}/> View</Link><button className="is-danger" onClick={()=>{setError("");setPending(note);}}>Revoke</button></>}</div></div></article>)}</section><aside className="sharing-review"><header><span className="eyebrow">RECENT DISCUSSION</span><h2>Context that stays.</h2><p>Questions and decisions remain attached to their source document.</p></header>{newest.length?newest.map(comment=><Link key={comment.id} to={`/notes/${comment.noteId}`}><small>{comment.noteTitle}</small><CommentSignal comment={comment}/></Link>):<div className="sharing-review-empty"><NavigationIcon name="comment" size={24}/><strong>No discussion yet.</strong><p>Comments created inside documents will gather here without changing the writing itself.</p></div>}</aside></div>:<section className="sharing-empty"><span><NavigationIcon name="share" size={28}/></span><small>CONTROLLED BY YOU</small><h2>{q?"No review work matches your search.":status==="public"?"No public links are active.":status==="discussion"?"No documents are in discussion.":"Your work is private."}</h2><p>Open a document to create a view-only link or add contextual comments. You can revoke public access at any time.</p><Link to="/notes/all">Browse documents <NavigationIcon name="chevron" size={14}/></Link></section>}
    <footer className="sharing-boundary"><NavigationIcon name="shield" size={17}/><span>Locked Notes and Will & Inheritance records cannot enter this register. Public links are view-only and revocable.</span></footer>
    <ConfirmDialog open={Boolean(pending)} title="Revoke this public link?" description={`People using the current link to “${pending?.title||"Untitled document"}” will immediately lose access. Your private document, comments, and version history remain unchanged.`} confirmLabel="Revoke access" error={error} busy={Boolean(busy)} onClose={()=>{setPending(null);setError("");}} onConfirm={revoke}/>
  </main>;
}
