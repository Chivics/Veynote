import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import VaultGate from "../../components/VaultGate";
import {
  clearVaultToken,
  getVaultToken,
} from "../../utils/vault";

import { willApi } from "../../api/will";

import WillModal from "../../components/will/WillModal";
import DeleteConfirmation from "../../components/will/DeleteConfirmation";
import WillDocuments from "../../components/will/WillDocuments";

import {
  AssetForm,
  BeneficiaryForm,
  ContactForm,
  EMPTY_ASSET,
  EMPTY_BENEFICIARY,
  EMPTY_CONTACT,
  EMPTY_EXECUTOR,
  ExecutorForm,
  WillDetailForm,
} from "../../components/will/WillForms";


const CONFIG = {
  detail: {
    label: "Will Detail",
    singular: "detail",
    api: willApi.details,
    back: "/will",
  },

  asset: {
    label: "Asset",
    singular: "asset",
    api: willApi.assets,
    back: "/will",
  },

  beneficiary: {
    label: "Beneficiary",
    singular: "beneficiary",
    api: willApi.beneficiaries,
    back: "/will",
  },

  contact: {
    label: "Important Contact",
    singular: "contact",
    api: willApi.contacts,
    back: "/will",
  },

  executor: {
    label: "Executor",
    singular: "executor",
    api: willApi.executors,
    back: "/will",
  },
};


function Field({ label, value }) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return (
    <div className="rounded-lg border border-app-border bg-app-panel2 p-3">
      <p className="text-[9.5px] uppercase tracking-[.08em] font-bold text-ink-muted">
        {label}
      </p>

      <p className="text-[11.5px] text-ink-soft mt-1 whitespace-pre-wrap break-words">
        {String(value)}
      </p>
    </div>
  );
}


function formatDate(value) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}


