import { useState, useRef, useEffect } from "react";
import { useMode } from "../context/ModeContext";

export default function ModeSwitcher() {
  const { mode, switchTo } = useMode();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isNotes = mode === "NOTES";

  return (
    <div className="relative mb-3" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between text-[11.5px] font-bold px-2.5 py-2 rounded-lg border transition ${
          isNotes
            ? "bg-accent-notes-soft text-[#c9c1ff] border-accent-notes/40"
            : "bg-accent-trade-soft text-[#bcdcff] border-accent-trade/40"
        }`}
      >
        <span>{isNotes ? "Notes" : "Trading Journal"}</span>
        <span className="opacity-70">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1.5 rounded-lg border border-app-border bg-app-panel overflow-hidden shadow-xl">
          <button
            onClick={() => {
              switchTo("NOTES");
              setOpen(false);
            }}
            className={`w-full text-left px-3 py-2.5 text-[12px] font-semibold hover:bg-app-panel2 transition ${
              isNotes ? "text-ink" : "text-ink-muted"
            }`}
          >
            📓 Notes
          </button>
          <button
            onClick={() => {
              switchTo("TRADING");
              setOpen(false);
            }}
            className={`w-full text-left px-3 py-2.5 text-[12px] font-semibold hover:bg-app-panel2 transition ${
              !isNotes ? "text-ink" : "text-ink-muted"
            }`}
          >
            📈 Trading Journal
          </button>
        </div>
      )}
    </div>
  );
}
