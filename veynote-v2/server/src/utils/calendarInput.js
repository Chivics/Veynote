const { validTimeZone, zonedInstant } = require("./calendarTime");

function calendarInput(body) {
  if (!body || typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 191) throw new Error("Enter a reminder title of 1–191 characters.");
  const value=body.date;
  if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value))throw new Error("Choose a valid reminder date.");
  const date=new Date(value), day=new Date(value.slice(0,10)+"T00:00:00Z");
  if(!Number.isFinite(+date) || !Number.isFinite(+day) || day.toISOString().slice(0,10)!==value.slice(0,10) || day.getUTCFullYear()<1900 || day.getUTCFullYear()>2200)throw new Error("Choose a valid reminder date.");
  let time=body.time || null;
  if(time!==null){
    if(typeof time!=="string")throw new Error("Choose a valid reminder time.");
    const legacy=time.trim().match(/^(\d{1,2}):([0-5]\d)\s*(am|pm)$/i);
    if(legacy && +legacy[1]>=1 && +legacy[1]<=12)time=`${String(+legacy[1]%12+(legacy[3].toLowerCase()==="pm"?12:0)).padStart(2,"0")}:${legacy[2]}`;
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error("Choose a time between 00:00 and 23:59.");
  }
  const allDay = body.allDay === true || !time;
  if (body.allDay === true && time) throw new Error("An all-day event cannot also have a clock time.");
  const timeZone = body.timeZone == null ? null : String(body.timeZone);
  if (timeZone && !validTimeZone(timeZone)) throw new Error("Choose a valid event time zone.");
  const rule = body.recurrenceRule || null;
  if (rule && !["DAILY", "WEEKLY", "MONTHLY"].includes(rule)) throw new Error("Choose a supported repeat schedule.");
  const untilKey = body.recurrenceUntil || null;
  if (untilKey && !rule) throw new Error("Choose a repeat schedule before setting its end date.");
  if (untilKey && (typeof untilKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(untilKey) || !Number.isFinite(+new Date(untilKey)) || new Date(untilKey).toISOString().slice(0, 10) !== untilKey || untilKey < value.slice(0, 10))) throw new Error("Choose a valid repeat end date on or after the first event.");
  const reminders = body.reminderMinutes == null ? [] : body.reminderMinutes;
  if (!Array.isArray(reminders) || reminders.length > 5 || reminders.some(offset => !Number.isInteger(offset) || offset < 0 || offset > 10080)) throw new Error("Choose up to five valid reminder offsets.");
  if (allDay && reminders.length) throw new Error("Choose a start time before adding timed reminder markers.");
  let startsAtUtc = null, endsAtUtc = null;
  if (!allDay && timeZone) {
    startsAtUtc = zonedInstant(value.slice(0, 10), time, timeZone, body.disambiguation);
    const endTime = body.endTime || null;
    if (endTime) {
      if (typeof endTime !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime)) throw new Error("Choose a valid end time.");
      const endDate = body.endDate || value.slice(0, 10);
      if (typeof endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !Number.isFinite(+new Date(endDate)) || new Date(endDate).toISOString().slice(0, 10) !== endDate) throw new Error("Choose a valid end date.");
      endsAtUtc = zonedInstant(endDate, endTime, timeZone, body.disambiguation);
      if (endsAtUtc <= startsAtUtc || endsAtUtc - startsAtUtc > 7 * 86400000) throw new Error("End time must follow the start and be within seven days.");
    }
  }
  return { title: body.title.trim(), date: day, time: allDay ? null : time, allDay, timeZone,
    startsAtUtc, endsAtUtc, recurrenceRule: rule, recurrenceUntil: untilKey ? new Date(`${untilKey}T00:00:00Z`) : null,
    reminderMinutes: [...new Set(reminders)].sort((a, b) => a - b) };
}
module.exports={calendarInput};
