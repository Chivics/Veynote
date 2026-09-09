import { useEffect, useState } from "react";

const API_BASE = "https://api-veynote.newdayfeeds.org/api";

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

function candidates({ src, imageId, attachmentId }) {
  const list = [];
  if (imageId) list.push(`${API_BASE}/trading/images/${imageId}/file`);
  if (attachmentId) {
    list.push(`${API_BASE}/trading/attachments/${attachmentId}/file`);
    list.push(`${API_BASE}/trading/attachments/${attachmentId}`);
  }
  if (src) {
    if (src.startsWith("blob:") || src.startsWith("data:")) return [src];
    if (src.startsWith("http://") || src.startsWith("https://")) list.push(src);
    else if (src.startsWith("/api/")) list.push(`https://api-veynote.newdayfeeds.org${src}`);
    else if (src.startsWith("/")) list.push(`${API_BASE}${src}`);
    else list.push(`${API_BASE}/${src}`);
    if (typeof src === "string" && !src.endsWith("/file") && src.includes("/images/")) {
      list.push(src.startsWith("http") ? `${src.replace(/\/$/, "")}/file` : `${API_BASE}${src}/file`);
    }
  }
  return [...new Set(list.filter(Boolean))];
}

async function loadBlob(urls) {
  let lastErr = "Could not load image";
  for (const url of urls) {
    if (url.startsWith("blob:") || url.startsWith("data:")) return url;
    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) {
        lastErr = `${res.status} ${url}`;
        continue;
      }
      const blob = await res.blob();
      const type = (blob.type || res.headers.get("content-type") || "").toLowerCase();
      if (type.includes("json") || type.includes("text/html") || type.includes("text/plain")) {
        lastErr = `not an image: ${type}`;
        continue;
      }
      return URL.createObjectURL(blob);
    } catch (e) {
      lastErr = e.message || lastErr;
    }
  }
  throw new Error(lastErr);
}

export function isImageFile({ mimeType, originalName, name } = {}) {
  if (mimeType && mimeType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i.test(originalName || name || "");
}

export default function AuthImage({ src, alt = "", className, style, onClick, imageId, attachmentId }) {
  const [blobUrl, setBlobUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let created = "";
    setFailed(false);
    setBlobUrl("");
    const urls = candidates({ src, imageId, attachmentId });
    if (!urls.length) {
      setFailed(true);
      return undefined;
    }
    loadBlob(urls)
      .then((u) => {
        created = u;
        if (!cancelled) setBlobUrl(u);
      })
      .catch((err) => {
        console.error("AuthImage failed", err.message, { src, imageId, urls });
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (created && created.startsWith("blob:")) URL.revokeObjectURL(created);
    };
  }, [src, imageId, attachmentId]);

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
    return <span className={className} style={{ display: "block", background: "#0c0f13", ...style }} aria-hidden />;
  }

  return <img src={blobUrl} alt={alt} className={className} style={style} onClick={onClick} />;
}