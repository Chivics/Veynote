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
    <div>
      <div className="flex items-end justify-between gap-6 mb-6">
        <div>
          <span className="eyebrow">{new Date().toDateString().toUpperCase()}</span>
          <h1 className="text-[30px] tracking-tight mt-1.5 mb-2">Trading Journal</h1>
          <p className="text-ink-muted m-0 max-w-[600px]">Capture the thinking behind every setup.</p>
        </div>
        <Link to="/trading/entries/new" className="btn-primary">+ Log trade</Link>
      </div>

      <div className="rounded-2xl p-5 flex items-center gap-3.5 mb-7 border border-app-border bg-gradient-to-br from-app-panel to-accent-trade-soft">
        <div className="w-[38px] h-[38px] rounded-xl bg-accent-trade-soft text-[#7db9ff] flex items-center justify-center text-base shrink-0">📈</div>
        <div>
          <strong className="block text-[13.5px] mb-0.5">What did you trade today?</strong>
          <span className="text-[11.5px] text-ink-muted">Log a setup, review a past trade, or add a psychology note.</span>
        </div>
        <div className="ml-auto flex gap-2 shrink-0">
          <Link to="/trading/entries/new" className="chip hover:bg-app-border">📈 Trade setup</Link>
          <Link to="/trading/search" className="chip hover:bg-app-border">◎ Search</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
        <StatCard label="Win rate" value={analytics?.hasData ? `${analytics.winRate}%` : "—"} hint={analytics?.hasData ? "All logged trades" : "Log a trade to start"} />
        <StatCard
          label="Total R"
          value={analytics?.hasData ? `${analytics.cumulativeR.at(-1)?.value >= 0 ? "+" : ""}${analytics.cumulativeR.at(-1)?.value}R` : "—"}
          hintTone={analytics?.hasData && analytics.cumulativeR.at(-1)?.value >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Open positions" value={openPositions.length} hint={openPositions[0]?.asset || ""} />
        <StatCard label="Total entries" value={entries ? entries.length : "0"} />
      </div>

      <div className="flex items-end justify-between mt-10 mb-4">
        <div>
          <span className="eyebrow">RECENT</span>
          <h2 className="text-[19px] tracking-[-.02em] mt-[5px] mb-0">Continue where you left off</h2>
        </div>
        <Link to="/trading/entries" className="text-ink-soft text-[12px]">View all →</Link>
      </div>

      {entries === null ? (
        <p className="text-ink-muted text-[12px]">Loading…</p>
      ) : recent.length === 0 ? (
        <EmptyState
          icon="📈"
          title="No trades yet"
          description="Log your first trade to start tracking performance."
          action={<Link to="/trading/entries/new" className="btn-primary">Log your first trade</Link>}
          className="mb-8"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {recent.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}

      <div className="flex items-end justify-between mt-10 mb-4">
        <div>
          <span className="eyebrow">ACCOUNTS</span>
          <h2 className="text-[19px] tracking-[-.02em] mt-[5px] mb-0">Your accounts</h2>
        </div>
      </div>
      {accounts === null ? (
        <p className="text-ink-muted text-[12px]">Loading…</p>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon="◆"
          title="No accounts yet"
          description="Add your prop-firm or personal account to start organizing trades."
          action={<Link to="/trading/accounts" className="btn-primary">Add your first account</Link>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} />
          ))}
        </div>
      )}
    </div>
  );
}

export function EntryCard({ entry }) {
  return (
    <Link to={`/trading/entries/${entry.id}`} className="card p-4 block hover:border-ink-muted transition">
      <div className="flex justify-between items-center gap-2.5">
        <span className={`type-pill ${entry.isTrade ? "bg-accent-trade-soft text-[#9ecbff]" : ""}`}>
          {entry.isTrade ? "Trading" : "Note"}
        </span>
        <span className="text-[10px] text-ink-muted">
          {new Date(entry.entryDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      </div>
      <h3 className="text-[14px] m-0 mb-1.5 tracking-tight">{entry.title}</h3>
      <p className="text-[11.5px] leading-relaxed text-ink-muted m-0 mb-3 line-clamp-2">
        {(entry.content || "").replace(/<[^>]*>/g, " ").slice(0, 140) || "No notes yet."}
      </p>
      {entry.isTrade && entry.asset && (
        <div className="bg-app-panel2 rounded-lg p-2.5 flex justify-between items-center mb-3">
          <div className="grid gap-[3px]">
            <span className="text-[11px] font-semibold">{entry.asset}</span>
            <b className={`text-[10px] flex items-center gap-1 ${entry.direction === "LONG" ? "text-success" : "text-danger"}`}>
              {entry.direction === "LONG" ? "▲ Long" : entry.direction === "SHORT" ? "▼ Short" : "—"}
            </b>
          </div>
          <div className="grid gap-[3px] text-right">
            <small className="text-[9px] text-ink-muted">Result</small>
            <b className={`text-[11px] ${entry.result === "WIN" ? "text-success" : entry.result === "LOSS" ? "text-danger" : ""}`}>
              {entry.result === "OPEN" ? "Open" : entry.result?.charAt(0) + entry.result?.slice(1).toLowerCase()}
            </b>
          </div>
        </div>
      )}
      <div className="border-t border-app-border pt-2.5 flex gap-1.5 flex-wrap">
        {(entry.setupTypes || "").split(",").filter(Boolean).map((t) => (
          <span key={t} className="text-[10px] text-ink-muted">#{t}</span>
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
    <Link to={`/trading/entries?accountId=${account.id}`} className="card p-4 flex flex-col gap-2 hover:border-ink-muted transition">
      <div className="w-9 h-9 rounded-lg bg-accent-trade-soft text-[#7db9ff] flex items-center justify-center mb-2 text-base">◆</div>
      <span className={`self-start text-[9.5px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>
        {account.status.charAt(0) + account.status.slice(1).toLowerCase()}
      </span>
      <h3 className="text-[14.5px] m-0">{account.name}</h3>
      <div className="flex gap-4 mt-1">
        <div>
          <small className="block text-[9.5px] text-ink-muted">Entries</small>
          <b className="text-[13px]">{account.stats.entryCount}</b>
        </div>
        <div>
          <small className="block text-[9.5px] text-ink-muted">Win rate</small>
          <b className="text-[13px]">{account.stats.winRate != null ? `${account.stats.winRate}%` : "—"}</b>
        </div>
      </div>
    </Link>
  );
}
