import { useEffect, useState } from "react";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { useApiQuery } from "../../hooks/useApiQuery";
import "./journalContextPanel.css";

export const JOURNAL_TYPES = [
  ["daily","Daily entry"],["reflection","Reflection"],["mood","Mood check-in"],["decision","Decision record"],
  ["calibration","Confidence calibration"],["lesson","Lesson"],["weekly","Weekly review"],["monthly","Monthly review"],
  ["quarterly","Quarterly review"],["annual","Annual review"],
];

export function journalTypeFromParams(searchParams) {
  const explicit = searchParams.get("type")?.toLowerCase();
  if (JOURNAL_TYPES.some(([value]) => value === explicit)) return explicit;
  const source = `${searchParams.get("tag") || ""} ${searchParams.get("template") || ""}`.toLowerCase();
  if (source.includes("decision")) return "decision";
  if (source.includes("calibration") || source.includes("confidence")) return "calibration";
  if (source.includes("mood")) return "mood";
  if (source.includes("lesson")) return "lesson";
  if (source.includes("reflection")) return "reflection";
  for (const period of ["weekly","monthly","quarterly","annual"]) if (source.includes(period)) return period;
  return "daily";
}

const field = (data, onChange, key, label, options = {}) => <label className="journal-context-field" key={key}>
  <span>{label}</span>
  {options.choices ? <select value={data[key] || ""} onChange={event => onChange({ ...data, [key]:event.target.value })}><option value="">Choose</option>{options.choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}</select> : <input type={options.type || "text"} min={options.min} max={options.max} value={data[key] ?? ""} placeholder={options.placeholder || ""} onChange={event => onChange({ ...data, [key]:options.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value })}/>}
</label>;

export default function JournalContextPanel({ type, data, onTypeChange, onChange }) {
  const [relationshipQuery,setRelationshipQuery]=useState(""); const [settled,setSettled]=useState("");
  useEffect(()=>{const timer=setTimeout(()=>setSettled(relationshipQuery.trim()),250);return()=>clearTimeout(timer);},[relationshipQuery]);
  const relationshipSearch=useApiQuery("/search",{q:settled,scope:"all"});
  const related=data.relatedRecords||[];
  const candidates=(relationshipSearch.data?.results||[]).filter(item=>!related.some(link=>link.type===item.type&&link.id===item.id)).slice(0,6);
  const addRelated=item=>{onChange({...data,relatedRecords:[...related,{type:item.type,id:item.id,title:item.title||"Untitled record",workspace:item.workspace||"Veynote",href:item.href}]});setRelationshipQuery("");setSettled("");};
  const fields = type === "decision" ? [
    field(data,onChange,"status","Status",{choices:["Considering","Decided","In progress","Reviewed"]}),
    field(data,onChange,"selectedOption","Selected option",{placeholder:"The path chosen"}),
    field(data,onChange,"confidence","Confidence %",{type:"number",min:0,max:100}),
    field(data,onChange,"reviewDate","Review date",{type:"date"}),
  ] : type === "calibration" ? [
    field(data,onChange,"forecast","Forecast",{placeholder:"What do you expect?"}),
    field(data,onChange,"confidence","Confidence %",{type:"number",min:0,max:100}),
    field(data,onChange,"resolutionDate","Resolution date",{type:"date"}),
    field(data,onChange,"outcome","Outcome",{choices:["Pending","Correct","Partly correct","Incorrect"]}),
  ] : type === "mood" ? [
    field(data,onChange,"intensity","Intensity · 1–5",{type:"number",min:1,max:5}),
    field(data,onChange,"energy","Energy · 1–5",{type:"number",min:1,max:5}),
    field(data,onChange,"context","Context",{placeholder:"Work, family, health…"}),
    field(data,onChange,"support","What may help",{placeholder:"Rest, clarity, conversation…"}),
  ] : type === "lesson" ? [
    field(data,onChange,"category","Category",{choices:["Work","Leadership","Relationships","Finance","Health","Personal"]}),
    field(data,onChange,"importance","Importance",{choices:["Consider","Important","Foundational"]}),
    field(data,onChange,"source","Source",{placeholder:"Decision, event, project…"}),
    field(data,onChange,"reviewDate","Review date",{type:"date"}),
  ] : ["weekly","monthly","quarterly","annual"].includes(type) ? [
    field(data,onChange,"periodStart","Period starts",{type:"date"}),
    field(data,onChange,"periodEnd","Period ends",{type:"date"}),
    field(data,onChange,"progress","Overall progress",{choices:["Behind","Mixed","On track","Ahead"]}),
    field(data,onChange,"nextPriority","Next priority",{placeholder:"The most important next move"}),
  ] : type === "reflection" ? [
    field(data,onChange,"category","Reflection lens",{choices:["Experience","Relationship","Work","Identity","Transition","Gratitude"]}),
    field(data,onChange,"significance","Significance",{choices:["Quiet note","Meaningful","Turning point"]}),
    field(data,onChange,"relatedEvent","Related event",{placeholder:"Meeting, milestone, conversation…"}),
    field(data,onChange,"reviewDate","Return to this",{type:"date"}),
  ] : [
    field(data,onChange,"energy","Energy · 1–5",{type:"number",min:1,max:5}),
    field(data,onChange,"focus","Daily focus",{placeholder:"What deserves attention?"}),
    field(data,onChange,"highlight","Moment to remember",{placeholder:"A person, detail, or turning point"}),
  ];
  return <section className="journal-context-panel" aria-label="Journal record context">
    <header><span><NavigationIcon name="book" size={17}/><strong>Record context</strong></span><small>Structured details remain searchable without interrupting the writing.</small></header>
    <div className="journal-context-grid"><label className="journal-context-field journal-context-type"><span>Record type</span><select value={type} onChange={event => onTypeChange(event.target.value)}>{JOURNAL_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>{fields}</div>
    <div className="journal-context-relationships"><div><span className="eyebrow">CONNECTED WORK</span><strong>Relate the records behind this entry.</strong><small>Search accessible Veynote work and preserve an explicit link to its source.</small></div><div className="journal-context-related-list">{related.map(item=><span key={`${item.type}-${item.id}`}><NavigationIcon name="link" size={13}/><b>{item.title}</b><small>{item.workspace}</small><button type="button" aria-label={`Remove ${item.title}`} onClick={()=>onChange({...data,relatedRecords:related.filter(link=>link!==item)})}><NavigationIcon name="close" size={12}/></button></span>)}</div><label className="journal-context-related-search"><NavigationIcon name="search" size={15}/><input value={relationshipQuery} onChange={event=>setRelationshipQuery(event.target.value)} placeholder="Find a note, task, trade, book, or business record…"/></label>{settled.length>1&&<div className="journal-context-related-results">{candidates.map(item=><button type="button" key={`${item.type}-${item.id}`} onClick={()=>addRelated(item)}><span><strong>{item.title}</strong><small>{item.workspace} · {item.meta||"Record"}</small></span><NavigationIcon name="plus" size={13}/></button>)}{relationshipSearch.data&&!candidates.length&&<p>No new accessible records match.</p>}</div>}</div>
  </section>;
}
