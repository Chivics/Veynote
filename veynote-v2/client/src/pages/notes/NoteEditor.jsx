import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import PaginatedEditor from "../../components/PaginatedEditor";
import EditorToolbar from "../../components/EditorToolbar";
import InsertMenu from "../../components/InsertMenu";
import AttachmentList from "../../components/AttachmentList";

const FONT_SIZE_PX = { small: "13px", medium: "15px", large: "18px", comfort: "16px", display: "22px", xlarge: "28px" };

function hasMeaningfulContent({ title, html, mood, tags }) {
  const plainText = (html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return Boolean(title?.trim()) || plainText.length > 0 || Boolean(mood?.trim()) || (tags && tags.length > 0);
}

export default function NoteEditor() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const editorFontSize = FONT_SIZE_PX[user?.editorFontSize] || FONT_SIZE_PX.medium;
  const editorRef = useRef(null);
  const latestHTML = useRef("");
  const saveTimer = useRef(null);
  const saveSeq = useRef(0);

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
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState([]);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get("/folders").then((d) => setFolders(d.folders));
  }, []);

  useEffect(() => {
    if (routeId) {
      api.get(`/notes/${routeId}`).then((d) => {
        setTitle(d.note.title || "");
        setFolderId(d.note.folderId || "");
        setMood(d.note.mood || "");
        setTags(d.note.tags || []);
        setInitialHTML(d.note.content || "");
        latestHTML.current = d.note.content || "";
        setAttachments((d.note.attachments || []).filter((a) => a.kind === "FILE"));
        setLoaded(true);
      });
    }
  }, [routeId]);

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
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave({ noteId, title, html: latestHTML.current, folderId, mood, tags });
    }, 900);
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

  if (!loaded) return <p className="text-ink-muted text-[12px]">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="eyebrow">{routeId || noteId ? "EDITING" : "NEW NOTE"}</span>
        <SaveStatus status={saveStatus} error={saveError} />
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

      <EditorToolbar editorRef={editorRef} onOpenInsertMenu={openInsertMenuFromButton} />

      <div className="-mt-px">
        <PaginatedEditor
          ref={editorRef}
          initialHTML={initialHTML}
          placeholder="Start writing, or type / for commands…"
          fontSize={editorFontSize}
          onChange={(html) => {
            latestHTML.current = html;
            scheduleAutosave();
          }}
          onSlash={handleSlash}
          onImageDrop={(files) => files.forEach((f) => uploadOne(f, { inline: true }))}
        />
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePicked} />
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilePicked} />

      {insertMenu && (
        <InsertMenu x={insertMenu.x} y={insertMenu.y} onPick={pickInsertBlock} onClose={() => setInsertMenu(null)} />
      )}
    </div>
  );
}

function SaveStatus({ status, error }) {
  if (status === "saving") return <span className="text-[11px] text-ink-muted">Saving…</span>;
  if (status === "saved") return <span className="text-[11px] text-success">Saved</span>;
  if (status === "error")
    return (
      <span className="text-[11px] text-danger" title={error}>
        Couldn't save — {error}
      </span>
    );
  return <span className="text-[11px] text-ink-muted">&nbsp;</span>;
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
