
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import VaultGate from "../../components/VaultGate";
import { clearVaultToken, getVaultToken } from "../../utils/vault";

const EMPTY_ASSET = {
  name: "",
  description: "",
  estimatedValue: "",
  instructions: "",
};

const EMPTY_BENEFICIARY = {
  name: "",
  relationship: "",
  contact: "",
  allocation: "",
  notes: "",
};

const EMPTY_WILL = {
  title: "My Will & Inheritance",
  wishes: "",
  instructions: "",
};

function formatDate(value) {
  if (!value) return "Not saved yet";

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function SectionHeader({ eyebrow, title, description, count }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <span className="eyebrow">{eyebrow}</span>

        <h2 className="text-[17px] font-bold mt-1">
          {title}
        </h2>

        {description && (
          <p className="text-[11.5px] text-ink-muted mt-1 max-w-2xl">
            {description}
          </p>
        )}
      </div>

      {count !== undefined && (
        <span className="chip shrink-0">
          {count}
        </span>
      )}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[10.5px] font-semibold text-ink-soft mb-1.5">
        {label}
      </span>

      {children}

      {hint && (
        <span className="block text-[9.5px] text-ink-muted mt-1">
          {hint}
        </span>
      )}
    </label>
  );
}

export default function WillInheritance() {
  const [unlocked, setUnlocked] = useState(
    Boolean(getVaultToken("will"))
  );

  const [will, setWill] = useState(null);

  const [form, setForm] = useState(EMPTY_WILL);

  const [asset, setAsset] = useState(EMPTY_ASSET);
  const [beneficiary, setBeneficiary] = useState(EMPTY_BENEFICIARY);

  const [editingAssetId, setEditingAssetId] = useState(null);
  const [editingBeneficiaryId, setEditingBeneficiaryId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // ---------------------------------------------------------
  // Load Will
  // ---------------------------------------------------------

  async function load() {
    setLoading(true);
    setError("");

    try {
      const { will: data } = await api.get("/will");

      setWill(data);

      setForm({
        title: data?.title || EMPTY_WILL.title,
        wishes: data?.wishes || "",
        instructions: data?.instructions || "",
      });

      setUnlocked(true);
    } catch (err) {
      if (err.requiresVault) {
        clearVaultToken("will");
        setUnlocked(false);
      } else {
        setError(
          err.message ||
            "Could not load your Will & Inheritance record."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (unlocked) {
      load();
    }

    // Unlock state intentionally controls this initial fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------
  // Vault
  // ---------------------------------------------------------

  function handleUnlocked() {
    setUnlocked(true);
    load();
  }

  function lockPage() {
    clearVaultToken("will");

    setUnlocked(false);
    setWill(null);

    setError("");
    setNotice("");
  }

  // ---------------------------------------------------------
  // Save Will
  // ---------------------------------------------------------

  async function saveWill(e) {
    e.preventDefault();

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const { will: data } = await api.patch("/will", form);

      setWill(data);

      setForm({
        title: data.title || EMPTY_WILL.title,
        wishes: data.wishes || "",
        instructions: data.instructions || "",
      });

      setNotice("Will details saved.");
    } catch (err) {
      setError(err.message || "Could not save your Will.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------
  // Assets
  // ---------------------------------------------------------

  async function saveAsset(e) {
    e.preventDefault();

    if (!asset.name.trim()) {
      setError("Asset name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (editingAssetId) {
        const { asset: updated } = await api.patch(
          `/will/assets/${editingAssetId}`,
          asset
        );

        setWill((current) => ({
          ...current,
          assets: current.assets.map((item) =>
            item.id === updated.id ? updated : item
          ),
        }));

        setNotice("Asset updated.");
      } else {
        const { asset: created } = await api.post(
          "/will/assets",
          asset
        );

        setWill((current) => ({
          ...current,
          assets: [...(current.assets || []), created],
        }));

        setNotice("Asset added.");
      }

      setAsset(EMPTY_ASSET);
      setEditingAssetId(null);
    } catch (err) {
      setError(err.message || "Could not save this asset.");
    } finally {
      setSaving(false);
    }
  }

  function editAsset(item) {
    setAsset({
      name: item.name || "",
      description: item.description || "",
      estimatedValue: item.estimatedValue || "",
      instructions: item.instructions || "",
    });

    setEditingAssetId(item.id);
    setNotice("");
    setError("");
  }

  function cancelAssetEdit() {
    setEditingAssetId(null);
    setAsset(EMPTY_ASSET);
  }

  async function removeAsset(id) {
    if (
      !window.confirm(
        "Remove this asset from your Will & Inheritance record?"
      )
    ) {
      return;
    }

    try {
      await api.delete(`/will/assets/${id}`);

      setWill((current) => ({
        ...current,
        assets: current.assets.filter(
          (item) => item.id !== id
        ),
      }));

      if (editingAssetId === id) {
        cancelAssetEdit();
      }

      setNotice("Asset removed.");
    } catch (err) {
      setError(
        err.message || "Could not remove the asset."
      );
    }
  }

  // ---------------------------------------------------------
  // Beneficiaries
  // ---------------------------------------------------------

  async function saveBeneficiary(e) {
    e.preventDefault();

    if (!beneficiary.name.trim()) {
      setError("Beneficiary name is required.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (editingBeneficiaryId) {
        const { beneficiary: updated } = await api.patch(
          `/will/beneficiaries/${editingBeneficiaryId}`,
          beneficiary
        );

        setWill((current) => ({
          ...current,
          beneficiaries: current.beneficiaries.map((item) =>
            item.id === updated.id ? updated : item
          ),
        }));

        setNotice("Beneficiary updated.");
      } else {
        const { beneficiary: created } = await api.post(
          "/will/beneficiaries",
          beneficiary
        );

        setWill((current) => ({
          ...current,
          beneficiaries: [
            ...(current.beneficiaries || []),
            created,
          ],
        }));

        setNotice("Beneficiary added.");
      }

      setBeneficiary(EMPTY_BENEFICIARY);
      setEditingBeneficiaryId(null);
    } catch (err) {
      setError(
        err.message || "Could not save this beneficiary."
      );
    } finally {
      setSaving(false);
    }
  }

  function editBeneficiary(item) {
    setBeneficiary({
      name: item.name || "",
      relationship: item.relationship || "",
      contact: item.contact || "",
      allocation: item.allocation || "",
      notes: item.notes || "",
    });

    setEditingBeneficiaryId(item.id);
    setNotice("");
    setError("");
  }

  function cancelBeneficiaryEdit() {
    setEditingBeneficiaryId(null);
    setBeneficiary(EMPTY_BENEFICIARY);
  }

  async function removeBeneficiary(id) {
    if (
      !window.confirm(
        "Remove this beneficiary from your Will & Inheritance record?"
      )
    ) {
      return;
    }

    try {
      await api.delete(`/will/beneficiaries/${id}`);

      setWill((current) => ({
        ...current,
        beneficiaries: current.beneficiaries.filter(
          (item) => item.id !== id
        ),
      }));

      if (editingBeneficiaryId === id) {
        cancelBeneficiaryEdit();
      }

      setNotice("Beneficiary removed.");
    } catch (err) {
      setError(
        err.message ||
          "Could not remove the beneficiary."
      );
    }
  }

  // ---------------------------------------------------------
  // Derived Data
  // ---------------------------------------------------------

  const assets = will?.assets || [];
  const beneficiaries = will?.beneficiaries || [];

  const completion = useMemo(() => {
    let complete = 0;

    if (form.title.trim()) complete += 1;
    if (form.wishes.trim()) complete += 1;
    if (form.instructions.trim()) complete += 1;
    if (assets.length) complete += 1;
    if (beneficiaries.length) complete += 1;

    return Math.round((complete / 5) * 100);
  }, [
    form,
    assets.length,
    beneficiaries.length,
  ]);

  // ---------------------------------------------------------
  // Locked State
  // ---------------------------------------------------------

  if (!unlocked) {
    return (
      <div className="max-w-[620px] mx-auto">
        <div className="mb-7">
          <span className="eyebrow">
            PRIVATE & SENSITIVE
          </span>

          <h1 className="text-[30px] font-bold mt-1.5">
            Will & Inheritance
          </h1>

          <p className="text-[13px] text-ink-muted mt-1.5">
            A protected place to document your wishes,
            assets, beneficiaries and important instructions.
          </p>
        </div>

        <VaultGate
          vault="will"
          onUnlock={handleUnlocked}
        />
      </div>
    );
  }

  // ---------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------

  if (loading && !will) {
    return (
      <p className="text-ink-muted text-[12.5px] text-center mt-16">
        Loading your protected record…
      </p>
    );
  }

  // ---------------------------------------------------------
  // Main UI
  // ---------------------------------------------------------

  return (
    <div className="max-w-[1040px] mx-auto pb-12">

      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="eyebrow">
                PRIVATE & SENSITIVE
              </span>

              <span className="chip">
                🔐 Protected
              </span>
            </div>

            <h1 className="text-[28px] sm:text-[32px] font-bold">
              {form.title || "Will & Inheritance"}
            </h1>

            <p className="text-[12px] text-ink-muted mt-1.5 max-w-2xl">
              Keep your personal wishes, assets,
              beneficiaries and instructions organised
              in one protected record.
            </p>
          </div>

          <button
            type="button"
            className="btn-outline self-start"
            onClick={lockPage}
          >
            🔒 Lock
          </button>
        </div>

        {/* Completion Card */}
        <div className="card mt-5 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[.1em] font-bold text-ink-muted">
                Record completeness
              </p>

              <p className="text-[12px] text-ink-soft mt-1">
                {completion}% of the main sections have
                information.
              </p>
            </div>

            <div className="w-full sm:w-56">
              <div className="h-1.5 rounded-full bg-app-panel2 overflow-hidden">
                <div
                  className="h-full bg-accent-notes rounded-full transition-all"
                  style={{
                    width: `${completion}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <p className="text-[9.5px] text-ink-muted mt-3">
            Last updated {formatDate(will?.updatedAt)}.
            This record is not a substitute for a legally
            executed will or professional legal advice.
          </p>
        </div>
      </header>

      {/* Alerts */}
      {(error || notice) && (
        <div
          className={`mb-4 rounded-lg border px-3.5 py-2.5 text-[11px] ${
            error
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          {error || notice}
        </div>
      )}

      {/* ---------------------------------------------------
          01 · WILL DETAILS
      --------------------------------------------------- */}

      <form
        onSubmit={saveWill}
        className="card p-4 sm:p-6 mb-4"
      >
        <SectionHeader
          eyebrow="01 · YOUR WISHES"
          title="Will details"
          description="Start with the overall document title, your wishes and any instructions that should be easy to find."
        />

        <div className="grid gap-4">

          <Field label="Document title">
            <input
              className="input"
              value={form.title}
              onChange={(e) =>
                setForm({
                  ...form,
                  title: e.target.value,
                })
              }
              placeholder="My Will & Inheritance"
            />
          </Field>

          <Field
            label="Personal wishes"
            hint="Describe your wishes in your own words. You can return and update this at any time."
          >
            <textarea
              className="input min-h-[190px] resize-y"
              value={form.wishes}
              onChange={(e) =>
                setForm({
                  ...form,
                  wishes: e.target.value,
                })
              }
              placeholder="Write your personal wishes…"
            />
          </Field>

          <Field
            label="Important instructions"
            hint="Add practical information, preferences, or anything your beneficiaries should know."
          >
            <textarea
              className="input min-h-[140px] resize-y"
              value={form.instructions}
              onChange={(e) =>
                setForm({
                  ...form,
                  instructions: e.target.value,
                })
              }
              placeholder="Important instructions…"
            />
          </Field>

        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-5 pt-4 border-t border-app-border">
          <span className="text-[9.5px] text-ink-muted">
            Changes are saved only when you press Save.
          </span>

          <button
            className="btn-primary"
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Will details"}
          </button>
        </div>
      </form>

      {/* ---------------------------------------------------
          02 · ASSETS
      --------------------------------------------------- */}

      <section className="card p-4 sm:p-6 mb-4">
        <SectionHeader
          eyebrow="02 · ASSETS"
          title="What you own"
          description="Record important assets and add enough detail for someone to understand what the asset is and what should happen to it."
          count={`${assets.length} ${
            assets.length === 1 ? "asset" : "assets"
          }`}
        />

        {assets.length > 0 ? (
          <div className="grid gap-2.5 mb-5">
            {assets.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-app-border bg-app-panel2 p-3.5 sm:p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[12.5px] font-bold truncate">
                      {item.name}
                    </h3>

                    {item.description && (
                      <p className="text-[10.5px] text-ink-muted mt-1 whitespace-pre-wrap">
                        {item.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {item.estimatedValue && (
                        <span className="chip">
                          Value: {item.estimatedValue}
                        </span>
                      )}

                      {item.instructions && (
                        <span className="chip">
                          Has instructions
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 shrink-0">
                    <button
                      type="button"
                      className="text-[10.5px] font-semibold text-ink-soft"
                      onClick={() => editAsset(item)}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="text-[10.5px] font-semibold text-danger"
                      onClick={() => removeAsset(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {item.instructions && (
                  <div className="mt-3 pt-3 border-t border-app-border">
                    <p className="text-[9.5px] uppercase tracking-[.08em] font-bold text-ink-muted">
                      Instructions
                    </p>

                    <p className="text-[10.5px] text-ink-soft mt-1 whitespace-pre-wrap">
                      {item.instructions}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-app-border p-6 text-center mb-5">
            <p className="text-[12px] font-semibold">
              No assets added yet
            </p>

            <p className="text-[10.5px] text-ink-muted mt-1">
              Add property, accounts, investments,
              valuables or other assets you want documented.
            </p>
          </div>
        )}

        {/* Asset Form */}
        <form
          onSubmit={saveAsset}
          className="rounded-xl border border-app-border bg-app-panel2 p-4"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[11.5px] font-bold">
                {editingAssetId
                  ? "Edit asset"
                  : "Add an asset"}
              </p>

              <p className="text-[9.5px] text-ink-muted mt-0.5">
                All fields except the name are optional.
              </p>
            </div>

            {editingAssetId && (
              <button
                type="button"
                className="text-[10px] font-semibold text-ink-muted"
                onClick={cancelAssetEdit}
              >
                Cancel edit
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">

            <Field label="Asset name">
              <input
                className="input"
                value={asset.name}
                onChange={(e) =>
                  setAsset({
                    ...asset,
                    name: e.target.value,
                  })
                }
                placeholder="e.g. House in Lagos"
              />
            </Field>

            <Field label="Estimated value">
              <input
                className="input"
                value={asset.estimatedValue}
                onChange={(e) =>
                  setAsset({
                    ...asset,
                    estimatedValue: e.target.value,
                  })
                }
                placeholder="e.g. ₦25,000,000"
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Description">
                <textarea
                  className="input min-h-[90px] resize-y"
                  value={asset.description}
                  onChange={(e) =>
                    setAsset({
                      ...asset,
                      description: e.target.value,
                    })
                  }
                  placeholder="Location, account details, identifying information, etc."
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Asset-specific instructions">
                <textarea
                  className="input min-h-[80px] resize-y"
                  value={asset.instructions}
                  onChange={(e) =>
                    setAsset({
                      ...asset,
                      instructions: e.target.value,
                    })
                  }
                  placeholder="What should happen to this asset?"
                />
              </Field>
            </div>

          </div>

          <button
            className="btn-outline mt-3"
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : editingAssetId
                ? "Update asset"
                : "+ Add asset"}
          </button>
        </form>
      </section>

      {/* ---------------------------------------------------
          03 · BENEFICIARIES
      --------------------------------------------------- */}

      <section className="card p-4 sm:p-6">
        <SectionHeader
          eyebrow="03 · BENEFICIARIES"
          title="Who should receive what"
          description="Document the people or organisations you intend to benefit, together with the relationship, contact and allocation details."
          count={`${beneficiaries.length} ${
            beneficiaries.length === 1
              ? "beneficiary"
              : "beneficiaries"
          }`}
        />

        {beneficiaries.length > 0 ? (
          <div className="grid gap-2.5 mb-5">
            {beneficiaries.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-app-border bg-app-panel2 p-3.5 sm:p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">

                    <h3 className="text-[12.5px] font-bold">
                      {item.name}
                    </h3>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {item.relationship && (
                        <span className="chip">
                          {item.relationship}
                        </span>
                      )}

                      {item.allocation && (
                        <span className="chip">
                          {item.allocation}
                        </span>
                      )}
                    </div>

                    {item.contact && (
                      <p className="text-[10.5px] text-ink-muted mt-2">
                        Contact: {item.contact}
                      </p>
                    )}

                    {item.notes && (
                      <p className="text-[10.5px] text-ink-soft mt-2 whitespace-pre-wrap">
                        {item.notes}
                      </p>
                    )}

                  </div>

                  <div className="flex gap-3 shrink-0">
                    <button
                      type="button"
                      className="text-[10.5px] font-semibold text-ink-soft"
                      onClick={() =>
                        editBeneficiary(item)
                      }
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="text-[10.5px] font-semibold text-danger"
                      onClick={() =>
                        removeBeneficiary(item.id)
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-app-border p-6 text-center mb-5">
            <p className="text-[12px] font-semibold">
              No beneficiaries added yet
            </p>

            <p className="text-[10.5px] text-ink-muted mt-1">
              Add the people or organisations you want
              documented in this record.
            </p>
          </div>
        )}

        {/* Beneficiary Form */}
        <form
          onSubmit={saveBeneficiary}
          className="rounded-xl border border-app-border bg-app-panel2 p-4"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[11.5px] font-bold">
                {editingBeneficiaryId
                  ? "Edit beneficiary"
                  : "Add a beneficiary"}
              </p>

              <p className="text-[9.5px] text-ink-muted mt-0.5">
                Use clear allocation language such as
                “50% of estate” or “House in Lagos”.
              </p>
            </div>

            {editingBeneficiaryId && (
              <button
                type="button"
                className="text-[10px] font-semibold text-ink-muted"
                onClick={cancelBeneficiaryEdit}
              >
                Cancel edit
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">

            <Field label="Full name / organisation">
              <input
                className="input"
                value={beneficiary.name}
                onChange={(e) =>
                  setBeneficiary({
                    ...beneficiary,
                    name: e.target.value,
                  })
                }
                placeholder="Beneficiary name"
              />
            </Field>

            <Field label="Relationship">
              <input
                className="input"
                value={beneficiary.relationship}
                onChange={(e) =>
                  setBeneficiary({
                    ...beneficiary,
                    relationship: e.target.value,
                  })
                }
                placeholder="e.g. Daughter, Brother, Charity"
              />
            </Field>

            <Field label="Contact">
              <input
                className="input"
                value={beneficiary.contact}
                onChange={(e) =>
                  setBeneficiary({
                    ...beneficiary,
                    contact: e.target.value,
                  })
                }
                placeholder="Phone, email or other contact"
              />
            </Field>

            <Field label="Allocation / entitlement">
              <input
                className="input"
                value={beneficiary.allocation}
                onChange={(e) =>
                  setBeneficiary({
                    ...beneficiary,
                    allocation: e.target.value,
                  })
                }
                placeholder="e.g. 50% of estate"
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Notes / special instructions">
                <textarea
                  className="input min-h-[85px] resize-y"
                  value={beneficiary.notes}
                  onChange={(e) =>
                    setBeneficiary({
                      ...beneficiary,
                      notes: e.target.value,
                    })
                  }
                  placeholder="Additional information about this beneficiary…"
                />
              </Field>
            </div>

          </div>

          <button
            className="btn-outline mt-3"
            type="submit"
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : editingBeneficiaryId
                ? "Update beneficiary"
                : "+ Add beneficiary"}
          </button>
        </form>
      </section>
    </div>
  );
}
