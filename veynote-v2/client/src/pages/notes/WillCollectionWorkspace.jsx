import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import ProtectedContentBoundary from "../../components/ProtectedContentBoundary";
import VaultGate from "../../components/VaultGate";
import WillDocuments from "../../components/will/WillDocuments";
import WillWorkspaceNavigation from "../../components/will/WillWorkspaceNavigation";
import { willApi } from "../../api/will";
import { clearVaultToken, getVaultToken } from "../../utils/vault";
import "./willWorkspace.css";
import "./willCollectionWorkspace.css";

const date = value => value ? new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric", year:"numeric" }).format(new Date(value)) : "Not reviewed";
const money = value => value ? String(value) : "Value not recorded";
const text = value => String(value || "").replaceAll("_", " ").replaceAll("-", " ");

const CONFIG = {
  assets: { eyebrow:"ESTATE INVENTORY", title:"Assets, with their responsibilities attached.", lead:"Property, accounts, businesses, investments, valuables, and digital holdings remain connected to beneficiaries, documents, instructions, and the people responsible for carrying them forward.", collection:"assets", create:"asset", createLabel:"Build asset record", icon:"brief", path:item=>`/will/assets/${item.id}`, titleOf:item=>item.name, meta:item=>money(item.estimatedValue), badge:item=>text(item.type), description:item=>item.description || item.ownership || "Ownership and allocation record", filters:["type"], warning:item=>!(item.allocations || []).length ? "Beneficiary allocation needed" : !(item.documents || []).length ? "Ownership evidence needed" : "" },
  liabilities: { eyebrow:"OBLIGATION LEDGER", title:"What the estate must settle.", lead:"Keep mortgages, loans, taxes, guarantees, and other obligations tied to the asset or institution they affect.", collection:"liabilities", create:"liability", createLabel:"Add liability", icon:"archive", path:item=>`/will/liabilities/${item.id}`, titleOf:item=>item.name, meta:item=>money(item.amount), badge:item=>text(item.status), description:item=>[item.lender, item.asset?.name && `Attached to ${item.asset.name}`].filter(Boolean).join(" · ") || "Estate obligation", filters:["status"], warning:item=>item.status === "ACTIVE" && !item.assetId ? "Link this obligation to an asset" : "" },
  beneficiaries: { eyebrow:"BENEFICIARY DIRECTORY", title:"People and organisations named in the plan.", lead:"Each beneficiary remains a reusable person or organisation record, with every assigned asset and allocation visible from one place.", collection:"beneficiaries", create:"beneficiary", createLabel:"Add beneficiary", icon:"heart", path:item=>`/will/beneficiaries/${item.id}`, titleOf:item=>item.name, meta:item=>item.relationship || item.allocation || "Relationship not recorded", badge:item=>text(item.beneficiaryType), description:item=>item.specificEntitlement || "Open to inspect assigned assets", filters:["beneficiaryType"], warning:item=>!(item.allocations || item.assets || []).length ? "No asset assignment yet" : "" },
  people: { eyebrow:"TRUSTED PEOPLE", title:"The people expected to act.", lead:"Executors and important contacts remain distinct, searchable records. Their role, contact information, and related estate responsibilities stay easy to verify.", collection:"people", create:"executor", createLabel:"Add executor", icon:"account", titleOf:item=>item.name, meta:item=>item.relationship || item.type || "Estate contact", badge:item=>item.__kind, description:item=>item.contact || [item.email,item.phone].filter(Boolean).join(" · ") || "Contact information not recorded", filters:["__kind"], path:item=>item.__kind === "Executor" ? `/will/executors/${item.id}` : `/will/contacts/${item.id}`, warning:item=>!(item.contact || item.email || item.phone) ? "Contact details needed" : "" },
  instructions: { eyebrow:"ESTATE INSTRUCTIONS", title:"Wishes that remain understandable in context.", lead:"Keep general wishes, guardianship, family messages, business succession, funeral preferences, and special instructions as focused records rather than one fragile block of text.", collection:"instructions", create:"detail", createLabel:"Add instruction", icon:"note", path:item=>`/will/details/${item.id}`, titleOf:item=>item.title, meta:item=>`Updated ${date(item.updatedAt)}`, badge:item=>text(item.type), description:item=>item.content, filters:["type"] },
  digital: { eyebrow:"DIGITAL LEGACY", title:"A deliberate plan for the digital estate.", lead:"Record what should happen to domains, subscriptions, cloud files, digital assets, and online identities. Keep raw credentials inside the dedicated password system, never in these instructions.", collection:"digital", create:"digital-legacy", createLabel:"Add digital instruction", icon:"key", path:item=>`/will/details/${item.id}`, titleOf:item=>item.title, meta:item=>`Updated ${date(item.updatedAt)}`, badge:()=>"digital legacy", description:item=>item.content, filters:[] },
};

