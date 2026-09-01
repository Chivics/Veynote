import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June","July","August","September","October","November","December",
];

export default function NotesCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [data, setData] = useState(null);
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [composing, setComposing] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  function load() {
    api.get("/calendar", { mode: "NOTES", year, month }).then(setData);
  }

  useEffect(load, [year, month]);

  function changeMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();

  const eventsByDay = useMemo(() => {
    const map = {};
    (data?.userEvents || []).forEach((ev) => {
      const d = new Date(ev.date).getUTCDate();
      map[d] = map[d] || { user: [], system: [] };
      map[d].user.push(ev);
    });
    (data?.systemEvents || []).forEach((ev) => {
      const d = new Date(ev.date).getUTCDate();
      map[d] = map[d] || { user: [], system: [] };
      map[d].system.push(ev);
    });
    return map;
  }, [data]);

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  async function addEvent() {
    if (!newTitle.trim()) return;
    const date = new Date(Date.UTC(year, month - 1, selectedDay)).toISOString();
    await api.post("/calendar", { mode: "NOTES", date, title: newTitle.trim() });
    setNewTitle("");
    setComposing(false);
    load();
  }

  async function removeEvent(id) {
    await api.delete(`/calendar/${id}`);
    load();
  }

  const selected = eventsByDay[selectedDay] || { user: [], system: [] };

  return (
    <div>
      <span className="eyebrow">PLANNER</span>
      <h1 className="text-[30px] tracking-tight my-1.5 mb-6">Calendar</h1>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="card p-5 flex-1 max-w-[820px]">
          <div className="flex items-center justify-center gap-5 mb-4">
            <button onClick={() => changeMonth(-1)} className="w-7 h-7 rounded-md bg-app-panel2 border border-app-border">‹</button>
            <h2 className="text-[14px] m-0 min-w-[130px] text-center">{MONTHS[month - 1]} {year}</h2>
            <button onClick={() => changeMonth(1)} className="w-7 h-7 rounded-md bg-app-panel2 border border-app-border">›</button>
          </div>

          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAYS.map((d) => (
              <span key={d} className="text-[9px] text-ink-muted text-center pb-1.5">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`b${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const isToday = isCurrentMonth && d === today.getDate();
              const dayEvents = eventsByDay[d];
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`min-h-[64px] rounded-lg p-1.5 text-left transition ${
                    selectedDay === d ? "bg-app-panel2 ring-1 ring-accent-notes" : "bg-app-panel2/60 hover:bg-app-panel2"
                  } ${isToday ? "border border-accent-notes" : ""}`}
                >
                  <b className="text-[10.5px] text-ink-soft">{d}</b>
                  {dayEvents?.user.slice(0, 1).map((ev) => (
                    <span key={ev.id} className="block text-[8.5px] mt-1 px-1 py-0.5 rounded bg-accent-notes-soft text-[#c9c1ff] truncate">
                      {ev.title}
                    </span>
                  ))}
                  {dayEvents?.system.slice(0, 1).map((ev, idx) => (
                    <span key={idx} className="block text-[8.5px] mt-1 px-1 py-0.5 rounded border border-app-border text-ink-muted truncate">
                      {ev.icon} {ev.title}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card p-4 w-full lg:w-[240px] shrink-0">
          <p className="text-[10px] text-ink-muted m-0 mb-1">
            {MONTHS[month - 1].toUpperCase()} {selectedDay}, {year}
          </p>
          <p className="text-[13px] font-bold m-0 mb-3.5">
            {isCurrentMonth && selectedDay === today.getDate() ? "Today" : `${MONTHS[month - 1]} ${selectedDay}`}
          </p>

          <div className="border-t border-app-border pt-2.5 mb-2.5">
            <p className="text-[9.5px] text-ink-muted m-0 mb-1.5">YOUR ENTRIES</p>
            {selected.user.length === 0 ? (
              <p className="text-[11px] text-ink-muted m-0">Nothing on this day yet</p>
            ) : (
              selected.user.map((ev) => (
                <div key={ev.id} className="flex justify-between items-center mb-1">
                  <p className="text-[11.5px] m-0">📝 {ev.title}</p>
                  <button onClick={() => removeEvent(ev.id)} className="text-ink-muted text-[10px]">✕</button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-app-border pt-2.5">
            <p className="text-[9.5px] text-ink-muted m-0 mb-1.5">OBSERVANCES</p>
            {selected.system.length === 0 ? (
              <p className="text-[11px] text-ink-muted m-0">None today</p>
            ) : (
              selected.system.map((ev, idx) => (
                <p key={idx} className="text-[11.5px] text-ink-muted m-0">{ev.icon} {ev.title}</p>
              ))
            )}
          </div>

          {composing ? (
            <div className="mt-3.5 flex flex-col gap-2">
              <input
                autoFocus
                className="input"
                placeholder="Add a note or reminder…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEvent()}
              />
              <div className="flex gap-2">
                <button onClick={addEvent} className="btn-primary flex-1 justify-center">Add</button>
                <button onClick={() => setComposing(false)} className="btn-outline">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setComposing(true)} className="btn-outline w-full text-center mt-3.5">
              + Add to this day
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
