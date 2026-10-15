import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { api } from "../../api/client";
import TradeDocumentation from "../../components/TradeDocumentation";
import { handleLinkPaste } from "../../utils/linkify";
import { safeHtml } from "../../utils/safeHtml";
import { observeMedia, persistentHTML } from "../../utils/media";

const SETUP_TYPES = [
  { key: "BOS", label: "Break of Structure" },
  { key: "OB", label: "Order Block" },
  { key: "LIQUIDITY_SWEEP", label: "Liquidity Sweep" },
  { key: "FVG", label: "FVG" },
  { key: "CUSTOM", label: "Custom" },
];
const WORKFLOW_STAGES = [
  { key: "setup", number: "01", label: "Setup", note: "Opportunity and context" },
  { key: "risk", number: "02", label: "Risk & execution", note: "Price map and exposure" },
  { key: "thesis", number: "03", label: "Trade thesis", note: "Narrative and invalidation" },
  { key: "analysis", number: "04", label: "Top-down analysis", note: "Context to confirmation" },
  { key: "psychology", number: "05", label: "Psychology", note: "State and discipline" },
  { key: "result", number: "06", label: "Result", note: "Outcome and exit" },
  { key: "review", number: "07", label: "Review", note: "Lesson and improvement" },
];

export default function TradeEditor() {
  const { id } = useParams();
  return <TradeEditorForm key={id || 'new'} />;
}

