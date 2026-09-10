import WillModal from "./WillModal";

export default function DeleteConfirmation({
  open,
  title = "Delete this item?",
  description,
  message,
  busy = false,
  onCancel,
  onConfirm,
}) {
  return (
    <WillModal
      open={open}
      title={title}
      onClose={busy ? undefined : onCancel}
    >
      <p className="text-sm text-ink-muted">
        {description || message || "This action cannot be undone."}
      </p>

      <div className="flex justify-end gap-2 mt-6">
        <button
          type="button"
          className="btn-outline"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>

        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Deleting..." : "Delete"}
        </button>
      </div>
    </WillModal>
  );
}