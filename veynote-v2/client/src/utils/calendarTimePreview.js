const CITY_LABELS = {
  "Africa/Lagos": "Lagos, Nigeria",
  "Africa/Johannesburg": "Johannesburg, South Africa",
  "Africa/Cairo": "Cairo, Egypt",
  "America/New_York": "New York, USA",
  "America/Chicago": "Chicago, USA",
  "America/Denver": "Denver, USA",
  "America/Los_Angeles": "Los Angeles, USA",
  "America/Toronto": "Toronto, Canada",
  "America/Vancouver": "Vancouver, Canada",
  "America/Mexico_City": "Mexico City, Mexico",
  "America/Sao_Paulo": "São Paulo, Brazil",
  "Europe/London": "London, United Kingdom",
  "Europe/Paris": "Paris, France",
  "Europe/Berlin": "Berlin, Germany",
  "Europe/Madrid": "Madrid, Spain",
  "Asia/Dubai": "Dubai, UAE",
  "Asia/Kolkata": "Mumbai / New Delhi, India",
  "Asia/Singapore": "Singapore",
  "Asia/Tokyo": "Tokyo, Japan",
  "Asia/Shanghai": "Shanghai, China",
  "Australia/Sydney": "Sydney, Australia",
  UTC: "Coordinated Universal Time",
};

export function timeZoneLabel(zone) {
  return CITY_LABELS[zone] || zone?.split("/").slice(1).join(" / ").replaceAll("_", " ") || "Choose a time zone";
}

export function timeZoneOptions(current = "") {
  const common = Object.keys(CITY_LABELS);
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set([current, ...common, ...supported].filter(Boolean))];
}

function localParts(instant, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function eventTimeInstants(date, time, zone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}$/.test(time || "")) return [];
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); }
  catch { return []; }
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59 || new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date) return [];
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set();
  for (const sample of [wall - 36 * 3600000, wall, wall + 36 * 3600000]) {
    const local = localParts(new Date(sample), zone);
    const [y, m, d] = local.date.split("-").map(Number);
    const [h, n] = local.time.split(":").map(Number);
    offsets.add(Date.UTC(y, m - 1, d, h, n) - sample);
  }
  return [...offsets].map(offset => new Date(wall - offset)).filter(candidate => {
    const parts = localParts(candidate, zone);
    return parts.date === date && parts.time === time;
  }).sort((a, b) => a - b);
}

export function offsetLabel(instant, zone) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
    .formatToParts(instant).find(part => part.type === "timeZoneName")?.value || "GMT";
  return name.replace("GMT", "UTC").replace(/^UTC$/, "UTC+00:00");
}

export function timeInZone(instant, zone, locale = undefined) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: zone, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(instant);
}
