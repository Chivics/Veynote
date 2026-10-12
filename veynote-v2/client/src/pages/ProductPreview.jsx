import { useEffect, useRef, useState } from "react";
import NavigationIcon from "../components/layout/NavigationIcon";
import "./productPreview.css";

let savedPreviewDocument = "";

export default function ProductPreview() {
  const [document, setDocument] = useState(() => savedPreviewDocument);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [attempt, setAttempt] = useState(0);
  const frame = useRef(null);
  useEffect(() => {
    if (savedPreviewDocument) return undefined;
    const controller = new AbortController();
    setError("");
    fetch("/product-preview/blueprint.html", { signal: controller.signal, credentials: "omit" })
      .then(response => { if (!response.ok) throw new Error("Reference unavailable"); return response.text(); })
      .then(html => {
        if (!html.includes('name="veynote-design-reference"')) throw new Error("Reference missing");
        if (!controller.signal.aborted) { savedPreviewDocument = html; setDocument(html); }
      })
      .catch(() => { if (!controller.signal.aborted) setError("The saved design reference could not be opened. Retry to load the local preview."); });
    return () => controller.abort();
  }, [attempt]);
  return <section className="product-preview-page">
    <header className="product-preview-heading">
      <div><span>Design reference</span><h1>Product Preview</h1><p>The complete approved blueprint. Compare every workspace, screen, theme and device width.</p></div>
      {globalThis.document?.fullscreenEnabled && <button type="button" className="btn-outline" onClick={async () => {
        setFeedback("");
        try { await frame.current?.requestFullscreen?.(); } catch { setFeedback("Your browser could not expand this frame. Use the Full size / Fit control inside the preview."); }
      }} disabled={!document}><NavigationIcon name="focus" size={17} /> Full screen</button>}
    </header>
    <div className="product-preview-notice"><NavigationIcon name="shield" size={16} /><span>Interactive design reference · representative records · isolated from your account and saved work</span></div>
    {feedback && <p className="product-preview-notice" role="status">{feedback}</p>}
    {error ? <div className="product-preview-recovery" role="alert"><h2>Design reference unavailable</h2><p>{error}</p><button type="button" className="btn-primary" onClick={() => setAttempt(value => value + 1)}>Retry preview</button></div>
      : document ? <iframe ref={frame} title="Complete Veynote approved UI/UX blueprint" srcDoc={document} sandbox="allow-scripts" referrerPolicy="no-referrer" className="product-preview-frame" />
      : <div className="product-preview-preparing" role="status">Opening the saved design reference…</div>}
  </section>;
}
