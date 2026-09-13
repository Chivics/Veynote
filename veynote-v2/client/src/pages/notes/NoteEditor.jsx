import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import PaginatedEditor from "../../components/PaginatedEditor";
import EditorToolbar from "../../components/EditorToolbar";
import InsertMenu from "../../components/InsertMenu";
import NoteLinkMenu from "../../components/NoteLinkMenu";
import AttachmentList from "../../components/AttachmentList";
import SaveStatus from "../../components/SaveStatus";
import FindReplaceBar from "../../components/FindReplaceBar";
import TableToolbar from "../../components/TableToolbar";
import VaultGate from "../../components/VaultGate";
import VersionHistory from "../../components/VersionHistory";
import ExportMenu from "../../components/ExportMenu";
import ShareMenu from "../../components/ShareMenu";
import NoteOptionsMenu from "../../components/NoteOptionsMenu";
import { computeStats, formatStats } from "../../utils/textStats";
import { getTemplate } from "../../data/noteTemplates";
import { escapeHtml } from "../../utils/safeHtml";
import { createNoteWriter } from "../../utils/noteWriter";
import { clearNoteGrant } from "../../utils/noteGrant";

const FONT_SIZE_PX = { small: "13px", medium: "15px", large: "18px", comfort: "16px", display: "22px", xlarge: "28px" };

