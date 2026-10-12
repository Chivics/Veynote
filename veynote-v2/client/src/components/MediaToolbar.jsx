import { createPortal } from "react-dom";

export default function MediaToolbar({ rect, state, onAlign, onSize, onMove, onReplace, onRemove, onClose }) {
  if (!rect) return null;
  const top = window.innerHeight - rect.bottom < 62 ? Math.max(12, rect.top - 58) : rect.bottom + 8;
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - 660));
  return createPortal(<div className="media-toolbar print:hidden" style={{ top, left }} role="toolbar" aria-label="Image controls" onMouseDown={event => event.preventDefault()} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="media-toolbar-group" role="group" aria-label="Alignment"><button type="button" className={state.align === "left" ? "is-active" : ""} aria-pressed={state.align === "left"} onClick={() => onAlign("left")}>Left</button><button type="button" className={state.align === "center" ? "is-active" : ""} aria-pressed={state.align === "center"} onClick={() => onAlign("center")}>Center</button><button type="button" className={state.align === "right" ? "is-active" : ""} aria-pressed={state.align === "right"} onClick={() => onAlign("right")}>Right</button></div>
    <div className="media-toolbar-group" role="group" aria-label="Image size"><button type="button" className={state.size === "small" ? "is-active" : ""} aria-pressed={state.size === "small"} onClick={() => onSize("small")}>Small</button><button type="button" className={state.size === "medium" ? "is-active" : ""} aria-pressed={state.size === "medium"} onClick={() => onSize("medium")}>Medium</button><button type="button" className={state.size === "wide" ? "is-active" : ""} aria-pressed={state.size === "wide"} onClick={() => onSize("wide")}>Wide</button></div>
    <div className="media-toolbar-group media-toolbar-move" role="group" aria-label="Image position"><button type="button" aria-label="Move image up" onClick={() => onMove("up")} disabled={!state.canMoveUp}>↑ Move</button><button type="button" aria-label="Move image down" onClick={() => onMove("down")} disabled={!state.canMoveDown}>↓ Move</button></div>
    <button type="button" onClick={onReplace}>Replace</button><button type="button" className="is-danger" onClick={onRemove}>Remove</button><button type="button" className="media-toolbar-close" aria-label="Close image controls" onClick={onClose}>×</button>
  </div>, document.body);
}
