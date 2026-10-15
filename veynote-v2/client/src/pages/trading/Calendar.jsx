import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import NavigationIcon from "../../components/layout/NavigationIcon";
import "./tradingCalendar.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June","July","August","September","October","November","December",
];

export default function TradingCalendar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const accountId = searchParams.get("accountId") || "";
  const [accounts, setAccounts] = useState(() => api.peek("/accounts")?.accounts ?? []);
  useEffect(() => { api.get("/accounts").then(data => setAccounts(data.accounts)).catch(() => {}); }, []);
  const activeAccount = accounts.find(account => account.id === accountId);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const result = useApiQuery("/calendar", { mode: "TRADING", year, month, accountId: accountId || undefined });
  const data = result.data;
  const dayResult = useApiQuery("/calendar/day", { mode: "TRADING", date: new Date(Date.UTC(year, month - 1, selectedDay)).toISOString(), accountId: accountId || undefined });
  const dayDetail = dayResult.data;

  function changeMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
    setSelectedDay(day => Math.min(day, new Date(y, m, 0).getDate()));
  }
  function returnToToday() {
    const current = new Date();
    setYear(current.getFullYear());
    setMonth(current.getMonth() + 1);
    setSelectedDay(current.getDate());
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  const summaryByDay = useMemo(() => {
    const map = {};
    (data?.tradingDaySummaries || []).forEach((s) => {
      map[new Date(s.date).getUTCDate()] = s;
    });
    return map;
  }, [data]);
  const monthSummary = useMemo(() => {
    const rows = data?.tradingDaySummaries || [];
    return { days:rows.length, trades:rows.reduce((sum,row)=>sum+(Number(row.tradeCount)||0),0), netR:Number(rows.reduce((sum,row)=>sum+(Number(row.netR)||0),0).toFixed(2)), positive:rows.filter(row=>Number(row.netR)>0).length };
  }, [data]);

  return (
    <main className="trading-calendar-page">
      <header className="trading-calendar-header"><div><span className="eyebrow">TRADING · TEMPORAL REVIEW</span><h1 className="page-title">Performance in the context of time.</h1><p>{activeAccount ? `Only trades logged under ${activeAccount.name} contribute to this calendar.` : "See when decisions were made, where results clustered, and return to the complete evidence behind any trading day."}</p></div><select aria-label="Trading account" value={accountId} onChange={event => setSearchParams(previous => { const next = new URLSearchParams(previous); if (event.target.value) next.set("accountId", event.target.value); else next.delete("accountId"); return next; }, { replace: true })}><option value="">All accounts</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></header>
      {(result.error || dayResult.error) && <p role="alert" className="text-danger">{(result.error || dayResult.error).message} <button className="btn-outline" onClick={() => Promise.allSettled([result.refresh(), dayResult.refresh()])}>Retry</button></p>}

      <section className="trading-calendar-summary"><div><span>Net month</span><strong className={monthSummary.netR>=0?"text-success":"text-danger"}>{data ? `${monthSummary.netR>0?"+":""}${monthSummary.netR}R` : "—"}</strong></div><div><span>Trading days</span><strong>{data ? monthSummary.days : "—"}</strong></div><div><span>Trades</span><strong>{data ? monthSummary.trades : "—"}</strong></div><div><span>Positive days</span><strong>{data ? monthSummary.positive : "—"}</strong></div></section>

      <div className="trading-calendar-layout">
        <section className="trading-calendar-board">
          <div className="trading-calendar-period">
            <button onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
            <div><span>MONTHLY REVIEW</span><h2>{MONTHS[month - 1]} {year}</h2></div>
            {!isCurrentMonth && <button className="trading-calendar-today" onClick={returnToToday}>Today</button>}
            <button onClick={() => changeMonth(1)} aria-label="Next month">›</button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAYS.map((d) => (
              <span key={d} className="text-[9px] text-ink-muted text-center pb-1.5">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const isToday = isCurrentMonth && d === today.getDate();
              const summary = summaryByDay[d];
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`h-[65px] rounded-lg p-1.5 text-left transition ${
                    selectedDay === d ? "bg-app-panel2 ring-1 ring-accent-trade" : "bg-app-panel2/60 hover:bg-app-panel2"
                  } ${isToday ? "border border-accent-trade" : ""}`}
                >
                  <b className="text-[10.5px] text-ink-soft">{d}</b>
                  {summary && (
                    <span className={`block text-[8.5px] mt-1 px-1 py-0.5 rounded truncate ${summary.netR >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                      {summary.netR >= 0 ? "+" : ""}{summary.netR}R · {summary.tradeCount}t
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="trading-calendar-day">
          <p className="text-[10px] text-ink-muted m-0 mb-1">{MONTHS[month - 1].toUpperCase()} {selectedDay}, {year}</p>
          {dayDetail?.trades?.length > 0 ? (
            <>
              <p className="text-[13px] font-bold m-0 mb-0.5">
                Net:{" "}
                <span className={netTotal(dayDetail.trades) >= 0 ? "text-success" : "text-danger"}>
                  {netTotal(dayDetail.trades) >= 0 ? "+" : ""}{netTotal(dayDetail.trades)}R
                </span>
              </p>
              <p className="text-[11px] text-ink-muted m-0 mb-3.5">
                {dayDetail.trades.length} trade{dayDetail.trades.length === 1 ? "" : "s"} ·{" "}
                {dayDetail.trades.filter((t) => t.result === "WIN").length} win ·{" "}
                {dayDetail.trades.filter((t) => t.result === "LOSS").length} loss
              </p>
              <div className="border-t border-app-border pt-2.5">
                {dayDetail.trades.map((t) => (
                  <Link key={t.id} to={`/trading/entries/${t.id}`} className="block text-[11.5px] mb-1.5">
                    <NavigationIcon name="chart" size={13}/> {t.title}{" "}
                    <span className={t.result === "WIN" ? "text-success" : t.result === "LOSS" ? "text-danger" : "text-ink-muted"}>
                      ({outcomeLabel(t.result)})
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-ink-muted mb-3.5">{dayDetail ? "No trades logged this day" : dayResult.error ? "Day details are unavailable." : "Checking this day…"}</p>
          )}
          <Link to={`/trading/entries/new${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`} className="btn-outline w-full text-center block mt-3.5">
            + Log a trade
          </Link>
        </aside>
      </div>
    </main>
  );
}

function netTotal(trades) {
  return Number(trades.reduce((s, t) => s + (t.achievedR || 0), 0).toFixed(2));
}
function outcomeLabel(result) {
  if (result === "BREAK_EVEN") return "Break-even";
  if (!result || result === "OPEN") return "Open";
  return result.charAt(0) + result.slice(1).toLowerCase();
}
