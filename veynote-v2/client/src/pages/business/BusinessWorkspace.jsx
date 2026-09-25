import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import NavigationIcon from "../../components/layout/NavigationIcon";

const CUSTOMER_STAGES = ["LEAD", "CONTACTED", "QUALIFIED", "CUSTOMER", "INACTIVE"];
const OPPORTUNITY_STAGES = ["DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
const label = value => String(value || "").toLowerCase().replace(/(^|\s|_)\S/g, letter => letter.toUpperCase()).replaceAll("_", " ");
const date = value => value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const money = (value, currency) => value == null ? "No amount" : new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(Number(value));

function Notice({ error, retry }) { return error ? <div className="inline-error" role="alert"><span>{error.message || error}</span>{retry && <button type="button" onClick={retry}>Retry</button>}</div> : null; }
function Empty({ icon = "brief", title, children }) { return <div className="business-empty"><span><NavigationIcon name={icon} size={24} /></span><h2>{title}</h2><p>{children}</p></div>; }
function Header({ eyebrow, title, description, action }) { return <header className="product-page-header business-header"><div><span className="eyebrow">{eyebrow}</span><h1 className="page-title">{title}</h1><p>{description}</p></div>{action}</header>; }

export default function BusinessWorkspace() {
  const { data, error, refresh } = useApiQuery("/business/workspaces");
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem("veynote_business_workspace") || "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const workspaces = data?.workspaces || [];
  const workspace = workspaces.find(item => item.id === selectedId) || workspaces[0];
  useEffect(() => { if (workspace?.id && workspace.id !== selectedId) { setSelectedId(workspace.id); localStorage.setItem("veynote_business_workspace", workspace.id); } }, [workspace?.id, selectedId]);
  async function create(event) {
    event.preventDefault(); setSaving(true); setFormError("");
    try { const result = await api.post("/business/workspaces", { name, description }); setSelectedId(result.workspace.id); localStorage.setItem("veynote_business_workspace", result.workspace.id); setName(""); setDescription(""); setShowCreate(false); await refresh(); }
    catch (failure) { setFormError(failure.message); } finally { setSaving(false); }
  }
  if (!data) return <div className="business-page"><Header eyebrow="BUSINESS" title="Your business workspace" description="Customers, conversations, and opportunities in one connected place." /><Notice error={error} retry={refresh} /><div className="business-placeholder" aria-hidden="true" /></div>;
  if (!workspace) return <div className="business-page business-onboarding"><Header eyebrow="BUSINESS" title="Build a clearer picture of your business." description="Bring your customers, conversations, and opportunities into one connected record." /><div className="business-onboarding-grid"><div><span className="eyebrow">ONE CONNECTED WORKSPACE</span><h2>Know the people behind every opportunity.</h2><p>Start with a workspace name. Add customers and track their journey from first contact to ongoing relationship.</p><div className="business-onboarding-steps"><span>01 · Customers</span><span>02 · Conversations</span><span>03 · Pipeline</span></div></div><form onSubmit={create} className="business-form-panel"><h2>Create a workspace</h2><label>Workspace name<input value={name} onChange={event => setName(event.target.value)} required maxLength={140} placeholder="e.g. Northstar Studio" /></label><label>What does your business do?<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} rows={3} placeholder="A short description for your team" /></label><Notice error={formError} /><button className="btn-primary" disabled={saving}>{saving ? "Creating…" : "Create workspace"}</button></form></div></div>;
  return <div className="business-page">
    <div className="business-workspace-strip">
      <span className="business-workspace-mark"><NavigationIcon name="brief" size={18} /></span>
      <div><small>CURRENT WORKSPACE</small><strong>{workspace.name}</strong></div>
      {workspaces.length > 1 && <select aria-label="Switch business workspace" value={workspace.id} onChange={event => { setSelectedId(event.target.value); localStorage.setItem("veynote_business_workspace", event.target.value); }}>{workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      <button className="business-workspace-add" onClick={() => setShowCreate(true)} aria-label="Create another business workspace"><NavigationIcon name="plus" size={15} /></button>
      <span className="business-role">{label(workspace.role)}</span>
    </div>
    <Outlet context={{ workspace }} />
    {showCreate && <div className="business-modal-backdrop" onClick={() => setShowCreate(false)}><form className="business-form-panel business-modal" onClick={event => event.stopPropagation()} onSubmit={create}>
      <div className="business-modal-head"><div><span className="eyebrow">ANOTHER BUSINESS</span><h2>Create a workspace</h2></div><button type="button" aria-label="Close" onClick={() => setShowCreate(false)}><NavigationIcon name="close" size={18} /></button></div>
      <p>Keep each business and its customer records separate.</p>
      <label>Workspace name<input value={name} onChange={event => setName(event.target.value)} required maxLength={140} autoFocus /></label>
      <label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} rows={3} /></label>
      <Notice error={formError} /><button className="btn-primary" disabled={saving}>{saving ? "Creating…" : "Create workspace"}</button>
    </form></div>}
  </div>;
}

function useBusiness() { return useOutletContext(); }

export function BusinessDashboard() {
  const { workspace } = useBusiness();
  const { data, error, refresh } = useApiQuery(`/business/${workspace.id}/overview`);
  const stageCount = key => data?.stageCounts?.find(item => item.stage === key)?._count?._all || 0;
  const opportunityCount = key => data?.opportunityCounts?.find(item => item.stage === key)?._count?._all || 0;
  return <><Header eyebrow="BUSINESS / OVERVIEW" title="A clearer view of the work." description={workspace.description || "Your customer relationships, follow-ups, and opportunities in one place."} action={<Link className="btn-primary" to="/business/customers?new=1"><NavigationIcon name="plus" size={15} /> New customer</Link>} /><Notice error={error} retry={refresh} /><div className="business-summary"><Link to="/business/customers"><small>ACTIVE CUSTOMERS & LEADS</small><strong>{data?.customerCount ?? "—"}</strong><span>View people <NavigationIcon name="chevron" size={13} /></span></Link><Link to="/business/customers?stage=LEAD"><small>NEW LEADS</small><strong>{data ? stageCount("LEAD") : "—"}</strong><span>Review leads <NavigationIcon name="chevron" size={13} /></span></Link><Link to="/business/pipeline"><small>OPEN OPPORTUNITIES</small><strong>{data ? OPPORTUNITY_STAGES.slice(0, 3).reduce((sum, stage) => sum + opportunityCount(stage), 0) : "—"}</strong><span>Open pipeline <NavigationIcon name="chevron" size={13} /></span></Link></div><div className="business-dashboard-grid"><section className="business-panel"><div className="business-panel-heading"><div><span className="eyebrow">RELATIONSHIP HISTORY</span><h2>Recent activity</h2></div><Link to="/business/customers">All customers →</Link></div>{data?.recentInteractions?.length ? <div className="business-activity-list">{data.recentInteractions.map(item => <Link key={item.id} to={`/business/customers/${item.customer.id}`}><span className="business-activity-icon"><NavigationIcon name="clock" size={16} /></span><div><strong>{item.customer.name}</strong><p>{item.summary}</p><small>{label(item.type)} · {date(item.occurredAt)}</small></div><NavigationIcon name="chevron" size={15} /></Link>)}</div> : <Empty icon="clock" title="A place for every conversation">Add an interaction from a customer record to build a useful relationship history.</Empty>}</section><section className="business-panel"><div className="business-panel-heading"><div><span className="eyebrow">WHAT IS NEXT</span><h2>Upcoming follow-ups</h2></div></div>{data?.nextActions?.length ? <div className="business-followup-list">{data.nextActions.map(item => <Link key={item.id} to={`/business/customers/${item.customer.id}`}><time>{date(item.nextActionAt)}</time><strong>{item.customer.name}</strong><p>{item.summary}</p></Link>)}</div> : <Empty icon="calendar" title="Your next steps stay visible">Set a follow-up date when you record a customer interaction.</Empty>}</section></div></>;
}

export function BusinessCustomers() {
  const { workspace } = useBusiness();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [name, setName] = useState(""); const [company, setCompany] = useState(""); const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState("");
  const navigate = useNavigate();
  const stage = params.get("stage") || "";
  const archived = params.get("archived") === "true";
  const path = `/business/${workspace.id}/customers`;
  const { data, error, refresh } = useApiQuery(path, { q: params.get("q") || undefined, stage: stage || undefined, archived: archived || undefined, page: params.get("page") || undefined });
  function setParam(key, value) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (["q", "stage", "archived"].includes(key)) next.delete("page"); setParams(next); }
  async function create(event) { event.preventDefault(); setSaving(true); setFormError(""); try { const result = await api.post(path, { name, company, email }); setParam("new", ""); navigate(`/business/customers/${result.customer.id}`); } catch (failure) { setFormError(failure.message); } finally { setSaving(false); } }
  return <>
    <Header eyebrow="BUSINESS / PEOPLE" title="Customers & relationships" description="Keep the full story of each lead and customer together."
      action={workspace.role !== "VIEWER" && <button className="btn-primary" onClick={() => setParam("new", "1")}><NavigationIcon name="plus" size={15} /> Add customer</button>} />
    <div className="business-toolbar">
      <form onSubmit={event => { event.preventDefault(); setParam("q", query.trim()); }}><NavigationIcon name="search" size={17} /><input aria-label="Search customers" placeholder="Search name, company, or email" value={query} onChange={event => setQuery(event.target.value)} /><button type="submit">Search</button></form>
      <select aria-label="Filter customer stage" value={stage} onChange={event => setParam("stage", event.target.value)}><option value="">All stages</option>{CUSTOMER_STAGES.map(item => <option key={item} value={item}>{label(item)}</option>)}</select>
      <button className={archived ? "is-active" : ""} onClick={() => setParam("archived", archived ? "" : "true")}>{archived ? "Active" : "Archived"}</button>
    </div>
    <Notice error={error} retry={refresh} />
    {data?.customers?.length ? <div className="business-customer-grid">{data.customers.map(customer => <Link key={customer.id} to={`/business/customers/${customer.id}`} className="business-customer-card">
      <div><span className="business-avatar">{customer.name.slice(0, 1).toUpperCase()}</span><span className="business-stage">{label(customer.stage)}</span></div>
      <h2>{customer.name}</h2><p>{customer.company || customer.email || "Individual contact"}</p>
      <footer><small>{customer._count?.interactions || 0} interactions · {customer._count?.opportunities || 0} opportunities</small><NavigationIcon name="chevron" size={16} /></footer>
    </Link>)}</div> : <Empty icon="brief" title={data ? "No customers in this view" : "Preparing your customer directory"}>{data ? "Add a customer or adjust the filters to find the people you need." : "Your customer records will appear here shortly."}</Empty>}
    {data?.pageCount > 1 && <div className="business-pagination"><span>{data.total} records · Page {data.page} of {data.pageCount}</span><div><button disabled={data.page <= 1} onClick={() => setParam("page", String(data.page - 1))}>Previous</button><button disabled={data.page >= data.pageCount} onClick={() => setParam("page", String(data.page + 1))}>Next</button></div></div>}
    {params.get("new") === "1" && <div className="business-modal-backdrop" onClick={() => setParam("new", "")}>
      <form className="business-form-panel business-modal" onClick={event => event.stopPropagation()} onSubmit={create}>
        <div className="business-modal-head"><div><span className="eyebrow">NEW RELATIONSHIP</span><h2>Add a customer</h2></div><button type="button" aria-label="Close" onClick={() => setParam("new", "")}><NavigationIcon name="close" size={18} /></button></div>
        <p>Start with a person. Add the conversation history and opportunities from their record.</p>
        <label>Name<input required maxLength={180} autoFocus value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Company<input maxLength={180} value={company} onChange={event => setCompany(event.target.value)} /></label>
        <label>Email<input type="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
        <Notice error={formError} /><button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Create customer"}</button>
      </form>
    </div>}
  </>;
}

