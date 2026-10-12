import { useState } from "react";
import { downloadMedia } from "../utils/media";

export default function FileDownload({ url, name, className, children = "Download" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    try {
      await downloadMedia(url, name);
    } catch (err) { setError(err.message || "Could not access this file. Please try again."); }
    finally { setBusy(false); }
  }
  return <span><button type="button" className={className} disabled={busy} onClick={download}>{busy ? "Preparing…" : children}</button>{error && <span role="alert" className="block text-danger text-xs mt-1">{error}</span>}</span>;
}
