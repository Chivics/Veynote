import { useEffect, useId, useRef, useState } from "react";
import NavigationIcon from "./layout/NavigationIcon";
import "./noteActions.css";

// Secondary actions share one keyboard-accessible dialog. Close it before
// opening another tool so the editor is no longer inert during formatting,
// find, history and device-authentication actions.
export default function NoteOptionsMenu({
  routeId,
  isOwner,
  isWill,
  isLocked,
  onToggleFind,
  onOpenHistory,
  onOpenInsights,
  onOpenExport,
  onDuplicate,
  onSaveAsTemplate,
  onToggleLock,
  isFavorite,
  isArchived,
  onToggleFavorite,
  onToggleArchive,
  onMoveToTrash,
  focusMode,
  onToggleFocusMode,
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null), trigger = useRef(null), heading = useId();
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  function close() { dialog.current.close(); setOpen(false); trigger.current?.focus(); }

  function pick(action) {
    close();
    action?.();
  }

  return (
    <>
      <button
        type="button"
        ref={trigger} onClick={() => setOpen(true)}
        className="note-focus-action" aria-label="Document options" aria-haspopup="dialog" aria-expanded={open}
      >
        <NavigationIcon name="more" size={20} />
      </button>
      <dialog ref={dialog} className="note-actions-dialog" aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
        if (event.target !== dialog.current) return;
        const rect = dialog.current.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}>
          <header><div><span className="eyebrow">YOUR WRITING</span><h2 id={heading}>Document options</h2></div><button type="button" autoFocus aria-label="Close document options" onClick={close}><NavigationIcon name="close" size={20} /></button></header>
          <div className="note-actions-list">
            {onOpenInsights && <button type="button" onClick={() => pick(onOpenInsights)}><NavigationIcon name="chart" size={19} /><span>Document insights</span></button>}
            {onOpenExport && <button type="button" onClick={() => pick(onOpenExport)}><NavigationIcon name="download" size={19} /><span>Export document</span></button>}
            <button type="button" onClick={() => pick(onToggleFind)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
              <NavigationIcon name="search" size={19} /><span>Find &amp; replace</span>
            </button>
            <button type="button" onClick={() => pick(onToggleFocusMode)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
              <NavigationIcon name="focus" size={19} /><span>{focusMode ? "Exit focus mode" : "Focus mode"}</span>
            </button>
            {isOwner && routeId && (
              <button type="button" onClick={() => pick(onOpenHistory)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
                <NavigationIcon name="clock" size={19} /><span>Version history</span>
              </button>
            )}
            {isOwner && routeId && !isWill && (
              <>
                <div className="h-px bg-app-border my-1" />
                <button type="button" onClick={() => pick(onToggleFavorite)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
                  <NavigationIcon name="heart" size={19} /><span>{isFavorite ? "Remove from favorites" : "Add to favorites"}</span>
                </button>
                <button type="button" onClick={() => pick(onToggleArchive)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
                  <NavigationIcon name="archive" size={19} /><span>{isArchived ? "Restore from Archive" : "Move to Archive"}</span>
                </button>
                <button type="button" onClick={() => pick(onDuplicate)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
                  <NavigationIcon name="note" size={19} /><span>Duplicate document</span>
                </button>
                {!isLocked && onSaveAsTemplate && <button type="button" onClick={() => pick(onSaveAsTemplate)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
                  <NavigationIcon name="files" size={19} /><span>Save as template</span>
                </button>}
                <button type="button" onClick={() => pick(onToggleLock)} className="block w-full text-left px-3 py-2 text-ink hover:bg-app-panel2">
                  <NavigationIcon name="lock" size={19} /><span>{isLocked ? "Remove note lock" : "Lock this note"}</span>
                </button>
                <div className="h-px bg-app-border my-1" />
                <button type="button" onClick={() => pick(onMoveToTrash)} className="is-danger"><NavigationIcon name="trash" size={19} /><span>Move to Trash</span></button>
              </>
            )}
          </div>
          <footer><NavigationIcon name="shield" size={15} /><span>{isLocked || isWill ? "Protected document. Access remains restricted." : "Archive preserves writing. Trash allows recovery."}</span></footer>
      </dialog>
    </>
  );
}
