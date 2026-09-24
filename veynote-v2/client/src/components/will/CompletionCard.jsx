export default function CompletionCard({
  items = [],
  attention = [],
}) {
  const completed = items.filter(
    (item) => item.complete
  ).length;

  const total = items.length;

  const percentage = total
    ? Math.round((completed / total) * 100)
    : 0;

  return (
    <div className="estate-readiness">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="eyebrow">
            Will readiness
          </span>

          <h2>{percentage}% ready for review</h2>

          <p className="text-xs text-ink-muted mt-1">
            Complete the important sections before
            considering your Will ready for review.
          </p>
        </div>

        <span className="estate-readiness-score">
          {completed}/{total}
        </span>
      </div>

      <div className="estate-readiness-progress">
        <div
          className="transition-all duration-500"
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
      {attention.length > 0 && <div className="estate-attention"><span className="eyebrow">REQUIRES ATTENTION</span>{attention.map((item, index) => <p key={`${item}-${index}`}><i />{item}</p>)}</div>}
    </div>
  );
}
