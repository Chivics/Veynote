import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
import MediaToolbar from "../../components/MediaToolbar";
import VaultGate from "../../components/VaultGate";
import ProtectedContentBoundary from "../../components/ProtectedContentBoundary";
import VersionHistory from "../../components/VersionHistory";
import ExportMenu from "../../components/ExportMenu";
import ShareMenu from "../../components/ShareMenu";
import NoteOptionsMenu from "../../components/NoteOptionsMenu";
import SaveTemplateDialog from "../../components/SaveTemplateDialog";
import ConfirmDialog from "../../components/ConfirmDialog";
import NavigationIcon from "../../components/layout/NavigationIcon";
import DocumentInsights from "../../components/DocumentInsights";
import DocumentContent from "../../components/DocumentContent";
import DocumentTagPicker from "../../components/DocumentTagPicker";
import NoteComments from "../../components/NoteComments";
import DocumentPosition from "../../components/DocumentPosition";
import "./editorWorkspace.css";
import "./noteDraftRecovery.css";
import { computeStats, formatStats } from "../../utils/textStats";
import { getTemplate } from "../../data/noteTemplates";
import { escapeHtml } from "../../utils/safeHtml";
import { createNoteWriter } from "../../utils/noteWriter";
import { downloadNoteBackup } from "../../utils/noteBackup";
import { acknowledgeNoteDraft, clearNoteDraft, readNoteDraft, sameNoteDraft, saveNoteDraft, setNoteDraftCreation } from "../../utils/noteDraftRecovery";
import { clearNoteGrant, setNoteGrant } from "../../utils/noteGrant";
import { getVaultToken } from "../../utils/vault";
import { writingText } from "../../utils/noteCollection.js";
import { downloadMedia, storedMediaName } from "../../utils/media.js";
import { useContextualNavigation } from "../../context/NavigationContext";
import JournalContextPanel, { journalTypeFromParams } from "../journal/JournalContextPanel";

const FONT_SIZE_PX = { small: "13px", medium: "16px", large: "18px", comfort: "17px", display: "22px", xlarge: "28px" };

function hasMeaningfulContent({ title, html, mood, tags }) {
  const structure = document.createElement("template"); structure.innerHTML = html || "";
  return Boolean(title?.trim()) || writingText(html).length > 0 || Boolean(structure.content.querySelector("img,table,hr")) || Boolean(mood?.trim()) || (tags && tags.length > 0);
}
function folderPath(folder, byId) {
  const names = [];
  const visited = new Set();
  let current = folder;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = byId.get(current.parentId);
  }
  return names.join(" / ");
}

