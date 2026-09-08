import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import StatCard from "../../components/StatCard";
import EmptyState from "../../components/EmptyState";

export default function TradingDashboard() {
  const [entries, setEntries] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    api.get("/trading/entries").then((d) => setEntries(d.entries));
    api.get("/accounts").then((d) => setAccounts(d.accounts));
    api.get("/analytics/trading").then(setAnalytics);
  }, []);

  const openPositions = entries?.filter((e) => e.isTrade && e.result === "OPEN") || [];
  const recent = (entries || []).slice(0, 4);

  return (
    <div className="flex flex-col gap-12 md:gap-7 px-1 sm:px-0 pb-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 md:gap-6">
        <div className="min-w-0">
          <span className="eyebrow">{new Date().toDateString().toUpperCase()}</span>
          <h1 className="font-bold text-[22px] leading-tight sm:text-[26px] md:text-[30px] tracking-tight mt-1.5 mb-2 break-words">
            Trading Journal
          </h1>
          <p className="text-ink-muted m-0 max-w-[600px] text-[13px] md:text-base">
            Capture the thinking behind every setup.
          </p>
        </div>
        <Link
          to="/trading/entries/new"
          className="btn-primary w-full md:w-auto text-center whitespace-nowrap shrink-0"
        >
          + Log trade
        </Link>
      </div>

      <div className="rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-5 md:gap-3.5 border border-app-border bg-gradient-to-br from-app-panel to-accent-trade-soft">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-[38px] h-[38px] rounded-xl bg-accent-trade-soft text-[#7db9ff] flex items-center justify-center text-base shrink-0">
            📈
          </div>
          <div className="min-w-0">
            <strong className="block text-[13.5px] mb-1">What did you trade today?</strong>
            <span className="text-[11.5px] text-ink-muted leading-relaxed">
              Log a setup, review a past trade, or add a psychology note.
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5 md:ml-auto shrink-0">
          <Link to="/trading/entries/new" className="chip hover:bg-app-border">
            📈 Trade setup
          </Link>
          <Link to="/trading/search" className="chip hover:bg-app-border">
            ◎ Search
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Win rate"
          value={analytics?.hasData ? `${analytics.winRate}%` : "—"}
          hint={analytics?.hasData ? "All logged trades" : "Log a trade to start"}
        />
        <StatCard
          label="Total R"
          value={
            analytics?.hasData
              ? `${analytics.cumulativeR.at(-1)?.value >= 0 ? "+" : ""}${analytics.cumulativeR.at(-1)?.value}R`
              : "—"
          }
          hintTone={
            analytics?.hasData && analytics.cumulativeR.at(-1)?.value >= 0
              ? "positive"
              : "negative"
          }
        />
        <StatCard
          label="Open positions"
          value={openPositions.length}
          hint={openPositions[0]?.asset || ""}
        />
        <StatCard label="Total entries" value={entries ? entries.length : "0"} />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div className="min-w-0">
            <span className="eyebrow">RECENT</span>
            <h2 className="text-[16px] md:text-[19px] tracking-[-.02em] mt-[5px] mb-0">
              Continue where you left off
            </h2>
          </div>
          <Link to="/trading/entries" className="text-ink-soft text-[12px] shrink-0">
            View all →
          </Link>
        </div>

        {entries === null ? (
          <p className="text-ink-muted text-[12px]">Loading…</p>
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
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recent.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <span className="eyebrow">ACCOUNTS</span>
          <h2 className="text-[16px] md:text-[19px] tracking-[-.02em] mt-[5px] mb-0">
            Your accounts
          </h2>
        </div>

        {accounts === null ? (
          <p className="text-ink-muted text-[12px]">Loading…</p>
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
      </section>
    </div>
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
          className={`type-pill shrink-0 ${
            entry.isTrade ? "bg-accent-trade-soft text-[#9ecbff]" : ""
          }`}
        >
          {entry.isTrade ? "Trading" : "Note"}
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
      to={`/trading/entries?accountId=${account.id}`}
      className="card p-4 flex flex-col gap-2 hover:border-ink-muted transition min-w-0"
    >
      <div className="w-9 h-9 rounded-lg bg-accent-trade-soft text-[#7db9ff] flex items-center justify-center mb-2 text-base">
        ◆
      </div>
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