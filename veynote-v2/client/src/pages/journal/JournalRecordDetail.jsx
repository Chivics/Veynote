import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import BackNavigation from "../../components/BackNavigation";
import ConfirmDialog from "../../components/ConfirmDialog";
import DocumentContent from "../../components/DocumentContent";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { entryDayDate, journalExcerpt, MOODS } from "./journalUtils";
import "./journalRecordDetail.css";

const TYPES = {
  daily: { label:"Daily entry", eyebrow:"DAILY RECORD", icon:"sun", returnTo:"/journal/timeline" },
  reflection: { label:"Reflection", eyebrow:"CONSIDERED REFLECTION", icon:"book", returnTo:"/journal/reflections" },
  mood: { label:"Mood check-in", eyebrow:"MOOD & ENERGY", icon:"sun", returnTo:"/journal/mood" },
  decision: { label:"Decision record", eyebrow:"DECISION PROVENANCE", icon:"tasks", returnTo:"/journal/decisions" },
  calibration: { label:"Calibration record", eyebrow:"CONFIDENCE CALIBRATION", icon:"chart", returnTo:"/journal/calibration" },
  lesson: { label:"Lesson", eyebrow:"LESSON LIBRARY", icon:"sparkle", returnTo:"/journal/lessons" },
  weekly: { label:"Weekly review", eyebrow:"WEEKLY RETROSPECTIVE", icon:"calendar", returnTo:"/journal/reviews/weekly" },
  monthly: { label:"Monthly review", eyebrow:"MONTHLY RETROSPECTIVE", icon:"calendar", returnTo:"/journal/reviews/monthly" },
  quarterly: { label:"Quarterly review", eyebrow:"QUARTERLY RETROSPECTIVE", icon:"calendar", returnTo:"/journal/reviews/quarterly" },
  annual: { label:"Annual review", eyebrow:"ANNUAL RETROSPECTIVE", icon:"calendar", returnTo:"/journal/reviews/annual" },
};
const HIDDEN_KEYS = new Set(["subjectType","subjectId"]);
const humanize = (value) => String(value || "").replace(/([a-z])([A-Z])/g,"$1 $2").replaceAll("_"," ").replace(/^./,letter=>letter.toUpperCase());
function displayValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" · ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value && typeof value === "object") return Object.values(value).filter(Boolean).join(" · ");
  return String(value ?? "");
}

