import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApiQuery } from "../../hooks/useApiQuery";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import AuthImage from "../../components/AuthImage";
import ImageLightbox from "../../components/ImageLightbox";
import FileDownload from "../../components/FileDownload";
import { downloadMedia, resolveMediaUrl } from "../../utils/media";
import { recordPath } from "../../utils/noteCollection.js";
import "./filesWorkspace.css";
import "./connectedFiles.css";

function fileType(mime = "") {
  if (mime.startsWith("image/")) return "Image";
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.startsWith("video/")) return "Video";
  if (/sheet|excel|csv/.test(mime)) return "Spreadsheet";
  if (/presentation|powerpoint/.test(mime)) return "Presentation";
  return "Document";
}
function sizeLabel(bytes = 0) { return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }
function dateLabel(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat(undefined, { day:"numeric", month:"short", year:"numeric" }).format(date); }
const previewable = mime => mime === "application/pdf" || mime === "text/plain" || mime === "text/csv" || /^(audio|video)\/[a-z0-9.+-]+$/i.test(mime || "");

export default function ConnectedFiles() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const kind = searchParams.get("kind") || "all";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const [draft, setDraft] = useState(q);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const previewRef = useRef(null);
  const result = useApiQuery("/files/connected", { page, ...(q && { q }), ...(kind !== "all" && { kind }) });
  const items = result.data?.items || [];
  const images = items.filter(item => item.mimeType?.startsWith("image/"));
  useEffect(() => { setDraft(q); }, [q]);
  useEffect(() => { if (draft === q) return undefined; const timer = setTimeout(() => setSearchParams(previous => { const next = new URLSearchParams(previous); if (draft.trim()) next.set("q", draft.trim()); else next.delete("q"); next.delete("page"); return next; }, { replace:true }), 230); return () => clearTimeout(timer); }, [draft, q, setSearchParams]);
  useEffect(() => { if (preview && !previewRef.current?.open) previewRef.current?.showModal(); }, [preview]);
  function updateParam(key, value) { setSearchParams(previous => { const next = new URLSearchParams(previous); if (value && value !== "all") next.set(key, value); else next.delete(key); next.delete("page"); return next; }); }
  function goPage(nextPage) { setSearchParams(previous => { const next = new URLSearchParams(previous); if (nextPage > 1) next.set("page", String(nextPage)); else next.delete("page"); return next; }); }
  async function open(item) {
    setError("");
    if (item.mimeType?.startsWith("image/")) { setLightboxIndex(images.findIndex(image => image.id === item.id)); return; }
    try {
      if (!previewable(item.mimeType)) return await downloadMedia(item.url, item.name);
      const url = new URL(await resolveMediaUrl(item.url), window.location.href);
      url.searchParams.set("preview", "1");
      setPreview({ ...item, previewUrl:url.href });
    } catch (failure) { setError(`“${item.name}” could not be opened. ${failure.message}`); }
  }

  return <div className="connected-files-workspace notes-surface">
    <header className="product-page-header"><div><span className="eyebrow">NOTES / FILES / CONNECTED WORK</span><h1 className="page-title">Files in documents</h1><p>Find the source, image, or reference alongside the writing that gives it meaning.</p></div><div className="product-page-actions"><Link to="/notes/new" className="btn-primary"><NavigationIcon name="plus" size={17} /> New note</Link></div></header>
    <nav className="files-view-nav" aria-label="File collections"><Link to="/notes/files"><NavigationIcon name="folder" size={16} /> My files</Link><Link to="/notes/files/connected" aria-current="page"><NavigationIcon name="note" size={16} /> In documents</Link><Link to="/notes/files/trash"><NavigationIcon name="trash" size={16} /> Trash</Link></nav>
    <div className="connected-files-intro"><span className="connected-files-intro-icon"><NavigationIcon name="link" size={24} /></span><div><span className="eyebrow">KEEP THE PROVENANCE</span><h2>Every file has a place in the story.</h2><p className="connected-files-intro-desktop">Open the original document to see the surrounding thought. Locked, estate, and deleted documents stay outside this collection.</p><p className="connected-files-intro-mobile">Open the source. Private writing stays private.</p></div><strong>{result.data ? `${result.data.total} connected ${result.data.total === 1 ? "file" : "files"}` : "Document context"}</strong></div>
    {result.error && <div className="inline-error" role="alert"><span>{result.data ? "Cached results remain visible. " : "Document files could not be opened. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div>}
    <div className="connected-files-controls"><label><NavigationIcon name="search" size={18} /><input aria-label="Search document files" placeholder="Search file or document names…" maxLength={120} value={draft} onChange={event => setDraft(event.target.value)} />{draft && <button type="button" aria-label="Clear file search" onClick={() => { setDraft(""); updateParam("q", ""); }}><NavigationIcon name="close" size={15} /></button>}</label><select aria-label="Filter document file type" value={kind} onChange={event => updateParam("kind", event.target.value)}><option value="all">All types</option><option value="images">Images</option><option value="pdf">PDFs</option><option value="documents">Documents</option><option value="spreadsheets">Spreadsheets</option><option value="presentations">Presentations</option><option value="audio">Audio</option><option value="video">Video</option></select></div>
    <section className="connected-files-results" aria-label="Files in accessible documents"><header><div><span className="eyebrow">DOCUMENT LIBRARY</span><h2>{q || kind !== "all" ? "Matching references" : "The material behind your writing"}</h2></div><span>{result.data ? `${result.data.total} ${result.data.total === 1 ? "result" : "results"}` : "Your files"}</span></header>
      {result.data && !items.length && <div className="connected-files-empty"><span><NavigationIcon name={q || kind !== "all" ? "search" : "files"} size={29} /></span><h3>{q || kind !== "all" ? "No files match this view." : "Your writing is ready for references."}</h3><p>{q || kind !== "all" ? "Try a different name or file type. Private and deleted documents remain excluded." : "Add an image or document inside a note, and its origin will be easy to find here."}</p>{q || kind !== "all" ? <button type="button" onClick={() => { setDraft(""); setSearchParams(new URLSearchParams(), { replace:true }); }}>Clear filters</button> : <Link to="/notes/all">Open your writing <NavigationIcon name="chevron" size={15} /></Link>}</div>}
      {items.length > 0 && <div className="connected-files-list">{items.map(item => <article className="connected-file" key={item.id}><button type="button" className="connected-file-visual" onClick={() => open(item)} aria-label={`${previewable(item.mimeType) || item.mimeType?.startsWith("image/") ? "Preview" : "Download"} ${item.name}`}>{item.mimeType?.startsWith("image/") ? <AuthImage src={item.url} alt="" /> : <NavigationIcon name={item.mimeType?.startsWith("video/") ? "play" : item.mimeType?.startsWith("image/") ? "image" : "files"} size={26} />}</button><div className="connected-file-copy"><span className="eyebrow">{fileType(item.mimeType)} · {sizeLabel(item.sizeBytes)}</span><h3>{item.name}</h3><p><NavigationIcon name={item.note?.kind === "JOURNAL" ? "book" : "note"} size={14} /> In <Link to={recordPath(item.note)}>{item.note?.title || "Untitled document"}</Link>{item.note?.folder?.name ? ` · ${item.note.folder.name}` : ""}{item.note?.isArchived ? " · Archived" : ""}</p></div><div className="connected-file-date">Added {dateLabel(item.createdAt)}</div><div className="connected-file-actions"><button type="button" onClick={() => open(item)}>{previewable(item.mimeType) || item.mimeType?.startsWith("image/") ? "Preview" : "Open"}</button><FileDownload url={item.url} name={item.name} className="connected-file-download"><NavigationIcon name="download" size={16} /> Download</FileDownload></div></article>)}</div>}
    </section>
    {result.data && result.data.pages > 1 && <nav className="connected-files-pages" aria-label="Document file pages"><span>Page {page} of {result.data.pages}</span><div><button type="button" disabled={page <= 1} onClick={() => goPage(page - 1)}>Previous</button><button type="button" disabled={page >= result.data.pages} onClick={() => goPage(page + 1)}>Next</button></div></nav>}
    {lightboxIndex !== null && <ImageLightbox images={images} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />}
    {preview && <dialog ref={previewRef} className="file-preview-dialog" aria-label={`Preview ${preview.name}`} onCancel={event => { event.preventDefault(); setPreview(null); }} onClose={() => setPreview(null)}><header><div><span className="eyebrow">DOCUMENT FILE</span><h2>{preview.name}</h2></div><div><FileDownload url={preview.url} name={preview.name} className="btn-outline">Download</FileDownload><button type="button" className="btn-outline" onClick={() => setPreview(null)}>Close</button></div></header><div className="files-preview-body">{preview.mimeType.startsWith("audio/") ? <audio controls src={preview.previewUrl} aria-label={`Audio preview of ${preview.name}`} /> : preview.mimeType.startsWith("video/") ? <video controls playsInline src={preview.previewUrl} aria-label={`Video preview of ${preview.name}`} /> : <iframe title={`Preview of ${preview.name}`} src={preview.previewUrl} />}</div></dialog>}
  </div>;
}
