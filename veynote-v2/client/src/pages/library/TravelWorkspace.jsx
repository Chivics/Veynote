import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import LibraryCover from "../../components/library/LibraryCover.jsx";
import NavigationIcon from "../../components/layout/NavigationIcon.jsx";
import { LIBRARY_CONFIG } from "../../data/libraryConfig";
import { useApiQuery } from "../../hooks/useApiQuery";
import "./travelWorkspace.css";

const config = LIBRARY_CONFIG.travel;
const endpoint = `/library/${config.key.toLowerCase()}`;
const statuses = ["All journeys", ...config.statusOptions];
const sortOptions = ["recent", "departure", "destination", "budget"];
const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const pathFor = item => `/notes/library/travel/${item.id}`;
const updatedAt = item => new Date(item.updatedAt || item.createdAt || 0).getTime() || 0;
const dateValue = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : "";
const today = () => new Date().toISOString().slice(0, 10);

function dateLabel(value, year = true) {
  if (!dateValue(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC",
  }).format(date);
}

function dateRange(item) {
  const departure = dateLabel(item.properties?.travelDate);
  const arrival = dateLabel(item.properties?.returnDate);
  if (departure && arrival) return `${departure} – ${arrival}`;
  if (departure) return `Departure ${departure}`;
  if (arrival) return `Return ${arrival}`;
  return "Dates to be decided";
}

