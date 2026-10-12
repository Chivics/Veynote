import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import LibraryCover from "../../components/library/LibraryCover.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import { useApiQuery } from "../../hooks/useApiQuery";
import "./filmWorkspace.css";

const config = LIBRARY_CONFIG.films;
const views = ["All", ...config.statusOptions];
const formats = ["All formats", ...config.categoryOptions];
const sorts = ["recent", "title", "rating", "watched"];
const filmPath = item => `/notes/library/films/${item.id}`;
const updatedAt = item => new Date(item.updatedAt || item.createdAt || 0).getTime() || 0;
const watchedAt = item => new Date(`${item.properties?.watchDate || ""}T00:00:00Z`).getTime() || 0;
const ratingOf = item => {
  const value = item.properties?.score;
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
};
const detailsOf = item => [item.properties?.director, item.properties?.releaseYear].filter(Boolean).join(" · ");
const excerpt = (value, length = 150) => value?.trim().length > length ? `${value.trim().slice(0, length).trimEnd()}…` : value?.trim();
const watchDateLabel = value => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { month:"short", day:"numeric", year:"numeric", timeZone:"UTC" }).format(date);
};

function FilmCard({ item, layout }) {
  const rating = ratingOf(item);
  const review = excerpt(item.properties?.review, layout === "list" ? 170 : 90);
  return <Link to={filmPath(item)} className="film-card">
    <div className="film-card-poster"><LibraryCover item={item} config={config} configKey="films" compact className="film-card-cover" />{item.isFavorite && <span className="film-card-favorite" aria-label="Favorite">★</span>}</div>
    <div className="film-card-copy"><div className="film-card-kicker"><span>{item.category || "Screen title"}</span>{item.properties?.genre && <span>{item.properties.genre}</span>}</div><h3>{item.title}</h3><p className="film-card-credits">{detailsOf(item) || "Creator and year to be added"}</p>{review && <p className="film-card-review">“{review}”</p>}<div className="film-card-bottom"><span className="film-card-status">{item.status || "Unsorted"}</span>{rating !== null && <strong className="film-card-rating">★ {rating}/10</strong>}{rating === null && item.properties?.watchDate && <span className="film-card-date">{watchDateLabel(item.properties.watchDate)}</span>}</div></div>
  </Link>;
}

function FilmSpotlight({ item, loading, error }) {
  if (loading) return <div className="film-spotlight film-spotlight-loading" role="status" aria-label="Loading featured film"><span /><span><i /><i /><i /></span></div>;
  if (error) return <div className="film-spotlight film-spotlight-empty"><NavigationIcon name="play" size={29} /><span className="eyebrow">COLLECTION UNAVAILABLE</span><h2>Your screen collection could not load.</h2><p>Use Retry below to bring back your saved titles.</p></div>;
  if (!item) return <div className="film-spotlight film-spotlight-empty"><NavigationIcon name="play" size={29} /><span className="eyebrow">THE NEXT FRAME IS YOURS</span><h2>Start with a story you want to see.</h2><p>Save a film, series or documentary to begin your collection.</p></div>;
  const rating = ratingOf(item);
  const review = excerpt(item.properties?.review, 170);
  return <Link to={filmPath(item)} className="film-spotlight"><div className="film-spotlight-poster"><LibraryCover item={item} config={config} configKey="films" compact className="film-spotlight-cover" /></div><div className="film-spotlight-copy"><span className="eyebrow">{item.status === "Watching" ? "ON YOUR SCREEN" : item.status === "Watchlist" ? "UP NEXT" : "RECENTLY SAVED"}</span><div className="film-spotlight-meta"><span>{item.category || "Screen title"}</span>{item.properties?.genre && <span>{item.properties.genre}</span>}</div><h2>{item.title}</h2><p>{detailsOf(item) || "A story in your collection"}</p>{review && <blockquote>“{review}”</blockquote>}<span className="film-spotlight-open">Open film record <NavigationIcon name="chevron" size={15} /></span>{rating !== null && <strong className="film-spotlight-rating">★ {rating}/10</strong>}</div></Link>;
}

