import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { CATEGORIES, PRIORITIES } from "./TradingRules";

const STATUSES = ["Active", "Reviewing", "Retired"];

export default function TradingRuleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [rule, setRule] = useState(null);

  function load() {
    api.get(`/trading-rules/${id}`).then((d) => setRule(d.rule));
  }
  useEffect(load, [id]);

  async function patch(fields) {
    const { rule: updated } = await api.patch(`/trading-rules/${id}`, fields);
    setRule((r) => ({ ...r, ...updated }));
  }

  async function remove() {
    if (!confirm("Delete this rule?")) return;
    await api.delete(`/trading-rules/${id}`);
    navigate("/trading/rules");
  }

  if (!rule) return <p className="text-ink-muted text-[12px]">Loading…</p>;

  return (
    <div className="max-w-[640px]">
      <div className="flex justify-between items-center mb-3">
        <span className="eyebrow">TRADING RULE</span>
        <button onClick={remove} className="text-danger text-[11px] font-semibold">Delete</button>
      </div>

      <input
        className="w-full bg-transparent outline-none text-[26px] font-bold tracking-tight text-ink mb-4"
        value={rule.rule}
        onChange={(e) => setRule({ ...rule, rule: e.target.value })}
        onBlur={(e) => patch({ rule: e.target.value })}
      />

      <div className="flex flex-col mb-5">
        <PropRow label="Category" icon="◈">
          <select className="bg-transparent outline-none text-[12.5px] text-ink-soft" value={rule.category || ""} onChange={(e) => patch({ category: e.target.value })}>
            <option value="">—</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </PropRow>
        <PropRow label="Priority" icon="⚑">
          <select className="bg-transparent outline-none text-[12.5px] text-ink-soft" value={rule.priority || ""} onChange={(e) => patch({ priority: e.target.value })}>
            <option value="">—</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </PropRow>
        <PropRow label="Status" icon="◉">
          <select className="bg-transparent outline-none text-[12.5px] text-ink-soft" value={rule.status} onChange={(e) => patch({ status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </PropRow>
      </div>

      <div className="border-t border-app-border pt-4">
        <span className="eyebrow">NOTES</span>
        <textarea
          className="w-full bg-transparent outline-none text-[13px] text-ink-soft mt-2 min-h-[100px] resize-none placeholder:text-ink-muted"
          placeholder="Explain why this rule exists and when it applies…"
          value={rule.notes || ""}
          onChange={(e) => setRule({ ...rule, notes: e.target.value })}
          onBlur={(e) => patch({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}

function PropRow({ label, icon, children }) {
  return (
    <div className="flex items-center gap-2.5 py-2 px-1 border-b border-app-border">
      <div className="w-[130px] shrink-0 text-[11.5px] text-ink-muted flex items-center gap-1.5">
        <span>{icon}</span> {label}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
