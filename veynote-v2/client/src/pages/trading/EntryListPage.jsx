import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import { EntryCard } from "./Dashboard";
import { useApiQuery } from "../../hooks/useApiQuery";

// mode: "all" | "search"
export default function EntryListPage({ mode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState(() => api.peek("/accounts")?.accounts ?? []);
  const accountId = searchParams.get("accountId") || "";
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [searchQuery, setSearchQuery] = useState(q);
  useEffect(() => { const timer = setTimeout(() => setSearchQuery(q), 200); return () => clearTimeout(timer); }, [q]);
  const result = useApiQuery("/trading/entries", { accountId, q: mode === "search" ? searchQuery : undefined });
  const entries = result.data?.entries ?? null;

  useEffect(() => {
    api.get("/accounts").then((d) => setAccounts(d.accounts));
  }, []);


  const activeAccount = accounts.find((a) => a.id === accountId);

  return (
    <div>
      {result.error && <p role="alert" className="text-danger mb-3">{result.error.message} <button onClick={() => result.refresh().catch(() => {})}>Retry</button></p>}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <span className="eyebrow">JOURNAL</span>
          <h1 className="page-title text-[22px] sm:text-[30px] tracking-tight mt-1.5 mb-2 break-words">
            {activeAccount ? activeAccount.name : mode === "search" ? "Search" : "All entries"}
          </h1>
          <p className="text-ink-muted m-0">{entries ? `${entries.length} total` : ""}</p>
        </div>
        <Link to="/trading/entries/new" className="btn-primary shrink-0">+ Log trade</Link>
      </div>

      {mode === "search" && (
        <div className="input flex items-center gap-2 mb-6">
          ◎
          <input
            className="bg-transparent outline-none flex-1 text-ink placeholder:text-ink-muted"
            placeholder="Search by title, asset, notes…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              const next = new URLSearchParams(searchParams);
              e.target.value ? next.set("q", e.target.value) : next.delete("q");
              setSearchParams(next);
            }}
            autoFocus
          />
        </div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        <FilterChip active={!accountId} onClick={() => setSearchParams({})}>All</FilterChip>
        {accounts.map((a) => (
          <FilterChip key={a.id} active={accountId === a.id} onClick={() => setSearchParams({ accountId: a.id })}>
            {a.name}
          </FilterChip>
        ))}
      </div>

      {entries === null ? (
        <PageSkeleton compact />
      ) : entries.length === 0 ? (
        <EmptyState
          icon="📈"
          title={activeAccount ? `No entries in ${activeAccount.name} yet.` : "No trades yet"}
          description="Log your first trade to start tracking performance."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
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
