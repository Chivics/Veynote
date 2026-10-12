import { useEffect, useRef } from "react";
import { safeHtml } from "../utils/safeHtml";
import { observeMedia } from "../utils/media";
import { API_BASE } from "../api/client";

export default function DocumentContent({ html, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    root.querySelectorAll('img[src^="/api/public/"]').forEach((img) => {
      img.src = new URL(img.getAttribute("src"), new URL(API_BASE, window.location.href).origin).href;
    });
    root.querySelectorAll('a.editor-inline-file-link[href^="/api/public/"]').forEach((link) => {
      link.href = new URL(link.getAttribute("href"), new URL(API_BASE, window.location.href).origin).href;
    });
    return observeMedia(root);
  }, [html]);
  return <div ref={ref} className={`editor-page ${className || ""}`} dangerouslySetInnerHTML={{ __html: safeHtml(html) }} />;
}
