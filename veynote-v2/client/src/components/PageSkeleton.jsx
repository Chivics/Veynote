export default function PageSkeleton({ title = "Veynote", compact = false }) {
  return <section aria-busy="true" aria-label={`Preparing ${title}`} className={`page-pending ${compact ? "is-compact" : ""}`}>
    {!compact && <h1 className="page-title">{title}</h1>}
    <span className="sr-only">Content is being prepared</span>
  </section>;
}
