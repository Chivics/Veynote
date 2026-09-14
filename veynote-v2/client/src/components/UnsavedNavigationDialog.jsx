import { useEffect, useRef } from "react";

export default function UnsavedNavigationDialog({ onStay, onRetry, onLeave }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} className="context-sheet bg-app-panel text-ink border border-app-border backdrop:bg-black/60" aria-labelledby="unsaved-title" onCancel={event => { event.preventDefault(); onStay(); }}>
    <h2 id="unsaved-title" className="font-bold text-xl mb-3">Your changes aren’t saved yet</h2>
    <p className="text-sm text-ink-muted mb-5">We kept this page open because saving didn’t complete. Stay here to review your work, or retry the save before continuing. Leaving without saving may lose your latest changes.</p>
    <div className="flex flex-col gap-2">
      <button autoFocus className="btn-primary min-h-11" onClick={onStay}>Stay on this page</button>
      <button className="btn-outline min-h-11" onClick={onRetry}>Retry save and continue</button>
      <button className="min-h-11 text-danger text-sm" onClick={onLeave}>Leave without saving</button>
    </div>
  </dialog>;
}