export default function NoteEditor({ kind = "NOTE" }) {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const privateCreation = !routeId && kind === "NOTE" && searchParams.get("private") === "1";
  const navigate = useNavigate();
  const { user } = useAuth();
  const { registerGuard, replaceSavedNote } = useContextualNavigation();
  const editorFontSize = FONT_SIZE_PX[user?.editorFontSize] || FONT_SIZE_PX.medium;
  const editorRef = useRef(null);
  const commentSelectionRef = useRef("");
  const documentRef = useRef(null);
  const titleRef = useRef(null);
  const latestHTML = useRef("");
  const saveTimer = useRef(null);
  const statsTimer = useRef(null);
  const saveSeq = useRef(0);
  const dirtyRef = useRef(false);
  const writer = useRef(createNoteWriter(api));
  const createdNoteId = useRef(null);
  const preserveCreatedNoteGrant = useRef(false);
  const navigatedNoteId = useRef(routeId || null);
  const loadSequence = useRef(0);
  const alive = useRef(true);

  const [noteId, setNoteId] = useState(routeId || null);
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState("");
  const [folders, setFolders] = useState([]);
  const [mood, setMood] = useState("");
  const requestedEntryDate = searchParams.get("date");
  const initialEntryDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedEntryDate || "") ? requestedEntryDate : new Date().toISOString().slice(0, 10);
  const [entryDate, setEntryDate] = useState(initialEntryDate);
  const [journalType, setJournalType] = useState(() => journalTypeFromParams(searchParams));
  const [journalData, setJournalData] = useState({});
  const [tags, setTags] = useState([]);
  const [initialHTML, setInitialHTML] = useState("");
  // Check tab recovery before autosave can clear an apparently empty new note.
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [saveError, setSaveError] = useState("");
  const [localRecoveryFailed, setLocalRecoveryFailed] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [recoveredNoteId, setRecoveredNoteId] = useState(null);
  const [recoveryDraft, setRecoveryDraft] = useState(null);
  const [insertMenu, setInsertMenu] = useState(null); // { x, y, fromSlash, blockEl } | null
  const [noteLinkMenu, setNoteLinkMenu] = useState(null); // { x, y, blockEl } | null
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState([]);
  const [findOpen, setFindOpen] = useState(false);
  const [tableToolbarRect, setTableToolbarRect] = useState(null);
  const [mediaToolbar, setMediaToolbar] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [stats, setStats] = useState(() => computeStats(""));
  const [formatState, setFormatState] = useState(null);
  const [editorHistory, setEditorHistory] = useState({ canUndo: false, canRedo: false });
  const [vaultRequired, setVaultRequired] = useState(null); // "locked-notes" | "will" | null
  const [isLocked, setIsLocked] = useState(false);
  const [isWill, setIsWill] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [isTrashed, setIsTrashed] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [trashBusy, setTrashBusy] = useState(false);
  const [backlinks, setBacklinks] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentQuote, setCommentQuote] = useState("");
  const [historyBase, setHistoryBase] = useState(null);
  const [noteMeta, setNoteMeta] = useState({ createdAt: null, updatedAt: null });
  const [shareState, setShareState] = useState({ shareEnabled: false, shareToken: null });
  const [focusMode, setFocusMode] = useState(false);
  const exportTriggerRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const replacingMedia = useRef(null);
  const folderNames = useMemo(() => {
    const byId = new Map(folders.map(folder => [folder.id, folder]));
    return new Map(folders.map(folder => [folder.id, folderPath(folder, byId)]));
  }, [folders]);

  function draftIdentity(id) {
    return user?.id ? { userId: user.id, kind, noteId: id || null } : null;
  }

  async function downloadUnsavedWriting() {
    try {
      await downloadNoteBackup(
        { title, content: latestHTML.current, folderId, mood, tags, kind, ...(kind === "JOURNAL" && { entryDate, journalType, journalData }) },
        kind === "JOURNAL" ? "veynote-unsaved-journal-entry.json" : "veynote-unsaved-note.json"
      );
    } catch (error) {
      if (error?.name !== "AbortError") setActionError("The backup could not be written. Keep this tab open and try again.");
    }
  }

  function editorWriter(initial, identity, recoveredCreation = null) {
    return createNoteWriter(api, initial, {
      recoveredCreation,
      createPath: privateCreation ? "/notes/locked" : "/notes",
      onCreateAttempt: creation => { if (!privateCreation) setNoteDraftCreation(identity, creation); },
      onCreated: response => {
        if (!response.noteToken) return;
        setNoteGrant(response.note.id, response.noteToken);
        preserveCreatedNoteGrant.current = true;
        setIsLocked(true);
      },
      onAcknowledged: (payload, note) => acknowledgeNoteDraft(identity, note.id, payload),
    });
  }

  function offerRecovery(identity, baseline) {
    const draft = readNoteDraft(identity);
    if (draft && !sameNoteDraft(draft, baseline)) setRecoveryDraft(draft);
    else {
      if (draft) clearNoteDraft(identity);
      setRecoveryDraft(null);
    }
  }

  function restoreDraft() {
    if (!recoveryDraft) return;
    const draft = recoveryDraft;
    if (!draft.noteId && draft.creation) writer.current = editorWriter({}, draftIdentity(null), draft.creation);
    setTitle(draft.title); setFolderId(draft.folderId || ""); setMood(draft.mood || "");
    setTags(draft.tags || []);
    if (kind === "JOURNAL") { if (draft.entryDate) setEntryDate(draft.entryDate); if (draft.journalType) setJournalType(draft.journalType); setJournalData(draft.journalData || {}); }
    setInitialHTML(draft.content); latestHTML.current = draft.content;
    setStats(computeStats(draft.content));
    dirtyRef.current = true;
    setSaveStatus("pending"); setSaveError(""); setRecoveryDraft(null);
  }

  function discardDraft() {
    if (!recoveryDraft) return;
    clearNoteDraft(draftIdentity(recoveryDraft.noteId));
    setRecoveryDraft(null);
  }

  useEffect(() => {
    const field = titleRef.current;
    if (!field) return;
    const resize = () => {
      field.style.height = "0px";
      field.style.height = `${Math.max(field.scrollHeight, 44)}px`;
    };
    resize();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    observer?.observe(field.parentElement);
    window.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, [title, loaded, focusMode]);

  useEffect(() => registerGuard(async () => {
    if (!dirtyRef.current) return true;
    clearTimeout(saveTimer.current);
    if (!writer.current.id && !writer.current.pending && !hasMeaningfulContent({ title, html: latestHTML.current, mood, tags })) { dirtyRef.current = false; clearNoteDraft(draftIdentity(null)); return true; }
    const currentWriter = writer.current, sequence = saveSeq.current;
    try {
      setSaveStatus("saving");
      await currentWriter.save({ title, content: latestHTML.current, folderId: folderId || null, mood, tags, kind, ...(kind === "JOURNAL" && { entryDate, journalType, journalData }) });
      if (!alive.current || currentWriter !== writer.current || sequence !== saveSeq.current) return false;
      dirtyRef.current = false; setSaveStatus("saved"); setSaveError(""); return true;
    } catch (error) {
      if (alive.current) { setSaveStatus([409, 410, 428].includes(error.status) ? "conflict" : "error"); setSaveError(error.message); }
      return false;
    }
  }, () => dirtyRef.current), [registerGuard, title, folderId, mood, tags, kind, entryDate]);

  useEffect(() => {
    api.get("/folders").then((d) => setFolders(d.folders)).catch(() => {});
  }, []);

  // "+ From template" pre-fills a brand-new, unsaved note — only applies
  // when there's no routeId yet (never overwrites a real, already-saved note).
  function loadNote() {
    if (createdNoteId.current === routeId) { createdNoteId.current = null; return; }
    const requestSequence = ++loadSequence.current;
    navigatedNoteId.current = routeId;
    writer.current = editorWriter({ id: routeId }, draftIdentity(routeId));
    clearTimeout(saveTimer.current);
    clearTimeout(statsTimer.current);
    dirtyRef.current = false;
    saveSeq.current++;
    setSaveStatus("idle"); setSaveError(""); setLoadError(""); setActionError("");
    setRecoveredNoteId(null); setRecoveryDraft(null);
    setBacklinks([]); setHistoryOpen(false); setInsightsOpen(false);
    setLoaded(false);
    setVaultRequired(null);
    if (!routeId) {
      if (privateCreation && !getVaultToken("locked-notes")) {
        setIsLocked(true); setVaultRequired("locked-notes"); return;
      }
      const template = getTemplate(searchParams.get("template"));
      const personalTemplateId = searchParams.get("personalTemplate");
      const initialTag = searchParams.get("tag")?.trim().toLowerCase();
      const journalPrompt = kind === "JOURNAL" ? searchParams.get("prompt")?.trim() : "";
      const startingHTML = journalPrompt ? `<blockquote><strong>${escapeHtml(journalPrompt)}</strong></blockquote>${template?.html || ""}` : template?.html || "";
      setNoteId(null); setTitle(template?.title || ""); setFolderId(searchParams.get("folder") || ""); setMood(""); setTags(initialTag ? [initialTag] : []);
      setEntryDate(initialEntryDate);
      setJournalType(journalTypeFromParams(searchParams));
      setJournalData({});
      setInitialHTML(startingHTML); latestHTML.current = startingHTML;
      setStats(computeStats(latestHTML.current)); setAttachments([]);
      setIsLocked(privateCreation); setIsWill(false); setIsFavorite(false); setIsArchived(false); setIsTrashed(false); setNoteMeta({ createdAt: null, updatedAt: null });
      setShareState({ shareEnabled: false, shareToken: null });
      const baseline = { title: template?.title || "", content: startingHTML, folderId: searchParams.get("folder") || "", mood: "", tags: initialTag ? [initialTag] : [], kind, entryDate: initialEntryDate, journalType, journalData };
      if (privateCreation) { setRecoveryDraft(null); setLoaded(true); }
      else if (personalTemplateId && kind === "NOTE") {
        api.get(`/writing-templates/${encodeURIComponent(personalTemplateId)}`).then(({ template: saved }) => {
          if (requestSequence !== loadSequence.current) return;
          setTitle(saved.name); setInitialHTML(saved.content); latestHTML.current = saved.content;
          setStats(computeStats(saved.content)); offerRecovery(draftIdentity(null), { ...baseline, title: saved.name, content: saved.content }); setLoaded(true);
        }).catch(error => { if (requestSequence === loadSequence.current) setLoadError(error.message); });
      } else { offerRecovery(draftIdentity(null), baseline); setLoaded(true); }
      return;
    }
    api
      .get(`/notes/${routeId}`)
      .then((d) => {
        if (requestSequence !== loadSequence.current) return;
        if (d.note.kind !== kind) { setLoadError("This record belongs to a different workspace."); return; }
        writer.current = editorWriter(d.note, draftIdentity(d.note.id));
        setNoteId(d.note.id);
        setTitle(d.note.title || "");
        setFolderId(d.note.folderId || "");
        setMood(d.note.mood || "");
        setEntryDate(new Date(d.note.entryDate || d.note.createdAt).toISOString().slice(0, 10));
        setJournalType(d.note.journalType || "daily");
        setJournalData(d.note.journalData || {});
        setTags(d.note.tags || []);
        setInitialHTML(d.note.content || "");
        latestHTML.current = d.note.content || "";
        setStats(computeStats(d.note.content || ""));
        // Inline images remain owned document assets after reload. Keeping
        // them in the inventory makes replacement and deliberate removal
        // possible even when the image block is no longer in the writing.
        setAttachments(d.note.attachments || []);
        setIsLocked(Boolean(d.note.isLocked));
        setIsWill(Boolean(d.note.isWill));
        setIsFavorite(Boolean(d.note.isFavorite));
        setIsArchived(Boolean(d.note.isArchived));
        setIsTrashed(Boolean(d.note.isTrashed));
        setNoteMeta({ createdAt: d.note.createdAt, updatedAt: d.note.updatedAt });
        setShareState({ shareEnabled: Boolean(d.note.shareEnabled), shareToken: d.note.shareToken || null });
        if (d.note.isLocked || d.note.isWill || d.note.isTrashed) {
          clearNoteDraft(draftIdentity(d.note.id)); setRecoveryDraft(null);
        } else offerRecovery(draftIdentity(d.note.id), d.note);
        setLoaded(true);
        setSaveStatus("saved");
        api.get(`/notes/${routeId}/backlinks`).then((b) => { if (requestSequence === loadSequence.current) setBacklinks(b.backlinks); }).catch(() => {});
      })
      .catch((err) => {
        if (requestSequence !== loadSequence.current) return;
        if (err.requiresVault) {
          clearNoteDraft(draftIdentity(routeId));
          if (err.requiresVault === "locked-notes") setIsLocked(true);
          setVaultRequired(err.requiresVault);
        } else {
          setLoadError(err.message);
        }
      });
  }

  useEffect(() => { loadNote(); return () => { ++loadSequence.current; clearTimeout(saveTimer.current); clearTimeout(statsTimer.current); }; }, [routeId, routeId ? null : searchParams.toString(), user?.id]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => {
    // Replacing /notes/new?private=1 with the newly created record is the
    // same editing session. Keep its freshly issued per-note grant once;
    // later navigation or unmount still clears it normally.
    if (preserveCreatedNoteGrant.current) { preserveCreatedNoteGrant.current = false; return; }
    clearNoteGrant();
  }, [routeId]);

  async function toggleLock() {
    try {
      setActionError("");
      clearTimeout(saveTimer.current);
      if (dirtyRef.current) {
        const lockingSequence = saveSeq.current;
        await writer.current.save({ title, content: latestHTML.current, folderId: folderId || null, mood, tags, kind, ...(kind === "JOURNAL" && { entryDate, journalType, journalData }) });
        if (lockingSequence !== saveSeq.current) throw new Error("Your note changed while saving. Wait for Saved, then change its lock.");
        dirtyRef.current = false;
        setSaveStatus("saved");
      }
      const { note } = await api.patch(`/notes/${routeId}/lock`, { locked: !isLocked });
      writer.current = createNoteWriter(api, note);
      setIsLocked(Boolean(note.isLocked));
      if (note.isLocked) {
        clearNoteDraft(draftIdentity(note.id));
        clearNoteGrant();
        setLoaded(false);
        setVaultRequired("locked-notes");
      }
    } catch (err) {
      if (err.requiresVault) {
        setVaultRequired(err.requiresVault);
      } else {
        setActionError(err.message || "The note security setting could not be changed. Your writing remains available.");
      }
    }
  }

  async function duplicateNote() {
    try {
      setActionError("");
      clearTimeout(saveTimer.current);
      const currentWriter = writer.current;
      const sequence = saveSeq.current;
      await currentWriter.save({ title, content: latestHTML.current, folderId: folderId || null, mood, tags, kind, ...(kind === "JOURNAL" && { entryDate, journalType, journalData }) });
      if (!alive.current || currentWriter !== writer.current) return;
      if (sequence !== saveSeq.current) throw new Error("Your note changed while saving. Wait for Saved, then duplicate it.");
      dirtyRef.current = false; setSaveStatus("saved");
      const { note } = await api.post(`/notes/${routeId}/duplicate`, {});
      if (!alive.current || currentWriter !== writer.current) return;
      navigate(kind === "JOURNAL" ? `/journal/entries/${note.id}` : `/notes/${note.id}`);
    } catch (err) {
      setActionError(err.message || "The note could not be duplicated. Your original writing remains unchanged.");
    }
  }

  // ---------------- autosave ----------------
  const doSave = useCallback(
    async (fields) => {
      const mySeq = fields.sequence ?? saveSeq.current;
      const currentWriter = writer.current;
      const payload = {
        title: fields.title,
        content: fields.html,
        folderId: fields.folderId || null,
        mood: fields.mood,
        tags: fields.tags,
        kind,
        ...(kind === "JOURNAL" && { entryDate: fields.entryDate, journalType: fields.journalType, journalData: fields.journalData }),
      };

      if (!currentWriter.id && !currentWriter.pending && !hasMeaningfulContent({ title: fields.title, html: fields.html, mood: fields.mood, tags: fields.tags })) {
        dirtyRef.current = false;
        clearNoteDraft(draftIdentity(null));
        setSaveStatus("idle");
        return; // nothing worth saving yet — stay quietly idle, no error shown
      }

      setSaveStatus("saving");
      try {
        const note = await currentWriter.save(payload);
        if (!alive.current || currentWriter !== writer.current) return;
        setNoteId(note.id);
        setIsLocked(Boolean(note.isLocked));
        setNoteMeta({ createdAt: note.createdAt, updatedAt: note.updatedAt });
        const savedPath = kind === "JOURNAL" ? `/journal/entries/${note.id}` : `/notes/${note.id}${privateCreation ? "?workspace=vault" : ""}`;
        if (!navigatedNoteId.current && replaceSavedNote(savedPath)) {
          navigatedNoteId.current = note.id;
          createdNoteId.current = note.id;
        }
        if (mySeq === saveSeq.current) {
          dirtyRef.current = false;
          setSaveStatus("saved");
          setSaveError("");
          setLocalRecoveryFailed(false);
        }
      } catch (err) {
        if (!alive.current || currentWriter !== writer.current) return;
        if (mySeq === saveSeq.current) {
          setSaveStatus([409, 410, 428].includes(err.status) ? "conflict" : navigator.onLine ? "error" : "offline");
          setSaveError(err.message);
          setRecoveredNoteId(err.data?.noteId || currentWriter.id || null);
        }
      }
    },
    [kind, replaceSavedNote]
  );

  function scheduleAutosave() {
    if (!loaded || isTrashed || vaultRequired || recoveryDraft) return;
    const isProtectedWriting = isLocked || isWill;
    const fields = { title, content: latestHTML.current, folderId: folderId || null, mood, tags, kind, ...(kind === "JOURNAL" && { entryDate, journalType, journalData }) };
    // Folder and tag links prepare a new note's metadata. Visiting one must
    // not silently create an empty record before the user writes anything.
    if (!writer.current.id && !writer.current.pending && !hasMeaningfulContent({ title, html: latestHTML.current, mood, tags: [] })) {
      dirtyRef.current = false;
      clearNoteDraft(draftIdentity(null));
      setSaveStatus("idle");
      return;
    }
    if (!writer.current.hasChanges(fields)) {
      dirtyRef.current = false;
      clearNoteDraft(draftIdentity(writer.current.id || routeId));
      setSaveStatus("saved");
      return;
    }
    dirtyRef.current = true;
    // Browser storage can reject a large manuscript (quota/private mode).
    // Never imply that an unsaved local recovery copy exists in that case.
    // Protected writing may autosave to the authenticated API, but it must
    // never be mirrored into sessionStorage where another browser context
    // could recover plaintext outside the Vault boundary.
    if (isProtectedWriting) {
      clearNoteDraft(draftIdentity(writer.current.id || routeId));
      setLocalRecoveryFailed(false);
    } else {
      setLocalRecoveryFailed(!saveNoteDraft(draftIdentity(writer.current.id || routeId), fields));
    }
    const sequence = ++saveSeq.current;
    setSaveStatus(navigator.onLine ? "pending" : "offline");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      doSave({ noteId, title, html: latestHTML.current, folderId, mood, tags, entryDate, journalType, journalData, sequence });
    }, 900);
  }

  async function saveAsTemplate(fields) {
    if (!routeId || kind !== "NOTE" || isLocked || isWill || isTrashed) throw new Error("Only an ordinary saved note can become a writing template.");
    clearTimeout(saveTimer.current);
    const currentWriter = writer.current, sequence = saveSeq.current;
    if (dirtyRef.current) {
      setSaveStatus("saving");
      await currentWriter.save({ title, content: latestHTML.current, folderId: folderId || null, mood, tags, kind });
      if (!alive.current || currentWriter !== writer.current || sequence !== saveSeq.current) throw new Error("Your note changed while saving. Wait for Saved, then try again.");
      dirtyRef.current = false; setSaveStatus("saved");
    }
    return api.post("/writing-templates", { ...fields, sourceNoteId: routeId });
  }

  async function changeRecordStatus(field, next) {
    try {
      clearTimeout(saveTimer.current);
      const currentWriter = writer.current;
      const sequence = saveSeq.current;
      await currentWriter.save({ title, content: latestHTML.current, folderId: folderId || null, mood, tags, kind, ...(kind === "JOURNAL" && { entryDate, journalType, journalData }) });
      if (!alive.current || currentWriter !== writer.current) return;
      const note = await currentWriter.patchMetadata({ [field]: next });
      if (!alive.current || currentWriter !== writer.current) return;
      if (field === "isFavorite") setIsFavorite(Boolean(note.isFavorite));
      if (field === "isArchived") setIsArchived(Boolean(note.isArchived));
      setNoteMeta({ createdAt: note.createdAt, updatedAt: note.updatedAt });
      if (sequence === saveSeq.current) dirtyRef.current = false;
      if (!dirtyRef.current) setSaveStatus("saved");
      setSaveError("");
    } catch (error) { setSaveError(error.message); setSaveStatus("error"); }
  }

  async function moveToTrash() {
    if (!routeId) return;
    setTrashBusy(true);
    try {
      clearTimeout(saveTimer.current);
      const currentWriter = writer.current, sequence = saveSeq.current;
      await currentWriter.save({ title, content: latestHTML.current, folderId: folderId || null, mood, tags, kind, ...(kind === "JOURNAL" && { entryDate, journalType, journalData }) });
      if (!alive.current || currentWriter !== writer.current) return;
      if (sequence !== saveSeq.current) throw new Error("This record changed while saving. Wait for Saved before moving it to Trash.");
      await api.delete(`/notes/${routeId}`);
      if (!alive.current || currentWriter !== writer.current) return;
      dirtyRef.current = false;
      clearNoteDraft(draftIdentity(routeId));
      setTrashOpen(false);
      navigate(isLocked ? "/vault/documents?view=trash" : "/notes/trash", { replace: true });
    } catch (error) { if (alive.current) { setSaveError(error.message); setSaveStatus("error"); } } finally { if (alive.current) setTrashBusy(false); }
  }

  async function recoverTrashedRecord(permanent = false) {
    if (trashBusy || !routeId) return;
    setTrashBusy(true); setSaveError("");
    const currentWriter = writer.current;
    try {
      if (permanent) await api.delete(`/notes/${routeId}/permanent`);
      else await api.post(`/notes/${routeId}/restore`);
      if (!alive.current || currentWriter !== writer.current) return;
      if (permanent) clearNoteDraft(draftIdentity(routeId));
      setTrashOpen(false);
      if (permanent) navigate(isLocked ? "/vault/documents?view=trash" : "/notes/trash", { replace: true });
      else loadNote();
    } catch (error) {
      if (alive.current && currentWriter === writer.current) {
        if (error.requiresVault) { setTrashOpen(false); setVaultRequired(error.requiresVault); }
        else setSaveError(error.message);
      }
    }
    finally { if (alive.current) setTrashBusy(false); }
  }

  async function openHistory() {
    clearTimeout(saveTimer.current);
    const currentWriter = writer.current;
    const sequence = saveSeq.current;
    try {
      setSaveError("");
      const note = await currentWriter.save({ title, content: latestHTML.current, folderId: folderId || null, mood, tags, kind, ...(kind === "JOURNAL" && { entryDate, journalType, journalData }) });
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
      if (isTrashed) return;
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
  }, [focusMode, isTrashed]);

  function closeFindBar() {
    setFindOpen(false);
    editorRef.current?.findAll(""); // also clears any leftover match highlight
  }

  useEffect(() => {
    if (!loaded || isTrashed || vaultRequired || recoveryDraft) return;
    scheduleAutosave();
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, folderId, mood, tags, entryDate, journalType, journalData, loaded, isTrashed, isLocked, isWill, vaultRequired, recoveryDraft]);

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
      kind,
      ...(kind === "JOURNAL" && { entryDate, journalType, journalData }),
      draftForAttachment: true,
    });
    if (!alive.current || currentWriter !== writer.current) throw new Error("The open note changed. Return to the original note to attach this file.");
    setNoteId(note.id);
    const savedPath = kind === "JOURNAL" ? `/journal/entries/${note.id}` : `/notes/${note.id}${privateCreation ? "?workspace=vault" : ""}`;
    if (navigatedNoteId.current !== note.id && replaceSavedNote(savedPath)) {
      navigatedNoteId.current = note.id;
      createdNoteId.current = note.id;
    }
    return note.id;
  }

  // ---------------- attachments ----------------
  async function uploadOne(file, { inline, replace = false }) {
    const tempId = `${Date.now()}-${Math.random()}`;
    setUploading((u) => [...u, { tempId, name: file.name, mimeType: file.type, progress: 0 }]);
    try {
      const targetId = await ensureSaved();
      const { attachment } = await api.upload(`/notes/${targetId}/attachments`, file, (pct) =>
        setUploading((u) => u.map((x) => (x.tempId === tempId ? { ...x, progress: pct } : x)))
      );
      setUploading((u) => u.filter((x) => x.tempId !== tempId));
      setAttachments((prev) => prev.some(item => item.id === attachment.id) ? prev : [...prev, attachment]);
      if (inline) {
        if (replace) {
          if (!editorRef.current?.mediaReplace(attachment.url, attachment.originalName, replace)) setUploadError("The image was attached, but its original place in the document is no longer available. You can open it from the attachment list.");
        }
        else if (!editorRef.current?.insertImageBlock(attachment)) setUploadError("The image is attached, but we could not place it in the document. You can open it from the attachment list.");
      } else {
        if (!editorRef.current?.insertFileCard(attachment)) setUploadError("The file is attached, but we could not place it in the document. You can open it from the attachment list.");
      }
    } catch (err) {
      setUploading((u) => u.filter((x) => x.tempId !== tempId));
      if (replace) editorRef.current?.cancelMediaReplace(replace);
      setUploadError(err.message || "This file could not be uploaded.");
    }
  }

  async function removeAttachment(attachmentId) {
    const attachment = attachments.find(item => item.id === attachmentId);
    await api.delete(`/notes/attachments/${attachmentId}`);
    if (attachment) editorRef.current?.removeAttachmentReferences(attachment.url);
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }

  async function openInlineFile(value) {
    const name = storedMediaName(value);
    const attachment = attachments.find(item => storedMediaName(item.url) === name);
    if (!name || !attachment) { setUploadError("This file is no longer attached to this document."); return; }
    try { await downloadMedia(attachment.url, attachment.originalName); }
    catch (error) { setUploadError(error.message || "This file could not be opened. Retry from the attachment list."); }
  }

  function handleImagePicked(e) {
    const files = Array.from(e.target.files || []);
    const replace = replacingMedia.current;
    replacingMedia.current = null;
    if (replace && files[0]) uploadOne(files[0], { inline: true, replace });
    else {
      if (replace) editorRef.current?.cancelMediaReplace(replace);
      files.forEach((f) => uploadOne(f, { inline: true }));
    }
    e.target.value = "";
  }

  function handleFilePicked(e) {
    const files = Array.from(e.target.files || []);
    files.forEach((f) => uploadOne(f, { inline: false }));
    e.target.value = "";
  }

  // ---------------- insert menu (both the "+" button and "/" trigger) ----------------
  function openInsertMenuFromButton(trigger) {
    const rect = trigger?.getBoundingClientRect?.() || document.activeElement?.getBoundingClientRect?.() || { left: 200, bottom: 200 };
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
      const slashBlock = insertMenu.blockEl;
      slashBlock.textContent = "";
      // Clearing textContent detaches the old text node. Replace the editor's
      // saved range with a caret in the still-connected block before running
      // a command or opening the upload picker.
      const range = document.createRange();
      range.selectNodeContents(slashBlock);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      editorRef.current?.saveSelection();
      slashBlock.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setInsertMenu(null);

    if (block.needsFilePicker === "image") {
      if (replacingMedia.current) editorRef.current?.cancelMediaReplace(replacingMedia.current);
      replacingMedia.current = null;
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

  if (!loaded) return loadError ? <section><h1 className="page-title">Note unavailable</h1><p role="alert" className="my-4 text-danger">{loadError}</p><button className="btn-primary" onClick={loadNote}>Retry</button> <Link className="btn-outline" to="/notes/all">Back to notes</Link></section> : <div className="note-editor-shell"><div className="note-editor-document max-w-[820px] mx-auto" aria-busy="true"><div className="note-editor-topline"><span className="eyebrow">{kind === "JOURNAL" ? "JOURNAL ENTRY" : "NOTES / EDITOR"}</span></div><div className="note-editor-pending" role="status">Opening your writing securely…</div></div></div>;

  if (recoveryDraft) return <section className="note-draft-recovery" role="alertdialog" aria-labelledby="note-draft-recovery-title" aria-describedby="note-draft-recovery-description">
    <span className="eyebrow">UNSAVED WRITING</span>
    <h1 id="note-draft-recovery-title">Restore changes from this tab?</h1>
    <p id="note-draft-recovery-description">A local copy of this {kind === "JOURNAL" ? "journal entry" : "note"} was kept before the last save completed. Choose whether to restore it or continue with the saved version.</p>
    <p className="note-draft-recovery-time">Local copy from {new Date(recoveryDraft.savedAt).toLocaleString()}</p>
    <div className="note-draft-recovery-actions"><button type="button" className="btn-primary" autoFocus onClick={restoreDraft}>Restore local changes</button><button type="button" className="btn-outline" onClick={discardDraft}>Discard local copy</button></div>
  </section>;

  if (isTrashed) return <ProtectedContentBoundary enabled={isLocked || isWill} vault={isWill ? "will" : "locked-notes"} resourceNoteId={noteId} noteId={isLocked && !isWill ? noteId : undefined}>
    <section className="note-trash-review">
      <header><div><span className="eyebrow">{isLocked || isWill ? "PROTECTED TRASH" : "RECOVERABLE WRITING"}</span><h1 className="page-title">{title || "Untitled note"}</h1><p>This document is in Trash. Your writing is preserved; restore it before editing.</p></div><NavigationIcon name="archive" size={30} /></header>
      <div className="note-trash-summary"><span><NavigationIcon name={isLocked || isWill ? "shield" : "lock"} size={16} />{isLocked || isWill ? "Protected access remains required" : "Private · Previous share links revoked"}</span><span>{formatStats(stats) || "No written text"}</span>{folderId && <span>Original folder: {folders.find(folder => folder.id === folderId)?.name || "Saved folder"}</span>}</div>
      {saveError && <div className="inline-error" role="alert">{saveError}</div>}
      <div className="note-trash-actions"><button type="button" className="btn-primary" disabled={trashBusy} onClick={() => recoverTrashedRecord()}><NavigationIcon name="back" size={16} />{trashBusy && !trashOpen ? "Restoring…" : "Restore document"}</button><Link className="btn-outline" to={isLocked ? "/vault/documents?view=trash" : "/notes/trash"}>Return to Trash</Link><button type="button" className="note-trash-permanent" disabled={trashBusy} onClick={() => { setSaveError(""); setTrashOpen(true); }}><NavigationIcon name="trash" size={16} /> Delete permanently</button></div>
      <DocumentContent html={initialHTML} className="note-trash-document" />
      {attachments.length > 0 && <p className="note-trash-attachment-context">{attachments.length} {attachments.length === 1 ? "attachment is" : "attachments are"} preserved with this document. Restore it to manage files.</p>}
      <ConfirmDialog open={trashOpen} title="Delete this document permanently?" description="Its writing, history and attachment access will be removed. This cannot be undone." error={saveError} busy={trashBusy} confirmLabel="Delete permanently" onClose={() => setTrashOpen(false)} onConfirm={() => recoverTrashedRecord(true)} />
    </section>
  </ProtectedContentBoundary>;

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

  function jumpToHeading(index) {
    const heading = documentRef.current?.querySelectorAll('[contenteditable="true"] :is(h1,h2,h3,h4,h5,h6)')[index];
    if (!heading) return;
    heading.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    heading.closest('[contenteditable="true"]')?.focus({ preventScroll: true });
    const range = document.createRange(); range.selectNodeContents(heading); range.collapse(true);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
  }

  function openComments() {
    setCommentQuote(commentSelectionRef.current || editorRef.current?.getSelectionQuote() || "");
    commentSelectionRef.current = "";
    setCommentsOpen(true);
  }

  return (
    <ProtectedContentBoundary enabled={isLocked || isWill} vault={isWill ? "will" : "locked-notes"} resourceNoteId={noteId} noteId={isLocked && !isWill ? noteId : undefined}><div className={`note-editor-shell ${focusMode ? "fixed inset-0 z-50 bg-app-bg overflow-y-auto px-4 sm:px-6 md:px-10 py-6 is-focus" : ""}`}>
      <div ref={documentRef} onClick={handleContentClick} className="note-editor-document max-sm:pb-16 mx-auto">
        <div className="note-editor-topline">
          <span className="eyebrow">
            {isWill ? "WILL & INHERITANCE" : isLocked ? "PROTECTED NOTE" : kind === "JOURNAL" ? "JOURNAL ENTRY" : "YOUR WRITING"}
          </span>
          <div className="note-document-actions print:hidden">
            <button type="button" className="note-focus-action note-insights-action" aria-haspopup="dialog" aria-expanded={insightsOpen} aria-label="Document insights" onClick={() => setInsightsOpen(true)}><NavigationIcon name="chart" size={18} /><span>Insights</span></button>
            {noteId && <button type="button" className="note-focus-action note-comments-action" aria-haspopup="dialog" aria-expanded={commentsOpen} aria-label="Document discussion" onPointerDown={() => { commentSelectionRef.current = editorRef.current?.getSelectionQuote() || ""; }} onClick={openComments}><NavigationIcon name="comment" size={18} /><span>Comments</span></button>}
            <button type="button" className="note-focus-action note-focus-mode-action" aria-pressed={focusMode} aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"} onClick={() => setFocusMode(value => !value)}><NavigationIcon name="focus" size={18} /><span>{focusMode ? "Exit focus" : "Focus"}</span></button>
            {routeId && (
              <ExportMenu
                compact
                triggerRef={exportTriggerRef}
                note={{ title, content: latestHTML.current, tags, createdAt: noteMeta.createdAt, updatedAt: noteMeta.updatedAt }}
              />
            )}
            {routeId && !isWill && !isLocked && (
              <ShareMenu
                noteId={routeId}
                title={title || "Untitled note"}
                shareEnabled={shareState.shareEnabled}
                shareToken={shareState.shareToken}
                onChange={setShareState}
              />
            )}
            {routeId && <button type="button" className="note-focus-action note-history-action" aria-label="Version history" onClick={openHistory}><NavigationIcon name="clock" size={17} /><span>History</span></button>}
            <NoteOptionsMenu
              routeId={routeId}
              isOwner
              isWill={isWill}
              isLocked={isLocked}
              onToggleFind={() => setFindOpen((o) => !o)}
              onOpenHistory={openHistory}
              onOpenInsights={() => setInsightsOpen(true)}
              onOpenExport={routeId ? () => exportTriggerRef.current?.click() : undefined}
              onDuplicate={duplicateNote}
              onSaveAsTemplate={kind === "NOTE" && !isLocked && !isWill && !isTrashed ? () => setSaveTemplateOpen(true) : undefined}
              onToggleLock={toggleLock}
              isFavorite={isFavorite}
              isArchived={isArchived}
              onToggleFavorite={() => changeRecordStatus("isFavorite", !isFavorite)}
              onToggleArchive={() => changeRecordStatus("isArchived", !isArchived)}
              onMoveToTrash={() => { setSaveError(""); setTrashOpen(true); }}
              focusMode={focusMode}
              onToggleFocusMode={() => setFocusMode((f) => !f)}
            />
            <span className="note-save-status"><SaveStatus status={saveStatus} error={saveError} compact /></span>
          </div>
        </div>
        {(["conflict", "error", "offline"].includes(saveStatus) || (localRecoveryFailed && dirtyRef.current)) && <div className="note-save-feedback print:hidden" role="alert">
          <div><strong>{saveStatus === "conflict" ? "Your writing needs review" : ["error", "offline"].includes(saveStatus) ? "Your changes are not saved yet" : "Local recovery is unavailable"}</strong><p>{["conflict", "error", "offline"].includes(saveStatus) ? saveError || "Keep this page open while you retry or download your work." : "This draft exceeds your browser's local storage capacity. Keep this page open until it says Saved, or download a copy."}{localRecoveryFailed && ["conflict", "error", "offline"].includes(saveStatus) && " A local recovery copy could not be kept on this device."}</p></div>
          <div className="note-save-feedback-actions">{["error", "offline"].includes(saveStatus) && <button type="button" onClick={scheduleAutosave}>Retry save</button>}{recoveredNoteId && ["conflict", "error", "offline"].includes(saveStatus) && <a target="_blank" rel="noopener noreferrer" href={kind === "JOURNAL" ? `/journal/entries/${encodeURIComponent(recoveredNoteId)}` : `/notes/${encodeURIComponent(recoveredNoteId)}`}>Open saved version</a>}<button type="button" onClick={downloadUnsavedWriting}>Download backup</button></div>
        </div>}

        <details className="note-document-details" open={kind === "JOURNAL" || undefined}>
          <summary><span><NavigationIcon name="folder" size={16} />{folderNames.get(folderId) || "Unfiled"}{tags.length > 0 && <small>· {tags.length} {tags.length === 1 ? "subject" : "subjects"}</small>}</span><span>Document details <NavigationIcon name="down" size={14} /></span></summary>
        <div className="note-editor-meta">
          <label className="note-folder-picker"><NavigationIcon name="folder" size={15} /><span>Folder</span><select value={folderId} onChange={(e) => setFolderId(e.target.value)} aria-label="Document folder">
            <option value="">Unfiled</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {folderNames.get(f.id) || f.name}
              </option>
            ))}
          </select></label>
          <label className="note-mood-picker"><span>Context</span><select value={mood} onChange={(e) => setMood(e.target.value)} aria-label="Writing context">
            <option value="">None</option>
            <option value="happy">Positive</option>
            <option value="focused">Focused</option>
            <option value="tired">Tired</option>
            <option value="stressed">Under pressure</option>
            <option value="grateful">Grateful</option>
          </select></label>
          {kind === "JOURNAL" && <label className="chip bg-app-panel2 journal-date-chip">Entry date <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></label>}
          <DocumentTagPicker tags={tags} onChange={setTags} />
        </div>
        </details>

        {kind === "JOURNAL" && <JournalContextPanel type={journalType} data={journalData} onTypeChange={value => { setJournalType(value); setJournalData({}); }} onChange={setJournalData} />}

        <textarea
          ref={titleRef}
          rows={1}
          aria-label="Record title" className="note-editor-title page-title"
          placeholder={kind === "JOURNAL" ? "Give this day a title…" : "Untitled note"}
          value={title}
          onChange={(e) => setTitle(e.target.value.replace(/[\r\n]+/g, " "))}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); editorRef.current?.focus(); } }}
        />

        <AttachmentList attachments={attachments} uploading={uploading} onRemove={removeAttachment} recoverable={!isLocked && !isWill} />
        {uploadError && <div className="inline-error" role="alert"><span>{uploadError}</span><button type="button" onClick={() => setUploadError("")}>Dismiss</button></div>}
        {actionError && <div className="inline-error" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError("")}>Dismiss</button></div>}

        {findOpen && <FindReplaceBar editorRef={editorRef} onClose={closeFindBar} />}

        <div className="note-editor-writing-layout">
          <aside className="note-editor-outline-rail" aria-label="Document navigation">
            <span className="eyebrow">Document outline</span>
            {stats.headingsOutline?.length ? <nav aria-label="Jump to document heading">{stats.headingsOutline.map((heading, index) => <button key={`${index}-${heading.text}`} type="button" className="note-outline-heading" style={{ paddingInlineStart: `${5 + Math.max(0, Number(heading.level || 1) - 1) * 10}px` }} onClick={() => jumpToHeading(index)}><span>H{heading.level}</span>{heading.text || "Untitled heading"}</button>)}</nav> : <p className="note-outline-empty">Headings will give this document a navigable outline as it grows.</p>}
            <div className="note-outline-actions"><button type="button" onClick={() => setInsightsOpen(true)}><NavigationIcon name="chart" size={17} /> Document info</button>{noteId && <button type="button" onPointerDown={() => { commentSelectionRef.current = editorRef.current?.getSelectionQuote() || ""; }} onClick={openComments}><NavigationIcon name="comment" size={17} /> Discussion</button>}{routeId && <button type="button" onClick={openHistory}><NavigationIcon name="clock" size={17} /> Version history</button>}</div>
          </aside>
          <div className="note-editor-writing-column">
            <EditorToolbar editorRef={editorRef} formatState={formatState} historyState={editorHistory} onOpenInsertMenu={openInsertMenuFromButton} />
            <PaginatedEditor
            ref={editorRef}
            initialHTML={initialHTML}
            placeholder={kind === "JOURNAL" ? "What happened, what mattered, and what do you want to remember?" : "Start writing, or type / for commands…"}
            fontSize={editorFontSize}
            onChange={(html) => {
              latestHTML.current = html;
              clearTimeout(statsTimer.current);
              statsTimer.current = setTimeout(() => { if (alive.current) setStats(computeStats(latestHTML.current)); }, 250);
              scheduleAutosave();
            }}
            onSelectionChange={setFormatState}
            onHistoryChange={setEditorHistory}
            onFileOpen={openInlineFile}
            onSlash={handleSlash}
            onNoteLink={handleNoteLink}
            onImageDrop={(files) => files.forEach((f) => uploadOne(f, { inline: true }))}
            onTableFocus={setTableToolbarRect}
            onMediaFocus={(rect, state) => setMediaToolbar(rect ? { rect, state } : null)}
            />

            {stats.words > 0 && (
              <button type="button" className="note-writing-statistics" aria-haspopup="dialog" aria-label="Open document statistics" onClick={() => setInsightsOpen(true)}>{formatStats(stats)} <NavigationIcon name="chart" size={14} /></button>
            )}
            <DocumentPosition documentRef={documentRef} documentKey={noteId || "new"} focusMode={focusMode} />
          </div>
        </div>

        {backlinks.length > 0 && (
          <div className="border-t border-app-border mt-5 pt-4">
            <p className="text-[11px] font-bold text-ink-muted mb-2 tracking-wide">LINKED FROM</p>
            <div className="flex flex-col gap-1">
              {backlinks.map((b) => (
                <Link key={b.id} to={b.kind === "JOURNAL" ? `/journal/entries/${b.id}` : `/notes/${b.id}`} className="text-[12px] text-accent-notes hover:underline">
                  {b.title || "Untitled"}
                </Link>
              ))}
            </div>
          </div>
        )}

        <TableToolbar rect={tableToolbarRect} editorRef={editorRef} />
        <MediaToolbar rect={mediaToolbar?.rect} state={mediaToolbar?.state || { align: "center", size: "wide" }} onAlign={align => editorRef.current?.mediaAlign(align)} onSize={size => editorRef.current?.mediaSize(size)} onMove={direction => editorRef.current?.mediaMove(direction)} onReplace={() => { const token = editorRef.current?.prepareMediaReplace(); if (!token) return; replacingMedia.current = token; imageInputRef.current?.click(); }} onRemove={() => { editorRef.current?.mediaRemove(); setMediaToolbar(null); }} onClose={() => { editorRef.current?.focusActiveMedia(); setMediaToolbar(null); }} />

        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePicked} onCancel={() => { if (replacingMedia.current) editorRef.current?.cancelMediaReplace(replacingMedia.current); replacingMedia.current = null; }} />
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
        <DocumentInsights open={insightsOpen} onClose={() => setInsightsOpen(false)} stats={stats} note={{ title, createdAt: noteMeta.createdAt, updatedAt: noteMeta.updatedAt, isLocked: isLocked || isWill, shareEnabled: shareState.shareEnabled }} attachmentCount={attachments.length} saveStatus={saveStatus} onOpenHistory={routeId ? openHistory : undefined} onNavigateHeading={index => {
          setInsightsOpen(false); requestAnimationFrame(() => jumpToHeading(index));
        }} />
        <NoteComments open={commentsOpen} noteId={noteId} quote={commentQuote} onClose={() => setCommentsOpen(false)} />
        <ConfirmDialog open={trashOpen} title="Move this record to Trash?" description="You can restore it from Trash later. Any public share link will be revoked." error={saveError} confirmLabel="Move to Trash" busy={trashBusy} onClose={() => setTrashOpen(false)} onConfirm={moveToTrash} />
        <SaveTemplateDialog open={saveTemplateOpen} title={title} onClose={() => setSaveTemplateOpen(false)} onSave={saveAsTemplate} />
      </div>
    </div></ProtectedContentBoundary>
  );
}