export function BusinessCustomerDetail() {
  const { workspace } = useBusiness(); const { id } = useParams();
  const path = `/business/${workspace.id}/customers/${id}`;
  const { data, error, refresh } = useApiQuery(path);
  const [editing, setEditing] = useState(false); const [form, setForm] = useState({});
  const [interaction, setInteraction] = useState(""); const [type, setType] = useState("NOTE"); const [nextActionAt, setNextActionAt] = useState("");
  const [newOpportunity, setNewOpportunity] = useState(false); const [title, setTitle] = useState(""); const [amount, setAmount] = useState(""); const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false); const [formError, setFormError] = useState("");
  const customer = data?.customer; const canWrite = workspace.role !== "VIEWER";
  async function saveCustomer(event) { event.preventDefault(); setSaving(true); setFormError(""); try { await api.patch(path, form); await refresh(); setEditing(false); } catch (failure) { setFormError(failure.message); } finally { setSaving(false); } }
  async function addInteraction(event) { event.preventDefault(); setSaving(true); setFormError(""); try { await api.post(`${path}/interactions`, { type, summary: interaction, nextActionAt: nextActionAt || null }); setInteraction(""); setNextActionAt(""); await refresh(); } catch (failure) { setFormError(failure.message); } finally { setSaving(false); } }
  async function addOpportunity(event) { event.preventDefault(); setSaving(true); setFormError(""); try { await api.post(`/business/${workspace.id}/opportunities`, { customerId: id, title, amount: amount || null, currency }); setNewOpportunity(false); setTitle(""); setAmount(""); await refresh(); } catch (failure) { setFormError(failure.message); } finally { setSaving(false); } }
