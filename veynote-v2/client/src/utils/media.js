import { api, API_BASE } from "../api/client";

const apiOrigin = () => new URL(API_BASE, window.location.href).origin;

export function storedMediaName(value) {
  try {
    const url = new URL(value, window.location.href);
    if (![apiOrigin(), window.location.origin].includes(url.origin)) return null;
    return url.pathname.match(/^\/uploads\/([a-f0-9]{32}(?:\.[a-z0-9_-]{1,16})?)$/i)?.[1] || null;
  } catch { return null; }
}

export async function resolveMediaUrl(value) {
  const storedName = storedMediaName(value);
  if (!storedName) return value;
  const { url } = await api.post("/media/access", { storedName });
  return new URL(url, apiOrigin()).href;
}

// Preview grants are temporary presentation state and must never be saved
// inside a document or exported as durable attachment references.
export function persistentHTML(element) {
  const copy = element.cloneNode(true);
  copy.querySelectorAll("img[src]").forEach((img) => {
    const name = storedMediaName(img.getAttribute("src"));
    if (name) img.setAttribute("src", `/uploads/${name}`);
  });
  return copy.innerHTML;
}

export function observeMedia(root) {
  let active = true;
  const seen = new WeakMap();
  function hydrate() {
    root.querySelectorAll("img[src]").forEach((img) => {
      const name = storedMediaName(img.getAttribute("src"));
      if (!name || seen.get(img) === name) return;
      seen.set(img, name);
      resolveMediaUrl(`/uploads/${name}`).then((url) => {
        if (active && root.contains(img) && seen.get(img) === name) img.setAttribute("src", url);
      }).catch(() => { if (active) img.alt = img.alt || "Unlock or reopen this note to view its image."; });
    });
  }
  const observer = new MutationObserver(hydrate);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  hydrate();
  return () => { active = false; observer.disconnect(); };
}
