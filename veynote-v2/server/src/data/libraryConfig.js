// Server-side mirror of client/src/data/libraryConfig.js — kept minimal.
// The server doesn't hard-enforce these (a user's own free-text status
// wouldn't break anything), it just uses the field lists to know which
// keys are allowed into the `properties` JSON blob per database.

const LIBRARY_DATABASES = {
  READING: {
    propertyFields: ["type", "score", "author", "completed"], // type: Book | Article | Film + TV
  },
  LIFE_GOALS: {
    propertyFields: ["progress", "target"],
  },
  TRAVEL_PLANS: {
    propertyFields: ["country", "travelDate", "budget"],
  },
  BUCKET_LIST: {
    propertyFields: ["completed"],
  },
  IDEAS: {
    propertyFields: [],
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