return <><Header eyebrow="BUSINESS / CUSTOMER" title={customer?.name || "Customer record"} description={customer ? `${customer.company || "Individual contact"} · ${label(customer.stage)}` : "Opening the relationship record."} action={customer && canWrite && <button className="btn-primary" onClick={() => { setForm({ name: customer.name, company: customer.company || "", email: customer.email || "", phone: customer.phone || "", source: customer.source || "", stage: customer.stage, notes: customer.notes || "" }); setEditing(true); }}>Edit profile</button>} /><Notice error={error} retry={refresh} /><Notice error={!editing && formError} />{customer && <div className="business-detail-grid"><section className="business-panel business-profile"><div className="business-profile-identity"><span className="business-avatar">{customer.name.slice(0, 1)}</span><div><h2>{customer.name}</h2><span className="business-stage">{label(customer.stage)}</span></div></div><dl><div><dt>Company</dt><dd>{customer.company || "—"}</dd></div><div><dt>Email</dt><dd>{customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : "—"}</dd></div><div><dt>Phone</dt><dd>{customer.phone || "—"}</dd></div><div><dt>Source</dt><dd>{customer.source || "—"}</dd></div></dl>{customer.notes && <p className="business-profile-notes">{customer.notes}</p>}</section><div className="business-detail-main"><section className="business-panel"><div className="business-panel-heading"><div><span className="eyebrow">CONVERSATION HISTORY</span><h2>Interactions</h2></div><small>{customer.interactions?.length || 0} recorded</small></div>{canWrite && <form className="business-interaction-compose" onSubmit={addInteraction}><select aria-label="Interaction type" value={type} onChange={event => setType(event.target.value)}>{["NOTE", "CALL", "EMAIL", "MEETING", "OTHER"].map(item => <option key={item}>{item}</option>)}</select><textarea required value={interaction} onChange={event => setInteraction(event.target.value)} placeholder="What happened? Record the useful context and next step." rows={3} /><label>Next follow-up <input type="date" value={nextActionAt} onChange={event => setNextActionAt(event.target.value)} /></label><button className="btn-primary" disabled={saving || !interaction.trim()}>Record interaction</button></form>}{customer.interactions?.length ? <div className="business-timeline">{customer.interactions.map(item => <article key={item.id}><span className="business-timeline-dot" /><div><small>{label(item.type)} · {date(item.occurredAt)} · {item.actorName}</small><p>{item.summary}</p>{item.nextActionAt && <span>Follow up {date(item.nextActionAt)}</span>}</div></article>)}</div> : <Empty icon="clock" title="No interactions yet">Keep decisions, calls, and conversations attached to this customer.</Empty>}</section><section className="business-panel"><div className="business-panel-heading"><div><span className="eyebrow">COMMERCIAL CONTEXT</span><h2>Opportunities</h2></div>{canWrite && <button onClick={() => setNewOpportunity(value => !value)}>+ Add opportunity</button>}</div>{newOpportunity && <form className="business-opportunity-compose" onSubmit={addOpportunity}><input aria-label="Opportunity title" required maxLength={180} placeholder="What is the opportunity?" value={title} onChange={event => setTitle(event.target.value)} /><div><input aria-label="Amount" inputMode="decimal" placeholder="Amount (optional)" value={amount} onChange={event => setAmount(event.target.value)} /><input aria-label="Currency" maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())} /></div><button className="btn-primary" disabled={saving}>Save opportunity</button></form>}{customer.opportunities?.length ? <div className="business-opportunity-list">{customer.opportunities.map(item => <div key={item.id}><div><strong>{item.title}</strong><small>{label(item.stage)}</small></div><span>{money(item.amount, item.currency)}</span></div>)}</div> : !newOpportunity && <Empty icon="chart" title="No opportunities yet">Connect a proposal or deal to this relationship when one emerges.</Empty>}</section></div></div>}{editing && <div className="business-modal-backdrop" onClick={() => setEditing(false)}><form className="business-form-panel business-modal" onClick={event => event.stopPropagation()} onSubmit={saveCustomer}><div className="business-modal-head"><h2>Edit customer</h2><button type="button" aria-label="Close" onClick={() => setEditing(false)}><NavigationIcon name="close" size={18} /></button></div>{["name", "company", "email", "phone", "source"].map(field => <label key={field}>{label(field)}<input value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })} required={field === "name"} /></label>)}<label>Journey stage<select value={form.stage} onChange={event => setForm({ ...form, stage: event.target.value })}>{CUSTOMER_STAGES.map(stage => <option key={stage} value={stage}>{label(stage)}</option>)}</select></label><label>Context<textarea rows={3} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label><Notice error={formError} /><button className="btn-primary" disabled={saving}>Save changes</button><button type="button" onClick={async () => { if (!window.confirm(customer.isArchived ? "Restore this customer?" : "Archive this customer? Their history remains intact.")) return; try { await api.patch(path, { isArchived: !customer.isArchived }); setEditing(false); await refresh(); } catch (failure) { setFormError(failure.message); } }}>{customer.isArchived ? "Restore customer" : "Archive customer"}</button></form></div>}</>;
}

