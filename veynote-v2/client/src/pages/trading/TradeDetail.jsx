import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";


export default function TradeDetail() {
  const { id } = useParams();
  const [entry, setEntry] = useState(null);
  const [images, setImages] = useState([]);

  useEffect(() => {
    api.get(`/trading/entries/${id}`).then((d) => setEntry(d.entry));
    api.get(`/trading/entries/${id}/images`).then((d) => setImages(d.images));
  }, [id]);

  if (!entry) return <p className="text-ink-muted text-[12px]">Loading…</p>;

  const resultTone = entry.result === "WIN" ? "text-success" : entry.result === "LOSS" ? "text-danger" : "text-ink";
  const setupTypes = (entry.setupTypes || "").split(",").filter(Boolean);
  const byStage = (stage) => images.filter((i) => i.stage === stage);
  const hasSetupImages = byStage("SETUP").length > 0;
  const hasAnyDocumentation =
    hasSetupImages || byStage("ENTRY").length > 0 || byStage("DURING_TRADE").length > 0 || byStage("POST_TRADE").length > 0;
  const hasPostTradeReview =
    entry.postTradeWhatHappened || entry.postTradeWentRight || entry.postTradeWentWrong || entry.postTradeLesson;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <span className="eyebrow">
          {entry.account?.name || "No account"} · {entry.result}
        </span>
        <Link to={`/trading/entries/${id}/edit`} className="btn-outline">✎ Edit</Link>
      </div>

      <h1 className="text-[26px] tracking-tight mb-6">{entry.title}</h1>

      {entry.isTrade && (
        <div className="rounded-2xl border border-app-border p-5 mb-6 bg-gradient-to-br from-app-panel to-accent-trade-soft">
          <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
            <div>
              <span className="eyebrow">RESULT</span>
              <h2 className={`text-[20px] mt-[5px] mb-0 ${resultTone}`}>
                {entry.achievedR != null ? `${entry.achievedR >= 0 ? "+" : ""}${entry.achievedR}R ` : ""}
                {entry.result.charAt(0) + entry.result.slice(1).toLowerCase()}
              </h2>
            </div>
            {entry.confidence != null && (
              <div className="text-right">
                <span className="eyebrow">CONFIDENCE</span>
                <b className="block text-[15px]">{entry.confidence}/10</b>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 border-t border-app-border">
            <TradeField label="ENTRY" value={entry.entryPrice} />
            <TradeField label="STOP LOSS" value={entry.stopLoss} />
            <TradeField label="TAKE PROFIT" value={entry.takeProfit} />
            <TradeField label="RISK / REWARD" value={entry.riskReward ? `${entry.riskReward}R` : "—"} accent />
          </div>

          {setupTypes.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-3.5">
              {setupTypes.map((t) => (
                <span key={t} className="text-[10px] px-2.5 py-1 rounded-full bg-accent-trade-soft text-[#9ecbff] border border-accent-trade/40">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="text-[14px] leading-[1.8] text-ink-soft mb-6"
        dangerouslySetInnerHTML={{ __html: entry.content || "<p class='text-ink-muted'>No notes yet.</p>" }}
      />

      {(entry.psychologyBefore || entry.psychologyDuring || entry.psychologyAfter) && (
        <>
          <h2 className="text-[15.5px] mb-3">Trading psychology</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-8">
            <PsychBox label="Before trade" value={entry.psychologyBefore} />
            <PsychBox label="During trade" value={entry.psychologyDuring} />
            <PsychBox label="After trade" value={entry.psychologyAfter} />
          </div>
        </>
      )}

      {hasAnyDocumentation && (
        <>
          <h2 className="text-[15.5px] mb-3">Trade documentation</h2>
          <div className="flex flex-col gap-6 mb-8">
            {hasSetupImages && (
              <section>
                <h3 className="text-[12.5px] font-bold mb-2.5">Pre-trade / Setup</h3>
                <div className="flex flex-col gap-3">
                  {[...new Set(byStage("SETUP").map((i) => i.timeframe).filter(Boolean))].map((tf) => (
                    <div key={tf} className="overview-timeframe">
                      <div className="overview-timeframe-head"><span>{tf}</span><small>{byStage("SETUP").filter((i) => i.timeframe === tf).length} charts</small></div>
                      <ImageGrid images={byStage("SETUP").filter((i) => i.timeframe === tf)} />
                    </div>
                  ))}
                </div>
              </section>
            )}
            {byStage("ENTRY").length > 0 && (
              <section>
                <h3 className="text-[12.5px] font-bold mb-2.5">Entry</h3>
                <ImageGrid images={byStage("ENTRY")} />
              </section>
            )}
            {byStage("DURING_TRADE").length > 0 && (
              <section>
                <h3 className="text-[12.5px] font-bold mb-2.5">During trade</h3>
                <ImageGrid images={byStage("DURING_TRADE")} />
              </section>
            )}
            {byStage("POST_TRADE").length > 0 && (
              <section>
                <h3 className="text-[12.5px] font-bold mb-2.5">Post-trade</h3>
                <ImageGrid images={byStage("POST_TRADE")} />
              </section>
            )}
          </div>
        </>
      )}

      {hasPostTradeReview && (
        <>
          <h2 className="text-[15.5px] mb-3">Post-trade review</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <PsychBox label="What happened" value={entry.postTradeWhatHappened} />
            <PsychBox label="What went right" value={entry.postTradeWentRight} />
            <PsychBox label="What went wrong" value={entry.postTradeWentWrong} />
            <PsychBox label="Lesson learned" value={entry.postTradeLesson} />
          </div>
        </>
      )}
    </div>
  );
}

function ImageGrid({ images }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {images.map((img) => (
        <a key={img.id} href={img.url} target="_blank" rel="noreferrer" className="block">
          <img src={img.url} alt={img.caption || img.originalName} className="w-full aspect-square object-cover rounded-lg border border-app-border" />
          {img.caption && <p className="text-[9.5px] text-ink-muted mt-1 truncate">{img.caption}</p>}
        </a>
      ))}
    </div>
  );
}

function TradeField({ label, value, accent }) {
  return (
    <div className="p-3.5 border-r border-app-border last:border-r-0">
      <small className="block text-[9px] text-ink-muted mb-1">{label}</small>
      <b className={`text-[13px] ${accent ? "text-[#9ecbff]" : ""}`}>{value ?? "—"}</b>
    </div>
  );
}

function PsychBox({ label, value }) {
  return (
    <div className="card p-3.5 min-h-[90px]">
      <label className="text-[10px] text-ink-muted block mb-2">{label}</label>
      <p className="text-[11px] text-ink-soft m-0">{value || "—"}</p>
    </div>
  );
}
