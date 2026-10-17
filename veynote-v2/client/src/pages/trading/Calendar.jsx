import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import NavigationIcon from "../../components/layout/NavigationIcon";
import EmptyState from "../../components/EmptyState";
import { tradingMonthReview } from "../../utils/tradingCalendar";
import "./tradingCalendar.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June","July","August","September","October","November","December",
];

export default function TradingCalendar() {
  const [searchParams, setSearchParams] = useSearchParams();
  const accountId = searchParams.get("accountId") || "";
  const view = ["month", "weeks", "agenda"].includes(searchParams.get("view")) ? searchParams.get("view") : "month";
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
  const monthSummary = useMemo(() => tradingMonthReview(data?.tradingDaySummaries || [], year, month), [data, year, month]);
  const selectedTrades = dayDetail?.trades || [];
  const selectedNet = netTotal(selectedTrades);
  const selectedEvidence = selectedTrades.length ? Math.round(selectedTrades.filter(trade => trade.content || trade.liquidityNarrative || trade.postTradeLesson || trade.psychologyBefore || trade.emotionBefore).length / selectedTrades.length * 100) : 0;

  function moveSelectedDay(delta) {
    const next = new Date(year, month - 1, selectedDay + delta);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
    setSelectedDay(next.getDate());
  }
  function selectView(nextView) {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (nextView === "month") next.delete("view"); else next.set("view", nextView);
      return next;
    }, { replace: true });
  }

  return (
    <main className="trading-calendar-page">
      <header className="trading-calendar-header"><div><span className="eyebrow">TRADING · TEMPORAL REVIEW</span><h1 className="page-title">Performance in the context of time.</h1><p>{activeAccount ? `Only trades logged under ${activeAccount.name} contribute to this calendar.` : "See when decisions were made, where results clustered, and return to the complete evidence behind any trading day."}</p></div><select aria-label="Trading account" value={accountId} onChange={event => setSearchParams(previous => { const next = new URLSearchParams(previous); if (event.target.value) next.set("accountId", event.target.value); else next.delete("accountId"); return next; }, { replace: true })}><option value="">All accounts</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></header>
      {(result.error || dayResult.error) && <p role="alert" className="text-danger">{(result.error || dayResult.error).message} <button className="btn-outline" onClick={() => Promise.allSettled([result.refresh(), dayResult.refresh()])}>Retry</button></p>}

      <section className="trading-calendar-summary"><div><span>Net month</span><strong className={monthSummary.netR>=0?"text-success":"text-danger"}>{data ? `${monthSummary.netR>0?"+":""}${monthSummary.netR}R` : "—"}</strong><small>Realized R for this scope</small></div><div><span>Win rate</span><strong>{data ? `${monthSummary.winRate}%` : "—"}</strong><small>{monthSummary.closed ? `${monthSummary.wins} of ${monthSummary.closed} closed outcomes` : "No closed outcomes"}</small></div><div><span>Evidence maturity</span><strong>{data ? `${monthSummary.evidencePercent}%` : "—"}</strong><small>{monthSummary.trades ? "Trades with review evidence" : "Awaiting evidence"}</small></div><div><span>Best day</span><strong>{monthSummary.best ? `${Number(monthSummary.best.netR)>0?"+":""}${monthSummary.best.netR}R` : "—"}</strong><small>{monthSummary.best ? new Date(monthSummary.best.date).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "No closed day"}</small></div></section>

      <div className="trading-calendar-layout">
        <section className="trading-calendar-board">
          <div className="trading-calendar-period">
            <button onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
            <div><span>MONTHLY REVIEW</span><h2>{MONTHS[month - 1]} {year}</h2></div>
            {!isCurrentMonth && <button className="trading-calendar-today" onClick={returnToToday}>Today</button>}
            <button onClick={() => changeMonth(1)} aria-label="Next month">›</button>
          </div>
          <nav className="trading-calendar-views" aria-label="Calendar review view">
            {[['month','Month'],['weeks','Weeks'],['agenda','Agenda']].map(([key,label])=><button key={key} type="button" aria-pressed={view===key} onClick={()=>selectView(key)}>{label}</button>)}
          </nav>

          {view === "month" && <><div className="grid grid-cols-7 gap-1.5 mb-1.5">
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
                  className={`trading-calendar-cell ${selectedDay === d ? "selected" : ""} ${isToday ? "today" : ""} ${summary ? Number(summary.netR)>0 ? "positive" : Number(summary.netR)<0 ? "negative" : "neutral" : ""}`}
                  aria-label={`${MONTHS[month - 1]} ${d}${summary ? `, ${summary.tradeCount} trades, ${summary.netR} R` : ""}`}
                >
                  <b>{d}</b>
                  {summary && (
                    <><i/><span>{summary.netR >= 0 ? "+" : ""}{summary.netR}R</span><small>{summary.tradeCount} trade{summary.tradeCount===1?"":"s"}</small></>
                  )}
                </button>
              );
            })}
          </div></>}
          {view === "weeks" && <WeekReview weeks={monthSummary.weeks} month={MONTHS[month-1]} onSelect={setSelectedDay}/>}
          {view === "agenda" && <AgendaReview rows={monthSummary.rows} month={MONTHS[month-1]} year={year} onSelect={setSelectedDay}/>}
        </section>

        <aside className="trading-calendar-day">
          <header className="trading-calendar-day-header"><button type="button" onClick={()=>moveSelectedDay(-1)} aria-label="Previous day">‹</button><div><span>DECISION REVIEW</span><strong>{MONTHS[month - 1]} {selectedDay}, {year}</strong></div><button type="button" onClick={()=>moveSelectedDay(1)} aria-label="Next day">›</button></header>
          {dayDetail?.trades?.length > 0 ? (
            <>
              <section className="trading-day-score"><div><span>Net result</span><strong className={selectedNet >= 0 ? "text-success" : "text-danger"}>{selectedNet > 0 ? "+" : ""}{selectedNet}R</strong></div><div><span>Evidence</span><strong>{selectedEvidence}%</strong></div></section>
              <p className="trading-day-outcomes">{dayDetail.trades.length} trade{dayDetail.trades.length === 1 ? "" : "s"} · {dayDetail.trades.filter((t) => t.result === "WIN").length} win · {dayDetail.trades.filter((t) => t.result === "LOSS").length} loss</p>
              <div className="trading-day-ledger">
                {dayDetail.trades.map((t) => (
                  <Link key={t.id} to={`/trading/entries/${t.id}`}>
                    <span><NavigationIcon name="chart" size={13}/><b>{t.asset || t.title || "Trade"}</b></span><small>{[t.session, t.setupTypes].filter(Boolean).join(" · ") || "Decision record"}</small><em className={t.result === "WIN" ? "text-success" : t.result === "LOSS" ? "text-danger" : "text-ink-muted"}>{t.achievedR > 0 ? "+" : ""}{t.achievedR || 0}R · {outcomeLabel(t.result)}</em>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-ink-muted mb-3.5">{dayDetail ? "No trades logged this day" : dayResult.error ? "Day details are unavailable." : "Checking this day…"}</p>
          )}
          <div className="trading-day-actions"><Link to={`/trading/entries/new?entryDate=${year}-${String(month).padStart(2,"0")}-${String(selectedDay).padStart(2,"0")}${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ""}`} className="btn-primary"><NavigationIcon name="plus" size={14}/> Log trade</Link>{activeAccount && <Link to={`/trading/accounts/${activeAccount.id}`} className="btn-outline">Open account</Link>}</div>
        </aside>
      </div>
    </main>
  );
}

function WeekReview({ weeks, month, onSelect }) {
  return <div className="trading-week-review">{weeks.map((week,index)=><button key={week.start} type="button" onClick={()=>onSelect(week.active[0] ? new Date(week.active[0].date).getUTCDate() : week.start)}>
    <span className="trading-week-index"><small>WEEK {String(index+1).padStart(2,"0")}</small><strong>{month.slice(0,3)} {week.start}–{week.end}</strong></span>
    <span className="trading-week-track" aria-hidden="true">{Array.from({length:week.end-week.start+1},(_,offset)=>{const day=week.start+offset;const row=week.active.find(item=>new Date(item.date).getUTCDate()===day);return <i key={day} className={!row?"empty":Number(row.netR)>0?"positive":Number(row.netR)<0?"negative":"neutral"}/>})}</span>
    <span><small>NET RESULT</small><strong className={week.netR>=0?"text-success":"text-danger"}>{week.trades?`${week.netR>0?"+":""}${week.netR}R`:"—"}</strong></span>
    <span><small>ACTIVITY</small><strong>{week.trades ? `${week.trades} trade${week.trades===1?"":"s"}` : "No trades"}</strong></span>
    <span><small>DOCUMENTED</small><strong>{week.trades ? `${week.evidencePercent}%` : "—"}</strong></span>
    <NavigationIcon name="chevron" size={15}/>
  </button>)}</div>;
}

function AgendaReview({ rows, month, year, onSelect }) {
  if (!rows.length) return <EmptyState icon="calendar" title="A clear month" description="No completed trading activity appears in this scope yet. Log a decision when the market gives you one; Veynote will build the review agenda from the real record."/>;
  return <div className="trading-agenda-review">{[...rows].reverse().map(row=>{const day=new Date(row.date).getUTCDate();return <button key={row.date} type="button" onClick={()=>onSelect(day)}>
    <time dateTime={row.date}><b>{String(day).padStart(2,"0")}</b><span>{month.slice(0,3)}<small>{year}</small></span></time>
    <span className="trading-agenda-story"><strong>{row.tradeCount} recorded decision{row.tradeCount===1?"":"s"}</strong><small>{row.wins} win · {row.losses} loss · {row.breakEven} break-even · {row.open} open</small></span>
    <span className="trading-agenda-evidence"><small>EVIDENCE</small><strong>{row.evidencePercent}%</strong></span>
    <em className={Number(row.netR)>=0?"text-success":"text-danger"}>{Number(row.netR)>0?"+":""}{row.netR}R</em>
    <NavigationIcon name="chevron" size={15}/>
  </button>})}</div>;
}

function netTotal(trades) {
  return Number(trades.reduce((s, t) => s + (t.achievedR || 0), 0).toFixed(2));
}
function outcomeLabel(result) {
  if (result === "BREAK_EVEN") return "Break-even";
  if (!result || result === "OPEN") return "Open";
  return result.charAt(0) + result.slice(1).toLowerCase();
}
