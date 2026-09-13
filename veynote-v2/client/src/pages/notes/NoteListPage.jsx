import PageSkeleton from "../../components/PageSkeleton.jsx";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import EmptyState from "../../components/EmptyState";
import { useApiQuery } from "../../hooks/useApiQuery";

const SCOPE_COPY = {
  all: { title: "All notes", eyebrow: "JOURNAL", empty: "No notes yet", emptyDesc: "Your written moments will show up here." },
  favorites: { title: "Favorites", eyebrow: "PINNED", empty: "No favorites yet", emptyDesc: "Tap the heart on any note to pin it here." },
  archive: { title: "Archive", eyebrow: "STORED", empty: "Nothing archived", emptyDesc: "Notes you archive will be kept here, out of your main list." },
  trash: { title: "Trash", eyebrow: "RECENTLY DELETED", empty: "Trash is empty", emptyDesc: "Deleted notes stay here for 30 days before they're gone for good." },
  folder: { title: "Folder", eyebrow: "FOLDER", empty: "No notes in this folder yet", emptyDesc: "Move or create a note here to get started." },
  tag: { title: "Tag", eyebrow: "TAG", empty: "No notes with this tag yet", emptyDesc: "" },
  search: { title: "Search", eyebrow: "SEARCH", empty: "No results", emptyDesc: "Try a different keyword." },
};

// scope: "all" | "favorites" | "archive" | "trash" | "folder" | "tag" | "search"
export default function NoteListPage({ scope }) {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [folder, setFolder] = useState(null);
  const [q, setQ] = useState(searchParams.get("q") || "");

  const copy = SCOPE_COPY[scope];
  const folderId = params.folderId;
  const tag = params.tag;
  const [searchQuery, setSearchQuery] = useState(q);
  useEffect(() => { const timer = setTimeout(() => setSearchQuery(q), 200); return () => clearTimeout(timer); }, [q]);
  const query = {};
  if (["favorites", "archive", "trash"].includes(scope)) query.scope = scope;
  else query.scope = "all";
  if (scope === "folder") query.folderId = folderId;
  if (scope === "tag") query.tag = tag;
  if (scope === "search") query.q = searchQuery;
  const result = useApiQuery("/notes", query);
  const notes = result.data?.notes ?? null;

  useEffect(() => {
    let active = true;
    setFolder(api.peek("/folders")?.folders.find(f => f.id === folderId) || null);
    if (scope === "folder") {
      api.get("/folders").then((d) => { if (active) setFolder(d.folders.find((f) => f.id === folderId)); }).catch(() => {});
    }
    return () => { active = false; };
  }, [scope, folderId]);

  async function toggleFavorite(note) {
    await api.patch(`/notes/${note.id}`, { isFavorite: !note.isFavorite });
    await result.refresh();
  }

  async function restoreNote(note) {
    await api.post(`/notes/${note.id}/restore`);
    await result.refresh();
  }

  async function deleteForever(note) {
    if (!confirm("Delete this note permanently? This can't be undone.")) return;
    await api.delete(`/notes/${note.id}`);
    await result.refresh();
  }

  const title = scope === "folder" ? folder?.name || "Folder" : scope === "tag" ? `#${tag}` : copy.title;

  return (
    <div>
      {result.error && <p role="alert" className="text-danger text-sm mb-3">{result.error.message} <button className="underline" onClick={() => result.refresh().catch(() => {})}>Retry</button></p>}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <span className="eyebrow">{copy.eyebrow}</span>
          <h1 className="page-title text-[22px] sm:text-[30px] tracking-tight my-1.5 break-words">{title}</h1>
          <p className="text-ink-muted text-[13px] m-0">{notes ? `${notes.length} total` : ""}</p>
        </div>
        <Link to="/notes/new" className="btn-primary shrink-0">+ New note</Link>
      </div>

      {scope === "search" && (
        <div className="input flex items-center gap-2 mb-6">
          ◎
          <input
            className="bg-transparent outline-none flex-1 text-ink placeholder:text-ink-muted"
            placeholder="Search title, content, tags…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSearchParams(e.target.value ? { q: e.target.value } : {});
            }}
            autoFocus
          />
        </div>
      )}

      {notes === null ? (
        <PageSkeleton compact />
      ) : notes.length === 0 ? (
        <div className="grid grid-cols-1">
          <EmptyState icon="📓" title={copy.empty} description={copy.emptyDesc} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {notes.map((note) => (
            <div key={note.id} className="card p-4">
              <Link to={scope === "trash" ? "#" : `/notes/${note.id}`} className="block">
                <div className="flex justify-between items-center mb-3">
                  <span className="type-pill">Note</span>
                  <span className="text-[10px] text-ink-muted">
                    {new Date(note.entryDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                <h3 className="text-[14px] m-0 mb-1.5 tracking-tight">{note.title}</h3>
                <p className="text-[11.5px] leading-relaxed text-ink-muted m-0 mb-3 line-clamp-2">
                  {(note.content || "").replace(/<[^>]*>/g, " ").slice(0, 140) || "No content yet."}
                </p>
              </Link>
              <div className="border-t border-app-border pt-2.5 flex justify-between items-center">
                <div>
                  {note.folder && <span className="text-[10px] text-ink-muted mr-1.5">📁 {note.folder.name}</span>}
                  {note.tags?.map((t) => (
                    <span key={t} className="text-[10px] text-ink-muted mr-1.5">#{t}</span>
                  ))}
                </div>
                {scope === "trash" ? (
                  <div className="flex gap-2">
                    <button onClick={() => restoreNote(note)} className="text-[10.5px] text-accent-notes font-semibold">Restore</button>
                    <button onClick={() => deleteForever(note)} className="text-[10.5px] text-danger font-semibold">Delete forever</button>
                  </div>
                ) : (
                  <button onClick={() => toggleFavorite(note)}>{note.isFavorite ? "♥" : "♡"}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
