export function storedMediaNameFor(value, { apiBase, pageHref, pageOrigin }) {
  try {
    const apiOrigin = new URL(apiBase, pageHref).origin;
    const url = new URL(value, pageHref);
    if (![apiOrigin, pageOrigin].includes(url.origin)) return null;
    return url.pathname.match(/^\/(?:uploads|api\/media)\/([a-f0-9]{32}(?:\.[a-z0-9_-]{1,16})?)$/i)?.[1] || null;
  } catch { return null; }
}
