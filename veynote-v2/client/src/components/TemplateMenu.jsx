import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { NOTE_TEMPLATES } from "../data/noteTemplates";

// A small "+ From template ▾" dropdown that starts a new note pre-filled
// with one of the built-in structures — sits next to the plain "+ New
// note" button wherever that already appears.
export default function TemplateMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="chip hover:bg-app-border">
        📐 From template {open ? "▴" : "▾"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 bg-app-panel border border-app-border rounded-lg shadow-2xl py-1.5 min-w-[180px]">
            {NOTE_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setOpen(false); navigate(`/notes/new?template=${t.id}`); }}
                className="flex items-center gap-2 w-full text-left px-3 py-2 text-[12.5px] text-ink hover:bg-app-panel2"
              >
                <span>{t.icon}</span>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
