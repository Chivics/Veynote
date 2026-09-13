export default function PageSkeleton({ title = "Veynote", compact = false }) {
  return <section aria-busy="true" aria-label={`Preparing ${title}`} className={compact ? "py-3" : "w-full py-4"}>
    {!compact && <h1 className="page-title mb-6">{title}</h1>}
    <div aria-hidden="true" className="grid gap-3">
      <div className="h-10 max-w-md rounded-lg bg-app-panel2" />
      <div className="h-24 rounded-xl border border-app-border bg-app-panel" />
      {!compact && <div className="h-40 rounded-xl border border-app-border bg-app-panel" />}
    </div>
  </section>;
}
