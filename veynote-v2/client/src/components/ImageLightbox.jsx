import { useEffect, useState } from "react";
import AuthImage from "./AuthImage";
import FileDownload from "./FileDownload";

// Full-screen viewer for trade/note images. Previously every image thumb
// just linked to the raw file in a new browser tab — this keeps the user
// in-app, adds keyboard nav, and gives every image a real download
// affordance instead of relying on the browser's own "save image as".
export default function ImageLightbox({ images, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const count = images.length;
  const current = images[index];

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
    }
    window.addEventListener("keydown", onKeyDown);
    // Lock background scroll while the lightbox is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [count, onClose]);

  if (!current) return null;

  return (
    <div className="lightbox-overlay" onMouseDown={onClose}>
      <div className="lightbox-topbar" onMouseDown={(e) => e.stopPropagation()}>
        <span className="lightbox-counter">
          {count > 1 ? `${index + 1} / ${count}` : current.originalName || "Image"}
        </span>
        <div className="flex items-center gap-2">
          <FileDownload url={current.url} name={current.originalName || current.name} className="lightbox-icon-btn">↓</FileDownload>
          <button
            type="button"
            className="lightbox-icon-btn"
            title="Close (Esc)"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>

      <div className="lightbox-stage" onMouseDown={(e) => e.stopPropagation()}>
        {count > 1 && (
          <button
            type="button"
            className="lightbox-nav lightbox-nav-prev"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            title="Previous (←)"
          >
            ‹
          </button>
        )}
        <AuthImage src={current.url} alt={current.caption || current.originalName || ""} className="lightbox-img" />
        {count > 1 && (
          <button
            type="button"
            className="lightbox-nav lightbox-nav-next"
            onClick={() => setIndex((i) => (i + 1) % count)}
            title="Next (→)"
          >
            ›
          </button>
        )}
      </div>

      {current.caption && (
        <p className="lightbox-caption" onMouseDown={(e) => e.stopPropagation()}>
          {current.caption}
        </p>
      )}
    </div>
  );
}
