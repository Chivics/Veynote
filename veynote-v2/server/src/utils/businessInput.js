const enums = {
  stage: ["LEAD", "CONTACTED", "QUALIFIED", "CUSTOMER", "INACTIVE"],
  type: ["NOTE", "CALL", "EMAIL", "MEETING", "OTHER"],
  opportunityStage: ["DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"],
};
class BusinessInputError extends Error {}

function textField(body, key, limit, required = false) {
  if (!(key in body)) {
    if (required) throw new BusinessInputError(`${key} is required.`);
    return undefined;
  }
  if (typeof body[key] !== "string") throw new BusinessInputError(`${key} must be text.`);
  const value = body[key].trim();
  if (required && !value) throw new BusinessInputError(`${key} is required.`);
  if (value.length > limit) throw new BusinessInputError(`${key} is too long.`);
  return value || (required ? value : null);
}

function enumField(body, key, values) {
  if (!(key in body)) return undefined;
  if (!values.includes(body[key])) throw new BusinessInputError(`Invalid ${key}.`);
  return body[key];
}

function dateField(body, key) {
  if (!(key in body)) return undefined;
  if (body[key] === null || body[key] === "") return null;
  if (typeof body[key] !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(body[key])) throw new BusinessInputError(`Invalid ${key}.`);
  const value = new Date(body[key]);
  if (Number.isNaN(value.getTime()) || (body[key].length === 10 && value.toISOString().slice(0, 10) !== body[key])) throw new BusinessInputError(`Invalid ${key}.`);
  return value;
}

function compact(data) { return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)); }

function validateBusinessInput(kind, body = {}, create = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new BusinessInputError("Invalid request body.");
  let data;
  if (kind === "workspace") data = { name: textField(body, "name", 140, create), description: textField(body, "description", 500) };
  if (kind === "customer") {
    data = { name: textField(body, "name", 180, create), company: textField(body, "company", 180), email: textField(body, "email", 254), phone: textField(body, "phone", 60), source: textField(body, "source", 120), stage: enumField(body, "stage", enums.stage), notes: textField(body, "notes", 20000) };
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new BusinessInputError("Enter a valid email address.");
    if ("isArchived" in body) {
      if (typeof body.isArchived !== "boolean") throw new BusinessInputError("Invalid archive status.");
      data.isArchived = body.isArchived;
    }
  }
  if (kind === "interaction") data = { type: enumField(body, "type", enums.type), summary: textField(body, "summary", 20000, create), occurredAt: dateField(body, "occurredAt"), nextActionAt: dateField(body, "nextActionAt") };
  if (kind === "opportunity") {
    data = { title: textField(body, "title", 180, create), stage: enumField(body, "stage", enums.opportunityStage), notes: textField(body, "notes", 20000), expectedCloseAt: dateField(body, "expectedCloseAt") };
    if ("amount" in body) {
      if (body.amount === null || body.amount === "") data.amount = null;
      else if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(String(body.amount))) throw new BusinessInputError("Enter a valid amount with up to two decimal places.");
      else data.amount = String(body.amount);
    }
    if ("currency" in body) {
      if (typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency)) throw new BusinessInputError("Use a three-letter currency code.");
      data.currency = body.currency;
    }
  }
  if (!data) throw new BusinessInputError("Invalid business record.");
  data = compact(data);
  if (!create && !Object.keys(data).length) throw new BusinessInputError("No valid changes were supplied.");
  return data;
}

module.exports = { validateBusinessInput, BusinessInputError };
