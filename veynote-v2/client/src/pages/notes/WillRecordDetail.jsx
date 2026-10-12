import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import VaultGate from "../../components/VaultGate";
import ProtectedContentBoundary from "../../components/ProtectedContentBoundary";
import {
  clearVaultToken,
  getVaultToken,
} from "../../utils/vault";

import { willApi } from "../../api/will";
import BackNavigation from "../../components/BackNavigation";

import WillModal from "../../components/will/WillModal";
import DeleteConfirmation from "../../components/will/DeleteConfirmation";
import WillDocuments from "../../components/will/WillDocuments";
import WillWorkspaceNavigation from "../../components/will/WillWorkspaceNavigation";
import "./willWorkspace.css";
import "./willCollectionWorkspace.css";

import {
  AssetForm,
  BeneficiaryForm,
  ContactForm,
  EMPTY_ASSET,
  EMPTY_BENEFICIARY,
  EMPTY_CONTACT,
  EMPTY_EXECUTOR,
  EMPTY_LIABILITY,
  ExecutorForm,
  LiabilityForm,
  WillDetailForm,
} from "../../components/will/WillForms";


const CONFIG = {
  detail: {
    label: "Will Detail",
    singular: "detail",
    api: willApi.details,
    back: "/will/instructions",
  },

  asset: {
    label: "Asset",
    singular: "asset",
    api: willApi.assets,
    back: "/will/assets",
  },

  beneficiary: {
    label: "Beneficiary",
    singular: "beneficiary",
    api: willApi.beneficiaries,
    back: "/will/beneficiaries",
  },

  contact: {
    label: "Important Contact",
    singular: "contact",
    api: willApi.contacts,
    back: "/will/people",
  },

  executor: {
    label: "Executor",
    singular: "executor",
    api: willApi.executors,
    back: "/will/people",
  },
  liability: {
    label: "Liability",
    singular: "liability",
    api: willApi.liabilities,
    back: "/will/liabilities",
  },
};

