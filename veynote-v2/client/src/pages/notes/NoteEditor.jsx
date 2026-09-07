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
  const [noteMeta, setNoteMeta] = useState({ createdAt: null, updatedAt: null });
  const [shareState, setShareState] = useState({ shareEnabled: false, shareToken: null });
  const [focusMode, setFocusMode] = useState(false);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get("/folders").then((d) => setFolders(d.folders));
  }, []);

  // "+ From template" pre-fills a brand-new, unsaved note — only applies
  // when there's no routeId yet (never overwrites a real, already-saved note).
  useEffect(() => {
    if (routeId) return;
    const templateId = searchParams.get("template");
    const template = templateId ? getTemplate(templateId) : null;
    if (!template) return;
    setTitle(template.title);
    setInitialHTML(template.html);
    latestHTML.current = template.html;
    setStats(computeStats(template.html));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadNote() {
    if (!routeId) return;
    setVaultRequired(null);
    api
      .get(`/notes/${routeId}`)
      .then((d) => {
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
        api.get(`/notes/${routeId}/backlinks`).then((b) => setBacklinks(b.backlinks)).catch(() => {});
      })
      .catch((err) => {
        if (err.requiresVault) {
          setVaultRequired(err.requiresVault);
        } else {
          alert(err.message);
        }
      });
  }

  useEffect(loadNote, [routeId]);

  async function toggleLock() {
    try {
      const { note } = await api.patch(`/notes/${routeId}/lock`, { locked: !isLocked });
      setIsLocked(Boolean(note.isLocked));
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
      const { note } = await api.post(`/notes/${routeId}/duplicate`, {});
      navigate(`/notes/${note.id}`);
    } catch (err) {
      alert(err.message);
    }
  }

  // ---------------- autosave ----------------
  const doSave = useCallback(
    async (fields) => {
      const mySeq = ++saveSeq.current;
      const payload = {
        title: fields.title,
        content: fields.html,
        folderId: fields.folderId || null,
        mood: fields.mood,
        tags: fields.tags,
      };

      if (!fields.noteId && !hasMeaningfulContent({ title: fields.title, html: fields.html, mood: fields.mood, tags: fields.tags })) {
        return; // nothing worth saving yet — stay quietly idle, no error shown
      }

      setSaveStatus("saving");
      try {
        if (!fields.noteId) {
          const { note } = await api.post("/notes", payload);
          if (mySeq !== saveSeq.current) return; // a newer save superseded this one
          setNoteId(note.id);
          navigate(`/notes/${note.id}`, { replace: true });
        } else {
          await api.patch(`/notes/${fields.noteId}`, payload);
        }
        if (mySeq === saveSeq.current) {
          setSaveStatus("saved");
          setSaveError("");
        }
      } catch (err) {
        if (mySeq === saveSeq.current) {
          setSaveStatus("error");
          setSaveError(err.message);
        }
      }
    },
    [navigate]
  );

  function scheduleAutosave() {
    dirtyRef.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave({ noteId, title, html: latestHTML.current, folderId, mood, tags });
    }, 900);
  }

  // Belt-and-braces: the 900ms autosave debounce is short, but if someone
  // closes the tab in that window (or a save is actively in flight), warn
  // instead of silently losing the last keystrokes.
  useEffect(() => {
    if (saveStatus === "saved" || saveStatus === "idle") dirtyRef.current = false;
  }, [saveStatus]);
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
    if (noteId) return noteId;
    const { note } = await api.post("/notes", {
      title,
      content: latestHTML.current,
      folderId: folderId || null,
      mood,
      tags,
      draftForAttachment: true,
    });
    setNoteId(note.id);
    navigate(`/notes/${note.id}`, { replace: true });
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
        editorRef.current?.insertHTML(`<img src="${attachment.url}" alt="${attachment.originalName}" />`);
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
      `<a class="note-link" href="/notes/${note.id}" data-note-id="${note.id}">${note.title || "Untitled"}</a>&nbsp;`
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

  if (vaultRequired) return <VaultGate vault={vaultRequired} onUnlock={loadNote} />;

  if (!loaded) return <p className="text-ink-muted text-[12px]">Loading…</p>;

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
              onOpenHistory={() => setHistoryOpen(true)}
              onDuplicate={duplicateNote}
              onToggleLock={toggleLock}
              focusMode={focusMode}
              onToggleFocusMode={() => setFocusMode((f) => !f)}
            />
            <SaveStatus status={saveStatus} error={saveError} />
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
          className="w-full bg-transparent outline-none text-[26px] font-bold tracking-tight text-ink mb-3.5 placeholder:text-ink-muted"
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
          <VersionHistory noteId={routeId} onClose={() => setHistoryOpen(false)} onRestored={loadNote} />
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