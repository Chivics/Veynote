export default function MediaToolbar({ rect, state, onAlign, onSize, onReplace, onRemove, onClose }) {
  if (!rect) return null;
  const top = Math.min(window.innerHeight - 58, Math.max(68, rect.bottom + 8));
  const left = Math.min(window.innerWidth - 330, Math.max(10, rect.left));
  return <div className="media-toolbar print:hidden" style={{ top, left }} role="toolbar" aria-label="Image controls" onMouseDown={event => event.preventDefault()}>
    <div className="media-toolbar-group" aria-label="Alignment"><button className={state.align === "left" ? "is-active" : ""} onClick={() => onAlign("left")}>Left</button><button className={state.align === "center" ? "is-active" : ""} onClick={() => onAlign("center")}>Center</button><button className={state.align === "right" ? "is-active" : ""} onClick={() => onAlign("right")}>Right</button></div>
    <div className="media-toolbar-group" aria-label="Image size"><button className={state.size === "small" ? "is-active" : ""} onClick={() => onSize("small")}>S</button><button className={state.size === "medium" ? "is-active" : ""} onClick={() => onSize("medium")}>M</button><button className={state.size === "wide" ? "is-active" : ""} onClick={() => onSize("wide")}>Wide</button></div>
    <button onClick={onReplace}>Replace</button><button className="is-danger" onClick={onRemove}>Remove</button><button aria-label="Close image controls" onClick={onClose}>×</button>
  </div>;
}
