import { useState } from "react";
import { resolveMediaUrl } from "../utils/media";

export default function FileDownload({ url, name, className, children = "Download" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    try {
      const href = await resolveMediaUrl(url);
      const anchor = document.createElement("a");
      anchor.href = href; anchor.download = name || "download";
      anchor.rel = "noreferrer"; anchor.target = "_blank";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    } catch (err) { setError(err.message || "Could not access this file. Please try again."); }
    finally { setBusy(false); }
  }
  return <span><button type="button" className={className} disabled={busy} onClick={download}>{busy ? "Preparing…" : children}</button>{error && <span role="alert" className="block text-danger text-xs mt-1">{error}</span>}</span>;
}
