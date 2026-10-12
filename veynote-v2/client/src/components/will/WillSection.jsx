import { Link } from "react-router-dom";

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[10.5px] font-semibold text-ink-soft mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[9.5px] text-ink-muted mt-1">{hint}</span>}
    </label>
  );
}

export function Section({ id, eyebrow, title, description, count, action, children }) {
  return (
    <section id={id} className="card estate-section">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2 className="text-[17px] font-bold mt-1">{title}</h2>
          {description && <p className="text-[11.5px] text-ink-muted mt-1 max-w-2xl">{description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {count !== undefined && <span className="chip">{count}</span>}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
      <div className="text-sm font-semibold">{title}</div>
      {description && <p className="text-xs text-ink-muted mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function RecordCard({
  title,
  subtitle,
  meta,
  to,
  badge,
  description,
  actions,
  onClick,
  onEdit,
  onDelete,
}) {
  const actionContent = actions || (
    <>
      {onEdit && <button type="button" className="text-[10px] font-semibold text-ink-soft" onClick={(e) => { e.stopPropagation(); onEdit(); }}>Edit</button>}
      {onDelete && <button type="button" className="text-[10px] font-semibold text-danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete</button>}
    </>
  );

  const content = (
    <div className="rounded-xl border border-white/10 p-4 hover:border-white/20 transition h-full">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="font-semibold text-sm truncate">{title || "Untitled"}</div>
            {badge && <span className="chip shrink-0 text-[9px]">{String(badge).replaceAll("_", " ").replaceAll("-", " ")}</span>}
          </div>
          {subtitle && <div className="text-xs text-ink-muted mt-1">{subtitle}</div>}
          {meta && <div className="text-[10px] text-ink-muted mt-2">{meta}</div>}
          {description && <p className="text-[10.5px] text-ink-muted mt-2 line-clamp-3 whitespace-pre-wrap break-words">{description}</p>}
        </div>
      </div>
    </div>
  );

  if (to) {
    return (
      <div className="relative group">
        <Link to={to} className="block">{content}</Link>
        {(actions || onEdit || onDelete) && <div className="absolute right-3 top-3 flex gap-2">{actionContent}</div>}
      </div>
    );
  }

  if (onClick) return <button type="button" className="block w-full text-left" onClick={onClick}>{content}</button>;
  return <div className="relative">{content}{(actions || onEdit || onDelete) && <div className="absolute right-3 top-3 flex gap-2">{actionContent}</div>}</div>;
}
