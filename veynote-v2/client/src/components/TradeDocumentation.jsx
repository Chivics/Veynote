import PageSkeleton from "./PageSkeleton.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import TradeImageUploader from "./TradeImageUploader";
import ImageLightbox from "./ImageLightbox";
import AttachmentList from "./AttachmentList";

const DEFAULT_TIMEFRAMES = ["Monthly", "Weekly", "Daily", "12H", "8H", "6H", "4H", "2H", "1H", "30M", "15M", "5M", "1M"];
const ANALYSIS_FIELDS = [
  ["marketStructure", "Market structure", "Trend, range, break of structure…"],
  ["keyLevels", "Key levels", "Support, resistance, supply, demand…"],
  ["liquidity", "Liquidity", "Pools, sweeps, resting liquidity…"],
  ["bias", "Bias", "Bullish, bearish, neutral — and why"],
  ["setupReasoning", "Setup reasoning", "What makes this timeframe relevant?"],
  ["confirmation", "Confirmation", "What confirms progression to the next timeframe?"],
  ["notes", "Notes", "Additional context or invalidation"],
];

export default function TradeDocumentation({ entryId, ensureEntryId }) {
  const [images, setImages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [fileUploading, setFileUploading] = useState([]);
  const [uploading, setUploading] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [timeframe, setTimeframe] = useState("");
  const [selectedTimeframes, setSelectedTimeframes] = useState([]);
  const [analysisBlocks, setAnalysisBlocks] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  function openLightbox(image) {
    setLightboxIndex(images.findIndex((i) => i.id === image.id));
  }

  useEffect(() => {
    if (!entryId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    Promise.allSettled([
      api.get(`/trading/entries/${entryId}/images`),
      api.get(`/trading/entries/${entryId}/attachments`),
      api.get(`/trading/entries/${entryId}/analysis`),
    ])
      .then(([imgRes, fileRes, analysisRes]) => {
        if (cancelled) return;
        if (imgRes.status === "fulfilled") setImages(imgRes.value?.images || []);
        if (fileRes.status === "fulfilled") setAttachments(fileRes.value?.attachments || []);
        if (analysisRes.status === "fulfilled") setAnalysisBlocks(analysisRes.value?.blocks || []);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  async function handleFileUpload(files) {
    const id = entryId || (await ensureEntryId());
    for (const file of files) {
      const tempId = `${Date.now()}-${Math.random()}`;
      setFileUploading((u) => [...u, { tempId, name: file.name, mimeType: file.type, progress: 0 }]);
      try {
        const { attachment } = await api.upload(`/trading/entries/${id}/attachments`, file, (pct) =>
          setFileUploading((u) => u.map((x) => (x.tempId === tempId ? { ...x, progress: pct } : x)))
        );
        setAttachments((prev) => [...prev, attachment]);
      } catch (err) {
        setError(err.message || "The file could not be uploaded.");
      } finally {
        setFileUploading((u) => u.filter((x) => x.tempId !== tempId));
      }
    }
  }

  async function removeAttachment(attachmentId) {
    await api.delete(`/trading/attachments/${attachmentId}`);
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }

  const setupImages = images.filter((i) => i.stage === "SETUP");
  const usedTimeframes = useMemo(() => {
    const fromImages = setupImages.map((i) => i.timeframe).filter(Boolean);
    return [...new Set([...DEFAULT_TIMEFRAMES, ...analysisBlocks.map((block) => block.timeframe), ...fromImages])];
  }, [analysisBlocks, setupImages]);
  const activeTimeframes = useMemo(() => {
    const fromImages = setupImages.map((i) => i.timeframe).filter(Boolean);
    const orderedBlocks = [...analysisBlocks].sort((a, b) => a.position - b.position).map((block) => block.timeframe);
    return [...new Set([...orderedBlocks, ...selectedTimeframes, ...fromImages])];
  }, [analysisBlocks, selectedTimeframes, setupImages]);

  async function handleUpload(stage, tf, files) {
    const id = entryId || (await ensureEntryId());
    const key = `${stage}:${tf || ""}`;
    for (const file of files) {
      const tempId = `${Date.now()}-${Math.random()}`;
      setUploading((u) => ({ ...u, [key]: [...(u[key] || []), { tempId, progress: 0, name: file.name }] }));
      try {
        const { image } = await api.upload(
          `/trading/entries/${id}/images`,
          file,
          (pct) =>
            setUploading((u) => ({
              ...u,
              [key]: (u[key] || []).map((x) => (x.tempId === tempId ? { ...x, progress: pct } : x)),
            })),
          { stage, timeframe: tf || undefined }
        );
        setImages((prev) => [...prev, image]);
      } catch (err) {
        setError(err.message || "The screenshot could not be uploaded.");
      } finally {
        setUploading((u) => ({ ...u, [key]: (u[key] || []).filter((x) => x.tempId !== tempId) }));
      }
    }
  }

  async function remove(id) {
    await api.delete(`/trading/images/${id}`);
    setImages((p) => p.filter((i) => i.id !== id));
    setLightboxIndex((idx) => {
      if (idx === null) return null;
      const removedIndex = images.findIndex((i) => i.id === id);
      return removedIndex === idx ? null : idx;
    });
  }

  async function caption(id, value) {
    const { image } = await api.patch(`/trading/images/${id}`, { caption: value });
    setImages((p) => p.map((i) => (i.id === id ? image : i)));
  }

  async function replaceImage(id, file) {
    try {
      const { image } = await api.upload(`/trading/images/${id}/file`, file, null, undefined, "PATCH");
      setImages((prev) => prev.map((i) => (i.id === id ? image : i)));
    } catch (err) {
      setError(err.message || "The screenshot could not be replaced.");
    }
  }

  async function addTimeframe(value) {
    const clean = value.trim();
    if (!clean) return;
    if (activeTimeframes.some((item) => item.toLowerCase() === clean.toLowerCase())) { setTimeframe(""); setOpen(false); return; }
    setError("");
    try {
      const id = entryId || (await ensureEntryId());
      const { block } = await api.post(`/trading/entries/${id}/analysis`, { timeframe: clean });
      setAnalysisBlocks((current) => [...current.filter((item) => item.id !== block.id), block].sort((a, b) => a.position - b.position));
      setSelectedTimeframes((prev) => prev.some((item) => item.toLowerCase() === clean.toLowerCase()) ? prev : [...prev, clean]);
      setTimeframe(""); setOpen(false);
    } catch (requestError) { setError(requestError.message || "This timeframe could not be added."); }
  }

  async function updateAnalysis(block, fields) {
    if (!block?.id) return;
    setError("");
    try {
      const { block: updated } = await api.patch(`/trading/analysis/${block.id}`, fields);
      setAnalysisBlocks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) { setError(requestError.message || "The analysis could not be saved."); }
  }

  async function ensureAnalysisBlock(tf) {
    const existing = analysisBlocks.find((item) => item.timeframe === tf);
    if (existing) return existing;
    try {
      const id = entryId || (await ensureEntryId());
      const { block } = await api.post(`/trading/entries/${id}/analysis`, { timeframe: tf });
      setAnalysisBlocks((current) => current.some((item) => item.id === block.id) ? current : [...current, block]);
      return block;
    } catch (requestError) { setError(requestError.message || "The analysis block could not be created."); return null; }
  }

  async function removeTimeframe(block, tf, imageCount) {
    if (imageCount) { setError("Remove this timeframe's screenshots before deleting its analysis."); return; }
    try {
      if (block?.id) await api.delete(`/trading/analysis/${block.id}`);
      setAnalysisBlocks((current) => current.filter((item) => item.id !== block?.id));
      setSelectedTimeframes((current) => current.filter((item) => item !== tf));
    } catch (requestError) { setError(requestError.message || "This timeframe could not be removed."); }
  }

  async function moveTimeframe(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= activeTimeframes.length) return;
    const order = [...activeTimeframes];
    [order[index], order[target]] = [order[target], order[index]];
    const reordered = order.map((tf, position) => ({ ...(analysisBlocks.find((block) => block.timeframe === tf) || { timeframe: tf }), position }));
    setSelectedTimeframes(order);
    setAnalysisBlocks(reordered.filter((block) => block.id));
    try { await Promise.all(reordered.filter((block) => block.id).map((block) => api.patch(`/trading/analysis/${block.id}`, { position: block.position }))); }
    catch (requestError) { setError(requestError.message || "The timeframe order could not be saved."); }
  }

  if (!loaded) return <PageSkeleton compact />;

  const renderStage = (stage, title, desc) => {
    const stageImages = images.filter((i) => i.stage === stage);
    const key = `${stage}:`;
    return (
      <section className="doc-section">
        <div className="doc-section-head">
          <div>
            <span className="doc-kicker">{title}</span>
            <p>{desc}</p>
          </div>
          <span className="doc-count">
            {stageImages.length} {stageImages.length === 1 ? "image" : "images"}
          </span>
        </div>
        <TradeImageUploader
          images={stageImages}
          uploading={uploading[key] || []}
          onUpload={(files) => handleUpload(stage, null, files)}
          onRemove={remove}
          onCaptionChange={caption}
          onReplace={replaceImage}
          onOpenLightbox={openLightbox}
        />
      </section>
    );
  };

  return (
    <div className="trade-documentation">
      <section className="pretrade-panel">
        <div className="pretrade-head">
          <div>
            <span className="doc-kicker">PRE-TRADE / SETUP</span>
            <h3>Build your market story</h3>
            <p>Organize top-down analysis by timeframe. Add multiple charts to every timeframe.</p>
          </div>
          <span className="doc-count">
            {setupImages.length} setup {setupImages.length === 1 ? "image" : "images"}
          </span>
        </div>
        {error && <div className="analysis-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div>}

        <div className="timeframe-picker" ref={inputRef}>
          <div className="timeframe-input-wrap">
            <span>⌕</span>
            <input
              value={timeframe}
              onChange={(e) => {
                setTimeframe(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTimeframe(timeframe);
              }}
              placeholder="Search or type a timeframe…"
            />
            <button type="button" onClick={() => setOpen((v) => !v)}>
              ▾
            </button>
          </div>
          {open && (
            <div className="timeframe-menu">
              {usedTimeframes
                .filter((tf) => !timeframe || tf.toLowerCase().includes(timeframe.toLowerCase()))
                .map((tf) => (
                  <button type="button" key={tf} onClick={() => addTimeframe(tf)}>
                    <span>{tf}</span>
                    <small>{setupImages.filter((i) => i.timeframe === tf).length} charts</small>
                  </button>
                ))}
              {timeframe.trim() &&
                !usedTimeframes.some((tf) => tf.toLowerCase() === timeframe.trim().toLowerCase()) && (
                  <button type="button" className="custom-option" onClick={() => addTimeframe(timeframe)}>
                    <span>＋ Use “{timeframe.trim()}”</span>
                    <small>Custom timeframe</small>
                  </button>
                )}
            </div>
          )}
        </div>

        {activeTimeframes.length > 0 && (
          <div className="timeframe-cards">
            {activeTimeframes.map((tf, index) => {
              const tfImages = setupImages.filter((i) => i.timeframe === tf);
              const key = `SETUP:${tf}`;
              const block = analysisBlocks.find((item) => item.timeframe === tf);
              const isCollapsed = collapsed[tf];
              return (
                <div className="timeframe-card" key={tf}>
                  <div className="timeframe-card-head">
                    <div>
                      <span className="analysis-sequence">{String(index + 1).padStart(2, "0")}</span>
                      <span className="timeframe-badge">{tf}</span>
                      <span className="timeframe-meta">
                        {tfImages.length} {tfImages.length === 1 ? "chart" : "charts"}
                      </span>
                    </div>
                    <div className="analysis-card-actions">
                      <button type="button" aria-label={`Move ${tf} up`} disabled={index === 0} onClick={() => moveTimeframe(index, -1)}>↑</button>
                      <button type="button" aria-label={`Move ${tf} down`} disabled={index === activeTimeframes.length - 1} onClick={() => moveTimeframe(index, 1)}>↓</button>
                      <button type="button" onClick={() => setCollapsed((current) => ({ ...current, [tf]: !current[tf] }))}>{isCollapsed ? "Expand" : "Collapse"}</button>
                      <button type="button" className="danger" onClick={() => removeTimeframe(block, tf, tfImages.length)}>Remove</button>
                    </div>
                  </div>
                  {!isCollapsed && <>
                    <div className="analysis-workspace-grid">
                      <div className="analysis-chart-board">
                        <div className="analysis-subhead"><div><strong>Chart evidence</strong><span>Upload, annotate externally, replace and caption each view.</span></div><span>{tf}</span></div>
                        <TradeImageUploader images={tfImages} uploading={uploading[key] || []} onUpload={(files) => handleUpload("SETUP", tf, files)} onRemove={remove} onCaptionChange={caption} onReplace={replaceImage} onOpenLightbox={openLightbox} compact />
                      </div>
                      <div className="analysis-observation-board">
                        {ANALYSIS_FIELDS.map(([field, label, placeholder]) => <label key={field} className={field === "setupReasoning" || field === "notes" ? "wide" : ""}><span>{label}</span><textarea value={block?.[field] || ""} placeholder={placeholder} onFocus={() => ensureAnalysisBlock(tf)} onChange={(event) => setAnalysisBlocks((current) => current.map((item) => item.id === block?.id ? { ...item, [field]: event.target.value } : item))} onBlur={(event) => updateAnalysis(analysisBlocks.find((item) => item.timeframe === tf), { [field]: event.target.value })} /></label>)}
                      </div>
                    </div>
                  </>}
                </div>
              );
            })}
          </div>
        )}

        {activeTimeframes.length === 0 && !timeframe && (
          <div className="pretrade-empty">
            <div className="pretrade-empty-icon">＋</div>
            <strong>Start your top-down analysis</strong>
            <span>Select a timeframe above, then drop in as many setup screenshots as you need.</span>
          </div>
        )}
      </section>

      {renderStage("ENTRY", "ENTRY", "Capture the exact trigger or confirmation that got you into the trade.")}
      {renderStage(
        "DURING_TRADE",
        "DURING TRADE",
        "Keep management, partials, adjustments and live decision screenshots together."
      )}
      {renderStage("POST_TRADE", "POST-TRADE", "Document the final chart and anything that helps you review the outcome.")}

      <section className="doc-section">
        <div className="doc-section-head">
          <div>
            <span className="doc-kicker">SUPPORTING FILES</span>
            <p>Trade plans, backtests, journals or anything else worth attaching — PDF, Word, Excel, CSV, audio, video, ZIP.</p>
          </div>
          <button type="button" className="text-action" onClick={() => fileInputRef.current?.click()}>
            + Add file
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt,audio/*,video/*,image/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) handleFileUpload(files);
            e.target.value = "";
          }}
        />
        <AttachmentList
          attachments={attachments}
          uploading={fileUploading}
          onRemove={removeAttachment}
          accentClass="text-accent-trade"
        />
        {attachments.length === 0 && fileUploading.length === 0 && (
          <p className="text-ink-muted text-[11.5px]">No files attached yet.</p>
        )}
      </section>

      {lightboxIndex !== null && (
        <ImageLightbox images={images} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
}