function returnPath(kind, record, fallback = "/will") {
  if (kind === "detail" && String(record?.type || "").replaceAll("_", "-") === "digital-legacy") return "/will/digital-legacy";
  return CONFIG[kind]?.back || fallback;
}


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
  const [relatedBeneficiaries, setRelatedBeneficiaries] = useState([]);
  const [relatedExecutors, setRelatedExecutors] = useState([]);
  const [relatedActivity, setRelatedActivity] = useState([]);

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
      if (kind === "beneficiary" || kind === "asset" || kind === "liability" || kind === "contact" || kind === "executor" || kind === "detail") {
        try {
          const dashboard = await willApi.get();

          setRelatedAssets(
            dashboard?.will?.assets || []
          );
          setRelatedBeneficiaries(dashboard?.will?.beneficiaries || []);
          setRelatedExecutors(dashboard?.will?.executors || []);
          setRelatedActivity((dashboard?.will?.activities || []).filter((item) => String(item.entityId || "") === String(id)).slice(0, 8));
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
      const { supportingFiles = [], ...fields } = form;
      const response = await config.api.update(id, fields);

      const key =
        kind === "detail"
          ? "detail"
          : kind;

      let updated =
        response?.[key];

      if (!updated) {
        throw new Error(
          "The record was updated, but no updated record was returned."
        );
      }

      if (kind === "asset" && supportingFiles.length) {
        for (const file of supportingFiles) {
          const body = new FormData(); body.append("file", file); body.append("scopeType", "asset"); body.append("scopeId", id);
          const uploaded = await willApi.documents.upload(body);
          updated = { ...updated, documents: [uploaded.document, ...(updated.documents || [])] };
        }
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

  async function createBeneficiaryFromAsset(form) {
    const { beneficiary } = await willApi.beneficiaries.create({ ...EMPTY_BENEFICIARY, ...form });
    setRelatedBeneficiaries(current => [beneficiary, ...current]);
    return beneficiary;
  }


  /*
   * Delete record.
   */
  async function remove() {
    setBusy(true);
    setError("");

    try {
      await config.api.remove(id);

      navigate(returnPath(kind, record, config.back), {
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
    setRelatedBeneficiaries([]);
    setRelatedExecutors([]);
    setRelatedActivity([]);

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


  /* Keep a previous route's protected record out of view while the next one opens. */
  if (!record || String(record.id) !== String(id)) {
    return (
      <div className="max-w-[900px] mx-auto">
        <span className="eyebrow">PRIVATE & SENSITIVE</span>
        <h1 className="page-title text-[26px] sm:text-[30px] font-bold mt-1.5">{config?.label || "Will record"}</h1>
        {error ? (
          <div className="inline-error mt-5" role="alert">
            <span>{error} This record has not been changed.</span>
            {config && id && <button type="button" onClick={load} disabled={loading}>Retry</button>}
          </div>
        ) : <p className="collection-inline-status mt-5" role="status">Opening this protected record…</p>}
        <BackNavigation to={config?.back || "/will"} label={config?.label || "Will"} className="mt-5" />
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
      : kind === "liability"
      ? {
          ...EMPTY_LIABILITY,
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
  const backPath = returnPath(kind, record, config.back);


  return (
    <ProtectedContentBoundary vault="will"><div className="will-workspace estate-record-page max-w-[1040px] mx-auto pb-10">

      {/* Breadcrumb / actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">

        <BackNavigation to={backPath} label={kind === "detail" && backPath === "/will/digital-legacy" ? "Digital legacy" : config.label} />

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

      <WillWorkspaceNavigation />


      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 mb-4 text-[11px] text-danger">
          {error}
        </div>
      )}


      {/* Header */}
      <header className="estate-record-hero mb-5">

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
                  value={[record.currency, record.estimatedValue].filter(Boolean).join(" ")}
                />

                <Field
                  label="Location"
                  value={record.location}
                />

                <Field
                  label="Institution / company"
                  value={record.institution}
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

                <Field
                  label="Responsible person"
                  value={record.responsibleExecutor?.name}
                />

                <Field
                  label="Instruction type"
                  value={record.instructionType?.replaceAll("_", " ")}
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

            {kind === "liability" && (
              <>
                <Field label="Liability type" value={record.type} />
                <Field label="Status" value={record.status} />
                <Field label="Lender / counterparty" value={record.lender} />
                <Field label="Amount" value={[record.currency, record.amount].filter(Boolean).join(" ")} />
                <Field label="Account / reference" value={record.accountReference} />
                <Field label="Due date" value={record.dueDate ? formatDate(record.dueDate) : ""} />
                <Field label="Related asset" value={record.asset?.name} />
                <div className="sm:col-span-2"><Field label="Notes & settlement context" value={record.notes} /></div>
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

        {kind === "asset" && <RelationshipPanel eyebrow="BENEFICIARIES" title="Who receives this asset" empty="No beneficiary allocation is attached to this asset yet." items={(record.allocations || []).map(allocation => ({ id: allocation.id, to: `/will/beneficiaries/${allocation.beneficiaryId}`, title: allocation.beneficiary?.name || "Beneficiary", detail: allocationLabel(allocation), note: allocation.conditions }))} />}

        {kind === "beneficiary" && <RelationshipPanel eyebrow="ASSIGNED ASSETS" title="Assets assigned to this person" empty="No assets are currently allocated to this beneficiary." items={(record.allocations || []).map(allocation => ({ id: allocation.id, to: `/will/assets/${allocation.assetId}`, title: allocation.asset?.name || "Asset", detail: allocationLabel(allocation), note: [allocation.asset?.currency, allocation.asset?.estimatedValue].filter(Boolean).join(" ") }))} />}

        {kind === "liability" && <RelationshipPanel eyebrow="RELATED ASSET" title="What this obligation affects" empty="This liability is not linked to a specific asset." items={record.asset ? [{ id:record.asset.id, to:`/will/assets/${record.asset.id}`, title:record.asset.name, detail:[record.asset.currency, record.asset.estimatedValue].filter(Boolean).join(" ") || "Open asset", note:record.asset.description }] : []} />}


        {/* Supporting documents */}
        {(
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

        <section className="card p-4 sm:p-6">
          <span className="eyebrow">RECORD HISTORY</span>
          <h2 className="text-lg font-bold mt-1">Activity & provenance</h2>
          <p className="text-[10.5px] text-ink-muted mt-1">A protected history of changes to this record. Activity describes the event without exposing sensitive field values.</p>
          {relatedActivity.length ? <div className="estate-record-activity">{relatedActivity.map((item) => <article key={item.id}><span>{item.message}</span><time>{formatDate(item.createdAt)}</time></article>)}</div> : <p className="text-[10.5px] text-ink-muted mt-4">No additional history has been recorded for this item yet.</p>}
        </section>

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
            beneficiaries={relatedBeneficiaries}
            executors={relatedExecutors}
            onCreateBeneficiary={createBeneficiaryFromAsset}
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

        {kind === "liability" && (
          <LiabilityForm
            initial={formInitial}
            assets={relatedAssets}
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

    </div></ProtectedContentBoundary>
  );
}

function allocationLabel(allocation) {
  if (allocation.allocationType === "PERCENTAGE") return `${allocation.percentage}% allocation`;
  if (allocation.allocationType === "AMOUNT") return allocation.specificAmount || "Specific amount";
  return "Receives remainder";
}

function RelationshipPanel({ eyebrow, title, empty, items }) {
  return <section className="card p-4 sm:p-6"><span className="eyebrow">{eyebrow}</span><h2 className="text-lg font-bold mt-1">{title}</h2>{items.length === 0 ? <p className="text-[10.5px] text-ink-muted mt-3">{empty}</p> : <div className="estate-relationship-list">{items.map(item => <Link key={item.id} to={item.to}><div><strong>{item.title}</strong>{item.note && <small>{item.note}</small>}</div><span>{item.detail}</span></Link>)}</div>}</section>;
}
