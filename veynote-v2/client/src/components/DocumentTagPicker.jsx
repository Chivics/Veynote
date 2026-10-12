import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import NavigationIcon from "./layout/NavigationIcon";
import "./documentTagPicker.css";

const normalize = value => String(value || "").trim().replace(/^#+/, "").trim().toLocaleLowerCase().slice(0, 60);

export default function DocumentTagPicker({ tags, onChange }) {
  const root = useRef(null);
  const input = useRef(null);
  const listId = useId();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [active, setActive] = useState(0);
  const [catalogError, setCatalogError] = useState(false);
  const normalizedTags = useMemo(() => new Set(tags.map(normalize)), [tags]);
  const query = normalize(value);
  const suggestions = useMemo(() => catalog
    .filter(tag => !normalizedTags.has(normalize(tag.name)) && (!query || tag.name.toLocaleLowerCase().includes(query)))
    .sort((a, b) => query
      ? Number(b.name.toLocaleLowerCase().startsWith(query)) - Number(a.name.toLocaleLowerCase().startsWith(query)) || b.count - a.count || a.name.localeCompare(b.name)
      : b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 6), [catalog, normalizedTags, query]);
  const canCreate = Boolean(query) && !normalizedTags.has(query) && !suggestions.some(tag => tag.name.toLocaleLowerCase() === query);
  const options = [...suggestions.map(tag => ({ name: tag.name, count: tag.count })), ...(canCreate ? [{ name: query, create: true }] : [])];
  const selected = Math.min(active, Math.max(0, options.length - 1));

  useEffect(() => {
    if (!open || catalogLoaded) return;
    let activeRequest = true;
    api.get("/notes/meta/tags").then(result => {
      if (!activeRequest) return;
      setCatalog(result.tags || []);
      setCatalogLoaded(true);
      setCatalogError(false);
    }).catch(() => {
      if (!activeRequest) return;
      setCatalogLoaded(true);
      setCatalogError(true);
    });
    return () => { activeRequest = false; };
  }, [open, catalogLoaded]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event) { if (!root.current?.contains(event.target)) setOpen(false); }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  function add(names) {
    const next = [...tags];
    const seen = new Set(normalizedTags);
    for (const raw of names) {
      const name = normalize(raw);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      next.push(name);
    }
    if (next.length !== tags.length) onChange(next);
    setValue("");
    setActive(0);
    setOpen(false);
    input.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!options.length) return;
      event.preventDefault();
      setOpen(true);
      setActive(index => (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
      return;
    }
    if (event.key === "Enter" || event.key === ",") {
      if (!query) return;
      event.preventDefault();
      add([event.key === "Enter" && open && options[selected] ? options[selected].name : query]);
      return;
    }
    if (event.key === "Backspace" && !value && tags.length) onChange(tags.slice(0, -1));
  }

  return <div ref={root} className="document-tag-picker" aria-label="Document subjects">
    <span className="document-tag-label"><NavigationIcon name="tag" size={15} /> Subjects</span>
    <div className="document-tag-row">
      {tags.map(tag => <span className="document-tag-pill" key={tag}><span>#{tag}</span><button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(tags.filter(item => item !== tag))}><NavigationIcon name="close" size={13} /></button></span>)}
      <input ref={input} type="text" aria-label="Add a document subject" role="combobox" aria-autocomplete="list" aria-expanded={open && options.length > 0} aria-controls={open && options.length ? listId : undefined} aria-activedescendant={open && options[selected] ? `${listId}-${selected}` : undefined} maxLength={60} placeholder={tags.length ? "+ subject" : "Add or find a subject"} value={value} onFocus={() => setOpen(true)} onChange={event => { setValue(event.target.value); setOpen(true); setActive(0); }} onKeyDown={handleKeyDown} onPaste={event => {
        const text = event.clipboardData.getData("text");
        if (!text.includes(",") && !text.includes("\n")) return;
        event.preventDefault();
        add(text.split(/[,\n]+/));
      }} />
    </div>
    {open && (options.length > 0 || catalogError) && <div className="document-tag-suggestions" id={listId} role="listbox" aria-label="Suggested subjects">
      {options.length > 0 && <span className="document-tag-suggestion-heading">{query ? "MATCHING SUBJECTS" : "FREQUENT SUBJECTS"}</span>}
      {options.map((option, index) => <button type="button" role="option" aria-selected={selected === index} id={`${listId}-${index}`} key={option.name} onMouseDown={event => event.preventDefault()} onClick={() => add([option.name])}><span>{option.create ? <NavigationIcon name="plus" size={15} /> : <NavigationIcon name="tag" size={15} />}{option.create ? `Create #${option.name}` : `#${option.name}`}</span>{!option.create && <small>{option.count} {option.count === 1 ? "record" : "records"}</small>}</button>)}
      {catalogError && <p>Existing subjects are unavailable. You can still add a new one.</p>}
    </div>}
  </div>;
}
