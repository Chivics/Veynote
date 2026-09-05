import { useState } from "react";
import { exportNote } from "../utils/noteExport";

const FORMATS = [
  { id: "md", label: "Markdown (.md)" },
  { id: "html", label: "HTML (.html)" },
  { id: "txt", label: "Plain text (.txt)" },
  { id: "json", label: "JSON (.json)" },
];

export default function ExportMenu({ note }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11px] font-semibold text-ink-muted hover:text-ink">
        ⬇ Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-app-panel border border-app-border rounded-lg shadow-2xl py-1.5 min-w-[170px]">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setOpen(false); exportNote(note, f.id); }}
                className="block w-full text-left px-3 py-2 text-[12px] text-ink hover:bg-app-panel2"
              >
                {f.label}
              </button>
            ))}
            <div className="h-px bg-app-border my-1" />
            <button
              type="button"
              onClick={() => { setOpen(false); window.print(); }}
              className="block w-full text-left px-3 py-2 text-[12px] text-ink hover:bg-app-panel2"
            >
              🖨 Print
            </button>
          </div>
        </>
      )}
    </div>
  );
}
