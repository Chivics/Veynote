import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../api/client";
import NavigationIcon from "../components/layout/NavigationIcon";
import "./publicTradingReport.css";

function Metric({ label, value, note }) {
  return <article><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function Breakdown({ title, rows = [] }) {
  return <section className="public-performance-breakdown"><header><span>Performance lens</span><h2>{title}</h2></header>{rows.length ? rows.map((row) => <div key={row.key}><span><strong>{row.key}</strong><small>{row.count} trades</small></span><i><b style={{ width: `${Math.max(3, row.winRate)}%` }} /></i><em>{row.winRate}%</em><strong>{row.totalR > 0 ? "+" : ""}{row.totalR}R</strong></div>) : <p>No classified trades in this period.</p>}</section>;
}

export default function PublicTradingReport() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, report: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/public/trading/${token}`, { signal: controller.signal })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "This report is unavailable."); return body.report; })
      .then((report) => setState({ loading: false, report, error: "" }))
      .catch((error) => { if (error.name !== "AbortError") setState({ loading: false, report: null, error: error.message }); });
    return () => controller.abort();
  }, [token]);

  if (state.loading) return <main className="public-performance-state"><span className="public-performance-mark">V</span><p>Preparing verified performance…</p></main>;
  if (state.error) return <main className="public-performance-state"><span className="public-performance-mark">V</span><h1>Report unavailable</h1><p>{state.error}</p></main>;
  const { report } = state; const m = report.metrics; const period = [report.period.from, report.period.to].map((value) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null);
  return <main className="public-performance-page">
    <nav><span className="public-performance-mark">V</span><strong>Veynote</strong><em>Verified performance</em></nav>
    <header className="public-performance-hero"><div><span className="eyebrow">PUBLIC PERFORMANCE RECORD</span><h1>{report.title}</h1><p>{report.accountName ? `${report.accountName} · ` : ""}{period[0] || "Beginning"} — {period[1] || "Present"}</p></div><strong className={m.netR >= 0 ? "is-positive" : "is-negative"}>{m.netR > 0 ? "+" : ""}{m.netR}R<small>net performance</small></strong></header>
    <section className="public-performance-trust"><NavigationIcon name="shield" size={18}/><p>Live read-only aggregate calculated by Veynote. Private notes, screenshots, balances, prices and identity are excluded.</p><time>Calculated {new Date(report.calculatedAt).toLocaleString()}</time></section>
    <section className="public-performance-metrics">
      <Metric label="Closed trades" value={m.closed} note={`${m.wins} wins · ${m.losses} losses · ${m.breakeven || 0} even`} />
      <Metric label="Win rate" value={`${m.winRate}%`} note="closed trades" />
      <Metric label="Expectancy" value={`${m.expectancy}R`} note="per trade" />
      <Metric label="Profit factor" value={m.profitFactor === null ? "∞" : m.profitFactor} note="gross R won / lost" />
      <Metric label="Max drawdown" value={`${m.maxDrawdown}R`} note="peak to trough" />
      <Metric label="Average win" value={m.averageWin == null ? "—" : `+${m.averageWin}R`} note="winning outcomes" />
      <Metric label="Average loss" value={m.averageLoss == null ? "—" : `−${m.averageLoss}R`} note="losing outcomes" />
      <Metric label="Payoff ratio" value={m.payoffRatio == null ? "—" : `${m.payoffRatio}:1`} note="average win / loss" />
      {m.pnl !== undefined && <Metric label="Realized P&L" value={new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(m.pnl)} note="shared by publisher" />}
    </section>
    {!!m.curve?.length && <section className="public-performance-curve"><header><div><span>Auditable progression</span><h2>Cumulative R path</h2><p>The sequence includes every closed trade in this published scope, ordered by execution date.</p></div><strong>{m.evidenceMaturity}<small>evidence maturity</small></strong></header><div>{m.curve.map((point,index)=>{const values=m.curve.map(item=>item.value);const min=Math.min(0,...values),max=Math.max(0,...values),range=Math.max(1,max-min);return <i key={index} className={point.value>=0?"positive":"negative"} style={{height:`${12+((point.value-min)/range)*88}%`}} title={`Trade ${index+1}: ${point.value>0?"+":""}${point.value}R`}/>})}</div><footer><span>Outcome range</span><strong>{m.worstR > 0 ? "+" : ""}{m.worstR}R</strong><i/><strong>{m.bestR > 0 ? "+" : ""}{m.bestR}R</strong></footer></section>}
    <section className="public-performance-narrative"><div><span>Review discipline</span><strong>{m.reviewCoverage}%</strong><p>of closed trades include a lesson or post-trade psychology review.</p></div><div><span>Decision evidence</span><strong>{m.evidenceCoverage ?? 0}%</strong><p>of closed trades include a thesis, invalidation, confirmation and top-down evidence.</p></div><div><span>Evidence base</span><strong>{m.closed}</strong><p>closed trades are included in this scope. Open positions do not affect these figures.</p></div></section>
    <div className="public-performance-breakdowns"><Breakdown title="Setups" rows={m.setup}/><Breakdown title="Sessions" rows={m.session}/><Breakdown title="Instruments" rows={m.instrument}/><Breakdown title="Market regimes" rows={m.regime}/></div>
    <section className="public-performance-method"><NavigationIcon name="shield" size={20}/><div><span>HOW VEYNOTE CALCULATES THIS RECORD</span><h2>Results remain live; the disclosure scope stays fixed.</h2><p>Only finalized, active trades inside the publisher’s chosen account and date range are included. Open positions, drafts, archived records and deleted records never affect these figures. R-multiple values are aggregated directly from the journal without exposing its private evidence.</p></div><dl><div><dt>Published</dt><dd>{new Date(report.publishedAt).toLocaleDateString()}</dd></div><div><dt>Method</dt><dd>{report.methodologyVersion}</dd></div><div><dt>Sample</dt><dd>{m.closed} closed trades</dd></div></dl></section>
    <footer><span className="public-performance-mark">V</span><div><strong>Recorded with Veynote</strong><p>Performance history is not a guarantee of future results.</p></div></footer>
  </main>;
}