function budgetLabel(item) {
  const value = item.properties?.budget;
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "";
  const amount = Number(value);
  const currency = String(item.properties?.currency || "").trim();
  if (!currency) return `${amount.toLocaleString()} budget`;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function TripCard({ item }) {
  const budget = budgetLabel(item);
  return <Link to={pathFor(item)} className="travel-card">
    <div className="travel-card-image"><LibraryCover item={item} config={config} configKey="travel" compact className="travel-card-cover" /><span className={`travel-status travel-status--${(item.status || "unset").toLowerCase().replace(/\s+/g, "-")}`}>{item.status || "Unsorted"}</span>{item.isFavorite && <span className="travel-favorite" aria-label="Favorite">★</span>}</div>
    <div className="travel-card-content"><div className="travel-card-kicker"><span>{item.category || "Destination to be decided"}</span>{item.priority && <span>{item.priority} priority</span>}</div><h3>{item.title}</h3><p className="travel-card-date"><NavigationIcon name="calendar" size={15} />{dateRange(item)}</p>{item.properties?.companions && <p className="travel-card-companions">With {item.properties.companions}</p>}<div className="travel-card-footer"><span>{budget || "Budget to be decided"}</span><span>Open trip <NavigationIcon name="chevron" size={15} /></span></div></div>
  </Link>;
}

function TravelFeature({ item, loading, error, onCreate }) {
  if (loading) return <div className="travel-feature travel-feature-loading" role="status" aria-label="Loading featured journey"><span /><span><i /><i /><i /></span></div>;
  if (error) return <div className="travel-feature travel-feature-empty"><NavigationIcon name="calendar" size={31} /><span className="eyebrow">COLLECTION UNAVAILABLE</span><h2>Your journeys could not load.</h2><p>Retry below to see your saved travel plans.</p></div>;
  if (!item) return <div className="travel-feature travel-feature-empty"><NavigationIcon name="calendar" size={31} /><span className="eyebrow">THE FIRST JOURNEY</span><h2>Start somewhere that stays with you.</h2><p>Save a destination, then bring the dates, people and details together as your plan grows.</p><button type="button" onClick={onCreate}>Plan your first trip <NavigationIcon name="chevron" size={15} /></button></div>;
  const departure = dateLabel(item.properties?.travelDate);
  return <Link to={pathFor(item)} className="travel-feature"><LibraryCover item={item} config={config} configKey="travel" compact className="travel-feature-cover" /><span className="travel-feature-copy"><small>{item.status === "Booked" ? "ON THE HORIZON" : item.status === "Planning" ? "TAKING SHAPE" : item.status === "Completed" ? "A JOURNEY REMEMBERED" : "A PLACE TO GO"}</small><strong>{item.title}</strong><span>{[item.category, departure].filter(Boolean).join(" · ") || item.status || "Your next journey"}</span><b>Open travel plan <NavigationIcon name="chevron" size={15} /></b></span></Link>;
}

export default function TravelWorkspace() {
  const navigate = useNavigate();
  const result = useApiQuery(endpoint);
  const sourceItems = result.data?.items ?? null;
  const [params, setParams] = useSearchParams();
  const view = statuses.includes(params.get("view")) ? params.get("view") : "All journeys";
  const sort = sortOptions.includes(params.get("sort")) ? params.get("sort") : "recent";
  const query = params.get("q") || "";
  const countryOptions = useMemo(() => [...new Set((sourceItems || []).map(item => item.category?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [sourceItems]);
  const country = countryOptions.includes(params.get("country")) ? params.get("country") : "";
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [status, setStatus] = useState("Wishlist");
  const [departure, setDeparture] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("");
  const [companions, setCompanions] = useState("");
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const createInFlight = useRef(false);
  const dialog = useRef(null);
  const titleInput = useRef(null);
  const coverInput = useRef(null);

  function setParam(key, value) {
    setParams(previous => { const next = new URLSearchParams(previous); if (!value || value === "All journeys" || value === "recent") next.delete(key); else next.set(key, value); return next; }, { replace: true });
  }
  function clearFilters() {
    setParams(previous => { const next = new URLSearchParams(previous); ["view", "country", "sort", "q"].forEach(key => next.delete(key)); return next; }, { replace: true });
  }
  function openCreate() {
    setTitle(""); setPlace(""); setStatus("Wishlist"); setDeparture(""); setReturnDate(""); setBudget(""); setCurrency(""); setCompanions(""); setCover(null); setCreated(null); setCreateError(""); setCreating(true);
  }
  function openRecord(record = created) {
    if (!record) return;
    setCreating(false);
    navigate(`${pathFor(record)}?edit=1`);
  }
  function closeCreate() {
    if (busy) return;
    if (created) openRecord(created);
    else setCreating(false);
  }
  useEffect(() => {
    if (params.get("new") !== "1") return;
    openCreate();
    setParams(previous => { const next = new URLSearchParams(previous); next.delete("new"); return next; }, { replace: true });
  }, [params, setParams]);
  useEffect(() => {
    const node = dialog.current;
    if (creating && !node?.open) { node?.showModal(); titleInput.current?.focus(); }
    if (!creating && node?.open) node.close();
  }, [creating]);
  useEffect(() => {
    if (!cover) { setCoverPreview(""); return; }
    const url = URL.createObjectURL(cover);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  const items = useMemo(() => {
    if (!sourceItems) return null;
    const needle = query.trim().toLocaleLowerCase();
    return sourceItems.filter(item => {
      if (view !== "All journeys" && item.status !== view) return false;
      if (country && item.category !== country) return false;
      if (!needle) return true;
      return [item.title, item.category, item.status, item.properties?.companions, item.properties?.currency, item.notes].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle);
    }).sort((a, b) => {
      if (sort === "destination") return (a.title || "").localeCompare(b.title || "") || updatedAt(b) - updatedAt(a);
      if (sort === "departure") return (dateValue(a.properties?.travelDate) || "9999").localeCompare(dateValue(b.properties?.travelDate) || "9999") || updatedAt(b) - updatedAt(a);
      if (sort === "budget") return (Number(b.properties?.budget) || 0) - (Number(a.properties?.budget) || 0) || updatedAt(b) - updatedAt(a);
      return updatedAt(b) - updatedAt(a);
    });
  }, [sourceItems, query, view, country, sort]);
  const upcoming = sourceItems?.filter(item => !["Completed", "Cancelled"].includes(item.status) && dateValue(item.properties?.travelDate) >= today()) || [];
  const featured = [...upcoming].sort((a, b) => a.properties.travelDate.localeCompare(b.properties.travelDate))[0] || sourceItems?.find(item => item.status === "Planning") || sourceItems?.find(item => item.status === "Wishlist") || sourceItems?.[0];
  const count = value => sourceItems ? sourceItems.filter(item => item.status === value).length : "—";
  const filtered = Boolean(query.trim() || view !== "All journeys" || country);

  function chooseCover(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!imageTypes.includes(file.type)) { setCreateError("Choose a JPG, PNG, WebP, or AVIF image."); return; }
    if (file.size > 10 * 1024 * 1024) { setCreateError("Choose an image smaller than 10 MB."); return; }
    setCover(file); setCreateError("");
  }
  async function createTrip(event) {
    event.preventDefault();
    if (createInFlight.current) return;
    if (!title.trim() && !created) { setCreateError("Give this journey a destination first."); titleInput.current?.focus(); return; }
    if (!created && departure && returnDate && returnDate < departure) { setCreateError("The return date must be on or after departure."); return; }
    createInFlight.current = true; setBusy(true); setCreateError("");
    try {
      let record = created;
      if (!record) {
        const response = await api.post(endpoint, {
          title: title.trim(), category: place.trim() || null, status,
          travelDate: departure || null, returnDate: returnDate || null,
          budget: budget === "" ? null : Number(budget), currency: currency.trim() || null,
          companions: companions.trim() || null,
        });
        record = response.item;
        setCreated(record);
      }
      if (cover) {
        try { await api.upload(`${endpoint}/${record.id}/cover`, cover); }
        catch (error) { setCreateError(`Your trip was saved, but its cover could not be added. ${error.message || "Try the upload again."}`); return; }
      }
      openRecord(record);
    } catch (error) { setCreateError(error.message || "This trip could not be saved."); }
    finally { createInFlight.current = false; setBusy(false); }
  }

  return <main className="travel-workspace">
    <header className="travel-header product-page-header"><div><span className="eyebrow">LIBRARY / TRAVEL PLANS</span><h1 className="page-title">Places to go. <em>Stories to bring home.</em></h1><p>Turn a destination into a considered journey. Keep the dates, people and practical details together as your plans take shape.</p></div><button type="button" className="btn-primary" onClick={openCreate}><NavigationIcon name="plus" size={17} /> Plan a trip</button></header>

    <section className="travel-overview" aria-label="Travel plans overview"><TravelFeature item={featured} loading={sourceItems === null && !result.error} error={sourceItems === null && Boolean(result.error)} onCreate={openCreate} /><div className="travel-overview-stats"><span className="eyebrow">YOUR JOURNEY LOG</span><div><strong>{sourceItems?.length ?? "—"}</strong><span>saved journeys</span></div><div><strong>{sourceItems ? upcoming.length : "—"}</strong><span>upcoming departures</span></div><div><strong>{count("Completed")}</strong><span>journeys completed</span></div></div></section>

    <section className="travel-collection" aria-label="Travel plan records"><div className="travel-section-heading"><div><span className="eyebrow">THE JOURNEY COLLECTION</span><h2>Your travel plans</h2></div><p>From a place on your wishlist to a journey you can remember.</p></div>
      <nav className="travel-views" aria-label="Travel status">{statuses.map(name => <button key={name} type="button" aria-pressed={view === name} onClick={() => setParam("view", name)}>{name}<span>{name === "All journeys" ? sourceItems?.length ?? "—" : count(name)}</span></button>)}</nav>
      <div className="travel-tools"><label className="travel-search"><NavigationIcon name="search" size={17} /><input type="search" aria-label="Search travel plans" placeholder="Search destinations, companions or notes" value={query} onChange={event => setParam("q", event.target.value)} />{query && <button type="button" aria-label="Clear travel search" onClick={() => setParam("q", "")}><NavigationIcon name="close" size={15} /></button>}</label><label className="travel-select"><span className="sr-only">Filter by country</span><select aria-label="Filter by country" value={country} onChange={event => setParam("country", event.target.value)}><option value="">Every country</option>{countryOptions.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="travel-select"><span className="sr-only">Sort travel plans</span><select aria-label="Sort travel plans" value={sort} onChange={event => setParam("sort", event.target.value)}><option value="recent">Recently updated</option><option value="departure">Departure date</option><option value="destination">Destination A–Z</option><option value="budget">Highest budget</option></select></label><span className="travel-result-count">{items === null ? "Loading journeys" : `${items.length} ${items.length === 1 ? "journey" : "journeys"}`}</span></div>
      {result.error && <div className="travel-error inline-error" role="alert"><span>{sourceItems ? "Your saved journeys remain visible. " : "Your travel plans could not be loaded. "}{result.error.message}</span><button type="button" onClick={() => result.refresh().catch(() => {})}>Retry</button></div>}
      {items === null ? !result.error && <div className="travel-loading" role="status" aria-label="Loading travel plans"><span /><span /><span /></div> : items.length === 0 ? <div className="travel-empty"><NavigationIcon name={filtered ? "search" : "calendar"} size={29} /><span className="eyebrow">{filtered ? "NO MATCHING JOURNEYS" : "A JOURNEY IN THE MAKING"}</span><h3>{filtered ? "Nothing matches this view." : "Every journey starts somewhere."}</h3><p>{filtered ? "Try another destination, country or status to find a saved plan." : "Save the first place on your mind. The timing and details can come later."}</p><button type="button" className={filtered ? "btn-outline" : "btn-primary"} onClick={filtered ? clearFilters : openCreate}>{filtered ? "Show all journeys" : "Plan your first trip"}</button></div> : <div className="travel-cards">{items.map(item => <TripCard key={item.id} item={item} />)}</div>}
    </section>

    <dialog ref={dialog} className="travel-create-dialog" aria-labelledby="travel-create-title" onCancel={event => { event.preventDefault(); closeCreate(); }} onClick={event => { if (event.target === event.currentTarget) closeCreate(); }}><form onSubmit={createTrip}>
      <header><div><span className="eyebrow">A NEW JOURNEY</span><h2 id="travel-create-title">Start with a place.</h2><p>Save the destination now. Add a cover and the details you know; the rest can take shape in the record.</p></div><button type="button" aria-label="Close" disabled={busy} onClick={closeCreate}><NavigationIcon name="close" size={19} /></button></header>
      <div className="travel-create-body"><div className="travel-create-fields"><label className="travel-create-title"><span>Destination <b aria-hidden="true">*</b></span><input ref={titleInput} value={title} onChange={event => { setTitle(event.target.value); setCreateError(""); }} required maxLength={191} disabled={busy || Boolean(created)} placeholder="City, region or place" /></label><div className="travel-create-pair"><label><span>Country <small>optional</small></span><input value={place} onChange={event => setPlace(event.target.value)} maxLength={191} disabled={busy || Boolean(created)} placeholder="Where is it?" /></label><label><span>Planning status</span><select value={status} onChange={event => setStatus(event.target.value)} disabled={busy || Boolean(created)}>{config.statusOptions.map(option => <option key={option}>{option}</option>)}</select></label></div><div className="travel-create-pair"><label><span>Departure <small>optional</small></span><input type="date" value={departure} onChange={event => { setDeparture(event.target.value); setCreateError(""); }} disabled={busy || Boolean(created)} /></label><label><span>Return <small>optional</small></span><input type="date" value={returnDate} onChange={event => { setReturnDate(event.target.value); setCreateError(""); }} disabled={busy || Boolean(created)} /></label></div><div className="travel-create-pair"><label><span>Budget <small>optional</small></span><input type="number" min="0" max="1000000000000" step="any" value={budget} onChange={event => setBudget(event.target.value)} disabled={busy || Boolean(created)} placeholder="Estimated amount" /></label><label><span>Currency <small>optional</small></span><input value={currency} onChange={event => setCurrency(event.target.value)} maxLength={40} disabled={busy || Boolean(created)} placeholder="e.g. USD" /></label></div><label><span>Travelling with <small>optional</small></span><input value={companions} onChange={event => setCompanions(event.target.value)} maxLength={500} disabled={busy || Boolean(created)} placeholder="Solo, family, friends…" /></label></div><div className="travel-create-media"><div className="travel-create-cover">{coverPreview ? <img src={coverPreview} alt="Selected travel cover preview" /> : <span><NavigationIcon name="image" size={28} /><strong>Picture the journey.</strong><small>Add a destination image if you have one.</small></span>}</div><input ref={coverInput} className="sr-only" type="file" accept={imageTypes.join(",")} onChange={chooseCover} disabled={busy} /><div className="travel-create-media-actions"><button type="button" onClick={() => coverInput.current?.click()} disabled={busy}>{cover ? "Replace image" : "Choose image"}</button>{cover && <button type="button" onClick={() => { setCover(null); setCreateError(""); }} disabled={busy}>Remove</button>}</div>{cover && <small className="travel-create-file">{cover.name}</small>}<small>JPG, PNG, WebP or AVIF · up to 10 MB</small></div></div>
      {createError && <p className="travel-create-error" role="alert">{createError}</p>}{created && <p className="travel-create-saved" role="status">Your trip is saved. Retry its image or open the record now.</p>}
      <footer><span>{busy ? created ? "Adding the image…" : "Saving your journey…" : "Private to your Library"}</span><div>{created && <button type="button" className="travel-create-open" onClick={() => openRecord()}>Open saved record</button>}<button type="submit" className="btn-primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : created ? cover ? "Retry image" : "Open record" : "Create & continue"}<NavigationIcon name="chevron" size={15} /></button></div></footer>
    </form></dialog>
  </main>;
}