function hasMeaningfulContent({ title, html, mood, tags }) {
  const plainText = (html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return Boolean(title?.trim()) || plainText.length > 0 || Boolean(mood?.trim()) || (tags && tags.length > 0);
}

export default function NoteEditor() {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const editorFontSize = FONT_SIZE_PX[user?.editorFontSize] || FONT_SIZE_PX.medium;
  const editorRef = useRef(null);
  const latestHTML = useRef("");
  const saveTimer = useRef(null);
  const saveSeq = useRef(0);
  const dirtyRef = useRef(false);
  const writer = useRef(createNoteWriter(api));
  const createdNoteId = useRef(null);
  const navigatedNoteId = useRef(routeId || null);
  const loadSequence = useRef(0);
  const alive = useRef(true);

  const [noteId, setNoteId] = useState(routeId || null);
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folders, setFolders] = useState([]);
  const [mood, setMood] = useState("");
  const [tags, setTags] = useState([]);
  const [initialHTML, setInitialHTML] = useState("");
  const [loaded, setLoaded] = useState(!routeId);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [saveError, setSaveError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [insertMenu, setInsertMenu] = useState(null); // { x, y, fromSlash, blockEl } | null
  const [noteLinkMenu, setNoteLinkMenu] = useState(null); // { x, y, blockEl } | null
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState([]);
  const [findOpen, setFindOpen] = useState(false);
  const [tableToolbarRect, setTableToolbarRect] = useState(null);
  const [stats, setStats] = useState(() => computeStats(""));
  const [vaultRequired, setVaultRequired] = useState(null); // "locked-notes" | "will" | null
  const [isLocked, setIsLocked] = useState(false);
  const [isWill, setIsWill] = useState(false);
  const [backlinks, setBacklinks] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBase, setHistoryBase] = useState(null);
  const [noteMeta, setNoteMeta] = useState({ createdAt: null, updatedAt: null });
  const [shareState, setShareState] = useState({ shareEnabled: false, shareToken: null });
  const [focusMode, setFocusMode] = useState(false);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get("/folders").then((d) => setFolders(d.folders)).catch(() => {});
  }, []);

  // "+ From template" pre-fills a brand-new, unsaved note — only applies
  // when there's no routeId yet (never overwrites a real, already-saved note).
  function loadNote() {
    if (createdNoteId.current === routeId) { createdNoteId.current = null; return; }
    const requestSequence = ++loadSequence.current;
    navigatedNoteId.current = routeId;
    writer.current = createNoteWriter(api, { id: routeId });
    clearTimeout(saveTimer.current);
    dirtyRef.current = false;
    saveSeq.current++;
    setSaveStatus("idle"); setSaveError(""); setLoadError("");
    setBacklinks([]); setHistoryOpen(false);
    setLoaded(false);
    setVaultRequired(null);
    if (!routeId) {
      const template = getTemplate(searchParams.get("template"));
      setNoteId(null); setTitle(template?.title || ""); setFolderId(""); setMood(""); setTags([]);
      setInitialHTML(template?.html || ""); latestHTML.current = template?.html || "";
      setStats(computeStats(latestHTML.current)); setAttachments([]);
      setIsLocked(false); setIsWill(false); setNoteMeta({ createdAt: null, updatedAt: null });
      setShareState({ shareEnabled: false, shareToken: null }); setLoaded(true);
      return;
    }
    api
      .get(`/notes/${routeId}`)
      .then((d) => {
        if (requestSequence !== loadSequence.current) return;
        writer.current = createNoteWriter(api, d.note);
        setNoteId(d.note.id);
        setTitle(d.note.title || "");
        setFolderId(d.note.folderId || "");
        setMood(d.note.mood || "");
        setTags(d.note.tags || []);
        setInitialHTML(d.note.content || "");
        latestHTML.current = d.note.content || "";
        setStats(computeStats(d.note.content || ""));
        setAttachments((d.note.attachments || []).filter((a) => a.kind === "FILE"));
        setIsLocked(Boolean(d.note.isLocked));
        setIsWill(Boolean(d.note.isWill));
        setNoteMeta({ createdAt: d.note.createdAt, updatedAt: d.note.updatedAt });
        setShareState({ shareEnabled: Boolean(d.note.shareEnabled), shareToken: d.note.shareToken || null });
        setLoaded(true);
        setSaveStatus("saved");
        api.get(`/notes/${routeId}/backlinks`).then((b) => { if (requestSequence === loadSequence.current) setBacklinks(b.backlinks); }).catch(() => {});
      })
      .catch((err) => {
        if (requestSequence !== loadSequence.current) return;
        if (err.requiresVault) {
          if (err.requiresVault === "locked-notes") setIsLocked(true);
          setVaultRequired(err.requiresVault);
        } else {
          setLoadError(err.message);
        }
      });
  }

  useEffect(() => { loadNote(); return () => { ++loadSequence.current; clearTimeout(saveTimer.current); }; }, [routeId]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { clearNoteGrant(); }, [routeId]);

  async function toggleLock() {
    try {
      clearTimeout(saveTimer.current);
      if (dirtyRef.current) {
        const lockingSequence = saveSeq.current;
        await writer.current.save({ title, content: latestHTML.current, folderId: folderId || null, mood, tags });
        if (lockingSequence !== saveSeq.current) throw new Error("Your note changed while saving. Wait for Saved, then change its lock.");
        dirtyRef.current = false;
        setSaveStatus("saved");
      }
      const { note } = await api.patch(`/notes/${routeId}/lock`, { locked: !isLocked });
      writer.current = createNoteWriter(api, { id: note.id, updatedAt: note.updatedAt });
      setIsLocked(Boolean(note.isLocked));
      if (note.isLocked) {
        clearNoteGrant();
        setLoaded(false);
        setVaultRequired("locked-notes");
      }
    } catch (err) {
      if (err.requiresVault) {
        setVaultRequired(err.requiresVault);
      } else {
        alert(err.message);
      }
    }
  }

  async function duplicateNote() {
    try {
      clearTimeout(saveTimer.current);
      const currentWriter = writer.current;
      const sequence = saveSeq.current;
      await currentWriter.save({ title, content: latestHTML.current, folderId: folderId || null, mood, tags });
      if (!alive.current || currentWriter !== writer.current) return;
      if (sequence !== saveSeq.current) throw new Error("Your note changed while saving. Wait for Saved, then duplicate it.");
      dirtyRef.current = false; setSaveStatus("saved");
      const { note } = await api.post(`/notes/${routeId}/duplicate`, {});
      if (!alive.current || currentWriter !== writer.current) return;
      navigate(`/notes/${note.id}`);
    } catch (err) {
      alert(err.message);
    }
  }

  // ---------------- autosave ----------------
  const doSave = useCallback(
    async (fields) => {
      const mySeq = fields.sequence ?? saveSeq.current;
      const payload = {
        title: fields.title,
        content: fields.html,
        folderId: fields.folderId || null,
        mood: fields.mood,
        tags: fields.tags,
      };

      if (!fields.noteId && !hasMeaningfulContent({ title: fields.title, html: fields.html, mood: fields.mood, tags: fields.tags })) {
        dirtyRef.current = false;
        setSaveStatus("idle");
        return; // nothing worth saving yet — stay quietly idle, no error shown
      }

      setSaveStatus("saving");
      const currentWriter = writer.current;
      try {
        const note = await currentWriter.save(payload);
        if (!alive.current || currentWriter !== writer.current) return;
        setNoteId(note.id);
        setNoteMeta({ createdAt: note.createdAt, updatedAt: note.updatedAt });
        if (!fields.noteId && navigatedNoteId.current !== note.id) {
          navigatedNoteId.current = note.id;
          createdNoteId.current = note.id;
          navigate(`/notes/${note.id}`, { replace: true });
        }
        if (mySeq === saveSeq.current) {
          dirtyRef.current = false;
          setSaveStatus("saved");
          setSaveError("");
        }
      } catch (err) {
        if (!alive.current || currentWriter !== writer.current) return;
        if (mySeq === saveSeq.current) {
          setSaveStatus(err.status === 409 || err.status === 428 ? "conflict" : navigator.onLine ? "error" : "offline");
          setSaveError(err.message);
        }
      }
    },
    [navigate]
  );

  function scheduleAutosave() {
    if (!writer.current.hasChanges({ title, content: latestHTML.current, folderId, mood, tags })) {
      dirtyRef.current = false;
      setSaveStatus("saved");
      return;
    }
    dirtyRef.current = true;
    const sequence = ++saveSeq.current;
    setSaveStatus(navigator.onLine ? "pending" : "offline");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave({ noteId, title, html: latestHTML.current, folderId, mood, tags, sequence });
    }, 900);
  }

  async function openHistory() {
    clearTimeout(saveTimer.current);
    const currentWriter = writer.current;
    const sequence = saveSeq.current;
    try {
      setSaveError("");
      const note = await currentWriter.save({ title, content: latestHTML.current, folderId: folderId || null, mood, tags });
      if (!alive.current || currentWriter !== writer.current) return;
      if (sequence !== saveSeq.current) throw new Error("Your note changed while saving. Wait for Saved, then reopen history.");
      dirtyRef.current = false; setSaveStatus("saved");
      setNoteMeta({ createdAt: note.createdAt, updatedAt: note.updatedAt });
      setHistoryBase(currentWriter.updatedAt); setHistoryOpen(true);
    } catch (err) {
      if (!alive.current || currentWriter !== writer.current) return;
      setSaveError(err.message); setSaveStatus(err.status === 409 ? "conflict" : "error");
    }
  }

  // Belt-and-braces: the 900ms autosave debounce is short, but if someone
  // closes the tab in that window (or a save is actively in flight), warn
  // instead of silently losing the last keystrokes.
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Ctrl/Cmd+F opens the in-note find & replace bar instead of the
  // browser's native page search, which can't see into a contentEditable
  // region's live state the way our own find can, and can't replace at all.
  // Escape exits Focus mode when it's active.
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
      if (e.key === "Escape" && focusMode) {
        setFocusMode(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusMode]);

  function closeFindBar() {
    setFindOpen(false);
    editorRef.current?.findAll(""); // also clears any leftover match highlight
  }

  useEffect(() => {
    if (!loaded) return;
    scheduleAutosave();
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, folderId, mood, tags, loaded]);

  // A note must exist on the server before a file can be attached to it —
  // if the user attaches something before typing a single word, create an
  // empty draft immediately rather than blocking the action.
  async function ensureSaved() {
    if (writer.current.id) return writer.current.id;
    const currentWriter = writer.current;
    const note = await currentWriter.save({
      title,
      content: latestHTML.current,
      folderId: folderId || null,
      mood,
      tags,
      draftForAttachment: true,
    });
    if (!alive.current || currentWriter !== writer.current) throw new Error("The open note changed. Return to the original note to attach this file.");
    setNoteId(note.id);
    if (navigatedNoteId.current !== note.id) {
      navigatedNoteId.current = note.id;
      createdNoteId.current = note.id;
      navigate(`/notes/${note.id}`, { replace: true });
    }
    return note.id;
  }

  // ---------------- attachments ----------------
  async function uploadOne(file, { inline }) {
    const tempId = `${Date.now()}-${Math.random()}`;
    setUploading((u) => [...u, { tempId, name: file.name, mimeType: file.type, progress: 0 }]);
    try {
      const targetId = await ensureSaved();
      const { attachment } = await api.upload(`/notes/${targetId}/attachments`, file, (pct) =>
        setUploading((u) => u.map((x) => (x.tempId === tempId ? { ...x, progress: pct } : x)))
      );
      setUploading((u) => u.filter((x) => x.tempId !== tempId));
      if (inline) {
        editorRef.current?.insertHTML(`<img src="${escapeHtml(attachment.url)}" alt="${escapeHtml(attachment.originalName)}" />`);
      } else {
        setAttachments((prev) => [...prev, attachment]);
      }
    } catch (err) {
      setUploading((u) => u.filter((x) => x.tempId !== tempId));
      alert(err.message);
    }
  }

  async function removeAttachment(attachmentId) {
    await api.delete(`/notes/attachments/${attachmentId}`);
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }

  function handleImagePicked(e) {
    const files = Array.from(e.target.files || []);
    files.forEach((f) => uploadOne(f, { inline: true }));
    e.target.value = "";
  }

  function handleFilePicked(e) {
    const files = Array.from(e.target.files || []);
    files.forEach((f) => uploadOne(f, { inline: false }));
    e.target.value = "";
  }

  // ---------------- insert menu (both the "+" button and "/" trigger) ----------------
  function openInsertMenuFromButton() {
    const rect = document.activeElement?.getBoundingClientRect?.() || { left: 200, bottom: 200 };
    setInsertMenu({ x: rect.left, y: rect.bottom + 4, fromSlash: false });
  }

  function handleSlash({ x, y, blockEl }) {
    setInsertMenu({ x, y: y + 6, fromSlash: true, blockEl });
  }

  function handleNoteLink({ x, y, blockEl }) {
    setNoteLinkMenu({ x, y: y + 6, blockEl });
  }

  function pickNoteLink(note) {
    if (noteLinkMenu?.blockEl) noteLinkMenu.blockEl.textContent = "";
    setNoteLinkMenu(null);
    editorRef.current?.insertHTML(
      `<a class="note-link" href="/notes/${escapeHtml(note.id)}" data-note-id="${escapeHtml(note.id)}">${escapeHtml(note.title || "Untitled")}</a>&nbsp;`
    );
  }

  function pickInsertBlock(block) {
    // If the menu was opened via "/", remove that slash character first.
    if (insertMenu?.fromSlash && insertMenu.blockEl) {
      insertMenu.blockEl.textContent = "";
    }
    setInsertMenu(null);

    if (block.needsFilePicker === "image") {
      imageInputRef.current?.click();
      return;
    }
    if (block.needsFilePicker === "file") {
      fileInputRef.current?.click();
      return;
    }
    block.action(editorRef.current);
  }

  if (vaultRequired) return <VaultGate vault={vaultRequired} noteId={vaultRequired === "locked-notes" && isLocked ? routeId : undefined} onUnlock={loadNote} />;

  if (!loaded) return loadError ? <section><h1 className="page-title">Note unavailable</h1><p role="alert" className="my-4 text-danger">{loadError}</p><button className="btn-primary" onClick={loadNote}>Retry</button> <Link className="btn-outline" to="/notes/all">Back to notes</Link></section> : <PageSkeleton title="Note" />;

  // Note-links are plain <a href> tags inside the editor's raw HTML (not
  // React <Link>s, since they're user content) — intercept clicks so
  // navigating between notes stays a client-side transition instead of a
  // full page reload.
  function handleContentClick(e) {
    const link = e.target.closest?.("a.note-link");
    if (!link) return;
    e.preventDefault();
    navigate(link.getAttribute("href"));
  }

  return (
    <div className={focusMode ? "fixed inset-0 z-50 bg-app-bg overflow-y-auto px-4 sm:px-6 md:px-10 py-6" : ""}>
      <div onClick={handleContentClick} className="max-sm:pb-16 max-w-[760px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="eyebrow">
            {isWill ? "WILL & INHERITANCE" : isLocked ? "🔒 LOCKED NOTE" : routeId || noteId ? "EDITING" : "NEW NOTE"}
          </span>
          <div className="flex items-center gap-1.5 print:hidden">
            {routeId && (
              <ExportMenu
                compact
                note={{ title, content: latestHTML.current, tags, createdAt: noteMeta.createdAt, updatedAt: noteMeta.updatedAt }}
              />
            )}
            {routeId && !isWill && !isLocked && (
              <ShareMenu
                compact
                noteId={routeId}
                shareEnabled={shareState.shareEnabled}
                shareToken={shareState.shareToken}
                onChange={setShareState}
              />
            )}
            <NoteOptionsMenu
              routeId={routeId}
              isOwner
              isWill={isWill}
              isLocked={isLocked}
              onToggleFind={() => setFindOpen((o) => !o)}
              onOpenHistory={openHistory}
              onDuplicate={duplicateNote}
              onToggleLock={toggleLock}
              focusMode={focusMode}
              onToggleFocusMode={() => setFocusMode((f) => !f)}
            />
            <SaveStatus status={saveStatus} error={saveError} />
            {["error", "offline"].includes(saveStatus) && <button type="button" className="btn-outline" onClick={scheduleAutosave}>Retry save</button>}
            {saveStatus === "conflict" && <button type="button" className="btn-outline" onClick={() => {
              const blob = new Blob([latestHTML.current], { type: "text/plain" });
              const url = URL.createObjectURL(blob); const a = document.createElement("a");
              a.href = url; a.download = "veynote-unsaved-writing.html.txt"; a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}>Download my unsaved writing</button>}
          </div>
        </div>

        <div className="flex gap-2.5 mb-4 flex-wrap">
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="chip bg-app-panel2 outline-none" title="Move to folder…">
            <option value="">📁 Move to folder…</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.icon} {f.name}
              </option>
            ))}
          </select>
          <select value={mood} onChange={(e) => setMood(e.target.value)} className="chip bg-app-panel2 outline-none">
            <option value="">Mood (optional)</option>
            <option value="happy">🙂 Happy</option>
            <option value="focused">🎯 Focused</option>
            <option value="tired">😴 Tired</option>
            <option value="stressed">😣 Stressed</option>
            <option value="grateful">🙏 Grateful</option>
          </select>
          <TagInput tags={tags} setTags={setTags} />
        </div>

        <input
          aria-label="Record title" className="page-title w-full bg-transparent outline-none text-[26px] font-bold tracking-tight text-ink mb-3.5 placeholder:text-ink-muted"
          placeholder="Untitled (title is optional — just start writing)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <AttachmentList attachments={attachments} uploading={uploading} onRemove={removeAttachment} />

        {findOpen && <FindReplaceBar editorRef={editorRef} onClose={closeFindBar} />}

        <EditorToolbar editorRef={editorRef} onOpenInsertMenu={openInsertMenuFromButton} />

        <div className="-mt-px">
          <PaginatedEditor
            ref={editorRef}
            initialHTML={initialHTML}
            placeholder="Start writing, or type / for commands…"
            fontSize={editorFontSize}
            onChange={(html) => {
              latestHTML.current = html;
              setStats(computeStats(html));
              scheduleAutosave();
            }}
            onSlash={handleSlash}
            onNoteLink={handleNoteLink}
            onImageDrop={(files) => files.forEach((f) => uploadOne(f, { inline: true }))}
            onTableFocus={setTableToolbarRect}
          />
        </div>

        {stats.words > 0 && (
          <p className="text-[10.5px] text-ink-muted mt-2 text-right">{formatStats(stats)}</p>
        )}

        {backlinks.length > 0 && (
          <div className="border-t border-app-border mt-5 pt-4">
            <p className="text-[11px] font-bold text-ink-muted mb-2 tracking-wide">LINKED FROM</p>
            <div className="flex flex-col gap-1">
              {backlinks.map((b) => (
                <Link key={b.id} to={`/notes/${b.id}`} className="text-[12px] text-accent-notes hover:underline">
                  {b.title || "Untitled"}
                </Link>
              ))}
            </div>
          </div>
        )}

        <TableToolbar rect={tableToolbarRect} editorRef={editorRef} />

        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePicked} />
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilePicked} />

        {insertMenu && (
          <InsertMenu x={insertMenu.x} y={insertMenu.y} onPick={pickInsertBlock} onClose={() => setInsertMenu(null)} />
        )}

        {noteLinkMenu && (
          <NoteLinkMenu x={noteLinkMenu.x} y={noteLinkMenu.y} onPick={pickNoteLink} onClose={() => setNoteLinkMenu(null)} />
        )}

        {historyOpen && (
          <VersionHistory noteId={routeId} expectedUpdatedAt={historyBase} onClose={() => setHistoryOpen(false)} onRestored={loadNote} />
        )}
      </div>
    </div>
  );
}

function TagInput({ tags, setTags }) {
  const [value, setValue] = useState("");
  function addTag(e) {
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      if (!tags.includes(value.trim().toLowerCase())) setTags([...tags, value.trim().toLowerCase()]);
      setValue("");
    }
  }
  return (
    <div className="chip bg-app-panel2 flex items-center gap-1.5 flex-wrap">
      {tags.map((t) => (
        <span key={t} className="text-ink">
          #{t}{" "}
          <button onClick={() => setTags(tags.filter((x) => x !== t))} className="text-ink-muted">
            ×
          </button>
        </span>
      ))}
      <input
        className="bg-transparent outline-none w-16 placeholder:text-ink-muted"
        placeholder="+ tag"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={addTag}
      />
    </div>
  );
}
