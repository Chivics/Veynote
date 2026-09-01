import { useEffect, useState } from "react";
import { api } from "../../api/client";
import StatCard from "../../components/StatCard";
import EmptyState from "../../components/EmptyState";

export default function Analytics() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/analytics/trading").then(setData);
  }, []);

  if (data === null) return <p className="text-ink-muted text-[12px]">Loading…</p>;

  return (
    <div>
      <span className="eyebrow">INSIGHTS</span>
      <h1 className="text-[30px] tracking-tight mt-1.5 mb-6">Analytics</h1>

      {!data.hasData ? (
        <EmptyState
          icon="▲"
          title="Not enough trades yet"
          description="Your performance patterns will show up here after a few logged trades."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
            <StatCard label="Total trades" value={data.totalTrades} />
            <StatCard label="Win rate" value={`${data.winRate}%`} />
            <StatCard label="Avg R:R" value={`${data.avgRiskReward}R`} />
            <StatCard label="Best setup" value={data.bestSetup ? data.bestSetup.type : "—"} hint={data.bestSetup ? `${data.bestSetup.winRate}% win rate` : ""} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="card p-[18px]">
              <h2 className="text-[14px] mt-0 mb-0.5">Cumulative R</h2>
              <span className="text-[10px] text-ink-muted">Every logged closed trade</span>
              <div className="h-[150px] flex items-end gap-1.5 mt-4">
                {data.cumulativeR.map((point, i) => {
                  const max = Math.max(...data.cumulativeR.map((p) => Math.abs(p.value)), 1);
                  const heightPct = Math.max(4, (Math.abs(point.value) / max) * 100);
                  return (
                    <div
                      key={i}
                      title={`${point.value}R on ${new Date(point.date).toLocaleDateString()}`}
                      className={`flex-1 rounded-t ${point.value >= 0 ? "bg-gradient-to-t from-[#4f83ff] to-[#8c7fff]" : "bg-danger/60"}`}
                      style={{ height: `${heightPct}%` }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="card p-[18px]">
              <h2 className="text-[14px] mt-0 mb-0.5">Rule adherence</h2>
              <span className="text-[10px] text-ink-muted">Based on psychology fields you fill in</span>
              <div className="mt-5">
                <Row label="Trades journaled" value={`${data.ruleAdherence.journaledPct}%`} />
                <Row label="Avg confidence on wins" value={data.ruleAdherence.avgConfidenceOnWins != null ? `${data.ruleAdherence.avgConfidenceOnWins}/10` : "—"} />
                <Row label="Best setup" value={data.setupBreakdown[0]?.type || "—"} last />
              </div>
            </div>
          </div>

          {data.setupBreakdown.length > 0 && (
            <div className="card p-[18px] mt-3">
              <h2 className="text-[14px] mt-0 mb-3.5">Win rate by setup type</h2>
              {data.setupBreakdown.map((s) => (
                <Row key={s.type} label={`${s.type} (${s.count} trades)`} value={`${s.winRate}%`} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value, last }) {
  return (
    <div className={`flex justify-between py-3 ${last ? "" : "border-b border-app-border"}`}>
      <b className="text-[11px] font-normal">{label}</b>
      <strong className="text-[12px]">{value}</strong>
    </div>
  );
}
