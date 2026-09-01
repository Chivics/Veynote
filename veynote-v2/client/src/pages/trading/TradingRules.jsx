import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";

const CATEGORIES = ["Risk Management", "Entry", "Exit", "Psychology", "Position Sizing", "Other"];
const PRIORITIES = ["Must follow", "Important", "Optional"];

function priorityClass(p) {
  if (p === "Must follow") return "bg-danger/15 text-danger";
  if (p === "Important") return "bg-warning/15 text-warning";
  return "bg-app-panel2 text-ink-muted border border-app-border";
}
function statusClass(s) {
  if (s === "Active") return "bg-success/15 text-success";
  if (s === "Reviewing") return "bg-[#5fa8ff]/15 text-[#7db9ff]";
  return "bg-app-panel2 text-ink-muted border border-app-border";
}

export default function TradingRules() {
  const navigate = useNavigate();
  const [rules, setRules] = useState(null);
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");

  function load() {
    api.get("/trading-rules").then((d) => setRules(d.rules));
  }
  useEffect(load, []);

  async function createRule(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const { rule } = await api.post("/trading-rules", { rule: text });
    setText("");
    setCreating(false);
    navigate(`/trading/rules/${rule.id}`);
  }

  return (
    <div>
      <span className="eyebrow">TRADING JOURNAL</span>
      <h1 className="text-[30px] tracking-tight mt-1.5 mb-2">My Trading Rules</h1>
      <p className="text-[13px] text-ink-muted mb-6">These are the non-negotiable rules I follow on every trade.</p>

      <div className="flex items-center gap-2 mb-4">
        <button className="btn-outline">Filter by category</button>
        <button className="btn-outline">Status</button>
        <button onClick={() => setCreating((c) => !c)} className="btn-primary ml-auto">+ New rule</button>
      </div>

      {creating && (
        <form onSubmit={createRule} className="card p-3.5 mb-4 flex gap-2.5">
          <input autoFocus className="input flex-1" placeholder="Write the rule…" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="btn-primary">Create</button>
        </form>
      )}

      {rules === null ? (
        <p className="text-ink-muted text-[12px]">Loading…</p>
      ) : rules.length === 0 ? (
        <EmptyState
          icon="☑"
          title="No rules yet"
          description="Write down the first rule you never break — risk management is a good place to start."
        />
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
<table className="w-full text-[12px] border-collapse">
          <thead>
            <tr>
              {["Rule", "Category", "Priority", "Status"].map((h) => (
                <th key={h} className="text-left text-[10px] uppercase tracking-wide text-ink-muted font-bold py-2.5 px-3 border-b border-app-border">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/trading/rules/${r.id}`)} className="hover:bg-app-panel2/40 cursor-pointer">
                <td className="py-3 px-3 border-b border-app-border text-ink font-medium">{r.rule}</td>
                <td className="py-3 px-3 border-b border-app-border text-ink-soft">{r.category || "—"}</td>
                <td className="py-3 px-3 border-b border-app-border">
                  {r.priority ? <span className={`text-[9.5px] font-bold px-2.5 py-0.5 rounded-full ${priorityClass(r.priority)}`}>{r.priority}</span> : "—"}
                </td>
                <td className="py-3 px-3 border-b border-app-border">
                  <span className={`text-[9.5px] font-bold px-2.5 py-0.5 rounded-full ${statusClass(r.status)}`}>{r.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
</div>
      )}
    </div>
  );
}

export { CATEGORIES, PRIORITIES };