function TradeEditorForm() {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !routeId;
  const bodyRef = useRef(null);

  const [entryId, setEntryId] = useState(routeId || null);
  const [accounts, setAccounts] = useState([]);
  const [loaded, setLoaded] = useState(isNew);
  useEffect(() => bodyRef.current ? observeMedia(bodyRef.current) : undefined, [loaded]);
  const [saving, setSaving] = useState(false);
  const [initialContent, setInitialContent] = useState('');
  const [analysisPath, setAnalysisPath] = useState([]);
  const [activeStage, setActiveStage] = useState("setup");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [thesisStarted, setThesisStarted] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [accountError, setAccountError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const editRevision = useRef(0), alive = useRef(true), saveInFlight = useRef(false);
  useEffect(() => { alive.current=true; return () => { alive.current=false; }; }, []);
  useEffect(() => {
    if (!reviewOpen) return undefined;
    const close = (event) => { if (event.key === "Escape" && !saving) setReviewOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [reviewOpen, saving]);
  useLayoutEffect(() => {
    // The editable element does not exist while the loading shell is shown.
    // Hydrate after it mounts, before media observation and before first paint.
    if (loaded && bodyRef.current) bodyRef.current.innerHTML = safeHtml(initialContent);
  }, [loaded, initialContent]);

  const [form, setFormState] = useState({
    accountId: searchParams.get("accountId") || "",
    title: "",
    asset: "",
    direction: "LONG",
    entryPrice: "",
    stopLoss: "",
    takeProfit: "",
    positionSize: "",
    riskAmount: "",
    profitLoss: "",
    session: "",
    entryDate: searchParams.get("entryDate") || new Date().toISOString().slice(0, 10),
    setupTypes: [],
    customSetupType: "",
    biasTimeframe: "",
    setupTimeframe: "",
    entryTimeframe: "",
    confidence: 5,
    result: "OPEN",
    achievedR: "",
    psychologyBefore: "",
    psychologyDuring: "",
    psychologyAfter: "",
    marketRegime: "",
    liquidityNarrative: "",
    structureNarrative: "",
    confirmationSignal: "",
    invalidationSignal: "",
    emotionBefore: "",
    impulseLevel: "",
    disciplineNotes: "",
    exitReasoning: "",
    nextImprovement: "",
    postTradeWhatHappened: "",
    postTradeWentRight: "",
    postTradeWentWrong: "",
    postTradeLesson: "",
  });

  function setForm(update) { editRevision.current++; setFormState(update); }

  useEffect(() => {
    let active=true;
    api.get("/accounts").then((d) => { if(active) setAccounts(d.accounts); })
      .catch(error => { if(active) setAccountError(error.message); });
    return () => { active=false; };
  }, []);

  useEffect(() => {
    let active=true;
    if (!isNew) {
      setLoadError(''); setLoaded(false);
      api.get(`/trading/entries/${routeId}`).then((d) => {
        if (!active) return;
        const e = d.entry;
        const storedSetupTypes = (e.setupTypes || "").split(",").filter(Boolean);
        const storedCustomSetup = storedSetupTypes.find((type) => type.startsWith("CUSTOM:"));
        const normalizedSetupTypes = storedSetupTypes.map((type) =>
          type.startsWith("CUSTOM:") ? "CUSTOM" : type
        );

        setFormState({
          accountId: e.accountId || "",
          title: e.title,
          asset: e.asset || "",
          direction: e.direction || "LONG",
          entryPrice: e.entryPrice ?? "",
          stopLoss: e.stopLoss ?? "",
          takeProfit: e.takeProfit ?? "",
          positionSize: e.positionSize ?? "",
          riskAmount: e.riskAmount ?? "",
          profitLoss: e.profitLoss ?? "",
          session: e.session || "",
          entryDate: new Date(e.entryDate || e.createdAt).toISOString().slice(0, 10),
          setupTypes: [...new Set(normalizedSetupTypes)],
          customSetupType: storedCustomSetup
            ? storedCustomSetup.slice("CUSTOM:".length)
            : "",
          biasTimeframe: e.biasTimeframe || "",
          setupTimeframe: e.setupTimeframe || "",
          entryTimeframe: e.entryTimeframe || "",
          confidence: e.confidence ?? 5,
          result: e.result,
          achievedR: e.achievedR ?? "",
          psychologyBefore: e.psychologyBefore || "",
          psychologyDuring: e.psychologyDuring || "",
          psychologyAfter: e.psychologyAfter || "",
          marketRegime: e.marketRegime || "",
          liquidityNarrative: e.liquidityNarrative || "",
          structureNarrative: e.structureNarrative || "",
          confirmationSignal: e.confirmationSignal || "",
          invalidationSignal: e.invalidationSignal || "",
          emotionBefore: e.emotionBefore || "",
          impulseLevel: e.impulseLevel || "",
          disciplineNotes: e.disciplineNotes || "",
          exitReasoning: e.exitReasoning || "",
          nextImprovement: e.nextImprovement || "",
          postTradeWhatHappened: e.postTradeWhatHappened || "",
          postTradeWentRight: e.postTradeWentRight || "",
          postTradeWentWrong: e.postTradeWentWrong || "",
          postTradeLesson: e.postTradeLesson || "",
        });
        setAnalysisPath([e.biasTimeframe, e.setupTimeframe, e.entryTimeframe].filter(Boolean));
        setInitialContent(e.content || '');
        setThesisStarted(Boolean((e.content || "").replace(/<[^>]+>/g, "").trim()));
        setLoaded(true);
      }).catch(error => { if(active) setLoadError(error.message); });
    }
    return () => { active=false; };
  }, [routeId, loadAttempt]);

  const rr =
    form.entryPrice && form.stopLoss && form.takeProfit
      ? (
          Math.abs(form.takeProfit - form.entryPrice) / (Math.abs(form.entryPrice - form.stopLoss) || 1)
        ).toFixed(2)
      : null;
  const stageComplete = {
    setup: Boolean(form.title.trim() && form.asset.trim() && form.session),
    risk: Boolean(form.entryPrice && form.stopLoss && form.takeProfit && form.riskAmount),
    thesis: Boolean(thesisStarted && form.invalidationSignal),
    analysis: analysisPath.length > 0,
    psychology: Boolean(form.emotionBefore || form.psychologyBefore || form.disciplineNotes),
    result: form.result !== "OPEN" && Boolean(form.exitReasoning || form.achievedR !== "" || form.profitLoss !== ""),
    review: Boolean(form.postTradeLesson && form.nextImprovement),
  };
  const completedStages = WORKFLOW_STAGES.filter((stage) => stageComplete[stage.key]).length;
  const activeStageIndex = WORKFLOW_STAGES.findIndex((stage) => stage.key === activeStage);

  function toggleSetupType(key) {
    setForm((f) => {
      const isSelected = f.setupTypes.includes(key);

      return {
        ...f,
        setupTypes: isSelected
          ? f.setupTypes.filter((k) => k !== key)
          : [...f.setupTypes, key],
        ...(key === "CUSTOM" && isSelected ? { customSetupType: "" } : {}),
      };
    });
  }

  function buildPayload() {
    const content = bodyRef.current ? persistentHTML(bodyRef.current) : "";
    const { customSetupType, ...formWithoutCustomField } = form;

    const setupTypes = form.setupTypes.map((type) => {
      if (type !== "CUSTOM") return type;

      const customValue = customSetupType.trim().replace(/,/g, " ");
      return customValue ? `CUSTOM:${customValue}` : "CUSTOM";
    });

    const firstTimeframe = analysisPath[0] || form.biasTimeframe || null;
    const finalTimeframe = analysisPath.at(-1) || form.entryTimeframe || null;
    const setupIndex = analysisPath.length > 2 ? analysisPath.length - 2 : analysisPath.length > 1 ? 1 : 0;
    return {
      ...formWithoutCustomField,
      setupTypes,
      entryDate: form.entryDate || null,
      biasTimeframe: firstTimeframe,
      setupTimeframe: analysisPath[setupIndex] || form.setupTimeframe || null,
      entryTimeframe: finalTimeframe,
      content,
      entryPrice: form.entryPrice ? Number(form.entryPrice) : null,
      stopLoss: form.stopLoss ? Number(form.stopLoss) : null,
      takeProfit: form.takeProfit ? Number(form.takeProfit) : null,
      positionSize: form.positionSize ? Number(form.positionSize) : null,
      riskAmount: form.riskAmount ? Number(form.riskAmount) : null,
      profitLoss: form.profitLoss ? Number(form.profitLoss) : null,
      achievedR: form.achievedR ? Number(form.achievedR) : null,
      confidence: Number(form.confidence),
    };
  }

  async function save() {
    if (saveInFlight.current) return;
    if (!form.title.trim()) { setSaveError('Give this trade a title before saving.'); return; }
    if (form.setupTypes.includes("CUSTOM") && !form.customSetupType.trim()) {
      setSaveError('Enter your custom setup type or deselect Custom.');
      return;
    }
    saveInFlight.current=true;
    const revision=editRevision.current;
    setSaveError('');
    setSaving(true);
    try {
      let savedId = entryId;
      if (!entryId) {
        const { entry } = await api.post("/trading/entries", buildPayload());
        if (!alive.current) return;
        savedId = entry.id;
        setEntryId(entry.id);
        window.history.replaceState(null, "", `/trading/entries/${entry.id}/edit`);
      } else {
        await api.patch(`/trading/entries/${entryId}`, buildPayload());
        if (!alive.current) return;
      }
      if (revision === editRevision.current) navigate(`/trading/entries/${savedId}`);
      else setSaveError('The earlier changes were saved. You edited this trade while saving; save again to include the latest changes.');
    } catch (error) {
      if (alive.current) setSaveError(error.message);
    } finally {
      saveInFlight.current=false;
      if (alive.current) setSaving(false);
    }
  }

  // Trade images need a real entry id to attach to — if someone uploads a
  // setup screenshot before ever hitting Save, create a lightweight draft
  // first (same pattern as the Notes editor's attachments), using
  // whatever title exists yet, or a placeholder if none.
  async function ensureEntryId() {
    if (entryId) return entryId;
    const { entry } = await api.post("/trading/entries", {
      ...buildPayload(),
      title: form.title.trim() || "Untitled trade",
    });
    setEntryId(entry.id);
    // Update the address bar so a refresh/bookmark lands back on this
    // draft — WITHOUT going through react-router's navigate(). navigate()
    // swaps to a fresh route match (/trading/entries/:id, which renders
    // the read-only TradeDetail, not the editor) and remounts this
    // component, silently discarding anything typed since the draft was
    // created. history.replaceState updates the URL without triggering
    // any of that.
    window.history.replaceState(null, "", `/trading/entries/${entry.id}/edit`);
    return entry.id;
  }

  function exec(cmd) {
    document.execCommand(cmd, false);
    bodyRef.current?.focus();
  }

  if (!loaded) return loadError ? <section><h1 className="page-title">Trade unavailable</h1><p role="alert" className="text-danger my-4">{loadError}</p><button className="btn-primary" onClick={() => setLoadAttempt(value => value + 1)}>Retry</button></section> : <PageSkeleton title="Trade" />;

  return (
    <div className="trade-workspace-page">
      <div className="trade-workspace-header">
        <div><span className="eyebrow">{entryId ? "EDITING TRADE" : "TRADE WORKSPACE"}</span><h1 className="page-title">{entryId ? "Review your trade" : "Document the complete idea"}</h1><p>Build the plan, evidence, execution and lesson in one connected record.</p></div>
        <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? "Saving…" : "Save trade"}
        </button>
      </div>

      {saveError && <p role="alert" className="text-danger text-sm mb-4">{saveError}</p>}
      {accountError && <p role="alert" className="text-danger text-sm mb-4">Accounts could not be loaded: {accountError} Reload this page before choosing an account.</p>}

      <section className="trade-record-identity">
        <div>
          <span className="eyebrow">LIVE RECORD</span>
          <input aria-label="Record title" placeholder="Name the opportunity" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <p>{form.asset ? `${form.asset} · ${form.direction}` : "Instrument, plan, evidence and review—kept together."}</p>
        </div>
        <div className="trade-record-meta">
          <label><span>Account</span><select value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}><option value="">Unassigned</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label><span>Trade date</span><input aria-label="Trade date" type="date" value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))} /></label>
          <div><span>Record state</span><strong>{form.result === "OPEN" ? "Planning / live" : "Closed · reviewed"}</strong></div>
        </div>
      </section>

      <div className="trade-stage-layout">
      <aside className="trade-workflow-nav" aria-label="Trade workspace sections">
        <div className="trade-workflow-progress"><span>RECORD COMPLETION</span><strong>{completedStages} / {WORKFLOW_STAGES.length}</strong><i><b style={{ width: `${completedStages / WORKFLOW_STAGES.length * 100}%` }} /></i></div>
        {WORKFLOW_STAGES.map((stage) => <button type="button" key={stage.key} className={`${activeStage === stage.key ? "active" : ""} ${stageComplete[stage.key] ? "complete" : ""}`} aria-current={activeStage === stage.key ? "step" : undefined} onClick={() => setActiveStage(stage.key)}><span>{stageComplete[stage.key] ? "✓" : stage.number}</span><div><strong>{stage.label}</strong><small>{stage.note}</small></div></button>)}
        <div className="trade-workflow-context"><span>LIVE SUMMARY</span><strong>{form.asset || "No instrument"} · {form.direction}</strong><small>{rr ? `${rr}R planned` : "Risk plan incomplete"}{analysisPath.length ? ` · ${analysisPath.join(" → ")}` : ""}</small></div>
      </aside>
      <main className="trade-stage-content">

      <section id="setup" hidden={activeStage !== "setup"} className="trade-stage-surface">
        <div className="trade-stage-primary">
        <div className="trade-section-heading"><div><span className="eyebrow">01 · THE OPPORTUNITY</span><h2>Define what you see</h2><p>Capture the market, session and setup before price movement changes the story.</p></div></div>
        <div className="trade-setup-lead">
          <label><span>Instrument</span><input className="input" placeholder="e.g. EURUSD" value={form.asset} onChange={(e) => setForm((f) => ({ ...f, asset: e.target.value.toUpperCase() }))} /></label>
          <div><span>Direction</span><div className="trade-direction-control"><button type="button" onClick={() => setForm((f) => ({ ...f, direction: "LONG" }))} className={form.direction === "LONG" ? "active long" : ""}>↗ Long</button><button type="button" onClick={() => setForm((f) => ({ ...f, direction: "SHORT" }))} className={form.direction === "SHORT" ? "active short" : ""}>↘ Short</button></div></div>
        </div>
        <div className="trade-context-grid">
          <label><span>Trading session</span><select className="input" value={form.session} onChange={(e) => setForm((f) => ({ ...f, session: e.target.value }))}><option value="">Choose session</option><option value="ASIA">Asia</option><option value="LONDON">London</option><option value="NEW_YORK">New York</option><option value="OVERLAP">London / New York overlap</option><option value="OTHER">Other</option></select></label>
          <label><span>Market regime</span><select className="input" value={form.marketRegime} onChange={(e) => setForm((f) => ({ ...f, marketRegime: e.target.value }))}><option value="">Choose context</option><option>Trending</option><option>Range-bound</option><option>Expansion</option><option>Reversal</option><option>High volatility</option><option>Low liquidity</option></select></label>
        </div>
        <p className="trade-field-caption">SETUP / PLAYBOOK</p>
        <div className="trade-setup-chips">
          {SETUP_TYPES.map((t) => (
            <button key={t.key} type="button" onClick={() => toggleSetupType(t.key)} className={form.setupTypes.includes(t.key) ? "active" : ""}>{form.setupTypes.includes(t.key) ? "✓ " : "+ "}{t.label}</button>
          ))}
        </div>

        {form.setupTypes.includes("CUSTOM") && (
          <label className="trade-custom-setup"><span>Custom setup</span><input type="text" value={form.customSetupType} onChange={(e) => setForm((f) => ({ ...f, customSetupType: e.target.value }))} placeholder="Failed key level + liquidity confirmation" maxLength={80} autoFocus className="input" /></label>
        )}
        </div>
        <aside className="trade-stage-aside"><span>DECISION PRINCIPLE</span><h3>A decision, with its evidence.</h3><p>Record the original opportunity before the outcome introduces hindsight. This becomes the reference point for every later review.</p><div><b>{form.setupTypes.length || 0}</b><small>setup signals selected</small></div></aside>
      </section>

      <section id="risk" hidden={activeStage !== "risk"} className="trade-stage-surface">
        <div className="trade-stage-primary"><div className="trade-section-heading"><div><span className="eyebrow">02 · RISK & EXECUTION</span><h2>Map the trade before entry</h2><p>Define the invalidation, reward and exposure as one coherent execution plan.</p></div></div>
          <div className={`trade-price-map ${form.direction === "SHORT" ? "short" : "long"}`}>
            {form.direction === "SHORT" ? <PriceLevel tone="stop" label="Stop loss" value={form.stopLoss} onChange={(value) => setForm((f) => ({ ...f, stopLoss:value }))} /> : <PriceLevel tone="target" label="Take profit" value={form.takeProfit} onChange={(value) => setForm((f) => ({ ...f, takeProfit:value }))} />}
            <PriceLevel tone="entry" label="Entry" value={form.entryPrice} onChange={(value) => setForm((f) => ({ ...f, entryPrice:value }))} />
            {form.direction === "SHORT" ? <PriceLevel tone="target" label="Take profit" value={form.takeProfit} onChange={(value) => setForm((f) => ({ ...f, takeProfit:value }))} /> : <PriceLevel tone="stop" label="Stop loss" value={form.stopLoss} onChange={(value) => setForm((f) => ({ ...f, stopLoss:value }))} />}
          </div>
          <div className="trade-context-grid"><label><span>Position size</span><input className="input" inputMode="decimal" value={form.positionSize} onChange={(e) => setForm((f) => ({ ...f, positionSize:e.target.value }))} placeholder="0.00" /></label><label><span>Planned monetary risk</span><input className="input" inputMode="decimal" value={form.riskAmount} onChange={(e) => setForm((f) => ({ ...f, riskAmount:e.target.value }))} placeholder="0.00" /></label></div>
        </div>
        <aside className="trade-stage-aside trade-rr-aside"><span>PLANNED RISK / REWARD</span><strong>{rr ? `${rr}R` : "—"}</strong><p>{rr ? (Number(rr) >= 2 ? "The planned reward compensates for the defined risk." : "Review whether this reward justifies the risk and execution cost.") : "Enter the price map to calculate the plan."}</p><dl><div><dt>Risk distance</dt><dd>{form.entryPrice && form.stopLoss ? Math.abs(Number(form.entryPrice) - Number(form.stopLoss)).toFixed(4) : "—"}</dd></div><div><dt>Reward distance</dt><dd>{form.entryPrice && form.takeProfit ? Math.abs(Number(form.takeProfit) - Number(form.entryPrice)).toFixed(4) : "—"}</dd></div></dl></aside>
      </section>

      <section id="thesis" hidden={activeStage !== "thesis"} className="trade-editor-section">
      <div className="trade-section-heading"><div><span className="eyebrow">03 · TRADE THESIS</span><h2>Your edge, in your own words</h2><p>Separate the narrative from its evidence, confirmation and invalidation.</p></div></div>
      <div className="flex gap-0.5 border border-app-border border-b-0 rounded-t-xl px-2.5 py-2 bg-app-panel">
        <button onClick={() => exec("bold")} className="w-7 h-7 max-sm:w-11 max-sm:h-11 rounded-md text-ink-muted hover:bg-app-panel2 hover:text-ink font-bold text-[12px] max-sm:text-[15px]">B</button>
        <button onClick={() => exec("italic")} className="w-7 h-7 max-sm:w-11 max-sm:h-11 rounded-md text-ink-muted hover:bg-app-panel2 hover:text-ink italic text-[12px] max-sm:text-[15px]">I</button>
        <button onClick={() => exec("insertUnorderedList")} className="w-7 h-7 max-sm:w-11 max-sm:h-11 rounded-md text-ink-muted hover:bg-app-panel2 hover:text-ink text-[12px] max-sm:text-[15px]">☰</button>
      </div>
      <div
        ref={bodyRef}
        contentEditable
        role="textbox" aria-label="Trade thesis" aria-multiline="true"
        onInput={(event) => { editRevision.current++; setThesisStarted(Boolean(event.currentTarget.textContent?.trim())); }}
        suppressContentEditableWarning
        onPaste={handleLinkPaste}
        data-placeholder="Write the trade thesis: what must be true for this opportunity to exist?"
        className="border border-app-border rounded-b-xl p-6 bg-app-panel min-h-[180px] text-[14px] leading-[1.8] text-ink-soft outline-none focus:border-accent-trade mb-4 trade-body"
      />
      <div className="trade-thesis-evidence"><PsychBox label="Liquidity narrative" value={form.liquidityNarrative} onChange={(v) => setForm((f) => ({ ...f, liquidityNarrative:v }))} placeholder="Where is price likely drawn, and whose liquidity is exposed?" /><PsychBox label="Market structure" value={form.structureNarrative} onChange={(v) => setForm((f) => ({ ...f, structureNarrative:v }))} placeholder="What structure supports the directional idea?" /><PsychBox label="Confirmation required" value={form.confirmationSignal} onChange={(v) => setForm((f) => ({ ...f, confirmationSignal:v }))} placeholder="What evidence permits execution?" /><PsychBox label="Invalidation" value={form.invalidationSignal} onChange={(v) => setForm((f) => ({ ...f, invalidationSignal:v }))} placeholder="What specifically proves the thesis wrong?" /></div>
      </section>

      <section id="analysis" hidden={activeStage !== "analysis"} className="trade-editor-section"><div className="trade-section-heading"><div><span className="eyebrow">04 · TOP-DOWN ANALYSIS</span><h2>Build the evidence board</h2><p>Choose only the timeframes that belong to this trade, then document the progression to execution.</p></div>{analysisPath.length > 0 && <span className="trade-analysis-path" aria-label="Selected timeframe path">{analysisPath.join(" → ")}</span>}</div>
      <div className="mb-8">
        <TradeDocumentation entryId={entryId} ensureEntryId={ensureEntryId} onTimeframesChange={setAnalysisPath} />
      </div>
      </section>

      <section id="psychology" hidden={activeStage !== "psychology"} className="trade-stage-surface"><div className="trade-stage-primary"><div className="trade-section-heading"><div><span className="eyebrow">05 · PSYCHOLOGY</span><h2>Notice the decision state</h2><p>Capture confidence, impulse and discipline without judging the outcome.</p></div></div>
      <div className="trade-psychology-controls"><label><span>Emotion before entry</span><select className="input" value={form.emotionBefore} onChange={(e) => setForm((f) => ({ ...f, emotionBefore:e.target.value }))}><option value="">Choose honestly</option><option>Calm</option><option>Focused</option><option>Patient</option><option>Hesitant</option><option>Anxious</option><option>FOMO</option><option>Frustrated</option><option>Overconfident</option></select></label><label><span>Impulse level</span><select className="input" value={form.impulseLevel} onChange={(e) => setForm((f) => ({ ...f, impulseLevel:e.target.value }))}><option value="">Choose level</option><option>Low — fully planned</option><option>Moderate — some urgency</option><option>High — reactive</option></select></label><label><span>Confidence · {form.confidence}/10</span><input type="range" min="1" max="10" value={form.confidence} onChange={(e) => setForm((f) => ({ ...f, confidence:e.target.value }))} /></label></div>
      <div className="trade-thesis-evidence"><PsychBox label="Before trade" value={form.psychologyBefore} onChange={(v) => setForm((f) => ({ ...f, psychologyBefore:v }))} /><PsychBox label="During trade" value={form.psychologyDuring} onChange={(v) => setForm((f) => ({ ...f, psychologyDuring:v }))} /><PsychBox label="After trade" value={form.psychologyAfter} onChange={(v) => setForm((f) => ({ ...f, psychologyAfter:v }))} /><PsychBox label="Discipline and rule adherence" value={form.disciplineNotes} onChange={(v) => setForm((f) => ({ ...f, disciplineNotes:v }))} placeholder="Which rules were followed, bent or broken?" /></div>
      </div><aside className="trade-stage-aside"><span>PROCESS OVER OUTCOME</span><h3>Notice without judgment.</h3><p>A profitable trade can be poorly executed. A losing trade can be disciplined. Record the quality of the decision separately from the result.</p><div><b>{form.confidence}/10</b><small>pre-trade confidence</small></div></aside>
      </section>

      <section id="result" hidden={activeStage !== "result"} className="trade-stage-surface"><div className="trade-stage-primary"><div className="trade-section-heading"><div><span className="eyebrow">06 · RESULT</span><h2>Close the execution loop</h2><p>Capture what the market paid, why the position ended, and how the outcome compared with the plan.</p></div></div>
      <div className="trade-result-console"><label><span>Outcome</span><select value={form.result} onChange={(event) => setForm((current) => ({ ...current, result:event.target.value }))}><option value="OPEN">Open / active</option><option value="WIN">Win</option><option value="LOSS">Loss</option><option value="BREAK_EVEN">Break-even</option></select></label><label><span>Achieved R</span><input inputMode="decimal" value={form.achievedR} onChange={(event) => setForm((current) => ({ ...current, achievedR:event.target.value }))} placeholder="e.g. 2.4" disabled={form.result === "OPEN"}/></label><label><span>Realized P&amp;L</span><input inputMode="decimal" value={form.profitLoss} onChange={(event) => setForm((current) => ({ ...current, profitLoss:event.target.value }))} placeholder="Optional" disabled={form.result === "OPEN"}/></label></div>
      <PsychBox label="Exit reasoning" value={form.exitReasoning} onChange={(v) => setForm((f) => ({ ...f, exitReasoning:v }))} placeholder="What ended the trade: target, invalidation, discretionary exit, time, or risk control?" />
      </div><aside className="trade-stage-aside trade-outcome-aside"><span>REALIZED PERFORMANCE</span><strong>{form.result === "OPEN" ? "Open" : form.achievedR !== "" ? `${form.achievedR}R` : "—"}</strong><p>{form.result === "OPEN" ? "The result remains separate from the original plan until the trade closes." : `${rr || "—"}R planned · ${form.achievedR || "—"}R achieved`}</p><div><b>{form.result.replace("_", " ")}</b><small>recorded outcome</small></div></aside>
      </section>

      <section id="review" hidden={activeStage !== "review"} className="trade-editor-section"><div className="trade-section-heading"><div><span className="eyebrow">07 · POST-TRADE REVIEW</span><h2>Turn the outcome into an edge</h2><p>Review the process, extract the lesson, and choose one concrete improvement.</p></div></div>
      <div className="trade-thesis-evidence">
        <PsychBox label="What happened" value={form.postTradeWhatHappened} onChange={(v) => setForm((f) => ({ ...f, postTradeWhatHappened: v }))} />
        <PsychBox label="What went right" value={form.postTradeWentRight} onChange={(v) => setForm((f) => ({ ...f, postTradeWentRight: v }))} />
        <PsychBox label="What went wrong" value={form.postTradeWentWrong} onChange={(v) => setForm((f) => ({ ...f, postTradeWentWrong: v }))} />
        <PsychBox label="Lesson learned" value={form.postTradeLesson} onChange={(v) => setForm((f) => ({ ...f, postTradeLesson: v }))} />
        <div className="trade-review-improvement"><span>ONE CHANGE NEXT TIME</span><textarea value={form.nextImprovement} onChange={(e) => setForm((f) => ({ ...f, nextImprovement:e.target.value }))} placeholder="State one specific behaviour you will repeat or change." /></div>
      </div>
      </section>
      <footer className="trade-stage-footer"><button type="button" className="btn-outline" disabled={activeStageIndex === 0} onClick={() => setActiveStage(WORKFLOW_STAGES[activeStageIndex - 1].key)}>← Previous</button><div><span>{WORKFLOW_STAGES[activeStageIndex].number} / {String(WORKFLOW_STAGES.length).padStart(2, "0")}</span><strong>{WORKFLOW_STAGES[activeStageIndex].label}</strong></div>{activeStageIndex < WORKFLOW_STAGES.length - 1 ? <button type="button" className="btn-primary" onClick={() => setActiveStage(WORKFLOW_STAGES[activeStageIndex + 1].key)}>Continue →</button> : <button type="button" className="btn-primary" onClick={() => setReviewOpen(true)}>Review complete record →</button>}</footer>
      </main>
      </div>
      {reviewOpen && <TradeReviewDialog form={form} rr={rr} analysisPath={analysisPath} saving={saving} onClose={() => setReviewOpen(false)} onSave={save} />}
    </div>
  );
}

