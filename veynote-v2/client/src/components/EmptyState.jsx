export default function EmptyState({ icon = "📄", title, description, action, className = "" }) {
  return (
    <div
      className={`col-span-full border-[1.5px] border-dashed border-app-border rounded-2xl py-14 px-5 flex flex-col items-center gap-2.5 text-center ${className}`}
    >
      <div className="w-11 h-11 rounded-full bg-app-panel2 flex items-center justify-center text-lg">{icon}</div>
      <p className="font-semibold text-[13.5px] m-0">{title}</p>
      {description && <p className="text-[11.5px] text-ink-muted m-0 max-w-[280px]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
