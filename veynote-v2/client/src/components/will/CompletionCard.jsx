export default function CompletionCard({
  items = [],
}) {
  const completed = items.filter(
    (item) => item.complete
  ).length;

  const total = items.length;

  const percentage = total
    ? Math.round((completed / total) * 100)
    : 0;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="eyebrow">
            Will readiness
          </span>

          <h2 className="text-lg font-bold mt-1">
            {percentage}% complete
          </h2>

          <p className="text-xs text-ink-muted mt-1">
            Complete the important sections before
            considering your Will ready for review.
          </p>
        </div>

        <span className="chip">
          {completed}/{total}
        </span>
      </div>

      <div className="h-2 rounded-full bg-white/10 mt-5 overflow-hidden">
        <div
          className="h-full bg-current transition-all duration-500"
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className={
                item.complete
                  ? "text-green-400"
                  : "text-ink-muted"
              }
            >
              {item.complete ? "✓" : "○"}
            </span>

            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}