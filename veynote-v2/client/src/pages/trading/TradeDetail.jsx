import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import ImageLightbox from "../../components/ImageLightbox";
import DocumentContent from "../../components/DocumentContent";
import ConfirmDialog from "../../components/ConfirmDialog";
import NavigationIcon from "../../components/layout/NavigationIcon";
import AuthImage from "../../components/AuthImage";


export default function TradeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [entry, setEntry] = useState(() => api.peek(`/trading/entries/${id}`)?.entry ?? null);
  const [images, setImages] = useState([]);
  const [analysisBlocks, setAnalysisBlocks] = useState([]);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [mediaLoading, setMediaLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const requestGeneration = useRef(0);

  function openLightbox(image) {
    setLightboxIndex(images.findIndex((i) => i.id === image.id));
  }

  function loadEntry(force = false) {
    const generation = requestGeneration.current;
    setError("");
    api.get(`/trading/entries/${id}`, undefined, { force })
      .then((data) => { if (requestGeneration.current === generation) setEntry(data.entry); })
      .catch((requestError) => { if (requestGeneration.current === generation) setError(requestError.message || "This trade could not be loaded."); });
  }

  function loadMedia(force = false) {
    const generation = requestGeneration.current;
    setMediaError("");
    setMediaLoading(true);
    Promise.allSettled([
      api.get(`/trading/entries/${id}/images`, undefined, { force }),
      api.get(`/trading/entries/${id}/analysis`, undefined, { force }),
    ]).then(([imageResult, analysisResult]) => {
      if (requestGeneration.current !== generation) return;
      setMediaLoading(false);
      if (imageResult.status === "fulfilled") setImages(imageResult.value.images || []);
      if (analysisResult.status === "fulfilled") setAnalysisBlocks(analysisResult.value.blocks || []);
      if (imageResult.status === "rejected" || analysisResult.status === "rejected") {
        setMediaError("Some screenshots or analysis could not be loaded. Your trade record is still available.");
      }
    });
  }

  useEffect(() => {
    requestGeneration.current += 1;
    setEntry(api.peek(`/trading/entries/${id}`)?.entry ?? null);
    setImages([]);
    setAnalysisBlocks([]);
    setLightboxIndex(null);
    loadEntry();
    loadMedia();
    return () => { requestGeneration.current += 1; };
  }, [id]);

  if (!entry || String(entry.id) !== String(id)) return <div className="trade-detail-page"><span className="eyebrow">TRADING JOURNAL</span><h1 className="page-title mt-1.5">Trade detail</h1>{error ? <div className="inline-error mt-5" role="alert"><span>{error}</span><button type="button" onClick={() => loadEntry(true)}>Retry</button></div> : <p className="collection-inline-status mt-5" role="status">Opening this trade…</p>}</div>;

  const resultTone = entry.result === "WIN" ? "text-success" : entry.result === "LOSS" ? "text-danger" : "text-ink";
  const setupTypes = (entry.setupTypes || "").split(",").filter(Boolean);
  const byStage = (stage) => images.filter((i) => i.stage === stage);
  const hasSetupImages = byStage("SETUP").length > 0;
  const hasAnyDocumentation =
    analysisBlocks.length > 0 || hasSetupImages || byStage("ENTRY").length > 0 || byStage("DURING_TRADE").length > 0 || byStage("POST_TRADE").length > 0;
  const hasPostTradeReview =
    entry.postTradeWhatHappened || entry.postTradeWentRight || entry.postTradeWentWrong || entry.postTradeLesson;
  const reviewChecks = [
    [Boolean(entry.content && entry.content !== "<p></p>"), "Trade thesis"],
    [analysisBlocks.length > 0 || hasSetupImages, "Top-down analysis"],
    [Boolean(entry.psychologyBefore || entry.psychologyDuring || entry.psychologyAfter), "Psychology"],
    [Boolean(hasPostTradeReview), "Post-trade lesson"],
  ];
  const reviewCompletion = Math.round(reviewChecks.filter(([complete]) => complete).length / reviewChecks.length * 100);

  async function removeTrade() {
    setDeleteBusy(true); setDeleteError("");
    try { await api.delete(`/trading/entries/${id}`); navigate("/trading/entries", { replace:true }); }
    catch (requestError) { setDeleteError(requestError.message || "This trade could not be deleted."); setDeleteBusy(false); }
  }

  return (
    <div className="trade-detail-page">
      {error && <div className="inline-error mb-4" role="alert"><span>{error} Showing the last available copy.</span><button type="button" onClick={() => loadEntry(true)}>Retry</button></div>}
      {mediaError && <div className="inline-error mb-4" role="alert"><span>{mediaError}</span><button type="button" onClick={() => loadMedia(true)}>Retry media</button></div>}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <span className="eyebrow">
          {entry.account?.name || "No account"} · {entry.result}
        </span>
        <div className="flex gap-2"><Link to={`/trading/entries/${id}/edit`} className="btn-outline"><NavigationIcon name="edit" size={16} /> Edit</Link><button type="button" className="btn-outline text-danger" onClick={() => setDeleteOpen(true)}><NavigationIcon name="trash" size={16} /> Delete</button></div>
      </div>

      <h1 className="page-title text-[26px] tracking-tight mb-6">{entry.title}</h1>

      {entry.isTrade && (
        <div className="rounded-2xl border border-app-border p-5 mb-6 bg-gradient-to-br from-app-panel to-accent-trade-soft">
          <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
            <div>
              <span className="eyebrow">RESULT</span>
              <h2 className={`text-[20px] mt-[5px] mb-0 ${resultTone}`}>
                {entry.achievedR != null ? `${entry.achievedR >= 0 ? "+" : ""}${entry.achievedR}R ` : ""}
                {entry.result === "BREAK_EVEN" ? "Break-even" : entry.result.charAt(0) + entry.result.slice(1).toLowerCase()}
              </h2>
            </div>
            {entry.confidence != null && (
              <div className="text-right">
                <span className="eyebrow">CONFIDENCE</span>
                <b className="block text-[15px]">{entry.confidence}/10</b>
              </div>
            )}
          </div>

          <div className="trade-detail-metrics">
            <TradeField label="ENTRY" value={entry.entryPrice} />
            <TradeField label="STOP LOSS" value={entry.stopLoss} />
            <TradeField label="TAKE PROFIT" value={entry.takeProfit} />
            <TradeField label="RISK / REWARD" value={entry.riskReward ? `${entry.riskReward}R` : "—"} accent />
            <TradeField label="POSITION SIZE" value={entry.positionSize} />
            <TradeField label="RISK AMOUNT" value={entry.riskAmount} />
            <TradeField label="REALIZED P&L" value={entry.profitLoss} accent />
            <TradeField label="SESSION" value={entry.session?.replaceAll("_", " ")} />
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

      {entry.isTrade && <section className="trade-review-integrity" aria-label="Trade review completeness">
        <div><span className="eyebrow">REVIEW INTEGRITY</span><strong>{reviewCompletion}% documented</strong><p>Complete evidence makes this trade more useful to your future decisions.</p></div>
        <div className="trade-review-checks">{reviewChecks.map(([complete, label]) => <span key={label} className={complete ? "complete" : "missing"}><i>{complete ? "✓" : "○"}</i>{label}</span>)}</div>
        {reviewCompletion < 100 && <Link className="btn-outline" to={`/trading/entries/${id}/edit`}>Complete review</Link>}
      </section>}

      <DocumentContent
        className="text-[14px] leading-[1.8] text-ink-soft mb-6 trade-body"
        html={entry.content || "<p>No notes yet.</p>"}
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

      {mediaLoading && !hasAnyDocumentation && <p className="collection-inline-status mb-6" role="status">Opening screenshots and analysis…</p>}
      {hasAnyDocumentation && (
        <>
          <h2 className="text-[15.5px] mb-3">Trade documentation</h2>
          <div className="flex flex-col gap-6 mb-8">
            {(hasSetupImages || analysisBlocks.length > 0) && (
              <section>
                <h3 className="text-[12.5px] font-bold mb-2.5">Top-down analysis</h3>
                <div className="trade-analysis-review">
                  {[...new Set([[...analysisBlocks].sort((a, b) => a.position - b.position).map((block) => block.timeframe), byStage("SETUP").map((image) => image.timeframe).filter(Boolean)].flat())].map((tf, index) => {
                    const block = analysisBlocks.find((item) => item.timeframe === tf);
                    const timeframeImages = byStage("SETUP").filter((image) => image.timeframe === tf);
                    return <article key={tf} className="overview-timeframe"><div className="overview-timeframe-head"><div><span className="analysis-sequence">{String(index + 1).padStart(2, "0")}</span><span>{tf}</span></div><small>{timeframeImages.length} chart{timeframeImages.length === 1 ? "" : "s"}</small></div>
                      {timeframeImages.length > 0 && <ImageGrid images={timeframeImages} onOpen={openLightbox} />}
                      {block && <div className="analysis-review-notes">{ANALYSIS_LABELS.filter(([field]) => block[field]).map(([field, label]) => <div key={field}><span>{label}</span><p>{block[field]}</p></div>)}</div>}
                    </article>;
                  })}
                </div>
              </section>
            )}
            {byStage("ENTRY").length > 0 && (
              <section>
                <h3 className="text-[12.5px] font-bold mb-2.5">Entry</h3>
                <ImageGrid images={byStage("ENTRY")} onOpen={openLightbox} />
              </section>
            )}
            {byStage("DURING_TRADE").length > 0 && (
              <section>
                <h3 className="text-[12.5px] font-bold mb-2.5">During trade</h3>
                <ImageGrid images={byStage("DURING_TRADE")} onOpen={openLightbox} />
              </section>
            )}
            {byStage("POST_TRADE").length > 0 && (
              <section>
                <h3 className="text-[12.5px] font-bold mb-2.5">Post-trade</h3>
                <ImageGrid images={byStage("POST_TRADE")} onOpen={openLightbox} />
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

      {lightboxIndex !== null && (
        <ImageLightbox images={images} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
      <ConfirmDialog open={deleteOpen} title="Delete this trade?" description="This removes the trade, its screenshots, analysis blocks, and attachments. This action cannot be undone." error={deleteError} confirmLabel="Delete trade" busy={deleteBusy} onClose={() => { if (!deleteBusy) { setDeleteOpen(false); setDeleteError(""); } }} onConfirm={removeTrade} />
    </div>
  );
}

const ANALYSIS_LABELS = [["marketStructure", "Market structure"], ["keyLevels", "Key levels"], ["liquidity", "Liquidity"], ["bias", "Bias"], ["setupReasoning", "Setup reasoning"], ["confirmation", "Confirmation"], ["notes", "Notes"]];

function ImageGrid({ images, onOpen }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {images.map((img) => (
        <button key={img.id} type="button" onClick={() => onOpen(img)} className="block text-left">
          <AuthImage src={img.url} alt={img.caption || img.originalName} className="w-full aspect-square object-cover rounded-lg border border-app-border" style={{minHeight:0}} />
          {img.caption && <p className="text-[9.5px] text-ink-muted mt-1 truncate">{img.caption}</p>}
        </button>
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
