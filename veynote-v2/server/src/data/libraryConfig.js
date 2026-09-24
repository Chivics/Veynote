// Server-side mirror of client/src/data/libraryConfig.js — kept minimal.
// The server doesn't hard-enforce these (a user's own free-text status
// wouldn't break anything), it just uses the field lists to know which
// keys are allowed into the `properties` JSON blob per database.

const LIBRARY_DATABASES = {
  READING: {
    propertyFields: ["score", "author", "genre", "progress", "started", "completed", "review", "isbn"],
  },
  FILMS: {
    propertyFields: ["score", "director", "genre", "releaseYear", "watchDate", "runtime", "review", "favorite"],
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

module.exports = { LIBRARY_DATABASES, pickProperties };
