import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import DocumentContent from "./DocumentContent";
import NavigationIcon from "./layout/NavigationIcon";
import "./versionHistory.css";

const MAX_DIFF_WORDS = 700;

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved revisions";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(date);
}

function fullDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved revision" : new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

function timeLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved" : new Intl.DateTimeFormat(undefined, {
    hour: "numeric", minute: "2-digit",
  }).format(date);
}

function writingText(html) {
  if (!html) return "";
  const spaced = html.replace(/<\/(?:p|div|li|h[1-6]|blockquote|tr|td|th|figure|section|article|pre)>|<br\s*\/?\s*>/gi, " ");
  const document = new DOMParser().parseFromString(spaced, "text/html");
  document.querySelectorAll("script,style").forEach(node => node.remove());
  return (document.body.textContent || "").replace(/\s+/g, " ").trim();
}

function compareWriting(previous, current) {
  if (!previous || !current) return null;
  const earlier = writingText(previous.content);
  const latest = writingText(current.content);
  const before = earlier ? earlier.split(" ") : [];
  const after = latest ? latest.split(" ") : [];
  const titleChanged = (previous.title || "") !== (current.title || "");
  const sameContent = (previous.content || "") === (current.content || "");
  if (earlier === latest) return { titleChanged, sameContent, sameWriting: true, beforeWords: before.length, afterWords: after.length, changes: [] };
  if (before.length > MAX_DIFF_WORDS || after.length > MAX_DIFF_WORDS) {
    return { titleChanged, sameContent, tooLong: true, beforeWords: before.length, afterWords: after.length };
  }

  // Bound the exact word diff so large documents remain quick to review.
  const rows = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      rows[i][j] = before[i] === after[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  const changes = [];
  let added = 0, removed = 0, i = 0, j = 0;
  function append(kind, word) {
    const last = changes[changes.length - 1];
    if (last?.kind === kind) last.words.push(word);
    else changes.push({ kind, words: [word] });
  }
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      append("same", before[i]); i++; j++;
    } else if (j < after.length && (i === before.length || rows[i][j + 1] >= rows[i + 1][j])) {
      append("added", after[j++]); added++;
    } else {
      append("removed", before[i++]); removed++;
    }
  }
  return { titleChanged, sameContent, sameWriting: false, beforeWords: before.length, afterWords: after.length, added, removed, changes };
}

function RevisionDocument({ note }) {
  return <div className="version-history-paper" onClickCapture={event => {
    if (event.target.closest("a")) event.preventDefault();
  }}>
    <h4>{note.title || "Untitled note"}</h4>
    {writingText(note.content) || /<(?:img|figure|table|video|audio|iframe|hr)\b/i.test(note.content || "")
      ? <DocumentContent html={note.content} className="version-history-writing" />
      : <p className="version-history-blank">There is no writing in this revision.</p>}
  </div>;
}

function HistorySkeleton({ compact = false }) {
  return <div className={compact ? "version-history-skeleton is-compact" : "version-history-skeleton"} role="status" aria-label="Loading version history">
    <span /><span /><span />
  </div>;
}

