import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import NavigationIcon from "../../components/layout/NavigationIcon";
import "./tradingAccounts.css";

const STATUSES = ["EVALUATION", "FUNDED", "PERSONAL", "BREACHED"];
const ACCOUNT_TYPES = ["Personal", "Prop firm challenge", "Funded", "Demo", "Brokerage"];

export default function Accounts() {
  const [accounts, setAccounts] = useState(() => api.peek("/accounts")?.accounts ?? null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [broker, setBroker] = useState("");
  const [status, setStatus] = useState("PERSONAL");
  const [accountType, setAccountType] = useState("Personal");
  const [currency, setCurrency] = useState("USD");
  const [startingBalance, setStartingBalance] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("PERFORMANCE");
  const createInFlight = useRef(false);

  function load() {
    api.get("/accounts").then((data) => { setAccounts(data.accounts); setLoadError(""); })
      .catch(requestError => setLoadError(requestError.message || "Trading accounts could not be loaded."));
  }
  useEffect(load, []);

  async function createAccount(e) {
    e.preventDefault();
    if (!name.trim() || createInFlight.current) return;
    createInFlight.current = true;
    setCreatingBusy(true);
    setError("");
    try {
      await api.post("/accounts", { name: name.trim(), broker, status, accountType, currency, startingBalance });
    } catch (requestError) {
      setError(requestError.message || "We couldn't create this account.");
      return;
    } finally {
      createInFlight.current = false;
      setCreatingBusy(false);
    }
    setName("");
    setBroker("");
    setStartingBalance("");
    setCreating(false);
    load();
  }
  const currencies = new Set((accounts || []).map(account => account.currency).filter(Boolean));
  const totalR = (accounts || []).reduce((sum, account) => sum + (Number(account.stats?.totalR) || 0), 0);
  const totalTrades = (accounts || []).reduce((sum, account) => sum + (Number(account.stats?.entryCount) || 0), 0);
  const visibleAccounts = useMemo(() => (accounts || []).filter(account => {
    const matchesQuery = !query || `${account.name} ${account.broker || ""} ${account.accountType || ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || account.status === statusFilter;
    return matchesQuery && matchesStatus;
  }).sort((a,b) => sortBy === "NAME" ? a.name.localeCompare(b.name) : sortBy === "ACTIVITY" ? Number(b.stats?.entryCount || 0)-Number(a.stats?.entryCount || 0) : Number(b.stats?.totalR || 0)-Number(a.stats?.totalR || 0)), [accounts, query, statusFilter, sortBy]);

  return (
    <main className="trading-accounts-page">
      <header className="trading-accounts-header">
        <div className="min-w-0">
          <span className="eyebrow">ACCOUNT PORTFOLIO</span>
          <h1 className="page-title">Independent books. One operating view.</h1>
          <p>Keep every broker, personal account and evaluation isolated while retaining a complete portfolio perspective.</p>
        </div>
        <button onClick={() => setCreating((c) => !c)} className="btn-primary shrink-0"><NavigationIcon name="plus" size={16}/>Add account</button>
      </header>
      {loadError && <div className="inline-error" role="alert"><span>{loadError}</span><button type="button" onClick={load}>Retry</button></div>}

      <section className="trading-accounts-summary"><div><span>Account workspaces</span><strong>{accounts?.length ?? "—"}</strong><small>Independent performance books</small></div><div><span>Currencies</span><strong>{accounts?.length ? currencies.size : "—"}</strong><small>{[...currencies].join(" · ") || "No currency recorded"}</small></div><div><span>Portfolio R</span><strong className={totalR>=0?"text-success":"text-danger"}>{accounts?.length ? `${totalR>0?"+":""}${Number(totalR.toFixed(2))}R` : "—"}</strong><small>{totalTrades} journal entries</small></div><div><span>Active mandates</span><strong>{accounts?.filter(item=>item.status!=="BREACHED").length ?? "—"}</strong><small>Personal, funded or evaluating</small></div></section>

      {!!accounts?.length && <section className="trading-account-toolbar" aria-label="Account portfolio controls"><label><NavigationIcon name="search" size={15}/><input aria-label="Search accounts" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search account, broker or type"/></label><select aria-label="Filter account status" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="ALL">All mandates</option>{STATUSES.map(item=><option key={item} value={item}>{item.charAt(0)+item.slice(1).toLowerCase()}</option>)}</select><select aria-label="Sort accounts" value={sortBy} onChange={event=>setSortBy(event.target.value)}><option value="PERFORMANCE">Sort by performance</option><option value="ACTIVITY">Sort by activity</option><option value="NAME">Sort by name</option></select><span>{visibleAccounts.length} of {accounts.length} workspaces</span></section>}

      {creating && (
        <form onSubmit={createAccount} className="card account-setup-panel mb-5">
          <div className="account-setup-copy">
            <span className="eyebrow">NEW WORKSPACE</span>
            <h2>Set up a trading account</h2>
            <p>Trades, rules, limits and performance remain independent for this account.</p>
          </div>
          <div className="account-setup-fields">
          <label><span>Account name</span><input className="input" placeholder="GoatFunded — Phase 2" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label><span>Broker / prop firm</span><input className="input" placeholder="Optional" value={broker} onChange={(e) => setBroker(e.target.value)} /></label>
          <label><span>Account type</span><select className="input" value={accountType} onChange={(e) => setAccountType(e.target.value)}>{ACCOUNT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label><span>Status</span><select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
            ))}
          </select></label>
          <label><span>Starting balance</span><div className="account-money-input"><select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>GBP</option><option>EUR</option><option>NGN</option><option>CAD</option><option>AUD</option></select><input inputMode="decimal" placeholder="10000" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} /></div></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-outline" disabled={creatingBusy} onClick={() => setCreating(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={creatingBusy || !name.trim()}>{creatingBusy ? "Creating…" : "Create workspace"}</button></div>
        </form>
      )}

      {accounts === null ? (
        !loadError && <p className="collection-inline-status" role="status">Checking trading accounts…</p>
      ) : accounts.length === 0 && !creating ? (
        <EmptyState
          icon="◆"
          title="No accounts yet"
          description="Add your prop-firm or personal account to start organizing trades."
          action={<button onClick={() => setCreating(true)} className="btn-primary">Add your first account</button>}
        />
      ) : (
        visibleAccounts.length ? <div className="trading-account-grid">
          {visibleAccounts.map((a) => (
            <Link
              key={a.id}
              to={`/trading/accounts/${a.id}`}
              className="trading-account-card"
            >
              <div className="trading-account-card-top"><span className="trading-account-icon"><NavigationIcon name="brief" size={18}/></span><span
                className={`trading-account-status ${
                  a.status === "FUNDED" ? "bg-success/15 text-success" : a.status === "EVALUATION" ? "bg-warning/15 text-warning" : "bg-app-panel2 text-ink-muted"
                }`}
              >
                {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
              </span></div>
              <div><h3>{a.name}</h3>{a.broker && <p>{a.broker}</p>}</div>
              {a.startingBalance != null && <strong className="trading-account-balance">{new Intl.NumberFormat(undefined, { style: "currency", currency: a.currency || "USD", maximumFractionDigits: 0 }).format(a.currentBalance ?? a.startingBalance)}</strong>}
              <div className="trading-account-metrics">
                <div>
                  <small className="block text-[9.5px] text-ink-muted">Entries</small>
                  <b className="text-[13px]">{a.stats.entryCount}</b>
                </div>
                <div>
                  <small className="block text-[9.5px] text-ink-muted">Win rate</small>
                  <b className="text-[13px]">{a.stats.winRate != null ? `${a.stats.winRate}%` : "—"}</b>
                </div>
                <div>
                  <small className="block text-[9.5px] text-ink-muted">Total R</small>
                  <b className={`text-[13px] ${a.stats.totalR >= 0 ? "text-success" : "text-danger"}`}>
                    {a.stats.totalR >= 0 ? "+" : ""}{a.stats.totalR}R
                  </b>
                </div>
              </div><footer><span>{a.accountType || "Trading account"}</span><NavigationIcon name="chevron" size={14}/></footer>
            </Link>
          ))}
        </div> : <EmptyState icon="⌕" title="No account matches this view" description="Adjust the search, status or sorting controls to return to the complete portfolio." action={<button className="btn-outline" onClick={()=>{setQuery("");setStatusFilter("ALL");}}>Clear filters</button>}/>
      )}
    </main>
  );
}
