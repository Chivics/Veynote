import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import TradeDocumentation from "../../components/TradeDocumentation";
import { handleLinkPaste } from "../../utils/linkify";

const SETUP_TYPES = [
  { key: "BOS", label: "Break of Structure" },
  { key: "OB", label: "Order Block" },
  { key: "LIQUIDITY_SWEEP", label: "Liquidity Sweep" },
  { key: "FVG", label: "FVG" },
  { key: "CUSTOM", label: "Custom" },
];

export default function TradeEditor() {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !routeId;
  const bodyRef = useRef(null);

  const [entryId, setEntryId] = useState(routeId || null);
  const [accounts, setAccounts] = useState([]);
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    accountId: searchParams.get("accountId") || "",
    title: "",
    asset: "",
    direction: "LONG",
    entryPrice: "",
    stopLoss: "",
    takeProfit: "",
    setupTypes: [],
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

  useEffect(() => {
    api.get("/accounts").then((d) => setAccounts(d.accounts));
  }, []);

  useEffect(() => {
    if (!isNew) {
      api.get(`/trading/entries/${routeId}`).then((d) => {
        const e = d.entry;
        setForm({
          accountId: e.accountId || "",
          title: e.title,
          asset: e.asset || "",
          direction: e.direction || "LONG",
          entryPrice: e.entryPrice ?? "",
          stopLoss: e.stopLoss ?? "",
          takeProfit: e.takeProfit ?? "",
          setupTypes: (e.setupTypes || "").split(",").filter(Boolean),
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
        if (bodyRef.current) bodyRef.current.innerHTML = e.content || "";
        setLoaded(true);
      });
    }
  }, [routeId]);

  const rr =
    form.entryPrice && form.stopLoss && form.takeProfit
      ? (
          Math.abs(form.takeProfit - form.entryPrice) / (Math.abs(form.entryPrice - form.stopLoss) || 1)
        ).toFixed(2)
      : null;

  function toggleSetupType(key) {
    setForm((f) => ({
      ...f,
      setupTypes: f.setupTypes.includes(key) ? f.setupTypes.filter((k) => k !== key) : [...f.setupTypes, key],
    }));
  }

  function buildPayload() {
    const content = bodyRef.current?.innerHTML || "";
    return {
      ...form,
      content,
      entryPrice: form.entryPrice ? Number(form.entryPrice) : null,
      stopLoss: form.stopLoss ? Number(form.stopLoss) : null,
      takeProfit: form.takeProfit ? Number(form.takeProfit) : null,
      achievedR: form.achievedR ? Number(form.achievedR) : null,
      confidence: Number(form.confidence),
    };
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (!entryId) {
        const { entry } = await api.post("/trading/entries", buildPayload());
        setEntryId(entry.id);
        window.history.replaceState(null, "", `/trading/entries/${entry.id}/edit`);
      } else {
        await api.patch(`/trading/entries/${entryId}`, buildPayload());
        navigate(`/trading/entries/${entryId}`);
      }
    } finally {
      setSaving(false);
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

  if (!loaded) return <p className="text-ink-muted text-[12px]">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="eyebrow">{entryId ? "EDITING" : "NEW ENTRY"}</span>
        <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? "Saving…" : "💾 Save"}
        </button>
      </div>

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
          <option value="BREAKEVEN">Breakeven</option>
        </select>
      </div>

      <input
        className="w-full bg-transparent outline-none text-[26px] font-bold tracking-tight text-ink mb-4 placeholder:text-ink-muted"
        placeholder="Trade title (e.g. BTCUSDT — BOS + OB Long)"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
      />

      <div className="rounded-2xl border border-app-border p-5 mb-6 bg-gradient-to-br from-app-panel to-accent-trade-soft">
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

        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-b border-app-border">
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
        </div>

        <p className="text-[10.5px] text-ink-muted mt-3.5 mb-1.5">SETUP TYPE (SMC)</p>
        <div className="flex gap-1.5 flex-wrap">
          {SETUP_TYPES.map((t) => (
            <button
              key={t.key}
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

        <p className="text-[10.5px] text-ink-muted mt-3.5 mb-1.5">TIMEFRAME HIERARCHY</p>
        <div className="flex gap-2 flex-wrap">
          <input className="input w-36" placeholder="Bias TF (Daily/4H)" value={form.biasTimeframe} onChange={(e) => setForm((f) => ({ ...f, biasTimeframe: e.target.value }))} />
          <input className="input w-32" placeholder="Setup TF (1H)" value={form.setupTimeframe} onChange={(e) => setForm((f) => ({ ...f, setupTimeframe: e.target.value }))} />
          <input className="input w-36" placeholder="Entry TF (15M/5M)" value={form.entryTimeframe} onChange={(e) => setForm((f) => ({ ...f, entryTimeframe: e.target.value }))} />
        </div>

        {form.result !== "OPEN" && (
          <div className="mt-3.5">
            <p className="text-[10.5px] text-ink-muted mb-1.5">ACHIEVED R</p>
            <input className="input w-32" placeholder="e.g. 3.2" value={form.achievedR} onChange={(e) => setForm((f) => ({ ...f, achievedR: e.target.value }))} />
          </div>
        )}
      </div>

      <div className="flex gap-0.5 border border-app-border border-b-0 rounded-t-xl px-2.5 py-2 bg-app-panel">
        <button onClick={() => exec("bold")} className="w-7 h-7 max-sm:w-11 max-sm:h-11 rounded-md text-ink-muted hover:bg-app-panel2 hover:text-ink font-bold text-[12px] max-sm:text-[15px]">B</button>
        <button onClick={() => exec("italic")} className="w-7 h-7 max-sm:w-11 max-sm:h-11 rounded-md text-ink-muted hover:bg-app-panel2 hover:text-ink italic text-[12px] max-sm:text-[15px]">I</button>
        <button onClick={() => exec("insertUnorderedList")} className="w-7 h-7 max-sm:w-11 max-sm:h-11 rounded-md text-ink-muted hover:bg-app-panel2 hover:text-ink text-[12px] max-sm:text-[15px]">☰</button>
      </div>
      <div
        ref={bodyRef}
        contentEditable
        suppressContentEditableWarning
        onPaste={handleLinkPaste}
        className="border border-app-border rounded-b-xl p-6 bg-app-panel min-h-[140px] text-[14px] leading-[1.8] text-ink-soft outline-none focus:border-accent-trade mb-6 trade-body"
      />

      <h2 className="text-[15.5px] mb-3">Trading psychology</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-8">
        <PsychBox label="Before trade" value={form.psychologyBefore} onChange={(v) => setForm((f) => ({ ...f, psychologyBefore: v }))} />
        <PsychBox label="During trade" value={form.psychologyDuring} onChange={(v) => setForm((f) => ({ ...f, psychologyDuring: v }))} />
        <PsychBox label="After trade" value={form.psychologyAfter} onChange={(v) => setForm((f) => ({ ...f, psychologyAfter: v }))} />
      </div>

      <h2 className="text-[15.5px] mb-3">Trade documentation</h2>
      <div className="mb-8">
        <TradeDocumentation entryId={entryId} ensureEntryId={ensureEntryId} />
      </div>

      <h2 className="text-[15.5px] mb-3">Post-trade review</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <PsychBox label="What happened" value={form.postTradeWhatHappened} onChange={(v) => setForm((f) => ({ ...f, postTradeWhatHappened: v }))} />
        <PsychBox label="What went right" value={form.postTradeWentRight} onChange={(v) => setForm((f) => ({ ...f, postTradeWentRight: v }))} />
        <PsychBox label="What went wrong" value={form.postTradeWentWrong} onChange={(v) => setForm((f) => ({ ...f, postTradeWentWrong: v }))} />
        <PsychBox label="Lesson learned" value={form.postTradeLesson} onChange={(v) => setForm((f) => ({ ...f, postTradeLesson: v }))} />
      </div>
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