export default function VersionHistory({ noteId, expectedUpdatedAt, onClose, onRestored }) {
  const [versions, setVersions] = useState(null);
  const [current, setCurrent] = useState(null);
  const [preview, setPreview] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("preview");
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);
  const selectionSequence = useRef(0);
  const previewCache = useRef(new Map());
  const dialog = useRef(null);
  const confirmButton = useRef(null);
  const returnFocus = useRef(null);

  async function openPreview(versionId) {
    const sequence = ++selectionSequence.current;
    setSelectedId(versionId);
    setPreview(null);
    setPreviewing(true);
    setConfirming(false);
    setError("");
    try {
      let version = previewCache.current.get(versionId);
      if (!version) {
        const data = await api.get("/notes/" + noteId + "/versions/" + versionId);
        version = data.version;
        if (selectionSequence.current === sequence) previewCache.current.set(versionId, version);
      }
      if (selectionSequence.current === sequence) setPreview(version);
    } catch (failure) {
      if (selectionSequence.current === sequence) setError(failure.message || "Could not load this revision.");
    } finally {
      if (selectionSequence.current === sequence) setPreviewing(false);
    }
  }

  async function loadHistory() {
    const sequence = ++loadSequence.current;
    selectionSequence.current++;
    previewCache.current.clear();
    setVersions(null);
    setCurrent(null);
    setPreview(null);
    setSelectedId(null);
    setNeedsRefresh(false);
    setError("");
    try {
      const [noteData, versionData] = await Promise.all([
        api.get("/notes/" + noteId), api.get("/notes/" + noteId + "/versions"),
      ]);
      if (loadSequence.current !== sequence) return;
      const list = versionData.versions || [];
      setCurrent(noteData.note);
      setVersions(list);
      if (list.length) openPreview(list[0].id);
      else setSelectedId("current");
    } catch (failure) {
      if (loadSequence.current === sequence) setError(failure.message || "Could not load version history.");
    }
  }

  useEffect(() => {
    returnFocus.current = document.activeElement;
    if (!dialog.current?.open) dialog.current?.showModal();
    return () => {
      loadSequence.current++;
      selectionSequence.current++;
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    };
  }, []);
  useEffect(() => { loadHistory(); return () => { loadSequence.current++; selectionSequence.current++; }; }, [noteId]);
  useEffect(() => { if (confirming) confirmButton.current?.focus(); }, [confirming]);

  function selectCurrent() {
    selectionSequence.current++;
    setSelectedId("current");
    setPreview(null);
    setPreviewing(false);
    setConfirming(false);
    setError("");
    setView("preview");
  }

  async function restore() {
    if (!preview || busy || !expectedUpdatedAt || needsRefresh) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/notes/" + noteId + "/versions/" + preview.id + "/restore", { expectedUpdatedAt });
      onRestored?.();
      onClose();
    } catch (failure) {
      if (failure.status === 409 || failure.status === 428) setNeedsRefresh(true);
      setError(failure.message || "Could not restore this revision.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  const selected = selectedId === "current" ? current : preview;
  const comparison = useMemo(() => compareWriting(preview, current), [preview, current]);
  const stale = Boolean(needsRefresh || (expectedUpdatedAt && current?.updatedAt &&
    new Date(expectedUpdatedAt).getTime() !== new Date(current.updatedAt).getTime()));
  const noDifference = comparison?.sameContent && !comparison?.titleChanged;
  const restoreReady = Boolean(preview && expectedUpdatedAt && !stale && !noDifference);
  const grouped = (versions || []).reduce((result, version) => {
    const label = dateLabel(version.createdAt);
    (result[label] ||= []).push(version);
    return result;
  }, {});

  return <dialog ref={dialog} className="version-history-dialog" aria-labelledby="version-history-title" onCancel={event => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <div className="version-history-shell">
      <header className="version-history-header">
        <div className="version-history-heading">
          <span className="version-history-eyebrow"><NavigationIcon name="clock" size={14} /> WRITING ARCHIVE</span>
          <h2 id="version-history-title">Version history</h2>
          <p>Return to an earlier thought, with the current writing kept safe.</p>
        </div>
        <button type="button" className="version-history-close" aria-label="Close version history" disabled={busy} onClick={onClose}><NavigationIcon name="close" size={20} /></button>
      </header>

      {error && <div className="version-history-error" role="alert"><NavigationIcon name="shield" size={17} /><span>{error}</span>{versions === null && <button type="button" onClick={loadHistory}>Retry</button>}</div>}
      {stale && <div className="version-history-alert" role="status">This note changed since history opened. Close and reopen history before restoring a revision.</div>}

      <div className="version-history-body">
        <aside className="version-history-rail" aria-label="Saved revisions">
          <div className="version-history-rail-top"><span>REVISIONS</span><strong>{versions?.length ?? "—"}</strong></div>
          {current && <button type="button" className={"version-history-current" + (selectedId === "current" ? " is-selected" : "")} aria-current={selectedId === "current" ? "true" : undefined} disabled={busy} onClick={selectCurrent}>
            <span className="version-history-current-icon"><NavigationIcon name="note" size={17} /></span>
            <span><strong>Current writing</strong><small>{fullDate(current.updatedAt)}</small></span>
            <span className="version-history-live-dot" />
          </button>}
          {versions === null ? <div className="version-history-loading"><HistorySkeleton compact /></div> : versions.length === 0 ? <div className="version-history-empty-rail">Earlier revisions will appear here as you continue writing.</div> : Object.entries(grouped).map(([day, items]) => <div className="version-history-day" key={day}>
            <h3>{day}</h3>
            <div className="version-history-day-list">{items.map(version => <button type="button" key={version.id} className={"version-history-revision" + (selectedId === version.id ? " is-selected" : "")} aria-current={selectedId === version.id ? "true" : undefined} disabled={busy} onClick={() => openPreview(version.id)}>
              <span className="version-history-revision-dot" />
              <span><strong>{version.title || "Untitled note"}</strong><small>{timeLabel(version.createdAt)} · Saved snapshot</small></span>
              <NavigationIcon name="chevron" size={14} />
            </button>)}</div>
          </div>)}
        </aside>

        <main className="version-history-main" aria-busy={previewing || busy}>
          {selected ? <>
            <div className="version-history-review-head">
              <div><span className="version-history-eyebrow">{selectedId === "current" ? "CURRENT DOCUMENT" : "SAVED SNAPSHOT"}</span><h3>{selected.title || "Untitled note"}</h3><p>{fullDate(selectedId === "current" ? selected.updatedAt : selected.createdAt)}</p></div>
              {selectedId !== "current" && <span className="version-history-review-badge">Read only</span>}
            </div>
            {selectedId !== "current" && <div className="version-history-tabs" role="tablist" aria-label="Review revision" onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "preview" : event.key === "End" ? "compare" : view === "preview" ? "compare" : "preview";
              setView(next);
              event.currentTarget.querySelector(next === "preview" ? "#version-history-tab-preview" : "#version-history-tab-compare")?.focus();
            }}>
              <button id="version-history-tab-preview" type="button" role="tab" aria-controls="version-history-panel" aria-selected={view === "preview"} tabIndex={view === "preview" ? 0 : -1} onClick={() => setView("preview")}><NavigationIcon name="preview" size={16} /> Preview</button>
              <button id="version-history-tab-compare" type="button" role="tab" aria-controls="version-history-panel" aria-selected={view === "compare"} tabIndex={view === "compare" ? 0 : -1} onClick={() => setView("compare")}><NavigationIcon name="files" size={16} /> Compare with current</button>
            </div>}
            <div id="version-history-panel" className="version-history-review" role={selectedId !== "current" ? "tabpanel" : undefined} aria-labelledby={selectedId !== "current" ? (view === "preview" ? "version-history-tab-preview" : "version-history-tab-compare") : undefined}>
              {view === "compare" && selectedId !== "current" ? <>
                <div className="version-history-diff-summary">
                  <div><span className="version-history-eyebrow">WHAT CHANGED SINCE THIS SNAPSHOT</span><strong>{noDifference ? "This snapshot matches the current writing" : comparison?.sameWriting ? "Formatting or embedded content changed" : comparison?.tooLong ? "Review the complete documents below" : "Review the changes"}</strong></div>
                  {!comparison?.tooLong && !comparison?.sameWriting && <div className="version-history-change-counts"><span>+{comparison?.added ?? 0} words</span><span>−{comparison?.removed ?? 0} words</span></div>}
                </div>
                {comparison?.titleChanged && <p className="version-history-title-change">Title changed from <strong>{preview.title || "Untitled note"}</strong> to <strong>{current.title || "Untitled note"}</strong>.</p>}
                {comparison?.changes?.length > 0 && <div className="version-history-word-diff" aria-label="Word changes from saved revision to current writing">{comparison.changes.map((part, index) => part.kind === "added" ? <ins key={index}>{part.words.join(" ")} </ins> : part.kind === "removed" ? <del key={index}>{part.words.join(" ")} </del> : <span key={index}>{part.words.join(" ")} </span>)}</div>}
                <div className="version-history-compare-grid">
                  <section><div className="version-history-pane-label"><span>THEN</span><strong>{fullDate(preview.createdAt)}</strong></div><RevisionDocument note={preview} /></section>
                  <section><div className="version-history-pane-label"><span>NOW</span><strong>Current writing</strong></div><RevisionDocument note={current} /></section>
                </div>
              </> : <div className="version-history-single"><RevisionDocument note={selected} /></div>}
            </div>
          </> : <div className="version-history-placeholder">
            {previewing || (versions === null && !error) ? <HistorySkeleton /> : <><span className="version-history-placeholder-icon"><NavigationIcon name="clock" size={25} /></span><h3>{versions?.length ? "Choose a revision" : "Your writing starts here"}</h3><p>{versions?.length ? "Select a saved revision to read it or compare it with your current writing." : "Once earlier writing is saved, you can review and restore it here."}</p>{selectedId && !previewing && versions?.length > 0 && <button type="button" onClick={() => openPreview(selectedId)}>Retry revision</button>}</>}
          </div>}
        </main>
      </div>

      <footer className="version-history-footer">
        <p><NavigationIcon name="shield" size={16} /><span>{confirming && preview ? "Restore the " + fullDate(preview.createdAt) + " snapshot? The current title and writing will be saved in history first." : "Restoring saves the current title and writing in history first. Attachments and other note details stay in place."}</span></p>
        <div className="version-history-footer-actions">
          {confirming && restoreReady ? <><button type="button" className="version-history-quiet" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button><button ref={confirmButton} type="button" className="version-history-primary" disabled={busy} onClick={restore}>{busy ? "Restoring…" : "Confirm restore"}</button></> : <><button type="button" className="version-history-quiet" disabled={busy} onClick={onClose}>Back to writing</button>{preview && <button type="button" className="version-history-primary" disabled={!restoreReady || busy} onClick={() => setConfirming(true)}>{noDifference ? "Already current" : "Restore this version"}</button>}</>}
        </div>
      </footer>
    </div>
  </dialog>;
}
