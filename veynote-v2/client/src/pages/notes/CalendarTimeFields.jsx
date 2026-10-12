import CalendarTimeZonePicker from "./CalendarTimeZonePicker.jsx";
import { eventTimeInstants, offsetLabel, timeInZone, timeZoneLabel, timeZoneOptions } from "../../utils/calendarTimePreview.js";
import "./calendarTimePreview.css";

export const zoneChoices = timeZoneOptions;

export default function CalendarTimeFields({ date, time, timeZone, setTimeZone, viewerZone, secondaryZone, endTime, setEndTime, endDate, setEndDate, repeat, setRepeat, repeatUntil, setRepeatUntil, reminders, setReminders }) {
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const instants = time ? eventTimeInstants(date, time, timeZone) : [];
  const instant = instants[0];
  const extraZones = [...new Set([viewerZone, secondaryZone].filter(zone => zone && zone !== deviceZone && zone !== timeZone))];
  return <div className="calendar-time-fields">
    <div className="calendar-time-context"><strong>{time ? "Schedule in the meeting’s time zone" : "All-day reminder"}</strong><span>{time ? "Enter the time you were given. Veynote converts it using the selected date’s daylight-saving rules." : "An all-day date stays on the selected calendar day in every time zone."}</span></div>
    {time && <><div className="calendar-time-row"><CalendarTimeZonePicker value={timeZone} onChange={setTimeZone} date={date} time={time} /><label>Ends at <small>Optional</small><input type="time" value={endTime} onChange={event => setEndTime(event.target.value)} /></label>{endTime && <label>End date<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>}</div>
      <div className={`calendar-time-equivalent${instant ? "" : " is-invalid"}`} role={instant ? "status" : "alert"}>{instant ? <><div><span>Event time</span><strong>{timeInZone(instant, timeZone)}</strong><small>{timeZoneLabel(timeZone)} · {offsetLabel(instant, timeZone)}</small></div><div><span>Your device time</span><strong>{timeInZone(instant, deviceZone)}</strong><small>{timeZoneLabel(deviceZone)} · {offsetLabel(instant, deviceZone)}</small></div>{extraZones.map(zone => <div key={zone}><span>{zone === viewerZone ? "Calendar view" : "Second clock"}</span><strong>{timeInZone(instant, zone)}</strong><small>{timeZoneLabel(zone)} · {offsetLabel(instant, zone)}</small></div>)}</> : <p>This local time does not exist on this date because clocks change. Choose another time.</p>}</div>
      {instants.length > 1 && <p className="calendar-dst-note">Clocks move back at this time, so it occurs twice. Veynote currently uses the first occurrence ({offsetLabel(instants[0], timeZone)}).</p>}</>}
    <div className="calendar-time-row"><label>Repeat<select value={repeat} onChange={event => setRepeat(event.target.value)}><option value="">Does not repeat</option><option value="DAILY">Every day</option><option value="WEEKLY">Every week</option><option value="MONTHLY">Every month</option></select></label>{repeat && <label>Repeat until <small>Optional</small><input type="date" value={repeatUntil} onChange={event => setRepeatUntil(event.target.value)} /></label>}</div>
    {time && <fieldset className="calendar-reminder-options"><legend>Reminder markers <small>Shown in Veynote; device notifications are not enabled yet</small></legend>{[[0,"At start"],[10,"10 min before"],[60,"1 hour before"],[1440,"1 day before"]].map(([minutes,label]) => <label key={minutes}><input type="checkbox" checked={reminders.includes(minutes)} onChange={event => setReminders(current => event.target.checked ? [...current, minutes].sort((a,b) => a-b) : current.filter(value => value !== minutes))} />{label}</label>)}</fieldset>}
  </div>;
}
