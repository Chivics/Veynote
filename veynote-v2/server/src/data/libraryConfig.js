// Server-side mirror of client/src/data/libraryConfig.js — kept minimal.
// The server doesn't hard-enforce these (a user's own free-text status
// wouldn't break anything), it just uses the field lists to know which
// keys are allowed into the `properties` JSON blob per database.

const LIBRARY_DATABASES = {
  READING: {
    propertyFields: ["score", "author", "genre", "format", "totalPages", "pagesRead", "progress", "started", "completed", "review", "highlights", "isbn"],
  },
  FILMS: {
    propertyFields: ["score", "director", "genre", "releaseYear", "watchDate", "runtime", "review"],
  },
  LIFE_GOALS: {
    propertyFields: ["progress", "target"],
  },
  TRAVEL_PLANS: {
    propertyFields: ["country", "travelDate", "returnDate", "budget", "currency", "companions"],
  },
  BUCKET_LIST: {
    propertyFields: ["targetDate", "location", "completed", "motivation"],
  },
  IDEAS: {
    propertyFields: ["summary", "nextStep", "source"],
  },
  PROJECTS: {
    propertyFields: ["progress", "startDate", "targetDate", "description"],
  },
};

function pickProperties(database, body = {}) {
  const allowed = LIBRARY_DATABASES[database]?.propertyFields || [];
  const out = {};
  for (const key of allowed) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

const DATE_FIELDS = new Set(["started", "completed", "watchDate", "target", "travelDate", "returnDate", "targetDate", "startDate"]);
const NUMBER_FIELDS = new Set(["score", "totalPages", "pagesRead", "progress", "releaseYear", "budget"]);
const LONG_FIELDS = new Set(["review", "highlights", "motivation", "summary", "description"]);

function invalid(message) { throw new Error(message); }
function parseLibraryInput(database, body, { create = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("Send Library fields as an object.");
  const data = {};
  for (const field of ["title", "category", "status", "priority", "notes", "link"]) {
    if (body[field] === undefined && !(create && field === "title")) continue;
    const value = body[field];
    if (field === "title") {
      if (typeof value !== "string" || !value.trim()) invalid("Title is required.");
      if (value.trim().length > 191) invalid("Title must be 191 characters or fewer.");
      data.title = value.trim();
      continue;
    }
    if (value !== null && typeof value !== "string") invalid(`${field} must be text.`);
    if (value && value.length > (field === "notes" ? 15000 : 191)) invalid(`${field} is too long.`);
    data[field] = field === "notes" ? value : value?.trim() || null;
  }
  if (body.isFavorite !== undefined) {
    if (typeof body.isFavorite !== "boolean") invalid("Favorite must be true or false.");
    data.isFavorite = body.isFavorite;
  }
  const properties = pickProperties(database, body);
  for (const [field, value] of Object.entries(properties)) {
    if (value === null || value === "") continue;
    if (DATE_FIELDS.has(field)) {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(+new Date(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) invalid(`${field} must be a valid date.`);
    } else if (NUMBER_FIELDS.has(field)) {
      if ((typeof value !== "string" && typeof value !== "number") || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > (field === "score" ? 10 : field === "progress" ? 100 : field === "releaseYear" ? 2200 : 1_000_000_000_000) || (field !== "budget" && !Number.isInteger(Number(value)))) invalid(`${field} must be a valid non-negative number.`);
    } else if (typeof value !== "string" || value.length > (LONG_FIELDS.has(field) ? 15000 : 500)) invalid(`${field} must be appropriately sized text.`);
  }
  return { data, properties };
}

module.exports = { LIBRARY_DATABASES, pickProperties, parseLibraryInput };
