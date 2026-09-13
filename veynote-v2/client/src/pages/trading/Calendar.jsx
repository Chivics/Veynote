import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June","July","August","September","October","November","December",
];

export default function TradingCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const result = useApiQuery("/calendar", { mode: "TRADING", year, month });
  const data = result.data;
  const dayResult = useApiQuery("/calendar/day", { mode: "TRADING", date: new Date(Date.UTC(year, month - 1, selectedDay)).toISOString() });
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

  return (
    <div>
      <span className="eyebrow">TIMELINE</span>
      <h1 className="page-title text-[30px] tracking-tight mt-1.5 mb-6">Trading calendar</h1>
      {(result.error || dayResult.error) && <p role="alert" className="text-danger">{(result.error || dayResult.error).message} <button className="btn-outline" onClick={() => Promise.allSettled([result.refresh(), dayResult.refresh()])}>Retry</button></p>}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="card p-5 flex-1 max-w-[800px]">
          <div className="flex items-center justify-center gap-[25px] mb-4">
            <button onClick={() => changeMonth(-1)} className="w-7 h-7 rounded-md bg-app-panel2 border border-app-border">‹</button>
            <h2 className="text-[15px] m-0 min-w-[130px] text-center">{MONTHS[month - 1]} {year}</h2>
            <button onClick={() => changeMonth(1)} className="w-7 h-7 rounded-md bg-app-panel2 border border-app-border">›</button>
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
        </div>

        <div className="card p-4 w-full lg:w-[240px] shrink-0">
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
                    📈 {t.title}{" "}
                    <span className={t.result === "WIN" ? "text-success" : t.result === "LOSS" ? "text-danger" : "text-ink-muted"}>
                      ({t.result === "OPEN" ? "Open" : t.result.charAt(0) + t.result.slice(1).toLowerCase()})
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-ink-muted mb-3.5">No trades logged this day</p>
          )}
          <Link to={`/trading/entries/new`} className="btn-outline w-full text-center block mt-3.5">
            + Log a trade
          </Link>
        </div>
      </div>
    </div>
  );
}

function netTotal(trades) {
  return Number(trades.reduce((s, t) => s + (t.achievedR || 0), 0).toFixed(2));
}
