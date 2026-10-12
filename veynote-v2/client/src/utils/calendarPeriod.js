export function addCalendarDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export function calendarWeekDays(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = addCalendarDays(date, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(monday, index));
}

export function adjacentWeekMonth(date) {
  const month = date.slice(0, 7);
  const other = calendarWeekDays(date).find(day => day.slice(0, 7) !== month);
  return other?.slice(0, 7) || null;
}

export function calendarPeriodTitle(date, view, format) {
  if (view === "day") return format(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (view === "week") {
    const days = calendarWeekDays(date);
    const start = format(days[0], { month: "short", day: "numeric" });
    const end = format(days[6], { month: "short", day: "numeric", year: "numeric" });
    return `${start} – ${end}`;
  }
  return format(date, { month: "long", year: "numeric" });
}
