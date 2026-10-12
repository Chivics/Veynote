import { useEffect, useRef, useState } from "react";
import { useContextualNavigation } from "../context/NavigationContext";
import BackNavigation, { BackChevron as Arrow } from "./BackNavigation";


function NavigationSheet({ navigation, onClose }) {
  const ref = useRef(null);
  const [feedback, setFeedback] = useState("");
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  async function act(action) { await action(); onClose(); }
  return <dialog ref={ref} aria-labelledby="navigation-sheet-title" onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  }} onCancel={event => { event.preventDefault(); onClose(); }} className="context-sheet bg-app-panel text-ink border border-app-border backdrop:bg-black/60">
    <div aria-hidden="true" className="w-10 h-1 rounded-full bg-ink-muted/40 mx-auto mb-5" />
    <h2 id="navigation-sheet-title" className="font-bold text-base mb-4">Navigate</h2>
    <div className="flex flex-col gap-1">
      <button className="context-sheet-action bg-app-panel2" disabled={navigation.busy} onClick={() => act(navigation.back)}><Arrow /><span>Back to {navigation.destination.label}<small className="block text-ink-muted font-normal mt-1">Return to your previous context</small></span></button>
      <button className="context-sheet-action" disabled={navigation.busy} onClick={() => act(() => navigation.go(navigation.route.workspace))}>Go to {navigation.route.workspace === "/trading" ? "Trading" : navigation.route.workspace === "/journal" ? "Journal" : "Notes"} dashboard</button>
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
  return <nav aria-label="Page context" className="veynote-context-navigation">
    <div>
      <BackNavigation label={navigation.destination.label} disabled={navigation.busy} onClick={navigation.back} />
      <span className="veynote-context-current">{navigation.route.label}</span>
    </div>
    <button type="button" aria-label="Page navigation options" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="veynote-context-options"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
    {open && <NavigationSheet navigation={navigation} onClose={() => setOpen(false)} />}
  </nav>;
}
