export function queryPath(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, String(item));
  }
  return query.size ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path;
}
