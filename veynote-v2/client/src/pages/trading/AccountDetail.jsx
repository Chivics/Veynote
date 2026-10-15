import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import StatCard from "../../components/StatCard";
import ConfirmDialog from "../../components/ConfirmDialog";
import NavigationIcon from "../../components/layout/NavigationIcon";
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

function AccountCalendar({ days = [], accountId }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOffset = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  const indexed = Object.fromEntries(days.map((day) => [day.date, day]));
  return <section className="card account-calendar-panel"><div className="section-heading"><div><span className="eyebrow">TRADING CALENDAR</span><h2>{now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2></div><Link to={`/trading/calendar?accountId=${encodeURIComponent(accountId)}`}>Full calendar →</Link></div><div className="account-calendar-weekdays">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="account-calendar-grid">{Array.from({ length: firstOffset }).map((_, index) => <span key={`blank-${index}`} />)}{Array.from({ length: count }).map((_, index) => { const dayNumber = index + 1; const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`; const activity = indexed[key]; return <div key={key} className={activity ? activity.totalR > 0 ? "positive" : activity.totalR < 0 ? "negative" : "neutral" : ""}><b>{dayNumber}</b>{activity && <small>{activity.totalR > 0 ? "+" : ""}{activity.totalR}R</small>}</div>; })}</div></section>;
}

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const accountPath = `/accounts/${id}`;
  const analyticsPath = `/analytics/trading?accountId=${id}`;
  const [payload, setPayload] = useState(() => api.peek(accountPath) ?? null);
  const [analytics, setAnalytics] = useState(() => api.peek(analyticsPath) ?? null);
  const [error, setError] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let active = true;
    setPayload(api.peek(accountPath) ?? null);
    setAnalytics(api.peek(analyticsPath) ?? null);
    setError("");
    setAnalyticsError("");
    api.get(accountPath).then(accountData => { if (active) setPayload(accountData); })
      .catch(requestError => { if (active) setError(requestError.message || "This account could not be loaded."); });
    api.get(analyticsPath).then(analyticsData => { if (active) setAnalytics(analyticsData); })
      .catch(requestError => { if (active) setAnalyticsError(requestError.message || "Account performance could not be loaded."); });
    return () => { active = false; };
  }, [accountPath, analyticsPath]);

  const account = payload?.account?.id === id ? payload.account : null;
  const performance = analytics || { hasData: false, cumulativeR: [], setupBreakdown: [], instrumentBreakdown: [], directionBreakdown: [], calendarDays: [] };
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

  async function removeAccount() {
    setDeleteBusy(true); setDeleteError("");
    try {
      await api.delete(accountPath);
      navigate("/trading/accounts", { replace: true });
    } catch (requestError) {
      setDeleteError(requestError.message || "This account could not be removed.");
      setDeleteBusy(false);
    }
  }

  if (!account) return <section className="account-workspace account-workspace-pending">
    <span className="eyebrow">ACCOUNT WORKSPACE</span><h1 className="page-title">Trading account</h1>
    {error ? <EmptyState icon="!" title="Account unavailable" description={error} action={<Link className="btn-outline" to="/trading/accounts">Back to accounts</Link>} /> : <p role="status">Opening this account…</p>}
  </section>;

  return (
    <div className="account-workspace">
      <header className="account-hero">
        <div className="account-hero-main">
          <div className="flex items-center gap-2 flex-wrap mb-3"><span className="type-pill bg-accent-trade-soft text-[#8dbdff]">{account.status}</span>{account.accountType && <span className="type-pill">{account.accountType}</span>}</div>
          <span className="eyebrow">ACCOUNT WORKSPACE</span>
          <h1 className="page-title">{account.name}</h1>
          <p>{[account.broker, `${account.stats.entryCount} journal entries`].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="account-hero-actions"><Link to={`/trading/entries/new?accountId=${id}`} className="btn-primary"><NavigationIcon name="plus" size={16} /> Log trade</Link><Link to={`/trading/entries?accountId=${id}`} className="btn-outline">Trade history</Link><button className="btn-outline" onClick={openSettings}><NavigationIcon name="settings" size={16} /> Settings</button></div>
        <div className="account-balance-panel">
          <span>Current balance</span><strong>{money(account.currentBalance ?? account.startingBalance, currency)}</strong>
          <small className={balanceChange == null ? "" : balanceChange >= 0 ? "text-success" : "text-danger"}>{balanceChange == null ? "Add balances in account settings" : `${balanceChange >= 0 ? "+" : ""}${money(balanceChange, currency)} from start`}</small>
        </div>
      </header>

      {analyticsError && <div className="inline-error" role="alert"><span>{analyticsError}</span><button type="button" onClick={() => { setAnalyticsError(""); api.get(analyticsPath, undefined, { force: true }).then(setAnalytics).catch(requestError => setAnalyticsError(requestError.message || "Account performance could not be loaded.")); }}>Retry performance</button></div>}

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
        <StatCard label="Win rate" value={performance.hasData ? `${performance.winRate}%` : "—"} hint={performance.hasData ? `${performance.wins}W · ${performance.losses}L · ${performance.breakEven}BE` : analytics === null ? "Checking performance…" : "No closed trades"} />
        <StatCard label="Total R" value={performance.hasData ? `${performance.totalR > 0 ? "+" : ""}${performance.totalR}R` : "—"} />
        <StatCard label="Realized P&L" value={performance.hasData && performance.realizedPnl != null ? money(performance.realizedPnl, currency) : "—"} hint="From recorded P&L" />
        <StatCard label="Max drawdown" value={performance.hasData ? `${performance.maximumDrawdown}R` : "—"} />
        <StatCard label="Expectancy" value={performance.hasData ? `${performance.expectancy > 0 ? "+" : ""}${performance.expectancy}R` : "—"} hint="Expected R per closed trade" />
        <StatCard label="Profit factor" value={performance.hasData ? (performance.profitFactor == null ? "∞" : performance.profitFactor) : "—"} hint="Gross R won / lost" />
        <StatCard label="Average win" value={performance.hasData && performance.averageWin != null ? `${performance.averageWin}R` : "—"} />
        <StatCard label="Average loss" value={performance.hasData && performance.averageLoss != null ? `${performance.averageLoss}R` : "—"} />
        <StatCard label="Planned R:R" value={performance.hasData && performance.avgRiskReward != null ? `${performance.avgRiskReward}R` : "—"} />
        <StatCard label="Account rules" value={payload.rules?.length || 0} hint={payload.rules?.filter((rule) => rule.status === "Active").length ? `${payload.rules.filter((rule) => rule.status === "Active").length} active` : "No active rules"} />
      </div>

      <div className="account-primary-grid">
        <section className="card account-equity-panel">
          <div className="section-heading"><div><span className="eyebrow">EQUITY CURVE</span><h2>Performance over time</h2></div><span className="type-pill">R multiple</span></div>
          {!performance.hasData ? <p className="account-empty-copy">{analytics === null ? "Checking account performance…" : "Closed trades will build this curve."}</p> : <div className="account-equity-chart" aria-label="Cumulative R chart">{performance.cumulativeR.map((point, index) => { const values = performance.cumulativeR.map((item) => item.value); const min = Math.min(...values, 0); const max = Math.max(...values, 0); const range = Math.max(max - min, 1); const height = ((point.value - min) / range) * 78 + 10; return <div key={point.tradeId || index} className="account-equity-column"><i className={point.value >= 0 ? "positive" : "negative"} style={{ height: `${height}%` }} /><span>{index === 0 || index === performance.cumulativeR.length - 1 ? `${point.value}R` : ""}</span></div>; })}</div>}
        </section>
        <section className="card account-limits-panel">
          <div className="section-heading"><div><span className="eyebrow">RISK ENVELOPE</span><h2>Limits & targets</h2></div><Link to="/trading/rules">Rulebook →</Link></div>
          <div className="account-limit-list"><div><span>Daily loss limit</span><b>{money(account.dailyLossLimit, currency)}</b></div><div><span>Overall drawdown</span><b>{money(account.drawdownLimit, currency)}</b></div><div><span>Profit target</span><b>{money(account.profitTarget, currency)}</b></div><div><span>Equity</span><b>{money(account.equity, currency)}</b></div></div>
        </section>
      </div>

      {performance.hasData && <section className="card account-edge-ledger">
        <div className="section-heading"><div><span className="eyebrow">EDGE DIAGNOSTICS</span><h2>Range, execution & evidence</h2></div><Link to={`/trading/analytics?accountId=${id}`}>Deep analytics →</Link></div>
        <div className="account-edge-ledger-grid">
          <Link to={performance.bestTrade ? `/trading/entries/${performance.bestTrade.id}` : "#"}><span>Best trade</span><strong className="text-success">{performance.bestTrade ? `+${performance.bestTrade.achievedR}R` : "—"}</strong><small>{performance.bestTrade?.asset || "No record"}</small></Link>
          <Link to={performance.worstTrade ? `/trading/entries/${performance.worstTrade.id}` : "#"}><span>Worst trade</span><strong className="text-danger">{performance.worstTrade ? `${performance.worstTrade.achievedR}R` : "—"}</strong><small>{performance.worstTrade?.asset || "No record"}</small></Link>
          <div><span>Break-even trades</span><strong>{performance.breakEven}</strong><small>Protected capital</small></div>
          <div><span>Closed sample</span><strong>{performance.totalTrades}</strong><small>{performance.totalTrades < 20 ? "Early evidence — interpret carefully" : "Developing evidence base"}</small></div>
        </div>
      </section>}

      <div className="account-breakdown-grid"><Breakdown title="Setups" rows={performance.setupBreakdown} empty={analytics === null ? "Checking performance…" : "Setup performance appears after closed trades."} /><Breakdown title="Instruments" rows={performance.instrumentBreakdown} empty={analytics === null ? "Checking performance…" : "Instrument performance appears here."} /><Breakdown title="Long vs short" rows={performance.directionBreakdown} empty={analytics === null ? "Checking performance…" : "Direction performance appears here."} /></div>

      {analytics === null ? <section className="card account-calendar-panel"><div className="section-heading"><div><span className="eyebrow">TRADING CALENDAR</span><h2>Account calendar</h2></div></div><p className="account-empty-copy" role={analyticsError ? undefined : "status"}>{analyticsError ? "Account calendar is unavailable until performance is reloaded." : "Checking account calendar…"}</p></section> : <AccountCalendar days={performance.calendarDays} accountId={id} />}

      <section className="account-recent-section">
        <div className="section-heading"><div><span className="eyebrow">ACCOUNT HISTORY</span><h2>Recent trades</h2></div><Link to={`/trading/entries?accountId=${id}`}>View all →</Link></div>
        {!payload.recentTrades?.length ? <EmptyState icon="↗" title="No trades in this account" description="Log the first trade and choose this account to begin its independent history." action={<Link className="btn-primary" to={`/trading/entries/new?accountId=${id}`}>Log a trade</Link>} /> : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{payload.recentTrades.slice(0, 4).map((trade) => <EntryCard key={trade.id} entry={trade} />)}</div>}
      </section>
      <section className="account-danger-zone" aria-labelledby="account-danger-title">
        <div><span className="eyebrow">ACCOUNT LIFECYCLE</span><strong id="account-danger-title">Remove this account workspace</strong><p>Its trades and rules will be preserved and moved to an unassigned state.</p></div>
        <button type="button" className="btn-outline text-danger" onClick={() => setDeleteOpen(true)}><NavigationIcon name="trash" size={16} /> Remove account</button>
      </section>
      <ConfirmDialog open={deleteOpen} title={`Remove ${account.name}?`} description="The account workspace will be deleted. Its trade history and trading rules will remain in Veynote and become unassigned, so no performance evidence is lost." confirmLabel="Remove account" tone="danger" busy={deleteBusy} error={deleteError} onClose={() => { if (!deleteBusy) { setDeleteOpen(false); setDeleteError(""); } }} onConfirm={removeAccount} />
    </div>
  );
}

function AccountInput({ label, value, onChange, type = "text" }) {
  return <label><span>{label}</span><input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "any" : undefined} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
