import { useEffect } from "react";

export default function WillModal({
  open,
  title,
  children,
  onClose,
  wide = false,
}) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={[
          "relative z-10 w-full max-h-[92vh] overflow-y-auto",
          "will-modal-panel rounded-t-2xl sm:rounded-2xl",
          wide ? "sm:max-w-5xl" : "sm:max-w-xl",
        ].join(" ")}
      >
        <div className="will-modal-header sticky top-0 z-10 flex items-center justify-between gap-4 px-5 py-4">
          <h2 className="text-sm font-bold">
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="btn-outline text-xs"
          >
            Close
          </button>
        </div>

        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
