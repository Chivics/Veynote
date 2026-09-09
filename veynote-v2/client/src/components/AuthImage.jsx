import { useEffect, useState } from "react";

const API_HOST = "https://api-veynote.newdayfeeds.org";
const API_BASE = `${API_HOST}/api`;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i;

export function isImageFile({ mimeType, originalName, name } = {}) {
  if (mimeType && mimeType.startsWith("image/")) return true;
  return IMAGE_EXT.test(originalName || name || "");
}

export function resolveFileUrl(url) {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/api/")) return `${API_HOST}${url}`;
  if (url.startsWith("/")) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
}

function authHeaders() {
  const token = localStorage.getItem("veynote_token");
  const vault = sessionStorage.getItem("veynote_vault_token");
  const will = sessionStorage.getItem("veynote_will_token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(vault ? { "X-Vault-Token": vault } : {}),
    ...(will ? { "X-Will-Token": will } : {}),
  };
}

const blobCache = new Map();

export async function fetchAuthedBlobUrl(url) {
  const resolved = resolveFileUrl(url);
  if (!resolved) return "";
  if (resolved.startsWith("blob:") || resolved.startsWith("data:")) return resolved;
  if (blobCache.has(resolved)) return blobCache.get(resolved);

  const res = await fetch(resolved, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load image");
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  blobCache.set(resolved, objectUrl);
  return objectUrl;
}

export default function AuthImage({ src, alt = "", className, style, onClick }) {
  const [blobUrl, setBlobUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setBlobUrl("");
    if (!src) return undefined;
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setBlobUrl(src);
      return undefined;
    }
    fetchAuthedBlobUrl(src)
      .then((u) => {
        if (!cancelled) setBlobUrl(u);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <span
        className={className}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          color: "#8d96a5",
          padding: 8,
          textAlign: "center",
          ...style,
        }}
        title={alt}
      >
        {alt || "Image failed to load"}
      </span>
    );
  }

  if (!blobUrl) {
    return (
      <span
        className={className}
        style={{ display: "block", background: "#0c0f13", ...style }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
    />
  );
}