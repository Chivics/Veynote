import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [accountError, setAccountError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const editRevision = useRef(0), alive = useRef(true), saveInFlight = useRef(false);
  useEffect(() => { alive.current=true; return () => { alive.current=false; }; }, []);
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
    entryDate: new Date().toISOString().slice(0, 10),
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
          postTradeWhatHappened: e.postTradeWhatHappened || "",
          postTradeWentRight: e.postTradeWentRight || "",
          postTradeWentWrong: e.postTradeWentWrong || "",
          postTradeLesson: e.postTradeLesson || "",
        });
        setAnalysisPath([e.biasTimeframe, e.setupTimeframe, e.entryTimeframe].filter(Boolean));
        setInitialContent(e.content || '');
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

      <nav className="trade-workflow-nav" aria-label="Trade workspace sections">
        <a href="#overview"><span>01</span> Overview</a><a href="#thesis"><span>02</span> Thesis</a><a href="#analysis"><span>03</span> Analysis</a><a href="#psychology"><span>04</span> Psychology</a><a href="#review"><span>05</span> Review</a>
      </nav>

      {saveError && <p role="alert" className="text-danger text-sm mb-4">{saveError}</p>}
      {accountError && <p role="alert" className="text-danger text-sm mb-4">Accounts could not be loaded: {accountError} Reload this page before choosing an account.</p>}

      <div className="flex gap-2.5 mb-4 flex-wrap">
        <select
          value={form.accountId}
          onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
          className="chip bg-app-panel2 outline-none"
        >
          <option value="">No account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={form.result}
          onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}
          className="chip bg-app-panel2 outline-none"
        >
          <option value="OPEN">Open</option>
          <option value="WIN">Win</option>
          <option value="LOSS">Loss</option>
          <option value="BREAK_EVEN">Break-even</option>
        </select>
        <select value={form.session} onChange={(e) => setForm((f) => ({ ...f, session: e.target.value }))} className="chip bg-app-panel2 outline-none">
          <option value="">Session</option><option value="ASIA">Asia</option><option value="LONDON">London</option><option value="NEW_YORK">New York</option><option value="OVERLAP">London / New York overlap</option><option value="OTHER">Other</option>
        </select>
        <label className="chip bg-app-panel2 trade-date-chip"><span>Trade date</span><input aria-label="Trade date" type="date" value={form.entryDate} onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))} /></label>
      </div>

      <input
        aria-label="Record title" className="page-title w-full bg-transparent outline-none text-[26px] font-bold tracking-tight text-ink mb-4 placeholder:text-ink-muted"
        placeholder="Trade title (e.g. BTCUSDT — BOS + OB Long)"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
      />

      <section id="overview" className="trade-overview-panel rounded-2xl border border-app-border p-5 mb-6 bg-gradient-to-br from-app-panel to-accent-trade-soft">
        <div className="trade-section-heading"><div><span className="eyebrow">01 · TRADE OVERVIEW & EXECUTION</span><h2>Plan the trade</h2></div><span className="type-pill">{form.result === "OPEN" ? "Planning / live" : "Closed"}</span></div>
        <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
          <div className="flex gap-2 items-center flex-wrap">
            <input
              className="input w-32"
              placeholder="Asset (BTCUSDT)"
              value={form.asset}
              onChange={(e) => setForm((f) => ({ ...f, asset: e.target.value }))}
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => setForm((f) => ({ ...f, direction: "LONG" }))}
                className={`text-[11px] px-2.5 py-1.5 rounded-md ${form.direction === "LONG" ? "bg-success/20 text-success" : "bg-app-panel2 text-ink-muted"}`}
              >
                Long
              </button>
              <button
                onClick={() => setForm((f) => ({ ...f, direction: "SHORT" }))}
                className={`text-[11px] px-2.5 py-1.5 rounded-md ${form.direction === "SHORT" ? "bg-danger/20 text-danger" : "bg-app-panel2 text-ink-muted"}`}
              >
                Short
              </button>
            </div>
          </div>
          <div className="text-right">
            <span className="eyebrow">CONFIDENCE</span>
            <input
              type="range"
              min="1"
              max="10"
              value={form.confidence}
              onChange={(e) => setForm((f) => ({ ...f, confidence: e.target.value }))}
              className="block w-24"
            />
            <b className="text-[13px]">{form.confidence}/10</b>
          </div>
        </div>

        <div className="trade-execution-grid">
          <TradeField label="ENTRY">
            <input className="bg-transparent outline-none w-full text-[13px] font-bold" value={form.entryPrice} onChange={(e) => setForm((f) => ({ ...f, entryPrice: e.target.value }))} placeholder="0.00" />
          </TradeField>
          <TradeField label="STOP LOSS">
            <input className="bg-transparent outline-none w-full text-[13px] font-bold" value={form.stopLoss} onChange={(e) => setForm((f) => ({ ...f, stopLoss: e.target.value }))} placeholder="0.00" />
          </TradeField>
          <TradeField label="TAKE PROFIT">
            <input className="bg-transparent outline-none w-full text-[13px] font-bold" value={form.takeProfit} onChange={(e) => setForm((f) => ({ ...f, takeProfit: e.target.value }))} placeholder="0.00" />
          </TradeField>
          <TradeField label="RISK / REWARD" accent>
            <span className="text-[13px] font-bold text-[#9ecbff]">{rr ? `${rr}R` : "—"}</span>
          </TradeField>
          <TradeField label="POSITION SIZE"><input className="bg-transparent outline-none w-full text-[13px] font-bold" inputMode="decimal" value={form.positionSize} onChange={(e) => setForm((f) => ({ ...f, positionSize: e.target.value }))} placeholder="0.00" /></TradeField>
          <TradeField label="RISK AMOUNT"><input className="bg-transparent outline-none w-full text-[13px] font-bold" inputMode="decimal" value={form.riskAmount} onChange={(e) => setForm((f) => ({ ...f, riskAmount: e.target.value }))} placeholder="0.00" /></TradeField>
        </div>

        <p className="text-[10.5px] text-ink-muted mt-3.5 mb-1.5">SETUP TYPE</p>
        <div className="flex gap-1.5 flex-wrap">
          {SETUP_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => toggleSetupType(t.key)}
              className={`text-[10px] max-sm:text-[11.5px] px-2.5 py-1 max-sm:px-3 max-sm:py-2 rounded-full border transition ${
                form.setupTypes.includes(t.key)
                  ? "bg-accent-trade-soft text-[#9ecbff] border-accent-trade/40"
                  : "bg-app-panel2 text-ink-soft border-app-border"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {form.setupTypes.includes("CUSTOM") && (
          <div className="mt-3">
            <input
              type="text"
              value={form.customSetupType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  customSetupType: e.target.value,
                }))
              }
              placeholder="Enter your custom setup type..."
              maxLength={80}
              autoFocus
              className="input w-full max-w-md"
            />
            <p className="text-[9.5px] text-ink-muted mt-1.5">
              Example: Failed key level + liquidity confirmation
            </p>
          </div>
        )}

        {form.result !== "OPEN" && (
          <div className="mt-3.5">
            <p className="text-[10.5px] text-ink-muted mb-1.5">ACHIEVED R</p>
            <input className="input w-32" placeholder="e.g. 3.2" value={form.achievedR} onChange={(e) => setForm((f) => ({ ...f, achievedR: e.target.value }))} />
            <input className="input w-40 ml-2" placeholder="Realized P&L" value={form.profitLoss} onChange={(e) => setForm((f) => ({ ...f, profitLoss: e.target.value }))} />
          </div>
        )}
      </section>

      <section id="thesis" className="trade-editor-section">
      <div className="trade-section-heading"><div><span className="eyebrow">02 · TRADE THESIS</span><h2>State the market story</h2><p>Explain the setup, invalidation and the evidence that justified execution.</p></div></div>
      <div className="flex gap-0.5 border border-app-border border-b-0 rounded-t-xl px-2.5 py-2 bg-app-panel">
        <button onClick={() => exec("bold")} className="w-7 h-7 max-sm:w-11 max-sm:h-11 rounded-md text-ink-muted hover:bg-app-panel2 hover:text-ink font-bold text-[12px] max-sm:text-[15px]">B</button>
        <button onClick={() => exec("italic")} className="w-7 h-7 max-sm:w-11 max-sm:h-11 rounded-md text-ink-muted hover:bg-app-panel2 hover:text-ink italic text-[12px] max-sm:text-[15px]">I</button>
        <button onClick={() => exec("insertUnorderedList")} className="w-7 h-7 max-sm:w-11 max-sm:h-11 rounded-md text-ink-muted hover:bg-app-panel2 hover:text-ink text-[12px] max-sm:text-[15px]">☰</button>
      </div>
      <div
        ref={bodyRef}
        contentEditable
        role="textbox" aria-label="Trade notes" aria-multiline="true"
        onInput={() => { editRevision.current++; }}
        suppressContentEditableWarning
        onPaste={handleLinkPaste}
        className="border border-app-border rounded-b-xl p-6 bg-app-panel min-h-[140px] text-[14px] leading-[1.8] text-ink-soft outline-none focus:border-accent-trade mb-6 trade-body"
      />
      </section>

      <section id="analysis" className="trade-editor-section"><div className="trade-section-heading"><div><span className="eyebrow">03 · TOP-DOWN ANALYSIS</span><h2>Build the evidence board</h2><p>Choose only the timeframes that belong to this trade, then document the progression to execution.</p></div>{analysisPath.length > 0 && <span className="trade-analysis-path" aria-label="Selected timeframe path">{analysisPath.join(" → ")}</span>}</div>
      <div className="mb-8">
        <TradeDocumentation entryId={entryId} ensureEntryId={ensureEntryId} onTimeframesChange={setAnalysisPath} />
      </div>
      </section>

      <section id="psychology" className="trade-editor-section"><div className="trade-section-heading"><div><span className="eyebrow">04 · PSYCHOLOGY</span><h2>Track the decision state</h2><p>Record emotion, discipline and impulse without turning reflection into a questionnaire.</p></div></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-8">
        <PsychBox label="Before trade" value={form.psychologyBefore} onChange={(v) => setForm((f) => ({ ...f, psychologyBefore: v }))} />
        <PsychBox label="During trade" value={form.psychologyDuring} onChange={(v) => setForm((f) => ({ ...f, psychologyDuring: v }))} />
        <PsychBox label="After trade" value={form.psychologyAfter} onChange={(v) => setForm((f) => ({ ...f, psychologyAfter: v }))} />
      </div>
      </section>

      <section id="review" className="trade-editor-section"><div className="trade-section-heading"><div><span className="eyebrow">05 · POST-TRADE REVIEW</span><h2>Turn the outcome into a lesson</h2><p>Separate what happened from what should change next time.</p></div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <PsychBox label="What happened" value={form.postTradeWhatHappened} onChange={(v) => setForm((f) => ({ ...f, postTradeWhatHappened: v }))} />
        <PsychBox label="What went right" value={form.postTradeWentRight} onChange={(v) => setForm((f) => ({ ...f, postTradeWentRight: v }))} />
        <PsychBox label="What went wrong" value={form.postTradeWentWrong} onChange={(v) => setForm((f) => ({ ...f, postTradeWentWrong: v }))} />
        <PsychBox label="Lesson learned" value={form.postTradeLesson} onChange={(v) => setForm((f) => ({ ...f, postTradeLesson: v }))} />
      </div>
      </section>
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

function PsychBox({ label, value, onChange }) {
  return (
    <div className="card p-3.5 min-h-[90px]">
      <label className="text-[10px] text-ink-muted block mb-2">{label}</label>
      <textarea
        className="bg-transparent outline-none w-full text-[12px] text-ink-soft resize-none h-[50px] placeholder:text-ink-muted"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What were you thinking/feeling?"
      />
    </div>
  );
}
