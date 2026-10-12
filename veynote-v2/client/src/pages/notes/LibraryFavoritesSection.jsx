import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useApiQuery } from "../../hooks/useApiQuery";
import LibraryCover from "../../components/library/LibraryCover";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import "./libraryFavorites.css";

const CONFIG_BY_DATABASE = Object.fromEntries(Object.entries(LIBRARY_CONFIG).map(([key, config]) => [config.key, { key, config }]));

export function useLibraryFavorites() { return useApiQuery("/library/favorites"); }

export function LibraryFavoritesSection({ result, query = "", onQueryChange, featured = false }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const items = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (result.data?.items || []).filter(item => {
      if (!needle) return true;
      const category = CONFIG_BY_DATABASE[item.database]?.config.label || "";
      return `${item.title} ${category} ${item.category || ""} ${item.status || ""} ${item.notes || ""}`.toLocaleLowerCase().includes(needle);
    });
  }, [result.data, query]);

  async function removeFavorite(item) {
    if (busy) return;
    setBusy(item.id); setError(""); setFeedback("");
    try {
      await api.patch(`/library/${item.database}/${item.id}`, { isFavorite: false });
      await result.refresh();
      setFeedback(`Removed “${item.title}” from Favorites. The Library record remains available.`);
    } catch (failure) {
      setError(failure.message || "The Library favorite could not be changed. Retry when your connection returns.");
    } finally { setBusy(null); }
  }

  if (!result.data && !result.error) return null;
  if (!items.length && !result.error && !query && !feedback) return null;
  return <section className={`library-favorites-section${featured ? " is-featured" : ""}`} aria-label="Favorite Library records">
    <header className="library-favorites-heading"><div><span className="eyebrow">CONNECTED WORK · LIBRARY</span><h2>Keep the context close.</h2><p>Books, films, plans, and ideas you marked for return. Each opens in its own Library workspace.</p></div><Link to="/notes/library">Explore Library <NavigationIcon name="chevron" size={15} /></Link></header>
    {featured && <label className="library-favorites-search"><NavigationIcon name="search" size={17} /><input aria-label="Find a favorite Library record" placeholder="Find a saved book, film, plan, or idea…" value={query} onChange={event => onQueryChange?.(event.target.value)} />{query && <button type="button" aria-label="Clear Library favorite search" onClick={() => onQueryChange?.("")}><NavigationIcon name="close" size={15} /></button>}</label>}
    {result.error && <div className="inline-error" role="alert"><span>{result.data ? "Your cached Library favorites remain visible. " : "Library favorites could not be opened. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
    {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div>}
    {feedback && <div className="library-favorites-feedback" role="status"><NavigationIcon name="check" size={16} /><span>{feedback}</span><button type="button" aria-label="Dismiss confirmation" onClick={() => setFeedback("")}><NavigationIcon name="close" size={15} /></button></div>}
    {items.length ? <div className="library-favorites-grid">{items.map(item => {
      const resolved = CONFIG_BY_DATABASE[item.database];
      if (!resolved) return null;
      const { key, config } = resolved;
      return <article className="library-favorite-card" key={item.id} aria-busy={busy === item.id || undefined}>
        <Link to={`/notes/library/${key}/${item.id}`} className="library-favorite-link" aria-label={`Open ${item.title} in ${config.label}`}>
          <LibraryCover item={item} config={config} configKey={key} compact className="library-favorite-cover" />
          <span className="library-favorite-body"><small>{config.label}{item.category ? ` · ${item.category}` : ""}</small><strong>{item.title}</strong><span>{item.status || "Saved in Library"}</span></span>
          <NavigationIcon name="chevron" size={17} />
        </Link>
        <button type="button" className="library-favorite-remove" disabled={busy === item.id} onClick={() => removeFavorite(item)} aria-label={`Remove ${item.title} from Favorites`}><NavigationIcon name="heart" size={17} /><span>{busy === item.id ? "Updating…" : "Remove favorite"}</span></button>
      </article>;
    })}</div> : query && <p className="library-favorites-no-match">No Library favorites match this search. Your saved records remain in the Library.</p>}
  </section>;
}