function TradeField({ label, children }) {
  return (
    <div className="p-3.5 border-r border-app-border last:border-r-0">
      <small className="block text-[9px] text-ink-muted mb-1">{label}</small>
      {children}
    </div>
  );
}

function PriceLevel({ tone, label, value, onChange }) {
  return <label className={`trade-price-level ${tone}`}><i /><span>{label}</span><input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} placeholder="0.0000" /></label>;
}

function TradeReviewDialog({ form, rr, analysisPath, saving, onClose, onSave }) {
  return createPortal(<div className="trade-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="trade-review-dialog" role="dialog" aria-modal="true" aria-labelledby="trade-review-title"><header><div><span className="eyebrow">FINAL REVIEW</span><h2 id="trade-review-title">Read the record as one decision.</h2><p>Confirm the plan, evidence and lesson before it enters your journal.</p></div><button type="button" onClick={onClose} aria-label="Close review" autoFocus>×</button></header><div className="trade-review-dialog-body"><section className="trade-review-summary"><div><span>Instrument</span><strong>{form.asset || "Not set"} · {form.direction}</strong></div><div><span>Execution</span><strong>{rr ? `${rr}R planned` : "Incomplete risk plan"}</strong></div><div><span>Analysis path</span><strong>{analysisPath.join(" → ") || "No timeframes"}</strong></div><div><span>Outcome</span><strong>{form.result.replace("_", " ")}{form.achievedR !== "" ? ` · ${form.achievedR}R` : ""}</strong></div></section><section className="trade-review-narrative"><article><span>Thesis evidence</span><p>{form.confirmationSignal || "Confirmation is not documented."}</p><small>Invalidation · {form.invalidationSignal || "Not documented"}</small></article><article><span>Decision state</span><p>{form.emotionBefore || "Emotion not recorded"} · confidence {form.confidence}/10</p><small>{form.disciplineNotes || "Discipline notes not recorded."}</small></article><article><span>Reusable lesson</span><p>{form.postTradeLesson || "Lesson not documented."}</p><small>Next time · {form.nextImprovement || "No improvement selected"}</small></article></section></div><footer><button className="btn-outline" type="button" onClick={onClose}>Keep editing</button><button className="btn-primary" type="button" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save complete trade"}</button></footer></section></div>, document.body);
}

function PsychBox({ label, value, onChange, placeholder = "What were you thinking or observing?" }) {
  return (
    <div className="card p-3.5 min-h-[90px]">
      <label className="text-[10px] text-ink-muted block mb-2">{label}</label>
      <textarea
        className="bg-transparent outline-none w-full text-[12px] text-ink-soft resize-none h-[50px] placeholder:text-ink-muted"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
