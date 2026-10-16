import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import ConfirmDialog from "../../components/ConfirmDialog";
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
  const viewParam = searchParams.get("view") || "active";
  const view = ["active", "archived", "trash"].includes(viewParam) ? viewParam : "active";
  const [lifecycleBusy, setLifecycleBusy] = useState("");
  const [lifecycleError, setLifecycleError] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  useEffect(() => { const timer = setTimeout(() => setSearchQuery(q), 200); return () => clearTimeout(timer); }, [q]);
  const result = useApiQuery("/trading/entries", { accountId, q: searchQuery || undefined, view });
  const entries = result.data?.entries ?? null;
  const visibleEntries = useMemo(() => (entries || []).filter(entry => {
    if (outcome === "ALL") return true;
    if (outcome === "DRAFT") return entry.isDraft;
    return !entry.isDraft && entry.result === outcome;
  }), [entries, outcome]);
  const summary = useMemo(() => ({
    drafts:(entries || []).filter(entry=>entry.isDraft).length,
    open:(entries || []).filter(entry=>!entry.isDraft && entry.result === "OPEN").length,
    closed:(entries || []).filter(entry=>!entry.isDraft && ["WIN","LOSS","BREAK_EVEN"].includes(entry.result)).length,
    wins:(entries || []).filter(entry=>!entry.isDraft && entry.result === "WIN").length,
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

  const setView = value => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    value === "active" ? next.delete("view") : next.set("view", value);
    return next;
  }, { replace: true });

  async function applyLifecycle(action) {
    if (!action?.entry?.id) return;
    const key = `${action.type}:${action.entry.id}`;
    setLifecycleBusy(key); setLifecycleError("");
    try {
      if (action.type === "archive") await api.post(`/trading/entries/${action.entry.id}/archive`, {});
      if (action.type === "restore") await api.post(`/trading/entries/${action.entry.id}/restore`, {});
      if (action.type === "trash") await api.delete(`/trading/entries/${action.entry.id}`);
      if (action.type === "permanent") await api.delete(`/trading/entries/${action.entry.id}/permanent`);
      setConfirmAction(null);
      await result.refresh();
    } catch (requestError) {
      setLifecycleError(requestError.message || "The journal record could not be updated.");
    } finally { setLifecycleBusy(""); }
  }

  return (
    <main className="trade-journal-page">
      {result.error && <p role="alert" className="text-danger mb-3">{result.error.message} <button onClick={() => result.refresh().catch(() => {})}>Retry</button></p>}
      {accountsError && <p role="alert" className="text-danger mb-3">{accountsError}</p>}
      <header className="trade-journal-header">
        <div className="min-w-0">
          <span className="eyebrow">TRADE JOURNAL · DECISION RECORD</span>
          <h1 className="page-title">{activeAccount ? activeAccount.name : view === "archived" ? "Archived decisions." : view === "trash" ? "Trading journal recovery." : mode === "search" ? "Find a trading decision" : "Trades, evidence and review."}</h1>
          <p>{activeAccount ? "This account’s trades remain isolated from every other performance record." : view === "archived" ? "Records held outside active performance remain available for review and restoration." : view === "trash" ? "Restore a deleted record or remove it permanently after deliberate confirmation." : "Return to the thesis, execution, psychology and evidence behind every trade."}</p>
        </div>
        {view === "active" && <Link to={`/trading/entries/new${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`} className="btn-primary shrink-0"><NavigationIcon name="plus" size={16}/>Log trade</Link>}
      </header>

      <section className="trade-journal-summary"><div><span>Total records</span><strong>{entries?.length ?? "—"}</strong><small>{summary.drafts ? `${summary.drafts} private draft${summary.drafts === 1 ? "" : "s"}` : "Across the current scope"}</small></div><div><span>Open</span><strong>{entries ? summary.open : "—"}</strong><small>Finalized and in progress</small></div><div><span>Closed</span><strong>{entries ? summary.closed : "—"}</strong><small>{summary.closed ? `${summary.wins} wins` : "No outcomes yet"}</small></div><div><span>Evidence coverage</span><strong>{entries?.length ? `${Math.round(summary.documented/entries.length*100)}%` : "—"}</strong><small>With notes or psychology</small></div></section>

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

      <nav className="trade-journal-lifecycle-nav" aria-label="Trading journal lifecycle">
        {[['active','Journal','note'],['archived','Archive','archive'],['trash','Trash','trash']].map(([value,label,icon]) => <button type="button" key={value} className={view === value ? "is-active" : ""} onClick={() => setView(value)}><NavigationIcon name={icon} size={15}/>{label}</button>)}
      </nav>

      <div className="trade-journal-filters">
        {[['ALL','All records'],['DRAFT','Drafts'],['OPEN','Open'],['WIN','Wins'],['LOSS','Losses'],['BREAK_EVEN','Break-even']].map(([value,label])=><FilterChip key={value} active={outcome===value} onClick={()=>setOutcome(value)}>{label}</FilterChip>)}
      </div>

      {lifecycleError && <div className="inline-error mb-4" role="alert">{lifecycleError}</div>}

      {entries === null ? (
        !result.error && <p className="collection-inline-status" role="status">Checking trade history…</p>
      ) : visibleEntries.length === 0 ? (
        <EmptyState
          icon="📈"
          title={searchQuery || outcome !== "ALL" ? "No matching trading records" : view === "archived" ? "The archive is clear" : view === "trash" ? "Trash is empty" : activeAccount ? `No entries in ${activeAccount.name} yet.` : "No trades yet"}
          description={searchQuery || outcome !== "ALL" ? "Try a broader phrase, outcome, or account scope." : view === "archived" ? "Archive records you want to preserve outside active performance." : view === "trash" ? "Deleted trading records remain recoverable here until you remove them permanently." : "Log your first trade to begin a reliable decision history."}
        />
      ) : (
        <div className="trade-journal-ledger">
          <header><span>Decision</span><span>Market & account</span><span>Outcome</span><span>Evidence</span><span aria-hidden="true" /></header>
          {visibleEntries.map((entry) => <TradeLedgerRow key={entry.id} entry={entry} view={view} busy={lifecycleBusy} onAction={action => action.type === "restore" || action.type === "archive" ? applyLifecycle(action) : setConfirmAction(action)}/>) }
        </div>
      )}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.type === "permanent" ? "Permanently delete this record?" : "Move this record to Trash?"}
        description={confirmAction?.type === "permanent" ? "This permanently removes the trade and its supporting evidence. This action cannot be undone." : "The trade will leave active performance and remain recoverable from Trash."}
        confirmLabel={confirmAction?.type === "permanent" ? "Delete permanently" : "Move to Trash"}
        tone="danger"
        busy={Boolean(lifecycleBusy)}
        error={lifecycleError}
        onClose={() => { if (!lifecycleBusy) { setConfirmAction(null); setLifecycleError(""); } }}
        onConfirm={() => applyLifecycle(confirmAction)}
      />
    </main>
  );
}

