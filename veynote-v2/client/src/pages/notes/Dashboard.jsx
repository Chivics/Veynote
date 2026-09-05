import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import StatCard from "../../components/StatCard";
import TemplateMenu from "../../components/TemplateMenu";
import EmptyState from "../../components/EmptyState";

export default function NotesDashboard() {
  const { user } = useAuth();
  const [notes, setNotes] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/notes", { scope: "all" }).then((d) => setNotes(d.notes));
    api.get("/analytics/notes").then(setStats);
  }, []);

  const pinned = notes?.filter((n) => n.isPinned) || [];
  const recent = (notes || []).slice(0, 6);

const hour = new Date().getHours();
const greeting =
  hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  console.log("USER OBJECT:", user);

return (
  <div>
    <div className="flex items-end justify-between gap-6 mb-7">
      <div>
        <span className="eyebrow">
          {new Date().toDateString().toUpperCase()}
        </span>

        <h1 className="text-[30px] tracking-tight my-1.5">
          {`${greeting}, ${user?.name}`}
        </h1>
          <p className="text-ink-muted text-[13px] m-0 max-w-[520px]">Here's where your journal stands today.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TemplateMenu />
          <Link to="/notes/new" className="btn-primary">+ New note</Link>
        </div>
      </div>

      <div className="rounded-2xl p-5 flex items-center gap-3.5 mb-7 border border-app-border bg-gradient-to-br from-app-panel to-accent-notes-soft">
        <div className="w-[38px] h-[38px] rounded-xl bg-accent-notes-soft text-[#a89fff] flex items-center justify-center text-base shrink-0">✨</div>
        <div>
          <strong className="block text-[13.5px] mb-0.5">What are you working on?</strong>
          <span className="text-[11.5px] text-ink-muted">Start a note, capture a reminder, or reflect on today.</span>
        </div>
        <div className="ml-auto flex gap-2 shrink-0">
          <Link to="/notes/new" className="chip hover:bg-app-border">✎ New note</Link>
          <Link to="/notes/calendar" className="chip hover:bg-app-border">☀ Today</Link>
          <Link to="/notes/search" className="chip hover:bg-app-border">◎ Search</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-7">
        <StatCard label="Total notes" value={stats?.hasData ? stats.totalNotes : "0"} />
        <StatCard label="This month" value={stats?.hasData ? stats.notesThisMonth : "0"} hint="entries" />
        <StatCard label="Folders" value={notes ? new Set(notes.map((n) => n.folderId).filter(Boolean)).size : "0"} />
        <StatCard label="Favorites" value={notes ? notes.filter((n) => n.isFavorite).length : "0"} />
      </div>

      {pinned.length > 0 && (
        <>
          <div className="flex items-end justify-between mb-3.5">
            <div>
              <span className="eyebrow">PINNED</span>
              <h2 className="text-[15.5px] mt-1 mb-0">Pinned notes</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-7">
            {pinned.map((n) => (
              <NoteCard key={n.id} note={n} />
            ))}
          </div>
        </>
      )}

      <div className="flex items-end justify-between mb-3.5">
        <div>
          <span className="eyebrow">RECENT</span>
          <h2 className="text-[15.5px] mt-1 mb-0">Recent notes</h2>
        </div>
        <Link to="/notes/all" className="text-ink-soft text-[11.5px]">View all →</Link>
      </div>

      {notes === null ? (
        <p className="text-ink-muted text-[12px]">Loading…</p>
      ) : recent.length === 0 ? (
        <div className="grid grid-cols-1">
          <EmptyState
            icon="📓"
            title="No notes yet."
            description="Write your first one to see it here."
            action={<Link to="/notes/new" className="btn-primary">Write your first note</Link>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recent.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note }) {
  return (
    <Link to={`/notes/${note.id}`} className="card p-4 block hover:border-ink-muted transition">
      <div className="flex justify-between items-center mb-3">
        <span className="type-pill">Note</span>
        <span className="text-[10px] text-ink-muted">{new Date(note.entryDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      </div>
      <h3 className="text-[14px] m-0 mb-1.5 tracking-tight">{note.title}</h3>
      <p className="text-[11.5px] leading-relaxed text-ink-muted m-0 mb-3 line-clamp-2">
        {stripHtml(note.content).slice(0, 140) || "No content yet."}
      </p>
      <div className="border-t border-app-border pt-2.5 flex justify-between items-center">
        <div>
          {note.tags?.map((t) => (
            <span key={t} className="text-[10px] text-ink-muted mr-1.5">#{t}</span>
          ))}
        </div>
        {note.isFavorite && <span>♥</span>}
      </div>
    </Link>
  );
}

function stripHtml(html) {
  return html?.replace(/<[^>]*>/g, " ") || "";
}
