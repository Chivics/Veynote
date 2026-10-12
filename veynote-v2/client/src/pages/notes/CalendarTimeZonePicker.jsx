import { useEffect, useId, useMemo, useRef, useState } from "react";
import { eventTimeInstants, offsetLabel, timeZoneLabel, timeZoneOptions } from "../../utils/calendarTimePreview.js";

export default function CalendarTimeZonePicker({ value, onChange, date, time }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef(null), input = useRef(null), trigger = useRef(null);
  const listId = useId();
  const options = useMemo(() => timeZoneOptions(value), [value]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter(zone => !needle || `${timeZoneLabel(zone)} ${zone}`.toLowerCase().includes(needle)).slice(0, 48);
  }, [options, query]);
  const instant = eventTimeInstants(date, time, value)[0] || new Date();

  useEffect(() => {
    if (!open) return undefined;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function select(zone) { onChange(zone); setOpen(false); setQuery(""); setActive(0); trigger.current?.focus(); }
  function toggle() { setOpen(previous => !previous); setQuery(""); setActive(0); if (!open) requestAnimationFrame(() => input.current?.focus()); }
  function onKeyDown(event) {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(index => Math.min(matches.length - 1, index + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
    if (event.key === "Enter" && matches[active]) { event.preventDefault(); select(matches[active]); }
  }

  return <div className="calendar-zone-picker" ref={root}>
    <span className="calendar-field-label">Event city / time zone</span>
    <button ref={trigger} type="button" className="calendar-zone-trigger" aria-expanded={open} aria-controls={listId} onClick={toggle}>
      <span><strong>{timeZoneLabel(value)}</strong><small>{value} · {offsetLabel(instant, value)}</small></span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="calendar-zone-popover">
      <input ref={input} role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined} autoComplete="off" placeholder="Search city, country, or IANA zone" value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown} />
      <div id={listId} role="listbox" aria-label="Time zones" className="calendar-zone-options">{matches.map((zone, index) => <button type="button" role="option" id={`${listId}-${index}`} aria-selected={zone === value} data-active={active === index} key={zone} onMouseEnter={() => setActive(index)} onClick={() => select(zone)}><strong>{timeZoneLabel(zone)}</strong><small>{zone}</small></button>)}{!matches.length && <p>No matching time zones. Try a city or IANA name.</p>}</div>
      <small>Offsets follow daylight-saving rules on the event date.</small>
    </div>}
  </div>;
}
