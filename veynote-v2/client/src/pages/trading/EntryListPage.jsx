import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import { EntryCard } from "./Dashboard";
import { useApiQuery } from "../../hooks/useApiQuery";
import NavigationIcon from "../../components/layout/NavigationIcon";
import "./tradingJournal.css";

// mode: "all" | "search"
export default function EntryListPage({ mode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState(() => api.peek("/accounts")?.accounts ?? []);
  const [accountsError, setAccountsError] = useState("");
  const accountId = searchParams.get("accountId") || "";
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [searchQuery, setSearchQuery] = useState(q);
  const [outcome, setOutcome] = useState("ALL");
  useEffect(() => { const timer = setTimeout(() => setSearchQuery(q), 200); return () => clearTimeout(timer); }, [q]);
  const result = useApiQuery("/trading/entries", { accountId, q: searchQuery || undefined });
  const entries = result.data?.entries ?? null;
  const visibleEntries = useMemo(() => (entries || []).filter(entry => outcome === "ALL" || entry.result === outcome), [entries, outcome]);
  const summary = useMemo(() => ({
    open:(entries || []).filter(entry=>entry.result === "OPEN").length,
    closed:(entries || []).filter(entry=>["WIN","LOSS","BREAK_EVEN"].includes(entry.result)).length,
    wins:(entries || []).filter(entry=>entry.result === "WIN").length,
    documented:(entries || []).filter(entry=>(entry.content || "").replace(/<[^>]+>/g," ").trim() || entry.preTradeEmotion || entry.postTradeEmotion).length,
  }), [entries]);

  useEffect(() => {
    api.get("/accounts").then((data) => { setAccounts(data.accounts); setAccountsError(""); })
      .catch(error => setAccountsError(error.message || "Account filters could not be loaded."));
  }, []);


  const activeAccount = accounts.find((a) => a.id === accountId);
  const setAccount = value => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (value) next.set("accountId", value); else next.delete("accountId");
    return next;
  }, { replace: true });

  return (
    <main className="trade-journal-page">
      {result.error && <p role="alert" className="text-danger mb-3">{result.error.message} <button onClick={() => result.refresh().catch(() => {})}>Retry</button></p>}
      {accountsError && <p role="alert" className="text-danger mb-3">{accountsError}</p>}
      <header className="trade-journal-header">
        <div className="min-w-0">
          <span className="eyebrow">TRADE JOURNAL · DECISION RECORD</span>
          <h1 className="page-title">{activeAccount ? activeAccount.name : mode === "search" ? "Find a trading decision" : "Trades, evidence and review."}</h1>
          <p>{activeAccount ? "This account’s trades remain isolated from every other performance record." : "Return to the thesis, execution, psychology and evidence behind every trade."}</p>
        </div>
        <Link to={`/trading/entries/new${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`} className="btn-primary shrink-0"><NavigationIcon name="plus" size={16}/>Log trade</Link>
      </header>

      <section className="trade-journal-summary"><div><span>Total records</span><strong>{entries?.length ?? "—"}</strong><small>Across the current scope</small></div><div><span>Open</span><strong>{entries ? summary.open : "—"}</strong><small>Still in progress</small></div><div><span>Closed</span><strong>{entries ? summary.closed : "—"}</strong><small>{summary.closed ? `${summary.wins} wins` : "No outcomes yet"}</small></div><div><span>Evidence coverage</span><strong>{entries?.length ? `${Math.round(summary.documented/entries.length*100)}%` : "—"}</strong><small>With notes or psychology</small></div></section>

      <section className="trade-journal-toolbar">
        <div className="trade-journal-search">
          <NavigationIcon name="search" size={17}/>
          <input
            placeholder="Search instrument, setup, thesis or notes…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              const next = new URLSearchParams(searchParams);
              e.target.value ? next.set("q", e.target.value) : next.delete("q");
              setSearchParams(next);
            }}
            autoFocus={mode === "search"}
          />
        </div>
        <select aria-label="Trading account filter" value={accountId} onChange={event=>setAccount(event.target.value)}><option value="">All accounts</option>{accounts.map(account=><option value={account.id} key={account.id}>{account.name}</option>)}</select>
      </section>

      <div className="trade-journal-filters">
        {[['ALL','All records'],['OPEN','Open'],['WIN','Wins'],['LOSS','Losses'],['BREAK_EVEN','Break-even']].map(([value,label])=><FilterChip key={value} active={outcome===value} onClick={()=>setOutcome(value)}>{label}</FilterChip>)}
      </div>

      {entries === null ? (
        !result.error && <p className="collection-inline-status" role="status">Checking trade history…</p>
      ) : visibleEntries.length === 0 ? (
        <EmptyState
          icon="📈"
          title={searchQuery || outcome !== "ALL" ? "No matching trading records" : activeAccount ? `No entries in ${activeAccount.name} yet.` : "No trades yet"}
          description={searchQuery || outcome !== "ALL" ? "Try a broader phrase, outcome, or account scope." : "Log your first trade to begin a reliable decision history."}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visibleEntries.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}
    </main>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11.5px] rounded-lg px-3 py-2 border transition ${
        active ? "bg-ink text-app-bg border-ink" : "bg-app-panel2 border-app-border text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}