function Card({ item, config }) {
  const warning = config.warning?.(item);
  return <Link to={config.path(item)} className="estate-directory-card">
    <div className="estate-directory-card-top"><span>{config.badge(item)}</span><NavigationIcon name="chevron" size={15} /></div>
    <h2>{config.titleOf(item) || "Untitled record"}</h2><strong>{config.meta(item)}</strong>
    <p>{config.description(item) || "Open the protected record for more information."}</p>
    <footer><time>Updated {date(item.updatedAt)}</time>{warning && <em>{warning}</em>}</footer>
  </Link>;
}

export default function WillCollectionWorkspace({ view }) {
  const config = CONFIG[view];
  const [unlocked,setUnlocked] = useState(Boolean(getVaultToken("will")));
  const [will,setWill] = useState(null); const [error,setError] = useState("");
  const [query,setQuery] = useState(""); const [filter,setFilter] = useState("all"); const [sort,setSort] = useState("recent");
  const load = useCallback(async()=>{ setError(""); try { const response=await willApi.get(); setWill(response.will); setUnlocked(true); } catch(err) { if(err.requiresVault){clearVaultToken("will");setUnlocked(false);setWill(null);} else setError(err.message || "We couldn't load this estate directory."); } },[]);
  useEffect(()=>{ if(unlocked) load(); },[unlocked,load]);
  const records = useMemo(()=>{
    if(!will || !config) return [];
    if(config.collection === "people") return [...(will.executors || []).map(item=>({...item,__kind:"Executor"})),...(will.contacts || []).map(item=>({...item,__kind:"Important contact"}))];
    if(config.collection === "instructions") return (will.details || []).filter(item=>String(item.type || "").replaceAll("_","-") !== "digital-legacy");
    if(config.collection === "digital") return (will.details || []).filter(item=>String(item.type || "").replaceAll("_","-") === "digital-legacy");
    return will[config.collection] || [];
  },[will,config]);
  const filterKey=config?.filters?.[0];
  const filterValues=useMemo(()=>filterKey ? [...new Set(records.map(item=>String(item[filterKey] || "Other")))].sort() : [],[records,filterKey]);
  const visible=useMemo(()=>records.filter(item=>{
    const haystack=JSON.stringify(item).toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (filter === "all" || String(item[filterKey] || "Other") === filter);
  }).sort((a,b)=>sort === "name" ? String(config.titleOf(a)).localeCompare(String(config.titleOf(b))) : new Date(b.updatedAt || b.createdAt || 0)-new Date(a.updatedAt || a.createdAt || 0)),[records,query,filter,sort,filterKey,config]);
  if(!unlocked) return <div className="max-w-[620px] mx-auto"><span className="eyebrow">PRIVATE & SENSITIVE</span><h1 className="page-title">Will & Inheritance</h1><p className="text-ink-muted mb-6">Unlock the protected estate workspace to continue.</p><VaultGate vault="will" onUnlock={()=>setUnlocked(true)} /></div>;
  if(!config) return null;
  const incomplete=records.filter(item=>config.warning?.(item)).length;
  return <ProtectedContentBoundary vault="will"><main className="will-workspace estate-directory">
    <header className="estate-directory-hero"><div><span className="eyebrow">{config.eyebrow}</span><h1>{config.title}</h1><p>{config.lead}</p></div><div className="estate-directory-count"><strong>{will ? records.length : "—"}</strong><span>protected records</span><small>{incomplete ? `${incomplete} require attention` : "No immediate gaps detected"}</small></div></header>
    <WillWorkspaceNavigation />
    {error && <div className="inline-error" role="alert"><span>{error}</span><button onClick={load}>Retry</button></div>}
    <section className="estate-directory-toolbar"><div className="estate-directory-search"><NavigationIcon name="search" size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={`Search ${config.collection.replaceAll("-"," ")}…`} aria-label={`Search ${config.collection}`} /></div>{filterValues.length>1 && <select value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">All types</option>{filterValues.map(value=><option key={value} value={value}>{text(value)}</option>)}</select>}<select value={sort} onChange={event=>setSort(event.target.value)}><option value="recent">Recently updated</option><option value="name">Name</option></select><Link className="btn-primary" to={`/will?create=${encodeURIComponent(config.create)}&returnTo=${encodeURIComponent(location.pathname)}`}><NavigationIcon name="plus" size={15}/>{config.createLabel}</Link></section>
    <section className="estate-directory-summary"><div><span>Recorded</span><strong>{records.length}</strong></div><div><span>Needs review</span><strong>{incomplete}</strong></div><div><span>Last estate review</span><strong>{date(will?.updatedAt)}</strong></div></section>
    {will && !records.length ? <section className="estate-directory-empty"><NavigationIcon name={config.icon} size={30}/><h2>Build the first {config.collection.replaceAll("-"," ")} record.</h2><p>{config.lead}</p><Link className="btn-primary" to={`/will?create=${encodeURIComponent(config.create)}&returnTo=${encodeURIComponent(location.pathname)}`}>{config.createLabel}</Link></section> : <section className="estate-directory-grid">{visible.map(item=><Card key={`${item.__kind || view}-${item.id}`} item={item} config={config}/>)}</section>}
    {will && records.length>0 && visible.length===0 && <section className="estate-directory-empty"><NavigationIcon name="search" size={28}/><h2>No matching estate records.</h2><p>Try a broader search or remove the current filter.</p><button className="btn-outline" onClick={()=>{setQuery("");setFilter("all");}}>Clear filters</button></section>}
  </main></ProtectedContentBoundary>;
}

export function WillDocumentsWorkspace() {
  const [unlocked,setUnlocked]=useState(Boolean(getVaultToken("will"))); const [will,setWill]=useState(null); const [error,setError]=useState("");
  const load=useCallback(async()=>{try{const response=await willApi.get();setWill(response.will);setUnlocked(true);}catch(err){if(err.requiresVault){clearVaultToken("will");setUnlocked(false);}else setError(err.message||"We couldn't load protected documents.");}},[]);
  useEffect(()=>{if(unlocked)load();},[unlocked,load]);
  if(!unlocked)return <div className="max-w-[620px] mx-auto"><VaultGate vault="will" onUnlock={()=>setUnlocked(true)}/></div>;
  return <ProtectedContentBoundary vault="will"><main className="will-workspace estate-directory"><header className="estate-directory-hero"><div><span className="eyebrow">SECURE EVIDENCE ROOM</span><h1>Documents with a clear estate purpose.</h1><p>Keep deeds, policies, certificates, contracts, identification, and supporting evidence connected to the estate record they substantiate.</p></div><div className="estate-directory-count"><strong>{will?.documents?.length ?? "—"}</strong><span>protected files</span><small>Access is logged inside the vault</small></div></header><WillWorkspaceNavigation/>{error&&<div className="inline-error"><span>{error}</span><button onClick={load}>Retry</button></div>}<section className="estate-document-room"><div><span className="eyebrow">DOCUMENT REGISTER</span><h2>Estate evidence</h2><p>Upload supporting records here or from the asset they belong to. Files stay inside the Will vault boundary.</p></div>{will&&<WillDocuments documents={will.documents||[]} onChange={documents=>setWill(current=>({...current,documents}))}/>}</section></main></ProtectedContentBoundary>;
}

export function WillActivityWorkspace() {
  const [unlocked,setUnlocked]=useState(Boolean(getVaultToken("will"))); const [will,setWill]=useState(null); const [query,setQuery]=useState("");
  const load=useCallback(async()=>{try{const response=await willApi.get();setWill(response.will);setUnlocked(true);}catch(err){if(err.requiresVault){clearVaultToken("will");setUnlocked(false);}}},[]); useEffect(()=>{if(unlocked)load();},[unlocked,load]);
  if(!unlocked)return <div className="max-w-[620px] mx-auto"><VaultGate vault="will" onUnlock={()=>setUnlocked(true)}/></div>;
  const rows=(will?.activities||[]).filter(item=>!query||`${item.message} ${item.action} ${item.entityType}`.toLowerCase().includes(query.toLowerCase()));
  return <ProtectedContentBoundary vault="will"><main className="will-workspace estate-directory"><header className="estate-directory-hero"><div><span className="eyebrow">SECURITY & PROVENANCE</span><h1>A durable history of the estate record.</h1><p>Review what changed, when it changed, and which protected record was affected without exposing the record content itself.</p></div><div className="estate-directory-count"><strong>{will?.activities?.length??"—"}</strong><span>recorded events</span><small>Newest activity first</small></div></header><WillWorkspaceNavigation/><div className="estate-directory-toolbar"><div className="estate-directory-search"><NavigationIcon name="search" size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search activity…"/></div></div><section className="estate-activity-ledger">{rows.map(item=><article key={item.id}><span><NavigationIcon name="clock" size={15}/></span><div><strong>{item.message}</strong><small>{text(item.action)} · {text(item.entityType)}</small></div><time>{date(item.createdAt)}</time></article>)}{will&&!rows.length&&<div className="estate-directory-empty"><h2>No matching activity.</h2><p>The audit trail will appear here as protected records change.</p></div>}</section></main></ProtectedContentBoundary>;
}
