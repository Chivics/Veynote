export default function StatCard({ label, value, hint, hintTone }) {
  const toneClass = hintTone === "positive" ? "text-success" : hintTone === "negative" ? "text-danger" : "text-ink-muted";
  return (
    <div className="card p-[17px] flex flex-col gap-[7px]">
      <span className="text-[11px] text-ink-muted">{label}</span>
      <strong className="text-[24px] tracking-[-.04em]">{value}</strong>
      {hint && <small className={`text-[11px] ${toneClass}`}>{hint}</small>}
    </div>
  );
}
