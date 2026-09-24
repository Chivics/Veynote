import { useEffect, useRef, useState } from "react";
import { useContextualNavigation } from "../context/NavigationContext";

function Arrow() { return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m14 5-7 7 7 7" /></svg>; }

function NavigationSheet({ navigation, onClose }) {
  const ref = useRef(null);
  const [feedback, setFeedback] = useState("");
  useEffect(() => { ref.current.showModal(); }, []);
  async function act(action) { await action(); onClose(); }
  return <dialog ref={ref} aria-labelledby="navigation-sheet-title" onCancel={event => { event.preventDefault(); onClose(); }} className="context-sheet bg-app-panel text-ink border border-app-border backdrop:bg-black/60">
    <div aria-hidden="true" className="w-10 h-1 rounded-full bg-ink-muted/40 mx-auto mb-5" />
    <h2 id="navigation-sheet-title" className="font-bold text-base mb-4">Navigate</h2>
    <div className="flex flex-col gap-1">
      <button className="context-sheet-action bg-app-panel2" disabled={navigation.busy} onClick={() => act(navigation.back)}><Arrow /><span>Back to {navigation.destination.label}<small className="block text-ink-muted font-normal mt-1">Return to your previous context</small></span></button>
      <button className="context-sheet-action" disabled={navigation.busy} onClick={() => act(() => navigation.go(navigation.route.workspace))}>Go to {navigation.route.workspace === "/trading" ? "Trading" : "Notes"} dashboard</button>
      {navigation.route.parent !== navigation.destination.to && <button className="context-sheet-action" disabled={navigation.busy} onClick={() => act(() => navigation.go(navigation.route.parent))}>Open parent section</button>}
      <button className="context-sheet-action" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setFeedback("Link copied. Access permissions are unchanged."); } catch { setFeedback("Copy the address from your browser to use this link."); } }}>Copy page link</button>
    </div>
    {feedback && <p role="status" className="text-sm text-ink-muted mt-3">{feedback}</p>}
    <button className="btn-outline w-full mt-4 min-h-11" onClick={onClose}>Cancel</button>
  </dialog>;
}

export default function ContextualNavigation() {
  const navigation = useContextualNavigation();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [navigation.revision]);
  if (!navigation.destination) return null;
  return <nav aria-label="Page context" className="flex items-center justify-between gap-3 mb-5 md:mb-7">
    <div className="flex items-center gap-4 min-w-0">
      <button className="context-back" disabled={navigation.busy} onClick={navigation.back} aria-label={`Back to ${navigation.destination.label}`}><Arrow /><span className="context-back-prefix">Back to</span><strong className="truncate">{navigation.destination.label}</strong></button>
      <span className="hidden md:block border-l border-app-border pl-4 text-xs text-ink-muted">{navigation.route.label}</span>
    </div>
    <button aria-label="Page navigation options" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="w-11 h-11 rounded-full border border-app-border bg-app-panel text-ink-muted hover:text-ink shrink-0">•••</button>
    {open && <NavigationSheet navigation={navigation} onClose={() => setOpen(false)} />}
  </nav>;
}