export function BusinessPipeline() {
  const { workspace } = useBusiness();
  const { data, error, refresh } = useApiQuery(`/business/${workspace.id}/opportunities`);
  const [busy, setBusy] = useState(""); const [moveError, setMoveError] = useState("");
  const grouped = useMemo(() => Object.fromEntries(OPPORTUNITY_STAGES.map(stage => [stage, (data?.opportunities || []).filter(item => item.stage === stage)])), [data]);
  async function move(item, stage) { setBusy(item.id); setMoveError(""); try { await api.patch(`/business/${workspace.id}/opportunities/${item.id}`, { stage }); await refresh(); } catch (failure) { setMoveError(failure.message); } finally { setBusy(""); } }
  return <><Header eyebrow="BUSINESS / PIPELINE" title="Opportunity pipeline" description="Track each potential sale by its real stage, customer, and value." action={<Link className="btn-primary" to="/business/customers">Open customers</Link>} /><Notice error={error || moveError} retry={refresh} /><div className="business-pipeline-board">{OPPORTUNITY_STAGES.map(stage => <section key={stage} className="business-pipeline-column"><header><span>{label(stage)}</span><strong>{grouped[stage].length}</strong></header>{grouped[stage].map(item => <article key={item.id}><span className="eyebrow">{item.customer?.company || item.customer?.name}</span><h2>{item.title}</h2><strong>{money(item.amount, item.currency)}</strong><Link to={`/business/customers/${item.customerId}`}>View customer <NavigationIcon name="chevron" size={13} /></Link>{workspace.role !== "VIEWER" && <select aria-label={`Move ${item.title} to stage`} value={item.stage} disabled={busy === item.id} onChange={event => move(item, event.target.value)}>{OPPORTUNITY_STAGES.map(option => <option key={option} value={option}>{label(option)}</option>)}</select>}</article>)}{!grouped[stage].length && <p className="business-pipeline-empty">No opportunities here yet.</p>}</section>)}</div></>;
}

