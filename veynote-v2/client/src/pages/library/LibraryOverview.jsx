import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import LibraryCover from "../../components/library/LibraryCover.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import "./libraryOverview.css";

const COLLECTIONS = [
  { key: "READING", route: "reading", label: "Reading", icon: "book", description: "Books, articles and research worth returning to.", group: "media" },
  { key: "FILMS", route: "films", label: "Films & movies", icon: "play", description: "A considered watchlist and the stories that stayed with you.", group: "media" },
  { key: "LIFE_GOALS", route: "goals", label: "Life goals", icon: "heart", description: "Long-range intentions with visible progress.", group: "experience" },
  { key: "TRAVEL_PLANS", route: "travel", label: "Travel plans", icon: "calendar", description: "Destinations, practical plans and memories.", group: "experience" },
  { key: "BUCKET_LIST", route: "bucket", label: "Bucket list", icon: "sun", description: "Experiences and milestones you want your life to include.", group: "experience" },
  { key: "IDEAS", route: "ideas", label: "Ideas", icon: "note", description: "Early thinking before it becomes a plan.", group: "work" },
  { key: "PROJECTS", route: "projects", label: "Projects", icon: "brief", description: "Active work, milestones and outcomes.", group: "work" },
];
const byKey = Object.fromEntries(COLLECTIONS.map(collection => [collection.key, collection]));
const destination = item => `/notes/library/${byKey[item.database]?.route || "reading"}/${item.id}`;
const formatDate = value => value ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)) : "";

function CollectionLink({ collection, count, latest, visual = false }) {
  const config = LIBRARY_CONFIG[collection.route];
  return <Link to={`/notes/library/${collection.route}`} className={`library-overview-collection${visual ? " is-visual" : ""}`}>
    {visual && <LibraryCover item={latest} config={config} configKey={collection.route} compact className="library-overview-cover" />}
    <div className="library-overview-collection-body"><span className="library-overview-collection-icon"><NavigationIcon name={collection.icon} size={19} /></span><span className="library-overview-collection-copy"><strong>{collection.label}</strong><small>{collection.description}</small></span><span className="library-overview-collection-count">{count ?? "—"}<small>{count === 1 ? "record" : "records"}</small></span><NavigationIcon name="chevron" size={17} /></div>
  </Link>;
}

