import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import PageSkeleton from "../../components/PageSkeleton.jsx";

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
  const [rules, setRules] = useState(() => api.peek("/trading-rules")?.rules ?? null);
  const [accounts, setAccounts] = useState(() => api.peek("/accounts")?.accounts ?? []);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ rule: "", category: "Risk Management", priority: "Must follow", accountId: "" });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ACTIVE");
  const [error, setError] = useState("");

  function load() { api.get("/trading-rules").then((data) => setRules(data.rules)).catch((requestError) => setError(requestError.message)); }
  useEffect(() => { load(); api.get("/accounts").then((data) => setAccounts(data.accounts)).catch(() => {}); }, []);

  const filtered = useMemo(() => (rules || []).filter((rule) => {
    const matchesQuery = !query || `${rule.rule} ${rule.notes || ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = category === "ALL" || rule.category === category;
    const matchesStatus = status === "ALL" || (status === "ACTIVE" ? rule.status === "Active" : rule.status !== "Active");
    return matchesQuery && matchesCategory && matchesStatus;
  }), [rules, query, category, status]);

  const summary = useMemo(() => ({
    active: (rules || []).filter((rule) => rule.status === "Active").length,
    critical: (rules || []).filter((rule) => rule.priority === "Must follow" && rule.status === "Active").length,
    warnings: (rules || []).filter((rule) => ["AT_RISK", "VIOLATED"].includes(rule.complianceStatus)).length,
    assigned: new Set((rules || []).map((rule) => rule.accountId).filter(Boolean)).size,
  }), [rules]);

  async function createRule(event) {
    event.preventDefault();
    if (!draft.rule.trim()) return;
    setError("");
    try {
      const { rule } = await api.post("/trading-rules", draft);
      setDraft({ rule: "", category: "Risk Management", priority: "Must follow", accountId: "" });
      setCreating(false);
      navigate(`/trading/rules/${rule.id}`);
    } catch (requestError) { setError(requestError.message || "We couldn't create this rule."); }
  }

  return (
    <div className="rulebook-page">
      <header className="rulebook-header">
        <div><span className="eyebrow">TRADING DISCIPLINE</span><h1 className="page-title">Trading Rulebook</h1><p>Your live operating system for risk, execution and discipline.</p></div>
        <button onClick={() => setCreating((value) => !value)} className="btn-primary">+ New rule</button>
      </header>

      <section className="rulebook-briefing">
        <div><span>Active rules</span><strong>{summary.active}</strong><small>Currently enforced</small></div>
        <div><span>Non-negotiable</span><strong>{summary.critical}</strong><small>Must-follow controls</small></div>
        <div><span>Needs attention</span><strong className={summary.warnings ? "text-danger" : ""}>{summary.warnings}</strong><small>At risk or violated</small></div>
        <div><span>Account coverage</span><strong>{summary.assigned}/{accounts.length || 0}</strong><small>Accounts with specific rules</small></div>
      </section>

      {creating && <form className="card rule-composer" onSubmit={createRule}>
        <div><span className="eyebrow">NEW CONTROL</span><h2>Write a rule you can verify</h2><p>Make it specific enough to check before or after a trade.</p></div>
        <label className="rule-composer-text"><span>Rule</span><textarea autoFocus value={draft.rule} onChange={(event) => setDraft({ ...draft, rule: event.target.value })} placeholder="Stop trading after the daily loss limit is reached." /></label>
        <div className="rule-composer-options">
          <label><span>Category</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Priority</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Applies to</span><select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}><option value="">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-outline" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" type="submit">Create rule</button></div>
      </form>}

      <div className="rulebook-toolbar">
        <label className="rulebook-search"><span aria-hidden="true">⌕</span><input aria-label="Search rules" placeholder="Search your rulebook" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">All categories</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
        <div className="rule-status-tabs" aria-label="Filter by status">{[["ACTIVE", "Active"], ["RETIRED", "Reviewing / retired"], ["ALL", "All"]].map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={status === value ? "active" : ""}>{label}</button>)}</div>
      </div>

      {rules === null ? <PageSkeleton compact /> : filtered.length === 0 ? <EmptyState icon="✓" title={rules.length ? "No matching rules" : "Your rulebook is ready"} description={rules.length ? "Adjust the search or filters to see more rules." : "Create the first risk or execution rule you want Veynote to keep visible."} action={!rules.length ? <button className="btn-primary" onClick={() => setCreating(true)}>Create first rule</button> : null} /> : (
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