export function BusinessFollowUps() {
  const { workspace } = useBusiness();
  const path = `/business/${workspace.id}/follow-ups`;
  const { data, error, refresh } = useApiQuery(path);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const followUps = data?.followUps || [];
  async function complete(item) {
    setBusy(item.id); setActionError("");
    try { await api.patch(`${path}/${item.id}`, { completed: true }); await refresh(); }
    catch (failure) { setActionError(failure.message); } finally { setBusy(""); }
  }
  return <>
    <Header eyebrow="BUSINESS / NEXT ACTIONS" title="Follow-ups" description="A working queue of promised next steps, kept with the customer conversation that created them." action={<Link className="btn-primary" to="/business/customers">Open customers</Link>} />
    <Notice error={error || actionError} retry={refresh} />
    <div className="business-followup-layout">
      <div className="business-followup-intro"><span className="eyebrow">OPEN COMMITMENTS</span><strong>{data ? followUps.length : "—"}</strong><p>Follow-ups are created when you record a customer interaction. Complete one here when the action is done.</p></div>
      <section className="business-panel business-followup-queue">
        {followUps.length ? followUps.map(item => <article key={item.id} className={item.nextActionAt?.slice(0, 10) < today ? "is-overdue" : ""}>
          <div className="business-followup-date"><span>{item.nextActionAt?.slice(0, 10) < today ? "OVERDUE" : "DUE"}</span><time>{date(item.nextActionAt)}</time></div>
          <div className="business-followup-body"><Link to={`/business/customers/${item.customerId}`}>{item.customer?.name} <NavigationIcon name="chevron" size={13} /></Link><p>{item.summary}</p><small>{label(item.type)} · {item.customer?.company || "Customer"}</small></div>
          {workspace.role !== "VIEWER" && <button type="button" disabled={busy === item.id} onClick={() => complete(item)}>{busy === item.id ? "Saving…" : "Mark complete"}</button>}
        </article>) : <Empty icon="calendar" title={data ? "All caught up" : "Preparing follow-ups"}>{data ? "Your next customer commitment will appear here when you set a follow-up date." : "Your open actions will appear here shortly."}</Empty>}
      </section>
    </div>
  </>;
}