export default function LibraryOverview() {
  const [params, setParams] = useSearchParams();
  const createDialog = useRef(null);
  const creating = params.get("new") === "1";
  function openCreate() { setParams(previous => { const next = new URLSearchParams(previous); next.set("new", "1"); return next; }); }
  function closeCreate() { setParams(previous => { const next = new URLSearchParams(previous); next.delete("new"); return next; }, { replace:true }); }
  useEffect(() => {
    const dialog = createDialog.current;
    if (creating && !dialog.open) dialog.showModal();
    if (!creating && dialog.open) dialog.close();
  }, [creating]);
  const [data, setData] = useState(() => api.peek("/library/summary") || null);
  const [error, setError] = useState("");
  function load(force = false) {
    setError("");
    api.get("/library/summary", undefined, { force }).then(setData).catch(failure => setError(failure.message || "Your Library could not be refreshed."));
  }
  useEffect(() => { load(); }, []);

  const summary = data?.summary;
  const recent = data?.recent || [];
  const total = summary ? Object.values(summary).reduce((sum, count) => sum + count, 0) : null;
  const latestByType = useMemo(() => Object.fromEntries(recent.map(item => [item.database, item]).reverse()), [recent]);
  const featured = recent.find(item => item.coverUrl) || recent[0];
  const featuredCollection = featured && byKey[featured.database];

  return <div className="library-overview">
    <dialog ref={createDialog} className="library-capture-dialog" aria-labelledby="library-capture-title" onCancel={event => { event.preventDefault(); closeCreate(); }} onClick={event => { if (event.target !== event.currentTarget) return; const rect=event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeCreate(); }}>
      <header><div><span className="eyebrow">ADD TO YOUR LIBRARY</span><h2 id="library-capture-title">What would you like to keep?</h2><p>Choose its place. Each collection has the details that belong to it.</p></div><button type="button" onClick={closeCreate} aria-label="Close Library creation"><NavigationIcon name="close" size={20} /></button></header>
      <div className="library-capture-options">{COLLECTIONS.map(collection => <Link key={collection.key} to={`/notes/library/${collection.route}?new=1`}><span className="library-capture-icon"><NavigationIcon name={collection.icon} size={21} /></span><span><strong>{collection.label}</strong><small>{collection.description}</small></span><NavigationIcon name="chevron" size={16} /></Link>)}</div>
      <footer><NavigationIcon name="lock" size={14} /> Private to your Library</footer>
    </dialog>
    <header className="library-overview-hero"><div className="library-overview-intro"><span className="eyebrow">YOUR PERSONAL LIBRARY</span><h1 className="page-title">A life, <em>intentionally collected.</em></h1><p>Keep what you read, watch, imagine, pursue and experience in one considered record of your life.</p><button type="button" className="btn-primary library-overview-add" aria-haspopup="dialog" aria-expanded={creating} onClick={openCreate}><NavigationIcon name="plus" size={17} />Add to Library</button><div className="library-overview-hero-foot"><span><strong>{total ?? "—"}</strong> {total === 1 ? "record" : "records"} in your Library</span><span aria-hidden="true" className="library-overview-divider" /><span>{COLLECTIONS.length} distinct collections</span></div></div>
      <div className="library-overview-hero-feature">{featured && featuredCollection ? <Link to={destination(featured)} className="library-overview-featured-link"><LibraryCover item={featured} config={LIBRARY_CONFIG[featuredCollection.route]} configKey={featuredCollection.route} compact className="library-overview-featured-cover" /><span className="library-overview-featured-copy"><small>RECENTLY IN YOUR LIBRARY · {featuredCollection.label.toUpperCase()}</small><strong>{featured.title}</strong><span>Open the record <NavigationIcon name="chevron" size={15} /></span></span></Link> : <div className="library-overview-empty-feature"><span className="library-overview-empty-mark"><NavigationIcon name="book" size={45} /></span><small>EVERY COLLECTION BEGINS SOMEWHERE</small><strong>Keep the things you want to remember.</strong><span>Your first record will take its place here.</span></div>}</div>
    </header>

    {error && <div role="alert" className="inline-error library-overview-error"><span>{error}{data && " Your previously loaded Library remains visible."}</span><button type="button" onClick={() => load(true)}>Retry</button></div>}

    <section className="library-overview-section" aria-labelledby="library-collections-title"><div className="library-overview-section-heading"><div><span className="eyebrow">THE COLLECTIONS</span><h2 id="library-collections-title">Everything in its own context.</h2></div><p>Each place has its own fields and visual language. Move between them without losing the larger story.</p></div>
      <div className="library-overview-groups"><div className="library-overview-group library-overview-media"><div className="library-overview-group-heading"><span>01 / READ & WATCH</span><p>Ideas and stories you encounter.</p></div>{COLLECTIONS.filter(item => item.group === "media").map(item => <CollectionLink key={item.key} collection={item} count={summary?.[item.key]} latest={latestByType[item.key]} visual />)}</div>
        <div className="library-overview-group"><div className="library-overview-group-heading"><span>02 / GO & BECOME</span><p>Where you are going, and why.</p></div>{COLLECTIONS.filter(item => item.group === "experience").map(item => <CollectionLink key={item.key} collection={item} count={summary?.[item.key]} latest={latestByType[item.key]} />)}</div>
        <div className="library-overview-group"><div className="library-overview-group-heading"><span>03 / THINK & BUILD</span><p>From first thought to finished work.</p></div>{COLLECTIONS.filter(item => item.group === "work").map(item => <CollectionLink key={item.key} collection={item} count={summary?.[item.key]} latest={latestByType[item.key]} />)}<div className="library-overview-group-note"><NavigationIcon name="note" size={18} /><span>A project can begin as an idea. Keep both records as its story develops.</span></div></div>
      </div>
    </section>

    <section className="library-overview-recent" aria-label="Recent Library records"><div className="library-overview-section-heading"><div><span className="eyebrow">RECENTLY COLLECTED</span><h2>Return to what matters.</h2></div><p>Your most recently updated Library records, across collections.</p></div>{recent.length ? <div className="library-overview-recent-list">{recent.slice(0, 5).map(item => { const collection = byKey[item.database]; return <Link to={destination(item)} key={item.id}><LibraryCover item={item} config={LIBRARY_CONFIG[collection?.route || "reading"]} configKey={collection?.route || "reading"} compact className="library-overview-recent-cover" /><span><small>{collection?.label || "Library"} · {formatDate(item.updatedAt)}</small><strong>{item.title}</strong></span><NavigationIcon name="chevron" size={17} /></Link>; })}</div> : <div className="library-overview-recent-empty"><NavigationIcon name="book" size={22} /><span>Your newest records will appear here once you begin a collection.</span><Link to="/notes/library/reading">Explore Reading <NavigationIcon name="chevron" size={15} /></Link></div>}</section>
  </div>;
}
