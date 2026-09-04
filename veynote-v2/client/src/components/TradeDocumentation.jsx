import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import TradeImageUploader from "./TradeImageUploader";
import ImageLightbox from "./ImageLightbox";
import AttachmentList from "./AttachmentList";

const DEFAULT_TIMEFRAMES = ["Monthly", "Weekly", "Daily", "4H", "1H", "30M", "15M", "5M", "1M"];

export default function TradeDocumentation({ entryId, ensureEntryId }) {
  const [images, setImages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [fileUploading, setFileUploading] = useState([]);
  const [uploading, setUploading] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [timeframe, setTimeframe] = useState("");
  const [selectedTimeframes, setSelectedTimeframes] = useState([]);
  const [open, setOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  function openLightbox(image) {
    setLightboxIndex(images.findIndex((i) => i.id === image.id));
  }

  useEffect(() => {
    if (!entryId) { setLoaded(true); return; }
    Promise.all([
      api.get(`/trading/entries/${entryId}/images`),
      api.get(`/trading/entries/${entryId}/attachments`),
    ]).then(([imgRes, fileRes]) => {
      setImages(imgRes.images);
      setAttachments(fileRes.attachments);
      setLoaded(true);
    });
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
        alert(err.message);
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
    return [...new Set([...DEFAULT_TIMEFRAMES, ...fromImages])];
  }, [images]);
  const activeTimeframes = useMemo(() => {
    const fromImages = setupImages.map((i) => i.timeframe).filter(Boolean);
    return [...new Set([...selectedTimeframes, ...fromImages])];
  }, [images, selectedTimeframes]);

  async function handleUpload(stage, tf, files) {
    const id = entryId || (await ensureEntryId());
    const key = `${stage}:${tf || ""}`;
    for (const file of files) {
      const tempId = `${Date.now()}-${Math.random()}`;
      setUploading((u) => ({ ...u, [key]: [...(u[key] || []), { tempId, progress: 0, name: file.name }] }));
      try {
        const { image } = await api.upload(`/trading/entries/${id}/images`, file, (pct) =>
          setUploading((u) => ({ ...u, [key]: (u[key] || []).map((x) => x.tempId === tempId ? { ...x, progress: pct } : x) })),
          { stage, timeframe: tf || undefined }
        );
        setImages((prev) => [...prev, image]);
      } catch (err) { alert(err.message); }
      finally { setUploading((u) => ({ ...u, [key]: (u[key] || []).filter((x) => x.tempId !== tempId) })); }
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
  async function caption(id, value) { const { image } = await api.patch(`/trading/images/${id}`, { caption: value }); setImages((p) => p.map((i) => i.id === id ? image : i)); }

  function addTimeframe(value) {
    const clean = value.trim();
    if (!clean) return;
    setSelectedTimeframes((prev) => prev.some((x) => x.toLowerCase() === clean.toLowerCase()) ? prev : [...prev, clean]);
    setTimeframe("");
    setOpen(false);
  }

  if (!loaded) return <p className="text-ink-muted text-[12px]">Loading documentation…</p>;

  const renderStage = (stage, title, desc) => {
    const stageImages = images.filter((i) => i.stage === stage);
    const key = `${stage}:`;
    return <section className="doc-section">
      <div className="doc-section-head"><div><span className="doc-kicker">{title}</span><p>{desc}</p></div><span className="doc-count">{stageImages.length} {stageImages.length === 1 ? "image" : "images"}</span></div>
      <TradeImageUploader images={stageImages} uploading={uploading[key] || []} onUpload={(files) => handleUpload(stage, null, files)} onRemove={remove} onCaptionChange={caption} onOpenLightbox={openLightbox} />
    </section>;
  };

  return <div className="trade-documentation">
    <section className="pretrade-panel">
      <div className="pretrade-head">
        <div><span className="doc-kicker">PRE-TRADE / SETUP</span><h3>Build your market story</h3><p>Organize top-down analysis by timeframe. Add multiple charts to every timeframe.</p></div>
        <span className="doc-count">{setupImages.length} setup {setupImages.length === 1 ? "image" : "images"}</span>
      </div>

      <div className="timeframe-picker" ref={inputRef}>
        <div className="timeframe-input-wrap">
          <span>⌕</span>
          <input value={timeframe} onChange={(e) => { setTimeframe(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Enter") addTimeframe(timeframe); }} placeholder="Search or type a timeframe…" />
          <button type="button" onClick={() => setOpen((v) => !v)}>▾</button>
        </div>
        {open && <div className="timeframe-menu">
          {usedTimeframes.filter((tf) => !timeframe || tf.toLowerCase().includes(timeframe.toLowerCase())).map((tf) => <button type="button" key={tf} onClick={() => addTimeframe(tf)}><span>{tf}</span><small>{setupImages.filter((i) => i.timeframe === tf).length} charts</small></button>)}
          {timeframe.trim() && !usedTimeframes.some((tf) => tf.toLowerCase() === timeframe.trim().toLowerCase()) && <button type="button" className="custom-option" onClick={() => addTimeframe(timeframe)}><span>＋ Use “{timeframe.trim()}”</span><small>Custom timeframe</small></button>}
        </div>}
      </div>

      {activeTimeframes.length > 0 && <div className="timeframe-cards">
        {activeTimeframes.map((tf) => {
          const tfImages = setupImages.filter((i) => i.timeframe === tf);
          const key = `SETUP:${tf}`;
          return <div className="timeframe-card" key={tf}>
            <div className="timeframe-card-head"><div><span className="timeframe-badge">{tf}</span><span className="timeframe-meta">{tfImages.length} {tfImages.length === 1 ? "chart" : "charts"}</span></div><button type="button" className="text-action" onClick={() => { setTimeframe(tf); setOpen(true); }}>Add / change</button></div>
            <TradeImageUploader images={tfImages} uploading={uploading[key] || []} onUpload={(files) => handleUpload("SETUP", tf, files)} onRemove={remove} onCaptionChange={caption} onOpenLightbox={openLightbox} compact />
          </div>;
        })}
      </div>}

      {activeTimeframes.length === 0 && !timeframe && <div className="pretrade-empty"><div className="pretrade-empty-icon">＋</div><strong>Start your top-down analysis</strong><span>Select a timeframe above, then drop in as many setup screenshots as you need.</span></div>}
    </section>

    {renderStage("ENTRY", "ENTRY", "Capture the exact trigger or confirmation that got you into the trade.")}
    {renderStage("DURING_TRADE", "DURING TRADE", "Keep management, partials, adjustments and live decision screenshots together.")}
    {renderStage("POST_TRADE", "POST-TRADE", "Document the final chart and anything that helps you review the outcome.")}

    <section className="doc-section">
      <div className="doc-section-head">
        <div><span className="doc-kicker">SUPPORTING FILES</span><p>Trade plans, backtests, journals or anything else worth attaching — PDF, Word, Excel, CSV, audio, video, ZIP.</p></div>
        <button type="button" className="text-action" onClick={() => fileInputRef.current?.click()}>+ Add file</button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt,audio/*,video/*"
        className="hidden"
        onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) handleFileUpload(files); e.target.value = ""; }}
      />
      <AttachmentList attachments={attachments} uploading={fileUploading} onRemove={removeAttachment} accentClass="text-accent-trade" />
      {attachments.length === 0 && fileUploading.length === 0 && (
        <p className="text-ink-muted text-[11.5px]">No files attached yet.</p>
      )}
    </section>

    {lightboxIndex !== null && (
      <ImageLightbox images={images} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
    )}
  </div>;
}
