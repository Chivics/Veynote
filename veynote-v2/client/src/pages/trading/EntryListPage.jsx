import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import { EntryCard } from "./Dashboard";

// mode: "all" | "search"
export default function EntryListPage({ mode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entries, setEntries] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const accountId = searchParams.get("accountId") || "";
  const [q, setQ] = useState(searchParams.get("q") || "");

  useEffect(() => {
    api.get("/accounts").then((d) => setAccounts(d.accounts));
  }, []);

  useEffect(() => {
    const query = {};
    if (accountId) query.accountId = accountId;
    if (mode === "search") query.q = q;
    api.get("/trading/entries", query).then((d) => setEntries(d.entries));
  }, [accountId, q, mode]);

  const activeAccount = accounts.find((a) => a.id === accountId);

  return (
    <div>
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
        <p className="text-ink-muted text-[12px]">Loading…</p>
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