function TradeLedgerRow({ entry, view, busy, onAction }) {
  const documented = Boolean((entry.content || "").replace(/<[^>]+>/g," ").trim() || entry.preTradeEmotion || entry.postTradeEmotion);
  const resultLabel = entry.isDraft ? "Draft" : entry.result === "BREAK_EVEN" ? "Break-even" : entry.result ? entry.result.charAt(0)+entry.result.slice(1).toLowerCase() : "Open";
  const resultTone = entry.isDraft ? "is-draft" : entry.result === "WIN" ? "is-win" : entry.result === "LOSS" ? "is-loss" : entry.result === "BREAK_EVEN" ? "is-even" : "is-open";
  const setups = (entry.setupTypes || "").split(",").map(item=>item.trim()).filter(Boolean);
  const actionBusy = type => busy === `${type}:${entry.id}`;
  return <article className="trade-journal-record"><Link className="trade-journal-ledger-row" to={`/trading/entries/${entry.id}`}>
    <time><strong>{new Date(entry.entryDate).getDate()}</strong><span>{new Date(entry.entryDate).toLocaleDateString(undefined,{month:"short",year:"numeric"})}</span></time>
    <span className="trade-journal-decision"><small>{entry.isDraft ? "PRIVATE DRAFT" : entry.isTrade ? "TRADE" : "RESEARCH NOTE"}</small><strong>{entry.title || "Untitled trading record"}</strong><span>{entry.account?.name || "No account assigned"}{entry.playbook?.title ? ` · ${entry.playbook.title}` : setups.length ? ` · ${setups.slice(0,2).join(" · ")}` : ""}</span></span>
    <span className="trade-journal-market"><strong>{entry.asset || "—"}</strong><small>{entry.direction ? entry.direction.charAt(0)+entry.direction.slice(1).toLowerCase() : "No direction"}</small></span>
    <span className={`trade-journal-outcome ${resultTone}`}><strong>{entry.achievedR != null ? `${entry.achievedR > 0 ? "+" : ""}${entry.achievedR}R` : resultLabel}</strong><small>{entry.profitLoss != null ? `${entry.profitLoss > 0 ? "+" : ""}${Number(entry.profitLoss).toLocaleString()}` : resultLabel}</small></span>
    <span className={`trade-journal-evidence ${documented ? "is-documented" : ""}`}><NavigationIcon name={documented?"check":"note"} size={14}/><span><strong>{entry.isDraft ? "Continue documenting" : documented?"Documented":"Needs context"}</strong><small>{entry.isDraft ? "Excluded from performance" : documented?"Thesis or psychology recorded":"Add the evidence behind the result"}</small></span></span>
    <NavigationIcon name="chevron" size={16}/>
  </Link><div className="trade-journal-record-actions">
    {view === "active" && <><button type="button" disabled={Boolean(busy)} onClick={() => onAction({ type:"archive", entry })}><NavigationIcon name="archive" size={13}/>{actionBusy("archive") ? "Archiving…" : "Archive"}</button><button type="button" className="is-danger" disabled={Boolean(busy)} onClick={() => onAction({ type:"trash", entry })}><NavigationIcon name="trash" size={13}/>Trash</button></>}
    {view === "archived" && <><button type="button" disabled={Boolean(busy)} onClick={() => onAction({ type:"restore", entry })}><NavigationIcon name="restore" size={13}/>{actionBusy("restore") ? "Restoring…" : "Restore"}</button><button type="button" className="is-danger" disabled={Boolean(busy)} onClick={() => onAction({ type:"trash", entry })}><NavigationIcon name="trash" size={13}/>Trash</button></>}
    {view === "trash" && <><button type="button" disabled={Boolean(busy)} onClick={() => onAction({ type:"restore", entry })}><NavigationIcon name="restore" size={13}/>{actionBusy("restore") ? "Restoring…" : "Restore"}</button><button type="button" className="is-danger" disabled={Boolean(busy)} onClick={() => onAction({ type:"permanent", entry })}><NavigationIcon name="trash" size={13}/>Delete permanently</button></>}
  </div></article>;
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
