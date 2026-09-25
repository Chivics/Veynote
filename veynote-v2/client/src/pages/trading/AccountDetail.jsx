import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import PageSkeleton from "../../components/PageSkeleton";
import StatCard from "../../components/StatCard";
import { EntryCard } from "./Dashboard";

function money(value, currency = "USD") {
  if (value == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function Breakdown({ title, rows, empty }) {
  return (
    <section className="card account-breakdown">
      <div className="section-heading"><div><span className="eyebrow">PERFORMANCE</span><h2>{title}</h2></div></div>
      {!rows?.length ? <p className="account-empty-copy">{empty}</p> : rows.slice(0, 6).map((row) => (
        <div className="account-breakdown-row" key={row.key}>
          <div><strong>{row.key}</strong><span>{row.count} trade{row.count === 1 ? "" : "s"}</span></div>
          <div><b className={row.totalR >= 0 ? "text-success" : "text-danger"}>{row.totalR > 0 ? "+" : ""}{row.totalR}R</b><span>{row.winRate}% wins</span></div>
        </div>
      ))}
    </section>
  );
}

function AccountCalendar({ days = [] }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOffset = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const indexed = Object.fromEntries(days.map((day) => [day.date, day]));
  return <section className="card account-calendar-panel"><div className="section-heading"><div><span className="eyebrow">TRADING CALENDAR</span><h2>{now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2></div><Link to="/trading/calendar">Full calendar →</Link></div><div className="account-calendar-weekdays">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="account-calendar-grid">{Array.from({ length: firstOffset }).map((_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: count }).map((_, index) => { const dayNumber = index + 1; const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`; const activity = indexed[key]; return <div key={key} className={activity ? activity.totalR > 0 ? "positive" : activity.totalR < 0 ? "negative" : "neutral" : ""}><b>{dayNumber}</b>{activity && <small>{activity.totalR > 0 ? "+" : ""}{activity.totalR}R</small>}</div>; })}</div></section>;
}

export default function AccountDetail() {
  const { id } = useParams();
  const accountPath = `/accounts/${id}`;
  const analyticsPath = `/analytics/trading?accountId=${id}`;
  const [payload, setPayload] = useState(() => api.peek(accountPath) ?? null);
  const [analytics, setAnalytics] = useState(() => api.peek(analyticsPath) ?? null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.get(accountPath), api.get(analyticsPath)])
      .then(([accountData, analyticsData]) => { if (active) { setPayload(accountData); setAnalytics(analyticsData); } })
      .catch((requestError) => { if (active) setError(requestError.message || "This account could not be loaded."); });
    return () => { active = false; };
  }, [accountPath, analyticsPath]);

  const account = payload?.account;
  const currency = account?.currency || "USD";
  const balanceChange = useMemo(() => {
    if (account?.startingBalance == null || account?.currentBalance == null) return null;
    return account.currentBalance - account.startingBalance;
  }, [account]);

  function openSettings() {
    setDraft({ name: account.name, broker: account.broker || "", accountType: account.accountType || "", currency, startingBalance: account.startingBalance ?? "", currentBalance: account.currentBalance ?? "", equity: account.equity ?? "", dailyLossLimit: account.dailyLossLimit ?? "", drawdownLimit: account.drawdownLimit ?? "", profitTarget: account.profitTarget ?? "", notes: account.notes || "" });
    setEditing(true);
  }

  async function saveSettings(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const { account: updated } = await api.patch(accountPath, draft);
      setPayload((current) => ({ ...current, account: { ...current.account, ...updated } }));
      setEditing(false);
    } catch (requestError) { setError(requestError.message || "Account settings could not be saved."); }
    finally { setSaving(false); }
  }

  if (error && !account) return <EmptyState icon="!" title="Account unavailable" description={error} action={<Link className="btn-outline" to="/trading/accounts">Back to accounts</Link>} />;
  if (!account || !analytics) return <PageSkeleton title="Trading account" />;

  return (
    <div className="account-workspace">
      <header className="account-hero">
        <div className="account-hero-main">
          <div className="flex items-center gap-2 flex-wrap mb-3"><span className="type-pill bg-accent-trade-soft text-[#8dbdff]">{account.status}</span>{account.accountType && <span className="type-pill">{account.accountType}</span>}</div>
          <span className="eyebrow">ACCOUNT WORKSPACE</span>
          <h1 className="page-title">{account.name}</h1>
          <p>{[account.broker, `${account.stats.entryCount} journal entries`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="account-hero-actions"><Link to={`/trading/entries/new?accountId=${id}`} className="btn-primary">+ Log trade</Link><Link to={`/trading/entries?accountId=${id}`} className="btn-outline">Trade history</Link><button className="btn-outline" onClick={openSettings}>Settings</button></div>
        <div className="account-balance-panel">
          <span>Current balance</span><strong>{money(account.currentBalance ?? account.startingBalance, currency)}</strong>
          <small className={balanceChange == null ? "" : balanceChange >= 0 ? "text-success" : "text-danger"}>{balanceChange == null ? "Add balances in account settings" : `${balanceChange >= 0 ? "+" : ""}${money(balanceChange, currency)} from start`}</small>
        </div>
      </header>

      {editing && <form className="card account-settings-panel" onSubmit={saveSettings}>
        <div className="section-heading"><div><span className="eyebrow">ACCOUNT CONFIGURATION</span><h2>Balances, risk limits & targets</h2></div><button type="button" className="text-action" onClick={() => setEditing(false)}>Close</button></div>
        <div className="account-settings-grid">
          <AccountInput label="Account name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
          <AccountInput label="Broker / prop firm" value={draft.broker} onChange={(value) => setDraft({ ...draft, broker: value })} />
          <AccountInput label="Account type" value={draft.accountType} onChange={(value) => setDraft({ ...draft, accountType: value })} />
          <label><span>Currency</span><select value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value })}><option>USD</option><option>GBP</option><option>EUR</option><option>NGN</option><option>CAD</option><option>AUD</option></select></label>
          <AccountInput type="number" label="Starting balance" value={draft.startingBalance} onChange={(value) => setDraft({ ...draft, startingBalance: value })} />
          <AccountInput type="number" label="Current balance" value={draft.currentBalance} onChange={(value) => setDraft({ ...draft, currentBalance: value })} />
          <AccountInput type="number" label="Current equity" value={draft.equity} onChange={(value) => setDraft({ ...draft, equity: value })} />
          <AccountInput type="number" label="Daily loss limit" value={draft.dailyLossLimit} onChange={(value) => setDraft({ ...draft, dailyLossLimit: value })} />
          <AccountInput type="number" label="Overall drawdown limit" value={draft.drawdownLimit} onChange={(value) => setDraft({ ...draft, drawdownLimit: value })} />
          <AccountInput type="number" label="Profit target" value={draft.profitTarget} onChange={(value) => setDraft({ ...draft, profitTarget: value })} />
          <label className="wide"><span>Account notes</span><textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Challenge terms, payout conditions, milestones or operating context…" /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-outline" onClick={() => setEditing(false)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? "Saving…" : "Save account"}</button></div>
      </form>}

      <div className="account-metrics-grid">
        <StatCard label="Win rate" value={analytics.hasData ? `${analytics.winRate}%` : "—"} hint={analytics.hasData ? `${analytics.wins}W · ${analytics.losses}L · ${analytics.breakEven}BE` : "No closed trades"} />
        <StatCard label="Total R" value={analytics.hasData ? `${analytics.totalR > 0 ? "+" : ""}${analytics.totalR}R` : "—"} />
        <StatCard label="Realized P&L" value={analytics.hasData && analytics.realizedPnl != null ? money(analytics.realizedPnl, currency) : "—"} hint="From recorded P&L" />
        <StatCard label="Max drawdown" value={analytics.hasData ? `${analytics.maximumDrawdown}R` : "—"} />
        <StatCard label="Average win" value={analytics.hasData && analytics.averageWin != null ? `${analytics.averageWin}R` : "—"} />
        <StatCard label="Average loss" value={analytics.hasData && analytics.averageLoss != null ? `${analytics.averageLoss}R` : "—"} />
        <StatCard label="Planned R:R" value={analytics.hasData && analytics.avgRiskReward != null ? `${analytics.avgRiskReward}R` : "—"} />
        <StatCard label="Account rules" value={payload.rules?.length || 0} hint={payload.rules?.filter((rule) => rule.status === "Active").length ? `${payload.rules.filter((rule) => rule.status === "Active").length} active` : "No active rules"} />
      </div>

      <div className="account-primary-grid">
        <section className="card account-equity-panel">
          <div className="section-heading"><div><span className="eyebrow">EQUITY CURVE</span><h2>Performance over time</h2></div><span className="type-pill">R multiple</span></div>
          {!analytics.hasData ? <p className="account-empty-copy">Closed trades will build this curve.</p> : <div className="account-equity-chart" aria-label="Cumulative R chart">{analytics.cumulativeR.map((point, index) => { const values = analytics.cumulativeR.map((item) => item.value); const min = Math.min(...values, 0); const max = Math.max(...values, 0); const range = Math.max(max - min, 1); const height = ((point.value - min) / range) * 78 + 10; return <div key={point.tradeId || index} className="account-equity-column"><i className={point.value >= 0 ? "positive" : "negative"} style={{ height: `${height}%` }} /><span>{index === 0 || index === analytics.cumulativeR.length - 1 ? `${point.value}R` : ""}</span></div>; })}</div>}
        </section>
        <section className="card account-limits-panel">
          <div className="section-heading"><div><span className="eyebrow">RISK ENVELOPE</span><h2>Limits & targets</h2></div><Link to="/trading/rules">Rulebook →</Link></div>
          <div className="account-limit-list"><div><span>Daily loss limit</span><b>{money(account.dailyLossLimit, currency)}</b></div><div><span>Overall drawdown</span><b>{money(account.drawdownLimit, currency)}</b></div><div><span>Profit target</span><b>{money(account.profitTarget, currency)}</b></div><div><span>Equity</span><b>{money(account.equity, currency)}</b></div></div>
        </section>
      </div>

      <div className="account-breakdown-grid"><Breakdown title="Setups" rows={analytics.setupBreakdown} empty="Setup performance appears after closed trades." /><Breakdown title="Instruments" rows={analytics.instrumentBreakdown} empty="Instrument performance appears here." /><Breakdown title="Long vs short" rows={analytics.directionBreakdown} empty="Direction performance appears here." /></div>

      <AccountCalendar days={analytics.calendarDays} />

      <section className="account-recent-section">
        <div className="section-heading"><div><span className="eyebrow">ACCOUNT HISTORY</span><h2>Recent trades</h2></div><Link to={`/trading/entries?accountId=${id}`}>View all →</Link></div>
        {!payload.recentTrades?.length ? <EmptyState icon="↗" title="No trades in this account" description="Log the first trade and choose this account to begin its independent history." action={<Link className="btn-primary" to={`/trading/entries/new?accountId=${id}`}>Log a trade</Link>} /> : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{payload.recentTrades.slice(0, 4).map((trade) => <EntryCard key={trade.id} entry={trade} />)}</div>}
      </section>
    </div>
  );
}

function AccountInput({ label, value, onChange, type = "text" }) {
  return <label><span>{label}</span><input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "any" : undefined} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
