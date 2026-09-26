import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import VaultGate from "./VaultGate";
import { protectedAccess } from "../utils/protectedAccess";

// Keep private drafts mounted, but never reveal them after account unlock
// until the independent note/estate access boundary is verified again.
export default function ProtectedContentBoundary({ enabled = true, vault, noteId, resourceNoteId = noteId, children }) {
  const { sessionLocked } = useAuth();
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const contentRef = useRef(null);
  const openDialogs = useRef([]);
  const hidden = enabled && (sessionLocked || needsUnlock);
  useLayoutEffect(() => hidden ? protectedAccess.pause({ vault, noteId: resourceNoteId }) : undefined, [hidden, vault, resourceNoteId]);
  useLayoutEffect(() => {
    if (enabled && sessionLocked && !needsUnlock) {
      // Native dialogs sit above ordinary hidden ancestors. Suspend them too,
      // retaining their React/form state, and restore them after private unlock.
      openDialogs.current = [...contentRef.current.querySelectorAll("dialog[open]")];
      openDialogs.current.forEach(dialog => dialog.close());
      setNeedsUnlock(true);
    } else if (!hidden && openDialogs.current.length) {
      openDialogs.current.forEach(dialog => { if (dialog.isConnected && !dialog.open) dialog.showModal(); });
      openDialogs.current = [];
    }
  }, [enabled, hidden, needsUnlock, sessionLocked]);
  return <>
    <div ref={contentRef} data-protected-content hidden={hidden} aria-hidden={hidden || undefined} style={hidden ? { display: "none" } : { display: "contents" }}>{children}</div>
    {enabled && needsUnlock && !sessionLocked && <section className="max-w-[620px] mx-auto py-6"><p className="text-sm text-ink-muted text-center">Account verified. This protected content needs its own unlock. Your open edits remain in memory.</p><VaultGate vault={vault} noteId={noteId} onUnlock={() => setNeedsUnlock(false)} /></section>}
  </>;
}
