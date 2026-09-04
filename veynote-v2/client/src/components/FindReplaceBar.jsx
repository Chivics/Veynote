import { useState } from "react";

// Overrides the browser's native Ctrl/Cmd+F with an in-note find &
// replace — the native one can't replace text or navigate matches
// inside a specific note.
export default function FindReplaceBar({ editorRef, onClose }) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [matchIndex, setMatchIndex] = useState(-1);

  function runFind(q) {
    const count = editorRef.current?.findAll(q) || 0;
    setMatchCount(count);
    if (count > 0) {
      setMatchIndex(0);
      editorRef.current?.goToMatch(0);
    } else {
      setMatchIndex(-1);
    }
  }

  function step(delta) {
    if (matchCount === 0) return;
    const next = (matchIndex + delta + matchCount) % matchCount;
    setMatchIndex(next);
    editorRef.current?.goToMatch(next);
  }

  function replaceOne() {
    if (matchIndex < 0) return;
    editorRef.current?.replaceCurrentMatch(replacement);
    runFind(query); // text shifted — recompute match positions from scratch rather than trust stale offsets
  }

  function replaceAll() {
    editorRef.current?.replaceAll(query, replacement);
    setMatchCount(0);
    setMatchIndex(-1);
  }

  return (
    <div className="flex items-center gap-2 bg-app-panel border border-app-border rounded-lg px-3 py-2 mb-3 flex-wrap">
      <input
        autoFocus
        className="bg-transparent outline-none text-[12px] text-ink w-32"
        placeholder="Find…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); runFind(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
          if (e.key === "Escape") onClose();
        }}
      />
      <span className="text-[10.5px] text-ink-muted whitespace-nowrap min-w-[70px]">
        {matchCount > 0 ? `${matchIndex + 1} of ${matchCount}` : query ? "No matches" : ""}
      </span>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); step(-1); }} className="text-ink-muted hover:text-ink text-[14px] px-1" title="Previous match">‹</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); step(1); }} className="text-ink-muted hover:text-ink text-[14px] px-1" title="Next match">›</button>
      <span className="w-px h-4 bg-app-border" />
      <input
        className="bg-transparent outline-none text-[12px] text-ink w-32"
        placeholder="Replace with…"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      />
      <button type="button" onMouseDown={(e) => { e.preventDefault(); replaceOne(); }} className="text-[10.5px] font-semibold text-accent-notes whitespace-nowrap">Replace</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); replaceAll(); }} className="text-[10.5px] font-semibold text-accent-notes whitespace-nowrap">Replace all</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); onClose(); }} className="ml-auto text-ink-muted hover:text-ink text-[14px] px-1" title="Close (Esc)">×</button>
    </div>
  );
}
