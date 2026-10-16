import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import ConfirmDialog from "../../components/ConfirmDialog";
import PageSkeleton from "../../components/PageSkeleton.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { CATEGORIES, COMPLIANCE, PRIORITIES } from "./TradingRules";

const STATUSES = ["Active", "Reviewing", "Retired"];

export default function TradingRuleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rule, setRule] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [state, setState] = useState("saved");
  const [error, setError] = useState("");
  const [events, setEvents] = useState(null);
  const [trades, setTrades] = useState([]);
  const [recording, setRecording] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [eventError, setEventError] = useState("");
  const [eventDraft, setEventDraft] = useState({ kind: "CHECK", complianceStatus: "COMPLIANT", note: "", correctiveAction: "", tradingEntryId: "", occurredAt: new Date().toISOString().slice(0,10) });

  useEffect(() => {
    api.get(`/trading-rules/${id}`).then((data) => setRule(data.rule)).catch((requestError) => setError(requestError.message));
    api.get(`/trading-rules/${id}/events`).then((data) => setEvents(data.events)).catch((requestError) => setEventError(requestError.message || "Verification history could not be loaded."));
    api.get("/trading/entries").then((data) => setTrades((data.entries || []).filter(entry => entry.isTrade && !entry.isDraft))).catch(() => {});
    api.get("/accounts").then((data) => setAccounts(data.accounts)).catch(() => {});
  }, [id]);

  async function patch(fields) {
    setState("saving"); setError("");
    try {
      const { rule: updated } = await api.patch(`/trading-rules/${id}`, fields);
      setRule((current) => ({ ...current, ...updated }));
      setState("saved");
    } catch (requestError) {
      setError(requestError.message || "This rule could not be saved.");
      setState("failed");
    }
  }

  async function remove() {
    setState("saving"); setError("");
    try { await api.delete(`/trading-rules/${id}`); navigate("/trading/rules"); }
    catch (requestError) { setError(requestError.message || "This rule could not be deleted."); setState("failed"); setConfirmDelete(false); }
  }
  function beginEvent(kind) {
    setEventDraft(current => ({ ...current, kind, complianceStatus: kind === "VIOLATION" ? "VIOLATED" : "COMPLIANT", note: "", correctiveAction: "", tradingEntryId: "", occurredAt: new Date().toISOString().slice(0,10) }));
    setEventError(""); setRecording(true);
  }
  async function recordEvent(event) {
    event.preventDefault(); setEventBusy(true); setEventError("");
    try {
      const body = await api.post(`/trading-rules/${id}/events`, eventDraft);
      setEvents(current => [body.event, ...(current || [])]);
      setRule(current => ({ ...current, complianceStatus: body.event.complianceStatus }));
      setRecording(false);
    } catch (requestError) { setEventError(requestError.message || "This verification could not be recorded."); }
    finally { setEventBusy(false); }
  }
  async function removeEvent(eventId) {
    setEventError("");
    try { await api.delete(`/trading-rules/${id}/events/${eventId}`); setEvents(current => (current || []).filter(item => item.id !== eventId)); }
    catch (requestError) { setEventError(requestError.message || "This verification record could not be removed."); }
  }
  if (!rule) return <div className="rule-detail-page">{error ? <div className="form-error">{error}</div> : <PageSkeleton title="Trading rule" />}</div>;

  return <div className="rule-detail-page">
    <header className="rule-detail-hero">
      <div className="rule-detail-meta"><span className="eyebrow">RULEBOOK CONTROL</span><span className={`save-state ${state}`}>{state === "saving" ? "Saving…" : state === "failed" ? "Save failed" : "Saved"}</span></div>
      <textarea aria-label="Rule text" value={rule.rule} onChange={(event) => setRule({ ...rule, rule: event.target.value })} onBlur={(event) => patch({ rule: event.target.value })} />
      <div className="rule-detail-badges"><span>{rule.category || "Uncategorized"}</span><span>{rule.priority || "Optional"}</span><span>{rule.account?.name || "All accounts"}</span></div>
    </header>

    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="rule-detail-grid">
      <section className="card rule-control-panel"><div className="section-heading"><div><span className="eyebrow">CONTROL</span><h2>Scope & enforcement</h2></div></div>
        <RuleField label="Category"><select value={rule.category || ""} onChange={(event) => patch({ category: event.target.value })}><option value="">Uncategorized</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></RuleField>
        <RuleField label="Priority"><select value={rule.priority || ""} onChange={(event) => patch({ priority: event.target.value })}><option value="">Optional</option>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></RuleField>
        <RuleField label="Lifecycle"><select value={rule.status} onChange={(event) => patch({ status: event.target.value })}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></RuleField>
        <RuleField label="Compliance"><select value={rule.complianceStatus || "UNREVIEWED"} onChange={(event) => patch({ complianceStatus: event.target.value })}>{COMPLIANCE.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></RuleField>
        <RuleField label="Trading account"><select value={rule.accountId || ""} onChange={(event) => patch({ accountId: event.target.value })}><option value="">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></RuleField>
      </section>

      <section className="card rule-limit-panel"><div className="section-heading"><div><span className="eyebrow">THRESHOLD</span><h2>Measurable limit</h2></div></div><p>Attach a number when this rule has a hard boundary, such as 1% risk or 3 trades.</p>
        <div className="rule-limit-input"><input type="number" min="0" step="any" value={rule.limitValue ?? ""} onChange={(event) => setRule({ ...rule, limitValue: event.target.value })} onBlur={(event) => patch({ limitValue: event.target.value })} placeholder="1" /><select value={rule.limitUnit || ""} onChange={(event) => patch({ limitUnit: event.target.value })}><option value="">Unit</option><option value="%">%</option><option value="trades">Trades</option><option value="R">R</option><option value="minutes">Minutes</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="NGN">NGN</option></select></div>
        <label className="rule-review-date"><span>Next review</span><input type="date" value={rule.reviewDate ? rule.reviewDate.slice(0, 10) : ""} onChange={(event) => patch({ reviewDate: event.target.value })} /></label>
      </section>
    </div>

    <section className="card rule-rationale-panel"><div className="section-heading"><div><span className="eyebrow">RATIONALE & RESPONSE</span><h2>Why this rule exists</h2></div></div><textarea value={rule.notes || ""} onChange={(event) => setRule({ ...rule, notes: event.target.value })} onBlur={(event) => patch({ notes: event.target.value })} placeholder="Describe the trigger, why it matters, and exactly what you should do when the limit is reached." /></section>

    <section className="rule-verification-workspace">
      <header><div><span className="eyebrow">COMPLIANCE LEDGER</span><h2>Evidence, breaches and corrective action.</h2><p>Keep an auditable history of how this control performed in real decisions.</p></div><div><button type="button" className="btn-outline" onClick={()=>beginEvent("CHECK")}>Record check</button><button type="button" className="btn-primary" onClick={()=>beginEvent("VIOLATION")}>Log violation</button></div></header>
      {recording && <form className="rule-event-composer" onSubmit={recordEvent}><div className="rule-event-type"><label><span>Record type</span><select value={eventDraft.kind} onChange={event=>setEventDraft(current=>({...current,kind:event.target.value}))}><option value="CHECK">Compliance check</option><option value="VIOLATION">Violation</option><option value="REVIEW">Formal review</option></select></label><label><span>Outcome</span><select value={eventDraft.complianceStatus} onChange={event=>setEventDraft(current=>({...current,complianceStatus:event.target.value}))}>{COMPLIANCE.map(item=><option key={item} value={item}>{item.replaceAll("_"," ")}</option>)}</select></label><label><span>Date</span><input type="date" value={eventDraft.occurredAt} onChange={event=>setEventDraft(current=>({...current,occurredAt:event.target.value}))}/></label><label><span>Related trade</span><select value={eventDraft.tradingEntryId} onChange={event=>setEventDraft(current=>({...current,tradingEntryId:event.target.value}))}><option value="">No trade linked</option>{trades.slice(0,100).map(trade=><option key={trade.id} value={trade.id}>{trade.asset || trade.title} · {new Date(trade.entryDate).toLocaleDateString()}</option>)}</select></label></div><label className="rule-event-note"><span>What happened or what was verified?</span><textarea autoFocus value={eventDraft.note} onChange={event=>setEventDraft(current=>({...current,note:event.target.value}))} placeholder="State the observable behavior, decision and evidence."/></label><label className="rule-event-note"><span>Corrective action</span><textarea value={eventDraft.correctiveAction} onChange={event=>setEventDraft(current=>({...current,correctiveAction:event.target.value}))} placeholder="What changes before the next risk decision?"/></label>{eventError&&<p className="form-error" role="alert">{eventError}</p>}<footer><button type="button" className="btn-outline" disabled={eventBusy} onClick={()=>setRecording(false)}>Cancel</button><button className="btn-primary" disabled={eventBusy||!eventDraft.note.trim()}>{eventBusy?"Recording…":"Add to ledger"}</button></footer></form>}
      {!recording && eventError && <p className="form-error" role="alert">{eventError}</p>}
      <div className="rule-event-timeline">{events===null ? <p className="collection-inline-status">Opening compliance history…</p> : events.length ? events.map(item=><article key={item.id} className={`rule-event ${item.complianceStatus.toLowerCase()}`}><i/><time>{new Date(item.occurredAt).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"})}</time><div><span>{item.kind.replaceAll("_"," ")} · {item.complianceStatus.replaceAll("_"," ")}</span><p>{item.note}</p>{item.correctiveAction&&<small>Corrective action · {item.correctiveAction}</small>}{item.tradingEntry&&<Link to={`/trading/entries/${item.tradingEntry.id}`}>Related trade · {item.tradingEntry.asset || item.tradingEntry.title} →</Link>}</div><button type="button" aria-label="Remove verification record" onClick={()=>removeEvent(item.id)}>×</button></article>) : <div className="rule-event-empty"><NavigationIcon name="shield" size={20}/><strong>No verification history yet</strong><p>Record a pre-session check, a violation, or a formal review when this control is used.</p></div>}</div>
    </section>
    <div className="rule-danger-zone"><div><strong>Retire this control</strong><span>Deleting removes it permanently from your rulebook.</span></div><button className="btn-outline text-danger" onClick={() => setConfirmDelete(true)}><NavigationIcon name="trash" size={16} /> Delete rule</button></div>
    <ConfirmDialog open={confirmDelete} title="Delete this trading rule?" description="This action cannot be undone. Historical trades will remain intact." confirmLabel="Delete rule" tone="danger" onClose={() => setConfirmDelete(false)} onConfirm={remove} />
  </div>;
}

function RuleField({ label, children }) { return <label className="rule-field"><span>{label}</span>{children}</label>; }
