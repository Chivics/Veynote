import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import NavigationIcon from "../../components/layout/NavigationIcon";

const CATEGORIES = ["Risk Management", "Entry", "Exit", "Psychology", "Position Sizing", "Session", "News", "Prop Firm", "Other"];
const PRIORITIES = ["Must follow", "Important", "Optional"];
const COMPLIANCE = ["UNREVIEWED", "COMPLIANT", "AT_RISK", "VIOLATED"];

function priorityClass(priority) {
  if (priority === "Must follow") return "critical";
  if (priority === "Important") return "important";
  return "optional";
}

export default function TradingRules() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const accountId = searchParams.get("accountId") || "";
  const [rules, setRules] = useState(() => api.peek("/trading-rules")?.rules ?? null);
  const [accounts, setAccounts] = useState(() => api.peek("/accounts")?.accounts ?? []);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ rule: "", category: "Risk Management", priority: "Must follow", accountId });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ACTIVE");
  const [compliance, setCompliance] = useState("ALL");
  const [quickReference, setQuickReference] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(() => new Set());
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionConfirmedAt, setSessionConfirmedAt] = useState(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const createInFlight = useRef(false);

  function load() { api.get("/trading-rules").then((data) => { setRules(data.rules); setLoadError(""); }).catch((requestError) => setLoadError(requestError.message || "Rules could not be loaded.")); }
  useEffect(() => { load(); api.get("/accounts").then((data) => setAccounts(data.accounts)).catch(() => {}); }, []);
  const activeAccount = accounts.find((account) => account.id === accountId);

  const filtered = useMemo(() => (rules || []).filter((rule) => {
    const matchesQuery = !query || `${rule.rule} ${rule.notes || ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "ALL" || rule.category === category;
    const matchesStatus = status === "ALL" || (status === "ACTIVE" ? rule.status === "Active" : rule.status !== "Active");
    const matchesCompliance = compliance === "ALL" || (rule.complianceStatus || "UNREVIEWED") === compliance;
    const matchesQuickReference = !quickReference || (rule.status === "Active" && rule.priority === "Must follow");
    const matchesAccount = !accountId || !rule.accountId || rule.accountId === accountId;
    return matchesQuery && matchesCategory && matchesStatus && matchesCompliance && matchesQuickReference && matchesAccount;
  }), [rules, query, category, status, compliance, quickReference, accountId]);

  const summary = useMemo(() => ({
    active: (rules || []).filter((rule) => rule.status === "Active").length,
    critical: (rules || []).filter((rule) => rule.priority === "Must follow" && rule.status === "Active").length,
    warnings: (rules || []).filter((rule) => ["AT_RISK", "VIOLATED"].includes(rule.complianceStatus)).length,
    reviewDue: (rules || []).filter((rule) => rule.status === "Active" && rule.reviewDate && new Date(rule.reviewDate) <= new Date()).length,
  }), [rules]);
  const sessionRules = useMemo(() => (rules || []).filter(rule => rule.status === "Active" && rule.priority === "Must follow" && (!accountId || !rule.accountId || rule.accountId === accountId)), [rules, accountId]);

  function toggleSessionRule(ruleId) {
    setSessionChecked(current => { const next = new Set(current); next.has(ruleId) ? next.delete(ruleId) : next.add(ruleId); return next; });
    setSessionError(""); setSessionConfirmedAt(null);
  }
  async function confirmSession() {
    if (sessionChecked.size !== sessionRules.length || !sessionRules.length) return;
    setSessionBusy(true); setSessionError("");
    try {
      const result = await api.post("/trading-rules/session-check", { ruleIds: sessionRules.map(rule => rule.id), accountId: accountId || null });
      setRules(current => current.map(rule => sessionChecked.has(rule.id) ? { ...rule, complianceStatus: "COMPLIANT" } : rule));
      setSessionConfirmedAt(result.occurredAt || new Date().toISOString());
    } catch (requestError) { setSessionError(requestError.message || "Pre-session readiness could not be recorded."); }
    finally { setSessionBusy(false); }
  }

  async function createRule(event) {
    event.preventDefault();
    if (!draft.rule.trim() || createInFlight.current) return;
    createInFlight.current = true;
    setCreatingBusy(true);
    setError("");
    try {
      const { rule } = await api.post("/trading-rules", draft);
      setDraft({ rule: "", category: "Risk Management", priority: "Must follow", accountId });
      setCreating(false);
      navigate(`/trading/rules/${rule.id}`);
    } catch (requestError) { setError(requestError.message || "We couldn't create this rule."); }
    finally { createInFlight.current = false; setCreatingBusy(false); }
  }

  return (
    <div className="rulebook-page">
      <header className="rulebook-header">
        <div><span className="eyebrow">TRADING DISCIPLINE</span><h1 className="page-title">{activeAccount ? `${activeAccount.name} Rulebook` : "Trading Rulebook"}</h1><p>{activeAccount ? "Account controls appear alongside global rules that govern every workspace." : "Your live operating system for risk, execution and discipline."}</p>{activeAccount && <Link className="rulebook-account-return" to={`/trading/accounts/${activeAccount.id}`}>← Return to account workspace</Link>}</div>
        <button onClick={() => { setDraft(current => ({ ...current, accountId })); setCreating((value) => !value); }} className="btn-primary">+ New rule</button>
      </header>

      <section className="rulebook-briefing">
        <div><span>Active rules</span><strong>{rules === null ? "—" : summary.active}</strong><small>Currently enforced</small></div>
        <div><span>Non-negotiable</span><strong>{rules === null ? "—" : summary.critical}</strong><small>Must-follow controls</small></div>
        <div><span>Needs attention</span><strong className={summary.warnings ? "text-danger" : ""}>{rules === null ? "—" : summary.warnings}</strong><small>At risk or violated</small></div>
        <div><span>Review due</span><strong className={summary.reviewDue ? "text-warning" : ""}>{rules === null ? "—" : summary.reviewDue}</strong><small>Controls requiring confirmation</small></div>
      </section>

      {!!summary.critical && <section className="rulebook-quick-reference" aria-label="Pre-session quick reference">
        <div><span className="eyebrow">PRE-SESSION BRIEF</span><h2>Your non-negotiables, before risk is live.</h2><p>{summary.critical} active must-follow control{summary.critical === 1 ? "" : "s"} across {accounts.length || "all"} account{accounts.length === 1 ? "" : "s"}.</p></div>
        <button type="button" className={quickReference ? "rulebook-mode-toggle active" : "rulebook-mode-toggle"} aria-pressed={quickReference} onClick={() => { setQuickReference(value => !value); setSessionChecked(new Set()); setSessionError(""); setSessionConfirmedAt(null); }}>{quickReference ? "Close readiness check" : "Begin readiness check"}</button>
      </section>}

      {quickReference && <section className="rulebook-session-check" aria-labelledby="session-check-title">
        <header><div><span className="eyebrow">PRE-RISK ATTESTATION</span><h2 id="session-check-title">Confirm the controls before the market tests them.</h2><p>{activeAccount ? `This check covers ${activeAccount.name} and every global non-negotiable.` : "This check covers every active non-negotiable across the trading workspace."}</p></div><strong>{sessionChecked.size}<small>of {sessionRules.length} confirmed</small></strong></header>
        <div className="rulebook-session-progress"><i style={{ width: `${sessionRules.length ? Math.round(sessionChecked.size / sessionRules.length * 100) : 0}%` }} /></div>
        <div className="rulebook-session-list">{sessionRules.map(rule => <label key={rule.id} className={sessionChecked.has(rule.id) ? "confirmed" : ""}><input type="checkbox" checked={sessionChecked.has(rule.id)} onChange={() => toggleSessionRule(rule.id)} /><span><strong>{rule.rule}</strong><small>{rule.category} · {rule.account?.name || "All accounts"}{rule.limitValue != null ? ` · ${rule.limitValue}${rule.limitUnit || ""}` : ""}</small></span><NavigationIcon name={sessionChecked.has(rule.id) ? "check" : "shield"} size={17}/></label>)}</div>
        {sessionConfirmedAt ? <div className="rulebook-session-confirmed" role="status"><NavigationIcon name="check" size={18}/><span><strong>Readiness recorded</strong><small>{new Date(sessionConfirmedAt).toLocaleString()} · The compliance ledger now contains this attestation.</small></span></div> : <footer><span>{sessionChecked.size === sessionRules.length ? "All controls acknowledged. This attestation will be added to each rule's history." : "Review and acknowledge every control before recording readiness."}</span><button type="button" className="btn-primary" disabled={sessionBusy || !sessionRules.length || sessionChecked.size !== sessionRules.length} onClick={confirmSession}>{sessionBusy ? "Recording…" : "Confirm session readiness"}</button></footer>}
        {sessionError && <p className="form-error" role="alert">{sessionError}</p>}
      </section>}

      {creating && <form className="card rule-composer" onSubmit={createRule}>
        <div><span className="eyebrow">NEW CONTROL</span><h2>Write a rule you can verify</h2><p>Make it specific enough to check before or after a trade.</p></div>
        <label className="rule-composer-text"><span>Rule</span><textarea autoFocus value={draft.rule} onChange={(event) => setDraft({ ...draft, rule: event.target.value })} placeholder="Stop trading after the daily loss limit is reached." /></label>
        <div className="rule-composer-options">
          <label><span>Category</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Priority</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Applies to</span><select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}><option value="">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-outline" disabled={creatingBusy} onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" type="submit" disabled={creatingBusy || !draft.rule.trim()}>{creatingBusy ? "Creating…" : "Create rule"}</button></div>
      </form>}

      <div className="rulebook-toolbar">
        <label className="rulebook-search"><span aria-hidden="true">⌕</span><input aria-label="Search rules" placeholder="Search your rulebook" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">All categories</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Filter by compliance" value={compliance} onChange={(event) => setCompliance(event.target.value)}><option value="ALL">All compliance</option>{COMPLIANCE.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
        <select aria-label="Filter by account" value={accountId} onChange={(event) => setSearchParams(previous => { const next = new URLSearchParams(previous); if (event.target.value) next.set("accountId", event.target.value); else next.delete("accountId"); return next; }, { replace:true })}><option value="">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
        <div className="rule-status-tabs" aria-label="Filter by status">{[["ACTIVE", "Active"], ["RETIRED", "Reviewing / retired"], ["ALL", "All"]].map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={status === value ? "active" : ""}>{label}</button>)}</div>
      </div>

      {loadError && <div className="inline-error" role="alert"><span>{loadError}</span><button type="button" onClick={load}>Retry</button></div>}
      {rules === null ? !loadError && <p className="collection-inline-status" role="status">Checking your rulebook…</p> : filtered.length === 0 ? <EmptyState icon="✓" title={rules.length ? "No matching rules" : "Your rulebook is ready"} description={rules.length ? "Adjust the search or filters to see more rules." : "Create the first risk or execution rule you want Veynote to keep visible."} action={!rules.length ? <button className="btn-primary" onClick={() => setCreating(true)}>Create first rule</button> : null} /> : (
        <div className="rulebook-grid">{filtered.map((rule) => <button key={rule.id} className={`rule-card ${priorityClass(rule.priority)}`} onClick={() => navigate(`/trading/rules/${rule.id}`)}>
          <div className="rule-card-top"><span className="rule-category">{rule.category || "Uncategorized"}</span><span className={`rule-compliance ${rule.complianceStatus?.toLowerCase()}`}>{(rule.complianceStatus || "UNREVIEWED").replaceAll("_", " ")}</span></div>
          <h2>{rule.rule}</h2>
          <p>{rule.notes || "Open the rule to add its rationale, limits and review guidance."}</p>
          <div className="rule-card-footer"><span>{rule.account?.name || "All accounts"}</span><span>{rule.limitValue != null ? `${rule.limitValue}${rule.limitUnit ? ` ${rule.limitUnit}` : ""}` : rule.priority || "Optional"}</span></div>
        </button>)}</div>
      )}
    </div>
  );
}

export { CATEGORIES, PRIORITIES, COMPLIANCE };
