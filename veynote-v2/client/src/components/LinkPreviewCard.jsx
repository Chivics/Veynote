import { useEffect, useState } from "react";
import { api } from "../api/client";

// Fetches a title/description for a pasted URL and renders it as a real
// bookmark card instead of leaving the raw address as the only visible
// content. Fails silently to nothing (not an error message) if the
// preview can't be fetched — a missing preview should never block someone
// from still using the plain link.
export default function LinkPreviewCard({ url }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get("/link-preview", { url })
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch(() => { if (!cancelled) setPreview(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);

  if (!url) return null;
  if (loading) return <div className="link-preview-card link-preview-loading">Fetching preview…</div>;
  if (!preview) return null;

  return (
    <a href={preview.url} target="_blank" rel="noreferrer noopener" className="link-preview-card">
      <p className="link-preview-title">{preview.title || preview.domain}</p>
      {preview.description && <p className="link-preview-desc">{preview.description}</p>}
      <p className="link-preview-domain">{preview.domain}</p>
    </a>
  );
}
