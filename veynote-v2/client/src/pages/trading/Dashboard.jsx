import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import NavigationIcon from "../../components/layout/NavigationIcon";
import "./tradingDashboard.css";

export default function TradingDashboard() {
  const [entries, setEntries] = useState(() => api.peek("/trading/entries")?.entries ?? null);
  const [accounts, setAccounts] = useState(() => api.peek("/accounts")?.accounts ?? null);
  const [analytics, setAnalytics] = useState(() => api.peek("/analytics/trading") ?? null);
  const [entriesError, setEntriesError] = useState("");
  const [accountsError, setAccountsError] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");

  function loadEntries(force = false) {
    setEntriesError("");
    api.get("/trading/entries", undefined, { force }).then((data) => setEntries(data.entries))
      .catch((error) => setEntriesError(error.message || "Trades could not be loaded."));
  }
  function loadAccounts(force = false) {
    setAccountsError("");
    api.get("/accounts", undefined, { force }).then((data) => setAccounts(data.accounts))
      .catch((error) => setAccountsError(error.message || "Accounts could not be loaded."));
  }
  function loadAnalytics(force = false) {
    setAnalyticsError("");
    api.get("/analytics/trading", undefined, { force }).then(setAnalytics)
      .catch((error) => setAnalyticsError(error.message || "Performance could not be loaded."));
  }

  useEffect(() => {
    loadEntries();
    loadAccounts();
    loadAnalytics();
  }, []);

  const openPositions = entries?.filter((e) => e.isTrade && e.result === "OPEN") || [];
  const recent = (entries || []).slice(0, 4);
  const netR = analytics?.hasData ? (analytics.totalR ?? analytics.cumulativeR?.at(-1)?.value ?? 0) : null;
  const closedTrades = analytics?.hasData ? analytics.totalTrades : 0;
  const journalCoverage = analytics?.ruleAdherence?.journaledPct;
  const activeAccounts = (accounts || []).filter(account => account.status !== "BREACHED");

  return (
    <main className="trading-command-page">
      <header className="trading-command-hero">
        <div className="trading-command-copy"><span className="eyebrow">{new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric"}).format(new Date()).toUpperCase()}</span><h1>Decision quality, measured over time.</h1><p>Review risk, execution and the evidence behind every result from one trading operating view.</p><div className="trading-command-actions"><Link to="/trading/entries/new" className="btn-primary"><NavigationIcon name="plus" size={16}/>Log trade</Link><Link to="/trading/entries" className="btn-outline"><NavigationIcon name="book" size={16}/>Open journal</Link></div></div>
        <div className="trading-command-performance"><span>NET PERFORMANCE</span><strong className={netR == null ? "" : netR >= 0 ? "text-success" : "text-danger"}>{netR == null ? "—" : `${netR > 0 ? "+" : ""}${netR}R`}</strong><small>{closedTrades ? `${closedTrades} closed trades · ${analytics.winRate}% win rate` : "Close a trade to establish a performance baseline"}</small><div className="trading-command-curve" aria-label="Recent cumulative R performance">{(analytics?.cumulativeR || []).slice(-18).map((point,index)=><i key={point.tradeId || index} className={point.value>=0?"positive":"negative"} style={{height:`${Math.max(12,Math.min(100,50+Number(point.value||0)*7))}%`}}/>)}</div></div>
      </header>

      {analyticsError && <div className="inline-error mb-4" role="alert"><span>Performance is unavailable: {analyticsError}</span><button type="button" onClick={() => loadAnalytics(true)}>Retry</button></div>}

      <section className="trading-briefing" aria-label="Trading briefing"><div><span>Open exposure</span><strong>{entries ? openPositions.length : "—"}</strong><small>{openPositions.length ? openPositions.map(item=>item.asset).filter(Boolean).slice(0,2).join(" · ") : "No open trades recorded"}</small></div><div><span>Evidence coverage</span><strong>{journalCoverage == null ? "—" : `${journalCoverage}%`}</strong><small>Closed trades with psychology context</small></div><div><span>Account coverage</span><strong>{accounts ? activeAccounts.length : "—"}</strong><small>{accounts?.length ? `${accounts.length} total workspaces` : "Add an account to separate performance"}</small></div><div><span>Next review</span><strong>{closedTrades ? "Ready" : "Pending"}</strong><small>{closedTrades ? "Analytics can identify patterns" : "Record a completed outcome"}</small></div></section>

      <section className="trading-edge-ledger" aria-label="Trading edge summary"><header><span className="eyebrow">EDGE & RISK LEDGER</span><h2>What the closed evidence currently supports.</h2><p>Metrics are calculated only from recorded closed trades. Open positions never distort the performance baseline.</p></header><dl><div><dt>Expectancy</dt><dd>{analytics?.hasData ? `${analytics.expectancy > 0 ? "+" : ""}${analytics.expectancy}R` : "—"}</dd><small>average result per trade</small></div><div><dt>Profit factor</dt><dd>{analytics?.hasData ? analytics.profitFactor == null ? "∞" : analytics.profitFactor : "—"}</dd><small>gross R won ÷ lost</small></div><div><dt>Drawdown</dt><dd>{analytics?.hasData ? `${analytics.maximumDrawdown}R` : "—"}</dd><small>maximum peak-to-trough</small></div><div><dt>Best setup</dt><dd>{analytics?.bestSetup?.key || "—"}</dd><small>{analytics?.bestSetup ? `${analytics.bestSetup.totalR > 0 ? "+" : ""}${analytics.bestSetup.totalR}R · ${analytics.bestSetup.count} trades` : "needs closed evidence"}</small></div></dl><Link to="/trading/analytics">Open full performance intelligence <NavigationIcon name="chevron" size={14}/></Link></section>

      <nav className="trading-command-links" aria-label="Trading workspace shortcuts"><Link to="/trading/analytics"><NavigationIcon name="chart" size={18}/><span><strong>Performance intelligence</strong><small>Expectancy, drawdown and edge</small></span><NavigationIcon name="chevron" size={14}/></Link><Link to="/trading/rules"><NavigationIcon name="shield" size={18}/><span><strong>Rulebook</strong><small>Risk controls and compliance</small></span><NavigationIcon name="chevron" size={14}/></Link><Link to="/trading/calendar"><NavigationIcon name="calendar" size={18}/><span><strong>Trading calendar</strong><small>Review decisions in time</small></span><NavigationIcon name="chevron" size={14}/></Link><Link to="/trading/reports"><NavigationIcon name="files" size={18}/><span><strong>Reports</strong><small>Private and public summaries</small></span><NavigationIcon name="chevron" size={14}/></Link></nav>

      <div className="trading-section-heading">
        <div className="min-w-0">
          <span className="eyebrow">RECENT</span>
          <h2 className="text-[16px] md:text-[19px] tracking-[-.02em] mt-[5px] mb-0">Recent decisions</h2>
        </div>
        <Link to="/trading/entries" className="text-ink-soft text-[12px] shrink-0">
          View all →
        </Link>
      </div>

      {entriesError && <div className="inline-error mb-4" role="alert"><span>Recent trades are unavailable: {entriesError}</span><button type="button" onClick={() => loadEntries(true)}>Retry</button></div>}
      {entries === null ? (
        !entriesError && <p className="collection-inline-status mb-8" role="status">Opening recent trades…</p>
      ) : recent.length === 0 ? (
        <EmptyState
          icon="📈"
          title="No trades yet"
          description="Log your first trade to start tracking performance."
          action={
            <Link to="/trading/entries/new" className="btn-primary">
              Log your first trade
            </Link>
          }
          className="mb-8"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {recent.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}

      <div className="trading-section-heading">
        <div className="min-w-0">
          <span className="eyebrow">ACCOUNTS</span>
          <h2 className="text-[16px] md:text-[19px] tracking-[-.02em] mt-[5px] mb-0">
            Account workspaces
          </h2>
        </div>
      </div>
      {accountsError && <div className="inline-error mb-4" role="alert"><span>Accounts are unavailable: {accountsError}</span><button type="button" onClick={() => loadAccounts(true)}>Retry</button></div>}
      {accounts === null ? (
        !accountsError && <p className="collection-inline-status" role="status">Opening trading accounts…</p>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="◆"
          title="No accounts yet"
          description="Add your prop-firm or personal account to start organizing trades."
          action={
            <Link to="/trading/accounts" className="btn-primary">
              Add your first account
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </div>
      )}
    </main>
  );
}

export function EntryCard({ entry }) {
  return (
    <Link
      to={`/trading/entries/${entry.id}`}
      className="card p-4 block hover:border-ink-muted transition min-w-0"
    >
      <div className="flex justify-between items-center gap-2.5">
        <span
          className={`type-pill shrink-0 inline-flex items-center gap-1.5 ${
            entry.isTrade ? "bg-accent-trade-soft text-[#9ecbff]" : ""
          }`}
        >
          <NavigationIcon name={entry.isTrade ? "chart" : "note"} size={12}/>{entry.isTrade ? "Trade" : "Research note"}
        </span>
        <span className="text-[10px] text-ink-muted shrink-0">
          {new Date(entry.entryDate).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
      <h3 className="text-[14px] m-0 mb-1.5 tracking-tight break-words">{entry.title}</h3>
      <p className="text-[11.5px] leading-relaxed text-ink-muted m-0 mb-3 line-clamp-2">
        {(entry.content || "").replace(/<[^>]*>/g, " ").slice(0, 140) || "No notes yet."}
      </p>
      {entry.isTrade && entry.asset && (
        <div className="bg-app-panel2 rounded-lg p-2.5 flex justify-between items-center gap-2 mb-3 min-w-0">
          <div className="grid gap-[3px] min-w-0">
            <span className="text-[11px] font-semibold truncate">{entry.asset}</span>
            <b
              className={`text-[10px] flex items-center gap-1 ${
                entry.direction === "LONG" ? "text-success" : "text-danger"
              }`}
            >
              {entry.direction === "LONG"
                ? "▲ Long"
                : entry.direction === "SHORT"
                ? "▼ Short"
                : "—"}
            </b>
          </div>
          <div className="grid gap-[3px] text-right shrink-0">
            <small className="text-[9px] text-ink-muted">Result</small>
            <b
              className={`text-[11px] ${
                entry.result === "WIN"
                  ? "text-success"
                  : entry.result === "LOSS"
                  ? "text-danger"
                  : ""
              }`}
            >
              {entry.result === "OPEN"
                ? "Open"
                : entry.result?.charAt(0) + entry.result?.slice(1).toLowerCase()}
            </b>
          </div>
        </div>
      )}
      <div className="border-t border-app-border pt-2.5 flex gap-1.5 flex-wrap">
        {(entry.setupTypes || "")
          .split(",")
          .filter(Boolean)
          .map((t) => (
            <span key={t} className="text-[10px] text-ink-muted">
              #{t}
            </span>
          ))}
      </div>
    </Link>
  );
}

function AccountCard({ account }) {
  const badgeClass =
    account.status === "FUNDED"
      ? "bg-success/15 text-success"
      : account.status === "EVALUATION"
      ? "bg-warning/15 text-warning"
      : "bg-app-panel2 text-ink-muted";

  return (
    <Link
      to={`/trading/accounts/${account.id}`}
      className="card p-4 flex flex-col gap-2 hover:border-ink-muted transition min-w-0"
    >
      <div className="w-9 h-9 rounded-lg bg-accent-trade-soft text-[#7db9ff] flex items-center justify-center mb-2 text-base"><NavigationIcon name="brief" size={18}/></div>
      <span
        className={`self-start text-[9.5px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}
      >
        {account.status.charAt(0) + account.status.slice(1).toLowerCase()}
      </span>
      <h3 className="text-[14.5px] m-0 break-words">{account.name}</h3>
      <div className="flex gap-4 mt-1">
        <div>
          <small className="block text-[9.5px] text-ink-muted">Entries</small>
          <b className="text-[13px]">{account.stats.entryCount}</b>
        </div>
        <div>
          <small className="block text-[9.5px] text-ink-muted">Win rate</small>
          <b className="text-[13px]">
            {account.stats.winRate != null ? `${account.stats.winRate}%` : "—"}
          </b>
        </div>
      </div>
    </Link>
  );
}