export default function WillRecordDetail({ kind }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const config = CONFIG[kind];

  const [unlocked, setUnlocked] = useState(
    Boolean(getVaultToken("will"))
  );

  const [record, setRecord] = useState(null);
  const [relatedAssets, setRelatedAssets] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [busy, setBusy] = useState(false);


  /*
   * Load the record.
   */
  const load = useCallback(async () => {
    if (!config || !id) {
      setLoading(false);
      setError("Invalid Will record.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await config.api.get(id);

      const key =
        kind === "detail"
          ? "detail"
          : kind;

      const data = response?.[key];

      if (!data) {
        throw new Error(
          `We couldn't find this ${config.singular}.`
        );
      }

      setRecord(data);

      /*
       * Beneficiaries can optionally be assigned
       * to a specific asset.
       *
       * Load the current Will dashboard so the
       * beneficiary edit form can show available assets.
       */
      if (kind === "beneficiary") {
        try {
          const dashboard = await willApi.get();

          setRelatedAssets(
            dashboard?.will?.assets || []
          );
        } catch (assetError) {
          /*
           * This should not prevent the beneficiary
           * record itself from loading.
           */
          console.warn(
            "[WillRecordDetail] Could not load related assets:",
            assetError
          );
        }
      }

      setUnlocked(true);
    } catch (err) {
      console.error(
        `[WillRecordDetail:${kind}] Load failed:`,
        err
      );

      /*
       * The API client marks expired/missing Will
       * vault access with requiresVault.
       */
      if (err?.requiresVault) {
        clearVaultToken("will");

        setUnlocked(false);
        setRecord(null);
        setRelatedAssets([]);

        return;
      }

      setError(
        err?.message ||
          `We couldn't load this ${config?.singular || "record"}.`
      );
    } finally {
      setLoading(false);
    }
  }, [
    config,
    id,
    kind,
  ]);


  useEffect(() => {
    if (unlocked) {
      load();
    }
  }, [unlocked, load]);


  /*
   * Save edits.
   */
  async function save(form) {
    setBusy(true);
    setError("");

    try {
      const response = await config.api.update(
        id,
        form
      );

      const key =
        kind === "detail"
          ? "detail"
          : kind;

      const updated =
        response?.[key];

      if (!updated) {
        throw new Error(
          "The record was updated, but no updated record was returned."
        );
      }

      setRecord(updated);
      setModalOpen(false);
    } catch (err) {
      console.error(
        `[WillRecordDetail:${kind}] Update failed:`,
        err
      );

      if (err?.requiresVault) {
        clearVaultToken("will");

        setUnlocked(false);
        setRecord(null);

        return;
      }

      setError(
        err?.message ||
          `We couldn't update this ${config.singular}.`
      );
    } finally {
      setBusy(false);
    }
  }


  /*
   * Delete record.
   */
  async function remove() {
    setBusy(true);
    setError("");

    try {
      await config.api.remove(id);

      navigate(config.back, {
        replace: true,
      });
    } catch (err) {
      console.error(
        `[WillRecordDetail:${kind}] Delete failed:`,
        err
      );

      if (err?.requiresVault) {
        clearVaultToken("will");

        setUnlocked(false);
        setRecord(null);
        setDeleteOpen(false);

        return;
      }

      setError(
        err?.message ||
          `We couldn't delete this ${config.singular}.`
      );

      setDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  }


  /*
   * Lock the Will vault immediately.
   */
  function lockPage() {
    clearVaultToken("will");

    setUnlocked(false);
    setRecord(null);
    setRelatedAssets([]);

    setModalOpen(false);
    setDeleteOpen(false);
  }


  /*
   * Vault locked.
   */
  if (!unlocked) {
    return (
      <div className="max-w-[620px] mx-auto">
        <div className="mb-7">
          <span className="eyebrow">
            PRIVATE & SENSITIVE
          </span>

          <h1 className="page-title text-[30px] font-bold mt-1.5">
            Will & Inheritance
          </h1>

          <p className="text-[11px] text-ink-muted mt-2 leading-5">
            This section is protected by your Will
            vault. Unlock it to continue.
          </p>
        </div>

        <VaultGate
          vault="will"
          onUnlock={() => {
            setUnlocked(true);
          }}
        />
      </div>
    );
  }


  /*
   * Loading.
   */
  if (loading && !record) {
    return (
      <div className="max-w-[900px] mx-auto py-8">
        <div className="card p-5">
          <p className="text-[12px] text-ink-muted">
            Loading {config?.singular || "record"}…
          </p>
        </div>
      </div>
    );
  }


  /*
   * Invalid configuration / missing record.
   */
  if (!record) {
    return (
      <div className="max-w-[900px] mx-auto">
        <div className="card p-5">
          <span className="eyebrow">
            WILL & INHERITANCE
          </span>

          <h1 className="page-title text-xl font-bold mt-2">
            Unable to load this record
          </h1>

          <p className="text-[12px] text-danger mt-2">
            {error ||
              `We couldn't find this ${
                config?.singular || "record"
              }.`}
          </p>

          <Link
            to="/will"
            className="btn-outline inline-block mt-5"
          >
            ← Back to Will
          </Link>
        </div>
      </div>
    );
  }


  /*
   * Prepare edit-form values.
   */
  const formInitial =
    kind === "detail"
      ? {
          type: String(record.type || "personal-wishes").replaceAll("_", "-"),
          title: record.title || "",
          content: record.content || "",
        }
      : kind === "asset"
      ? {
          ...EMPTY_ASSET,
          ...record,
        }
      : kind === "beneficiary"
      ? {
          ...EMPTY_BENEFICIARY,
          ...record,
        }
      : kind === "contact"
      ? {
          ...EMPTY_CONTACT,
          ...record,
        }
      : {
          ...EMPTY_EXECUTOR,
          ...record,
        };


  const title =
    record.title ||
    record.name ||
    config.label;


  const documents =
    Array.isArray(record.documents)
      ? record.documents
      : [];


  /*
   * Human-readable type.
   */
  const displayType =
    record.type
      ? String(record.type)
          .replaceAll("-", " ")
          .replaceAll("_", " ")
      : config.label;


  return (
    <div className="max-w-[900px] mx-auto pb-10">

      {/* Breadcrumb / actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/will"
            className="text-[10.5px] font-semibold text-accent-notes"
          >
            ← Back to Will
          </Link>

          <span className="text-ink-muted">
            /
          </span>

          <span className="text-[10.5px] text-ink-muted">
            {config.label}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">

          <button
            type="button"
            className="btn-outline text-xs"
            onClick={() => setModalOpen(true)}
            disabled={busy}
          >
            Edit
          </button>

          <button
            type="button"
            className="btn-outline text-danger text-xs"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
          >
            Delete
          </button>

          <button
            type="button"
            className="btn-primary text-xs"
            onClick={lockPage}
            disabled={busy}
          >
            Lock
          </button>

        </div>
      </div>


      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 mb-4 text-[11px] text-danger">
          {error}
        </div>
      )}


      {/* Header */}
      <header className="mb-5">

        <span className="eyebrow">
          {displayType}
        </span>

        <h1 className="page-title text-[26px] sm:text-[30px] font-bold tracking-tight mt-1.5 break-words">
          {title}
        </h1>

        <p className="text-[10.5px] text-ink-muted mt-1">
          Created {formatDate(record.createdAt)}
          {" · "}
          Updated {formatDate(record.updatedAt)}
        </p>

      </header>


      <div className="grid gap-4">

        {/* Record information */}
        <section className="card p-4 sm:p-6">

          <div className="grid sm:grid-cols-2 gap-2.5">

            {/* WILL DETAIL */}
            {kind === "detail" && (
              <>
                <Field
                  label="Section"
                  value={displayType}
                />

                <div className="sm:col-span-2">
                  <Field
                    label="Details"
                    value={record.content}
                  />
                </div>
              </>
            )}


            {/* ASSET */}
            {kind === "asset" && (
              <>
                <Field
                  label="Asset type"
                  value={record.type}
                />

                <Field
                  label="Estimated value"
                  value={record.estimatedValue}
                />

                <Field
                  label="Location"
                  value={record.location}
                />

                <Field
                  label="Account / reference"
                  value={record.accountReference}
                />

                <Field
                  label="Ownership"
                  value={record.ownership}
                />

                <Field
                  label="Description"
                  value={record.description}
                />

                <div className="sm:col-span-2">
                  <Field
                    label="Instructions"
                    value={record.instructions}
                  />
                </div>
              </>
            )}


            {/* BENEFICIARY */}
            {kind === "beneficiary" && (
              <>
                <Field
                  label="Beneficiary type"
                  value={record.beneficiaryType}
                />

                <Field
                  label="Relationship"
                  value={record.relationship}
                />

                <Field
                  label="Contact"
                  value={record.contact}
                />

                <Field
                  label="Allocation / entitlement"
                  value={record.allocation}
                />

                <Field
                  label="Specific asset"
                  value={
                    record.specificAsset?.name
                  }
                />

                <Field
                  label="Specific entitlement"
                  value={
                    record.specificEntitlement
                  }
                />

                <Field
                  label="Notes"
                  value={record.notes}
                />

                <div className="sm:col-span-2">
                  <Field
                    label="Special instructions"
                    value={
                      record.specialInstructions
                    }
                  />
                </div>
              </>
            )}


            {/* CONTACT */}
            {kind === "contact" && (
              <>
                <Field
                  label="Contact type"
                  value={record.type}
                />

                <Field
                  label="Phone"
                  value={record.phone}
                />

                <Field
                  label="Email"
                  value={record.email}
                />

                <div className="sm:col-span-2">
                  <Field
                    label="Notes"
                    value={record.notes}
                  />
                </div>
              </>
            )}


            {/* EXECUTOR */}
            {kind === "executor" && (
              <>
                <Field
                  label="Relationship"
                  value={record.relationship}
                />

                <Field
                  label="Contact"
                  value={record.contact}
                />

                <Field
                  label="Address"
                  value={record.address}
                />

                <Field
                  label="Notes"
                  value={record.notes}
                />

                <div className="sm:col-span-2">
                  <Field
                    label="Instructions"
                    value={record.instructions}
                  />
                </div>
              </>
            )}

          </div>


          {/* Bottom actions */}
          <div className="flex flex-col sm:flex-row gap-2 mt-5 pt-4 border-t border-app-border">

            <button
              type="button"
              className="btn-primary"
              onClick={() => setModalOpen(true)}
              disabled={busy}
            >
              Edit {config.label}
            </button>

            <button
              type="button"
              className="btn-outline text-danger"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
            >
              Delete
            </button>

          </div>

        </section>


        {/* Supporting documents */}
        {(kind === "detail" ||
          kind === "asset" ||
          kind === "beneficiary") && (
          <section className="card p-4 sm:p-6">

            <div className="mb-4">
              <span className="eyebrow">
                DOCUMENTS
              </span>

              <h2 className="text-lg font-bold mt-1">
                Supporting documents
              </h2>

              <p className="text-[10.5px] text-ink-muted mt-1">
                Keep relevant documents attached to
                this record. Files remain protected by
                the Will vault.
              </p>
            </div>

            <WillDocuments
              documents={documents}
              scopeType={kind}
              scopeId={id}
              onChange={(next) => {
                setRecord((current) => ({
                  ...current,
                  documents: next,
                }));
              }}
            />

          </section>
        )}

      </div>


      {/* Edit modal */}
      <WillModal
        open={modalOpen}
        title={`Edit ${config.label}`}
        wide
        onClose={() => {
          if (!busy) {
            setModalOpen(false);
          }
        }}
      >

        {kind === "detail" && (
          <WillDetailForm
            initial={formInitial}
            onSubmit={save}
            onCancel={() => setModalOpen(false)}
            busy={busy}
          />
        )}


        {kind === "asset" && (
          <AssetForm
            initial={formInitial}
            onSubmit={save}
            onCancel={() => setModalOpen(false)}
            busy={busy}
          />
        )}


        {kind === "beneficiary" && (
          <BeneficiaryForm
            initial={formInitial}
            assets={relatedAssets}
            onSubmit={save}
            onCancel={() => setModalOpen(false)}
            busy={busy}
          />
        )}


        {kind === "contact" && (
          <ContactForm
            initial={formInitial}
            onSubmit={save}
            onCancel={() => setModalOpen(false)}
            busy={busy}
          />
        )}


        {kind === "executor" && (
          <ExecutorForm
            initial={formInitial}
            onSubmit={save}
            onCancel={() => setModalOpen(false)}
            busy={busy}
          />
        )}

      </WillModal>


      {/* Delete confirmation */}
      <DeleteConfirmation
        open={deleteOpen}
        title={`Delete ${config.label}?`}
        message={`Are you sure you want to remove “${title}”? This action cannot be undone.`}
        busy={busy}
        onCancel={() => {
          if (!busy) {
            setDeleteOpen(false);
          }
        }}
        onConfirm={remove}
      />

    </div>
  );
}