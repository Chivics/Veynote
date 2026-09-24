import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";

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

  function load() {
    api.get("/accounts").then((d) => setAccounts(d.accounts));
  }
  useEffect(load, []);

  async function createAccount(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    try {
      await api.post("/accounts", { name, broker, status, accountType, currency, startingBalance });
    } catch (requestError) {
      setError(requestError.message || "We couldn't create this account.");
      return;
    }
    setName("");
    setBroker("");
    setStartingBalance("");
    setCreating(false);
    load();
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <span className="eyebrow">WORKSPACES</span>
          <h1 className="page-title text-[22px] sm:text-[30px] tracking-tight mt-1.5 mb-2">Accounts</h1>
          <p className="text-ink-muted m-0">{accounts ? `${accounts.length} accounts` : ""}</p>
        </div>
        <button onClick={() => setCreating((c) => !c)} className="btn-primary shrink-0">+ Add account</button>
      </div>

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
          <div className="flex justify-end gap-2"><button type="button" className="btn-outline" onClick={() => setCreating(false)}>Cancel</button><button type="submit" className="btn-primary">Create workspace</button></div>
        </form>
      )}

      {accounts === null ? (
        <PageSkeleton compact />
      ) : accounts.length === 0 && !creating ? (
        <EmptyState
          icon="◆"
          title="No accounts yet"
          description="Add your prop-firm or personal account to start organizing trades."
          action={<button onClick={() => setCreating(true)} className="btn-primary">Add your first account</button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {accounts.map((a) => (
            <Link
              key={a.id}
              to={`/trading/accounts/${a.id}`}
              className="card p-4 flex flex-col gap-2 hover:border-ink-muted transition"
            >
              <div className="w-9 h-9 rounded-lg bg-accent-trade-soft text-[#7db9ff] flex items-center justify-center mb-2 text-base">◆</div>
              <span
                className={`self-start text-[9.5px] font-bold px-2 py-0.5 rounded-full ${
                  a.status === "FUNDED" ? "bg-success/15 text-success" : a.status === "EVALUATION" ? "bg-warning/15 text-warning" : "bg-app-panel2 text-ink-muted"
                }`}
              >
                {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
              </span>
              <h3 className="text-[14.5px] m-0">{a.name}</h3>
              {a.broker && <span className="text-[11px] text-ink-muted mb-1">{a.broker}</span>}
              {a.startingBalance != null && <span className="text-[11px] text-ink-soft">{new Intl.NumberFormat(undefined, { style: "currency", currency: a.currency || "USD", maximumFractionDigits: 0 }).format(a.currentBalance ?? a.startingBalance)}</span>}
              <div className="flex gap-4 mt-1">
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
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
