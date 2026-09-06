import { useState } from "react";

// Consolidates the secondary note actions (find, comments, history,
// duplicate, lock) into one "⋯" menu instead of a row of separate
// buttons competing for space in the header — Export and Share stay as
// their own icon buttons next to this one, since they're self-contained
// dropdowns already and nesting a dropdown inside a dropdown is worse
// UX than two adjacent triggers.
export default function NoteOptionsMenu({
  routeId,
  isOwner,
  isWill,
  isLocked,
  onToggleFind,
  onToggleComments,
  onOpenHistory,
  onDuplicate,
  onToggleLock,
}) {
  const [open, setOpen] = useState(false);

  function pick(action) {
    setOpen(false);
    action();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-7 h-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-app-panel2 text-[15px]"
        title="More options"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-app-panel border border-app-border rounded-lg shadow-2xl py-1.5 min-w-[190px] text-[12.5px]">
            <button type="button" onClick={() => pick(onToggleFind)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
              🔍 Find &amp; replace
            </button>
            {routeId && (
              <button type="button" onClick={() => pick(onToggleComments)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
                💬 Comments
              </button>
            )}
            {isOwner && routeId && (
              <button type="button" onClick={() => pick(onOpenHistory)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
                🕐 Version history
              </button>
            )}
            {isOwner && routeId && !isWill && (
              <>
                <div className="h-px bg-app-border my-1" />
                <button type="button" onClick={() => pick(onDuplicate)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
                  ⧉ Duplicate
                </button>
                <button type="button" onClick={() => pick(onToggleLock)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
                  {isLocked ? "🔓 Unlock note" : "🔒 Lock note"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
