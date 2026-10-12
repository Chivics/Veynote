import { useEffect, useState } from "react";
import { willApi } from "../../api/will";
import WillModal from "./WillModal";
import DeleteConfirmation from "./DeleteConfirmation";
import { EmptyState } from "./WillSection";
import "./willDocuments.css";

const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;

function matchesScope(document, scopeType, scopeId) {
  if (!scopeType || !scopeId) {
    return !document.detailId && !document.assetId && !document.beneficiaryId && !document.contactId && !document.executorId && !document.liabilityId;
  }
  const key = `${scopeType}Id`;
  return document[key] === scopeId;
}

export default function WillDocuments({ documents: suppliedDocuments, onChange, scopeType, scopeId }) {
  const controlled = Array.isArray(suppliedDocuments);
  const [documents, setDocuments] = useState(controlled ? suppliedDocuments : []);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (controlled) setDocuments(suppliedDocuments.filter((item) => matchesScope(item, scopeType, scopeId)));
  }, [controlled, suppliedDocuments, scopeType, scopeId]);

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await willApi.documents.list();
        if (!cancelled) setDocuments((response.documents || []).filter((item) => matchesScope(item, scopeType, scopeId)));
      } catch (err) {
        if (!cancelled) setError(err.message || "We couldn't load documents.");
      }
    })();
    return () => { cancelled = true; };
  }, [controlled, scopeType, scopeId]);

  function publish(next) {
    setDocuments(next);
    onChange?.(next);
  }

  async function upload() {
    if (!file) return;
    setUploading(true); setProgress(0); setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (scopeType && scopeId) {
        formData.append("scopeType", scopeType);
        formData.append("scopeId", scopeId);
      }
      const response = await willApi.documents.upload(formData, setProgress);
      const next = [response.document, ...documents];
      publish(next);
      setFile(null); setOpen(false);
    } catch (err) {
      setError(err.message || "We couldn't upload this document.");
    } finally {
      setUploading(false); setProgress(0);
    }
  }

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null;
    if (selected && selected.size > MAX_DOCUMENT_BYTES) {
      setFile(null);
      setError("That document is larger than the 200 MB protected-file limit.");
      event.target.value = "";
      return;
    }
    setError("");
    setFile(selected);
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true); setError("");
    try {
      await willApi.documents.remove(deleteTarget.id);
      publish(documents.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || "We couldn't delete this document.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button type="button" className="btn-primary text-xs" onClick={() => setOpen(true)}>Add document</button>
      </div>

      {error && <div className="text-xs text-danger mb-4">{error}</div>}

      {documents.length === 0 ? (
        <EmptyState title="No documents yet" description="Store supporting documents securely with your Will." />
      ) : (
        <div className="space-y-2">
          {documents.map((document) => (
            <div key={document.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{document.originalName}</div>
                <div className="text-[10px] text-ink-muted mt-1">
                  {Math.max(1, Math.round(Number(document.sizeBytes || 0) / 1024))} KB · {document.mimeType || "File"}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href={`${import.meta.env.VITE_API_URL}${document.downloadUrl}`} target="_blank" rel="noreferrer" className="btn-outline text-[10px]">Open</a>
                <button type="button" className="btn-outline text-[10px]" onClick={() => setDeleteTarget(document)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <WillModal open={open} title="Add Will document" onClose={() => !uploading && setOpen(false)}>
        <div className="space-y-5">
          <div className="estate-document-picker"><input type="file" onChange={chooseFile} className="block w-full text-sm" /><p>Choose a supported document up to 200 MB. Upload progress remains visible while the file is transferred into the protected estate store.</p>{file && <strong>{file.name} · {(file.size / 1024 / 1024).toFixed(file.size >= 1024 * 1024 ? 1 : 2)} MB</strong>}</div>
          {uploading && <div><div className="text-xs mb-2">Uploading {progress}%</div><div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-current transition-all" style={{ width: `${progress}%` }} /></div></div>}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <button type="button" className="btn-outline" disabled={uploading} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!file || uploading} onClick={upload}>{uploading ? "Uploading..." : "Upload"}</button>
          </div>
        </div>
      </WillModal>

      <DeleteConfirmation
        open={Boolean(deleteTarget)}
        title="Delete this document?"
        description="This document will be permanently removed from your private Will workspace."
        busy={deleting}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={remove}
      />
    </div>
  );
}
