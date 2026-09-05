import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

// Opened by typing "[[" at the start of a block (mirrors the "/" slash
// command's own trigger rule). Unlike the slash menu, this needs live
// search, so it carries its own text input rather than reading further
// typing back out of the contentEditable block.
export default function NoteLinkMenu({ x, y, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      api.get("/notes/meta/search", { q: query }).then((d) => setResults(d.notes));
    }, 150);
    return () => clearTimeout(handle);
  }, [query]);

  const top = Math.min(y, window.innerHeight - 260);
  const left = Math.min(x, window.innerWidth - 240);

  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={onClose} />
      <div
        style={{ position: "fixed", top, left, zIndex: 35 }}
        className="w-[220px] bg-app-panel border border-app-border rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          placeholder="Link to a note…"
          className="w-full bg-transparent outline-none border-b border-app-border px-3 py-2 text-[12.5px] text-ink"
        />
        <div className="max-h-[220px] overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-[11.5px] text-ink-muted">{query ? "No matching notes." : "Start typing to search…"}</p>
          ) : (
            results.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onPick(n)}
                className="block w-full text-left px-3 py-2 text-[12px] text-ink hover:bg-app-panel2 truncate"
              >
                {n.title || "Untitled"}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
