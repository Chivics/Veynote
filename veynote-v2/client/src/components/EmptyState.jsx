export default function EmptyState({ icon = "📄", title, description, action, className = "" }) {
  return (
    <div
      className={`empty-state col-span-full ${className}`}
    >
      <div className="empty-state-icon">{icon}</div>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
