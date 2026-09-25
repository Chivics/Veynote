import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import TemplateMenu from "../../components/TemplateMenu";
import EmptyState from "../../components/EmptyState";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";

function stripHtml(html) { return html?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || ""; }
function shortDate(value) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

function NoteCard({ note, featured = false }) {
  return <Link to={`/notes/${note.id}`} className={`record-card ${featured ? "is-featured" : ""}`}>
    <div className="record-card-meta"><span className="type-pill">{note.isPinned ? "Pinned note" : "Note"}</span><time>{shortDate(note.entryDate)}</time></div>
    <h3>{note.title || "Untitled note"}</h3>
    <p>{stripHtml(note.content).slice(0, featured ? 230 : 145) || "Open this note and begin writing."}</p>
    <div className="record-card-footer">
      <span>{note.folder?.name ? <><NavigationIcon name="folder" size={13} /> {note.folder.name}</> : "Personal record"}</span>
      <span>{note.tags?.slice(0, 2).map(tag => <i key={tag}>#{tag}</i>)}</span>
      <NavigationIcon name="chevron" size={15} />
    </div>
  </Link>;
}

export default function NotesDashboard() {
  const { user } = useAuth();
  const [notes, setNotes] = useState(() => api.peek("/notes", { scope: "all" })?.notes ?? null);
  const [stats, setStats] = useState(() => api.peek("/analytics/notes") ?? null);
  const [notesError, setNotesError] = useState("");
  const [statsError, setStatsError] = useState("");

  function loadNotes(force = false) {
    setNotesError("");
    api.get("/notes", { scope: "all" }, { force }).then((data) => setNotes(data.notes))
      .catch((error) => setNotesError(error.message || "Your notes could not be loaded."));
  }
  function loadStats(force = false) {
    setStatsError("");
    api.get("/analytics/notes", undefined, { force }).then(setStats)
      .catch((error) => setStatsError(error.message || "Note statistics could not be loaded."));
  }
  useEffect(() => { loadNotes(); loadStats(); }, []);

  const pinned = notes?.filter(note => note.isPinned) ?? [];
  const recent = (notes ?? []).slice(0, 6);
  const continuation = pinned[0] || recent[0] || null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.name?.split(" ")[0] || "there";
  const folderCount = notes ? new Set(notes.map(note => note.folderId).filter(Boolean)).size : "—";
  const favoriteCount = notes ? notes.filter(note => note.isFavorite).length : "—";

  return <div className="notes-home">
    <header className="product-page-header">
      <div><span className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span><h1 className="page-title">{greeting}, {firstName}</h1><p>Your records are ready when you are. Capture something new or continue where you left off.</p></div>
      <div className="product-page-actions"><TemplateMenu /><Link to="/notes/new" className="btn-primary"><NavigationIcon name="plus" size={16} /> New note</Link></div>
    </header>

    {notesError && <div className="inline-error" role="alert"><span>Notes are unavailable: {notesError}</span><button type="button" onClick={() => loadNotes(true)}>Retry notes</button></div>}
    {statsError && <div className="inline-error" role="alert"><span>Overview statistics are unavailable: {statsError}</span><button type="button" onClick={() => loadStats(true)}>Retry statistics</button></div>}

    <section className="capture-stage" aria-labelledby="capture-heading">
      <div className="capture-stage-copy"><span className="eyebrow">Quick capture</span><h2 id="capture-heading">Turn a thought into a useful record.</h2><p>Write freely now. Organize, connect, and revisit it when the context matters.</p><div><Link to="/notes/new" className="capture-primary"><NavigationIcon name="note" size={17} /> Start writing</Link><Link to="/journal"><NavigationIcon name="sun" size={16} /> Today’s journal</Link><Link to="/notes/tasks"><NavigationIcon name="tasks" size={16} /> Add a task</Link></div></div>
      <div className="capture-stage-continuation">
        <div className="continuation-label"><span><i /> Resume</span><small>{continuation ? `Updated ${shortDate(continuation.updatedAt || continuation.entryDate)}` : "Your next record"}</small></div>
        {continuation ? <><h3>{continuation.title || "Untitled note"}</h3><p>{stripHtml(continuation.content).slice(0, 180) || "Continue shaping this note."}</p><Link to={`/notes/${continuation.id}`}>Continue writing <NavigationIcon name="chevron" size={14} /></Link></> : notes === null ? <><h3>Your workspace</h3><p>{notesError ? "Recent records could not be opened. Try again above." : "Opening your recent records…"}</p></> : <><h3>Your workspace starts here</h3><p>Create your first note. Veynote will preserve it here so you can resume naturally.</p><Link to="/notes/new">Create a note <NavigationIcon name="chevron" size={14} /></Link></>}
      </div>
    </section>

    <section className="record-overview" aria-label="Notes overview">
      <div><span>Total records</span><strong>{stats?.hasData ? stats.totalNotes : notes?.length ?? "—"}</strong><small>Across your Notes workspace</small></div>
      <div><span>This month</span><strong>{stats?.hasData ? stats.notesThisMonth : "—"}</strong><small>New entries captured</small></div>
      <div><span>Folders</span><strong>{folderCount}</strong><small>Organized collections</small></div>
      <div><span>Favorites</span><strong>{favoriteCount}</strong><small>Important records</small></div>
    </section>

    {pinned.length > 1 && <section className="home-section"><div className="section-heading"><div><span className="eyebrow">Within reach</span><h2>Pinned notes</h2></div><Link to="/notes/favorites">View favorites <NavigationIcon name="chevron" size={13} /></Link></div><div className="record-grid">{pinned.slice(0, 2).map(note => <NoteCard key={note.id} note={note} />)}</div></section>}

    <section className="home-section">
      <div className="section-heading"><div><span className="eyebrow">Your latest context</span><h2>Recent notes</h2></div><Link to="/notes/all">View all <NavigationIcon name="chevron" size={13} /></Link></div>
      {notes === null ? (!notesError && <p className="collection-inline-status" role="status">Opening recent notes…</p>) : recent.length === 0 ? <EmptyState icon="✦" title="Your first record is waiting" description="Capture an idea, reflection, meeting, or plan. It will stay connected to the rest of your Veynote history." action={<Link to="/notes/new" className="btn-primary">Write your first note</Link>} /> : <div className="record-grid">{recent.map((note, index) => <NoteCard key={note.id} note={note} featured={index === 0 && recent.length > 2} />)}</div>}
    </section>
  </div>;
}
