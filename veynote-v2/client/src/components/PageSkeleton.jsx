export default function PageSkeleton({ title = "Veynote", compact = false }) {
  return <section aria-busy="true" aria-label={`Preparing ${title}`} className={`page-skeleton ${compact ? "is-compact" : ""}`}>
    {!compact && <div className="skeleton-heading"><span className="skeleton-line is-eyebrow" /><h1 className="page-title">{title}</h1><span className="skeleton-line is-subtitle" /></div>}
    <div aria-hidden="true" className="skeleton-layout">
      <div className="skeleton-card is-featured"><span className="skeleton-line is-short" /><span className="skeleton-line" /><span className="skeleton-line is-medium" /></div>
      <div className="skeleton-card"><span className="skeleton-line is-short" /><span className="skeleton-line is-medium" /></div>
      {!compact && <div className="skeleton-card is-wide"><span className="skeleton-line is-short" /><span className="skeleton-line" /><span className="skeleton-line is-medium" /></div>}
    </div>
  </section>;
}