export default function JournalRecordDetail() {
  const { id } = useParams(); const navigate = useNavigate();
  const [record,setRecord]=useState(null); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const [deleteOpen,setDeleteOpen]=useState(false);
  function load(force=false){ setError(""); api.get(`/notes/${id}`,undefined,{force}).then(body=>{ if(body.note.kind!=="JOURNAL") throw new Error("This record does not belong to Journal."); setRecord(body.note); }).catch(failure=>setError(failure.message)); }
  useEffect(()=>{load();},[id]);
  const type=record?.journalType || "daily"; const config=TYPES[type] || TYPES.daily;
  const fields=useMemo(()=>Object.entries(record?.journalData || {}).filter(([key,value])=>!HIDDEN_KEYS.has(key)&&value!==null&&value!==undefined&&displayValue(value).trim()),[record]);
  async function patch(fields){setBusy(true);setError("");try{const body=await api.patch(`/notes/${id}`,fields);setRecord(body.note);}catch(failure){setError(failure.message);}finally{setBusy(false);}}
  async function remove(){setBusy(true);setError("");try{await api.delete(`/notes/${id}`);navigate("/journal/timeline",{replace:true});}catch(failure){setError(failure.message);}finally{setBusy(false);}}
  if(!record) return <main className="journal-record-page"><BackNavigation to="/journal/timeline" label="Timeline"/><div className="journal-record-loading">{error?<><h1>Journal record unavailable</h1><p role="alert">{error}</p><button className="btn-outline" onClick={()=>load(true)}>Retry</button></>:<><span/><span/><span/></>}</div></main>;
  const day=entryDayDate(record.entryDate || record.createdAt); const mood=MOODS[record.mood];
  const tags=(record.tags || []).map(tag=>typeof tag==="string"?tag:tag.name).filter(Boolean);
  return <main className="journal-record-page">
    <div className="journal-record-topline"><BackNavigation to={config.returnTo} label={config.label}/><div className="journal-record-actions"><button type="button" className={record.isFavorite?"is-active":""} disabled={busy} onClick={()=>patch({isFavorite:!record.isFavorite})}><NavigationIcon name="star" size={15}/>{record.isFavorite?"Favorited":"Favorite"}</button><Link className="btn-outline" to={`/journal/entries/${id}/edit`}><NavigationIcon name="edit" size={15}/> Edit writing</Link><button type="button" aria-label="Move journal record to Trash" onClick={()=>setDeleteOpen(true)}><NavigationIcon name="trash" size={15}/></button></div></div>
    {error&&<div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={()=>load(true)}>Retry</button></div>}
    <header className="journal-record-hero"><div className="journal-record-date"><strong>{day.getDate()}</strong><span>{day.toLocaleDateString(undefined,{month:"short"})}</span><small>{day.getFullYear()}</small></div><div><span className="eyebrow">{config.eyebrow}</span><h1>{record.title || config.label}</h1><p>{journalExcerpt(record).slice(0,220) || "A private record preserved with its original context and history."}</p><div className="journal-record-signals">{mood&&<span>{mood.symbol} {mood.label}</span>}<span>Updated {new Date(record.updatedAt).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</span>{tags.map(tag=><span key={tag}>#{tag}</span>)}</div></div><span className="journal-record-mark"><NavigationIcon name={config.icon} size={24}/></span></header>
    <div className="journal-record-layout"><article className="journal-record-writing"><div className="journal-record-section-head"><div><span className="eyebrow">ORIGINAL RECORD</span><h2>Writing and evidence</h2></div><Link to={`/journal/entries/${id}/edit`}>Edit <NavigationIcon name="chevron" size={13}/></Link></div>{record.content?<DocumentContent html={record.content}/>:<div className="journal-record-empty"><NavigationIcon name="edit" size={23}/><h3>No long-form writing yet</h3><p>The structured context is preserved. Add writing when the record needs a fuller account.</p><Link className="btn-primary" to={`/journal/entries/${id}/edit`}>Add writing</Link></div>}</article>
      <aside className="journal-record-context"><section><span className="eyebrow">RECORDED CONTEXT</span><h2>{config.label} details</h2>{fields.length?<dl>{fields.map(([key,value])=><div key={key}><dt>{humanize(key)}</dt><dd>{displayValue(value)}</dd></div>)}</dl>:<p>No structured context was recorded for this entry.</p>}</section><section className="journal-record-continuity"><span className="eyebrow">CONTINUITY</span><h2>Return to the wider story</h2><Link to={config.returnTo}>Open {config.label.toLowerCase()} history <NavigationIcon name="chevron" size={14}/></Link><Link to="/journal/related">Related records <NavigationIcon name="chevron" size={14}/></Link><Link to="/journal/calendar">Journal calendar <NavigationIcon name="chevron" size={14}/></Link></section><section className="journal-record-governance"><span>Created {new Date(record.createdAt).toLocaleString()}</span><span>Last edited {new Date(record.updatedAt).toLocaleString()}</span><button type="button" disabled={busy} onClick={()=>patch({isArchived:!record.isArchived})}>{record.isArchived?"Restore from archive":"Archive record"}</button></section></aside></div>
    <ConfirmDialog open={deleteOpen} title="Move this journal record to Trash?" description="The record will leave Journal history but can be restored from Notes Trash. Any public link will be revoked." confirmLabel="Move to Trash" busy={busy} error={error} onClose={()=>setDeleteOpen(false)} onConfirm={remove}/>
  </main>;
}
