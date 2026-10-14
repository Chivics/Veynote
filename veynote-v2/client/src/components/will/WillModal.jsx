import { useEffect, useRef } from "react";

export default function WillModal({ open, title, description, children, onClose, wide = false }) {
  const modalRef = useRef(null);
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const previouslyFocused = document.activeElement;
    window.requestAnimationFrame(() => modalRef.current?.querySelector("input, select, textarea, button")?.focus());
    function handleKeyDown(event) {
      if (event.key === "Escape" && !modalRef.current?.closest("[hidden]")) {
        onClose?.();
      }
      if (event.key === "Tab") {
        const focusable = [...(modalRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]') || [])];
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="will-modal-title" className="will-modal-shell fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={[
          "relative z-10 w-full",
          "will-modal-panel rounded-t-2xl sm:rounded-2xl",
          wide ? "sm:max-w-5xl" : "sm:max-w-xl",
        ].join(" ")}
      >
        <div className="will-modal-header sticky top-0 z-10 flex items-center justify-between gap-4 px-5 py-4">
          <div><h2 id="will-modal-title" className="text-sm font-bold">{title}</h2>{description && <p>{description}</p>}</div>

          <button
            type="button"
            onClick={onClose}
            className="btn-outline text-xs"
          >
            Close
          </button>
        </div>

        <div className="will-modal-body p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