export default function FilmWorkspace() {
  const navigate = useNavigate();
  const result = useApiQuery("/library/films");
  const sourceItems = result.data?.items ?? null;
  const [params, setParams] = useSearchParams();
  const view = views.includes(params.get("view")) ? params.get("view") : "All";
  const format = formats.includes(params.get("format")) ? params.get("format") : "All formats";
  const sort = sorts.includes(params.get("sort")) ? params.get("sort") : "recent";
  const layout = params.get("layout") === "list" ? "list" : "posters";
  const search = params.get("q") || "";
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Movie");
  const [status, setStatus] = useState("Watchlist");
  const [creator, setCreator] = useState("");
  const [poster, setPoster] = useState(null);
  const [posterPreview, setPosterPreview] = useState("");
  const [createdRecord, setCreatedRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const createInFlight = useRef(false);
  const dialog = useRef(null);
  const titleInput = useRef(null);
  const posterInput = useRef(null);

  function setParam(key, value) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (!value || value === "All" || value === "All formats" || value === "recent" || value === "posters") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace:true });
  }
  function clearFilters() {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const key of ["view", "format", "sort", "q"]) next.delete(key);
      return next;
    }, { replace:true });
  }
  function openCreate() {
    setTitle(""); setCategory("Movie"); setStatus("Watchlist"); setCreator("");
    setPoster(null); setCreatedRecord(null); setCreateError(""); setCreating(true);
  }
  function openCreatedRecord(record = createdRecord) {
    if (!record) return;
    setCreating(false);
    navigate(`${filmPath(record)}?edit=1`);
  }
  function closeCreate() {
    if (busy) return;
    if (createdRecord) openCreatedRecord();
    else setCreating(false);
  }
  useEffect(() => {
    if (params.get("new") !== "1") return;
    openCreate();
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("new"); return next; }, { replace:true });
  }, [params, setParams]);
  useEffect(() => {
    const node = dialog.current;
    if (creating && !node?.open) { node?.showModal(); titleInput.current?.focus(); }
    if (!creating && node?.open) node.close();
  }, [creating]);
  useEffect(() => {
    if (!poster) { setPosterPreview(""); return; }
    const url = URL.createObjectURL(poster);
    setPosterPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [poster]);

  const items = useMemo(() => {
    if (!sourceItems) return null;
    const needle = search.trim().toLocaleLowerCase();
    return sourceItems.filter(item => {
      if (view !== "All" && item.status !== view) return false;
      if (format !== "All formats" && item.category !== format) return false;
      if (needle && ![item.title, item.category, item.status, item.properties?.director, item.properties?.genre, item.properties?.releaseYear, item.properties?.review].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle)) return false;
      return true;
    }).sort((a, b) => {
      if (sort === "title") return (a.title || "").localeCompare(b.title || "");
      if (sort === "rating") return (ratingOf(b) ?? -1) - (ratingOf(a) ?? -1) || updatedAt(b) - updatedAt(a);
      if (sort === "watched") return watchedAt(b) - watchedAt(a) || updatedAt(b) - updatedAt(a);
      return updatedAt(b) - updatedAt(a);
    });
  }, [sourceItems, search, view, format, sort]);
  const spotlight = sourceItems?.find(item => item.status === "Watching") || sourceItems?.find(item => item.status === "Watchlist") || sourceItems?.[0];
  const count = status => sourceItems ? sourceItems.filter(item => item.status === status).length : "—";
  const filtered = Boolean(search.trim() || view !== "All" || format !== "All formats");

  function choosePoster(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
      setPoster(null); setCreateError("Choose a JPG, PNG, WebP, or AVIF image."); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPoster(null); setCreateError("Choose an image smaller than 10 MB."); return;
    }
    setPoster(file); setCreateError("");
  }

  async function createRecord(event) {
    event.preventDefault();
    const name = title.trim();
    if ((!name && !createdRecord) || createInFlight.current) return;
    createInFlight.current = true; setBusy(true); setCreateError("");
    try {
      let record = createdRecord;
      if (!record) {
        const { item } = await api.post("/library/films", { title:name, category, status, director:creator.trim() || null });
        record = item;
        setCreatedRecord(item);
      }
      if (poster) {
        try { await api.upload(`/library/films/${record.id}/cover`, poster); }
        catch (error) {
          setCreateError(`The title was saved, but its poster could not be added. ${error.message || "Try the upload again."}`);
          return;
        }
      }
      openCreatedRecord(record);
    } catch (error) { setCreateError(error.message || "This title could not be saved."); }
    finally { createInFlight.current = false; setBusy(false); }
  }

  return <main className="film-workspace">
    <header className="film-workspace-header product-page-header"><div><span className="eyebrow">THE SCREEN COLLECTION</span><h1 className="page-title">Films &amp; Movies <em>Stories worth keeping.</em></h1><p>Keep a considered watchlist, then remember the films, series and documentaries that stayed with you.</p></div><div className="product-page-actions"><button type="button" className="btn-primary" onClick={openCreate}><NavigationIcon name="plus" size={17} /> Add a title</button></div></header>

    <section className="film-overview" aria-label="Screen collection overview"><FilmSpotlight item={spotlight} loading={!sourceItems && !result.error} error={!sourceItems && Boolean(result.error)} /><div className="film-overview-stats"><span className="eyebrow">YOUR SCREEN JOURNAL</span><div><strong>{sourceItems?.length ?? "—"}</strong><span>saved titles</span></div><div><strong>{count("Watchlist")}</strong><span>on the watchlist</span></div><div><strong>{count("Watching")}</strong><span>watching now</span></div><div><strong>{count("Watched")}</strong><span>watched</span></div></div></section>

    <section className="film-collection" aria-label="Film and movie records"><div className="film-section-heading"><div><span className="eyebrow">THE COLLECTION</span><h2>Your screen collection</h2></div><p>Move from what you plan to watch to what you want to remember.</p></div>
      <nav className="film-views" aria-label="Film collection views">{views.map(name => <button type="button" key={name} aria-current={view === name ? "page" : undefined} onClick={() => setParam("view", name)}>{name === "All" ? "All titles" : name}<span>{name === "All" ? sourceItems?.length ?? "—" : count(name)}</span></button>)}</nav>
      <div className="film-tools"><label className="film-search"><NavigationIcon name="search" size={18} /><input type="search" value={search} onChange={event => setParam("q", event.target.value)} placeholder="Search titles, creators, genres or reviews" aria-label="Search screen collection" />{search && <button type="button" aria-label="Clear film search" onClick={() => setParam("q", "")}><NavigationIcon name="close" size={15} /></button>}</label><label className="film-select"><span className="sr-only">Filter by format</span><select aria-label="Filter by format" value={format} onChange={event => setParam("format", event.target.value)}>{formats.map(name => <option key={name} value={name}>{name}</option>)}</select></label><label className="film-select"><span className="sr-only">Sort titles</span><select aria-label="Sort titles" value={sort} onChange={event => setParam("sort", event.target.value)}><option value="recent">Recently updated</option><option value="title">Title A–Z</option><option value="rating">Highest rated</option><option value="watched">Recently watched</option></select></label><div className="film-layout" role="group" aria-label="Film layout"><button type="button" aria-label="Poster view" aria-pressed={layout === "posters"} onClick={() => setParam("layout", "posters")}><NavigationIcon name="grid" size={17} /></button><button type="button" aria-label="List view" aria-pressed={layout === "list"} onClick={() => setParam("layout", "list")}><NavigationIcon name="list" size={17} /></button></div></div>
      {result.error && <div className="film-error inline-error" role="alert"><span>{sourceItems ? "Your saved titles remain visible. " : "Your screen collection could not be loaded. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
      {items === null ? !result.error && <div className="film-loading" role="status" aria-label="Loading screen collection"><span /><span /><span /><span /></div> : items.length === 0 ? <div className="film-empty"><NavigationIcon name={filtered ? "search" : "play"} size={29} /><span className="eyebrow">{filtered ? "NO MATCHING TITLES" : "A COLLECTION IN THE MAKING"}</span><h3>{filtered ? "No titles in this view yet." : "The first frame is yours."}</h3><p>{filtered ? "Try another view, format or search to find what you saved." : "Add a film, series or documentary to begin your watchlist."}</p>{filtered ? <button type="button" className="btn-outline" onClick={clearFilters}>Show all titles</button> : <button type="button" className="btn-primary" onClick={openCreate}>Add your first title</button>}</div> : <><div className="film-result-count">{items.length} {items.length === 1 ? "title" : "titles"}</div><div className={`film-cards is-${layout}`}>{items.map(item => <FilmCard key={item.id} item={item} layout={layout} />)}</div></>}
    </section>

    <dialog ref={dialog} className="film-create-dialog" aria-labelledby="film-create-title" onCancel={event => { event.preventDefault(); closeCreate(); }} onClick={event => { if (event.target === event.currentTarget) closeCreate(); }}>
      <div className="film-create-head"><div><span className="eyebrow">ADD TO YOUR SCREEN COLLECTION</span><h2 id="film-create-title">Start with the title.</h2><p>Save the story and its poster now. Add a rating and review in the record.</p></div><button type="button" aria-label="Close" onClick={closeCreate} disabled={busy}><NavigationIcon name="close" size={19} /></button></div>
      <form onSubmit={createRecord}>
        <label className="film-create-title"><span>Title <b aria-hidden="true">*</b></span><input ref={titleInput} value={title} onChange={event => { setTitle(event.target.value); setCreateError(""); }} placeholder="What do you want to watch or remember?" maxLength={191} autoComplete="off" required disabled={busy || Boolean(createdRecord)} /></label>
        <div className="film-create-fields"><label><span>Format</span><select value={category} onChange={event => setCategory(event.target.value)} disabled={busy || Boolean(createdRecord)}>{config.categoryOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label><label><span>Starting point</span><select value={status} onChange={event => setStatus(event.target.value)} disabled={busy || Boolean(createdRecord)}>{config.statusOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label></div>
        <label className="film-create-creator"><span>Director or creator <small>optional</small></span><input value={creator} onChange={event => setCreator(event.target.value)} placeholder="Add a name if you know it" maxLength={500} autoComplete="off" disabled={busy || Boolean(createdRecord)} /></label>
        <div className="film-create-poster"><div className="film-create-poster-preview">{posterPreview ? <img src={posterPreview} alt="Selected poster preview" /> : <span><NavigationIcon name="play" size={27} /><small>POSTER</small></span>}</div><div><strong>Poster image <small>optional</small></strong><p>Choose a JPG, PNG, WebP or AVIF image, up to 10 MB.</p><input ref={posterInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={choosePoster} disabled={busy} /><div className="film-create-poster-actions"><button type="button" onClick={() => posterInput.current?.click()} disabled={busy}>{poster ? "Replace poster" : "Choose poster"}</button>{poster && <button type="button" onClick={() => { setPoster(null); setCreateError(""); }} disabled={busy}>Remove</button>}</div>{poster && <small className="film-create-poster-file">{poster.name}</small>}</div></div>
        {createError && <div className="inline-error" role="alert"><span>{createError}</span></div>}
        {createdRecord && <p className="film-create-saved" role="status">Your title is saved. Retry the poster or open the record now.</p>}
        <footer><span>{busy ? createdRecord ? "Uploading poster…" : "Creating title…" : "Private to your Library"}</span><div>{createdRecord && <button type="button" className="film-create-open" onClick={() => openCreatedRecord()}>Open saved record</button>}<button type="submit" className="btn-primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : createdRecord ? poster ? "Retry poster" : "Open record" : "Create & continue"}<NavigationIcon name="chevron" size={16} /></button></div></footer>
      </form>
    </dialog>
  </main>;
}
