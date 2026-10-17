import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import StatCard from "../../components/StatCard";

function PerformanceTable({ title, subtitle, rows }) {
  return <section className="card analytics-breakdown"><div className="section-heading"><div><span className="eyebrow">BREAKDOWN</span><h2>{title}</h2><p>{subtitle}</p></div></div>{!rows?.length ? <p className="account-empty-copy">Not enough categorized trades yet.</p> : <div>{rows.slice(0, 8).map((row) => <div className="analytics-breakdown-row" key={row.key}><div><strong>{row.key}</strong><span>{row.count} trade{row.count === 1 ? "" : "s"}</span></div><div className="analytics-rate"><i><b style={{ width: `${Math.max(row.winRate, 3)}%` }} /></i><span>{row.winRate}%</span></div><b className={row.totalR >= 0 ? "text-success" : "text-danger"}>{row.totalR > 0 ? "+" : ""}{row.totalR}R</b></div>)}</div>}</section>;
}

function periodRange(period) {
  if (period === "all") return { from: "", to: "" };
  const today = new Date();
  const start = new Date(today);
  if (period === "30") start.setDate(today.getDate() - 29);
  if (period === "90") start.setDate(today.getDate() - 89);
  if (period === "year") start.setMonth(0, 1);
  return { from: start.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
}

export default function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const accountId = searchParams.get("accountId") || "";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const period = searchParams.get("period") || "all";
  const query = new URLSearchParams();
  if (accountId) query.set("accountId", accountId);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const path = `/analytics/trading${query.size ? `?${query}` : ""}`;
  const [data, setData] = useState(() => api.peek(path) ?? null);
  const [accounts, setAccounts] = useState(() => api.peek("/accounts")?.accounts ?? []);
  const [error, setError] = useState("");
  const [accountsError, setAccountsError] = useState("");
  const requestGeneration = useRef(0);

  function load(force = false) {
    const generation = requestGeneration.current;
    setError("");
    api.get(path, undefined, { force })
      .then((result) => { if (generation === requestGeneration.current) setData(result); })
      .catch((requestError) => { if (generation === requestGeneration.current) setError(requestError.message || "Analytics could not be loaded."); });
  }
  useEffect(() => { requestGeneration.current += 1; setData(api.peek(path) ?? null); load(); return () => { requestGeneration.current += 1; }; }, [path]);
  useEffect(() => { api.get("/accounts").then((result) => setAccounts(result.accounts)).catch((requestError) => setAccountsError(requestError.message || "Accounts could not be loaded.")); }, []);
  const account = accounts.find((item) => item.id === accountId);
  function choosePeriod(value) {
    const range = periodRange(value);
    const next = new URLSearchParams(searchParams);
    next.set("period", value);
    range.from ? next.set("from", range.from) : next.delete("from");
    range.to ? next.set("to", range.to) : next.delete("to");
    setSearchParams(next, { replace: true });
  }
  function chooseDate(name, value) {
    const next = new URLSearchParams(searchParams);
    next.set("period", "custom");
    value ? next.set(name, value) : next.delete(name);
    setSearchParams(next, { replace: true });
  }

  return <div className="trading-analytics-page">
    <header className="analytics-header"><div><span className="eyebrow">PERFORMANCE INTELLIGENCE</span><h1 className="page-title">Trading Analytics</h1><p>{accountId ? account ? `Only trades logged under ${account.name} contribute to this view.` : "Only trades logged under the selected account contribute to this view." : "A factual view across every trading account."}</p></div><select aria-label="Trading account" value={accountId} onChange={(event) => { const next = new URLSearchParams(searchParams); event.target.value ? next.set("accountId", event.target.value) : next.delete("accountId"); setSearchParams(next); }}><option value="">All accounts</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></header>
    {accountsError && <div className="analysis-error" role="alert"><span>Account choices could not be loaded: {accountsError}</span><button type="button" onClick={() => { setAccountsError(""); api.get("/accounts", undefined, { force: true }).then((result) => setAccounts(result.accounts)).catch((requestError) => setAccountsError(requestError.message || "Accounts could not be loaded.")); }}>Retry accounts</button></div>}
    <section className="analytics-scope" aria-label="Analytics period"><div><span>Evidence window</span><nav>{[["30","30 days"],["90","90 days"],["year","This year"],["all","All time"]].map(([value,label]) => <button type="button" key={value} className={period === value ? "active" : ""} aria-pressed={period === value} onClick={() => choosePeriod(value)}>{label}</button>)}</nav></div><label><span>From</span><input type="date" value={from} max={to || undefined} onChange={(event) => chooseDate("from", event.target.value)} /></label><label><span>To</span><input type="date" value={to} min={from || undefined} onChange={(event) => chooseDate("to", event.target.value)} /></label></section>
    {error && <div className="analysis-error" role="alert"><span>{error}{data ? " Showing the last available results." : ""}</span><button type="button" onClick={() => load(true)}>Retry</button></div>}
    {data === null ? (!error && <p className="collection-inline-status" role="status">Opening performance results…</p>) : !data.hasData ? <EmptyState icon="↗" title="Performance starts with a closed trade" description="Open trades remain visible in the journal, while this page waits for a completed outcome before calculating statistics." action={<Link className="btn-primary" to={`/trading/entries/new${accountId ? `?accountId=${accountId}` : ""}`}>Log a trade</Link>} /> : <>
      <section className="analytics-scoreboard"><div className="analytics-primary-score"><span>NET PERFORMANCE</span><strong className={data.totalR >= 0 ? "text-success" : "text-danger"}>{data.totalR > 0 ? "+" : ""}{data.totalR}R</strong><small>{data.totalTrades} closed trades · {data.wins} wins · {data.losses} losses</small></div><div><span>Win rate</span><strong>{data.winRate}%</strong><small>{data.breakEven} break-even</small></div><div><span>Expectancy</span><strong>{data.expectancy != null ? `${data.expectancy > 0 ? "+" : ""}${data.expectancy}R` : "—"}</strong><small>Per closed trade</small></div><div><span>Max drawdown</span><strong>{data.maximumDrawdown}R</strong><small>Peak-to-trough</small></div></section>
      <div className="analytics-metric-grid"><StatCard label="Profit factor" value={data.profitFactor == null ? "∞" : data.profitFactor} hint="Gross R won ÷ lost" /><StatCard label="Average outcome" value={data.averageOutcome != null ? `${data.averageOutcome > 0 ? "+" : ""}${data.averageOutcome}R` : "—"} hint="Expectancy realized" /><StatCard label="Average win" value={data.averageWin != null ? `${data.averageWin}R` : "—"} /><StatCard label="Average loss" value={data.averageLoss != null ? `${data.averageLoss}R` : "—"} /><StatCard label="Planned R:R" value={data.avgRiskReward != null ? `${data.avgRiskReward}R` : "—"} /><StatCard label="Journal coverage" value={`${data.ruleAdherence.journaledPct}%`} hint="Psychology captured" /><StatCard label="Best trade" value={data.bestTrade ? `${data.bestTrade.achievedR > 0 ? "+" : ""}${data.bestTrade.achievedR || 0}R` : "—"} hint={data.bestTrade?.asset || ""} /><StatCard label="Worst trade" value={data.worstTrade ? `${data.worstTrade.achievedR || 0}R` : "—"} hint={data.worstTrade?.asset || ""} /></div>
      <section className="card analytics-equity-card"><div className="section-heading"><div><span className="eyebrow">PERFORMANCE CURVE</span><h2>Cumulative R</h2><p>Every point represents a closed trade in chronological order.</p></div><span className="type-pill">{account?.name || "All accounts"}</span></div><div className="analytics-equity-chart">{data.cumulativeR.map((point, index) => { const values = data.cumulativeR.map((item) => item.value); const min = Math.min(...values, 0); const max = Math.max(...values, 0); const range = Math.max(max - min, 1); const height = ((point.value - min) / range) * 82 + 8; return <Link to={`/trading/entries/${point.tradeId}`} key={point.tradeId || index} className="analytics-equity-point" title={`${point.value}R · ${new Date(point.date).toLocaleDateString()}`}><i className={point.value >= 0 ? "positive" : "negative"} style={{ height: `${height}%` }} /><span>{index === 0 || index === data.cumulativeR.length - 1 ? `${point.value}R` : ""}</span></Link>; })}</div></section>
      <div className="analytics-breakdown-grid"><PerformanceTable title="Setup performance" subtitle="Which playbook ideas produce results." rows={data.setupBreakdown} /><PerformanceTable title="Instrument performance" subtitle="Where your edge is concentrated." rows={data.instrumentBreakdown} /><PerformanceTable title="Long vs short" subtitle="Directional execution and outcome." rows={data.directionBreakdown} /></div>
      <div className="analytics-context-grid"><PerformanceTable title="Playbook evidence" subtitle="Reusable setups measured independently from labels." rows={data.playbookBreakdown} /><PerformanceTable title="Trading session" subtitle="Where your execution and attention produce results." rows={data.sessionBreakdown} /><PerformanceTable title="Entry timeframe" subtitle="Where execution evidence is strongest." rows={data.timeframeBreakdown} /><PerformanceTable title="Market regime" subtitle="The contexts where your playbook holds up." rows={data.marketRegimeBreakdown} /><PerformanceTable title="Day of week" subtitle="When performance tends to concentrate." rows={data.dayOfWeekBreakdown} /></div>
      <section className="analytics-behaviour-ledger"><div><span className="eyebrow">BEHAVIOUR UNDER PRESSURE</span><h2>Streaks are context, not identity.</h2><p>Use them to detect changes in execution. The underlying decisions remain available for review.</p></div><article><span>Current sequence</span><strong>{data.streaks?.current?.count || 0}<small>{data.streaks?.current?.outcome?.replace("BREAK_EVEN", "break-even").toLowerCase() || "closed trades"}</small></strong></article><article><span>Longest winning</span><strong>{data.streaks?.longestWinning || 0}<small>trades</small></strong></article><article><span>Longest losing</span><strong>{data.streaks?.longestLosing || 0}<small>trades</small></strong></article><Link className="btn-outline" to="/trading/entries">Review sequence</Link></section>
      <section className="analytics-confidence-ledger"><div><span className="eyebrow">EVIDENCE MATURITY</span><h2>{data.totalTrades < 20 ? "Early sample" : data.totalTrades < 50 ? "Developing sample" : "Established sample"}</h2><p>Veynote separates measured history from certainty. Keep documenting the same setup taxonomy before treating a pattern as durable.</p></div><strong>{data.totalTrades}<small>closed trades</small></strong><Link to="/trading/entries" className="btn-outline">Audit source trades</Link></section>
      <section className="card analytics-discipline"><div><span className="eyebrow">DISCIPLINE SIGNALS</span><h2>Evidence quality</h2><p>Documentation coverage is measured separately from performance, so missing evidence is never mistaken for discipline.</p></div><div><span>Psychology captured</span><strong>{data.ruleAdherence.journaledPct}%</strong></div><div><span>Complete decision records</span><strong>{data.ruleAdherence.completeEvidencePct ?? 0}%</strong></div><div><span>Exit reviews completed</span><strong>{data.ruleAdherence.exitReviewPct ?? 0}%</strong></div><div><span>Confidence on wins</span><strong>{data.ruleAdherence.avgConfidenceOnWins != null ? `${data.ruleAdherence.avgConfidenceOnWins}/10` : "—"}</strong></div><Link to="/trading/rules" className="btn-outline">Open Rulebook</Link></section>
    </>}
  </div>;
}
