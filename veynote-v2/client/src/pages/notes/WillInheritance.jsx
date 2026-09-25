import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import VaultGate from "../../components/VaultGate";
import { clearVaultToken, getVaultToken } from "../../utils/vault";
import { willApi } from "../../api/will";
import WillModal from "../../components/will/WillModal";
import DeleteConfirmation from "../../components/will/DeleteConfirmation";
import CompletionCard from "../../components/will/CompletionCard";
import WillDocuments from "../../components/will/WillDocuments";
import { AssetForm, BeneficiaryForm, ContactForm, EMPTY_ASSET, EMPTY_BENEFICIARY, EMPTY_CONTACT, EMPTY_DETAIL, EMPTY_EXECUTOR, ExecutorForm, WillDetailForm, WillProfileForm } from "../../components/will/WillForms";
import { EmptyState, RecordCard, Section } from "../../components/will/WillSection";

const ASSET_FILTERS = [["All", "All"], ["property", "Property"], ["bank", "Bank Account"], ["investment", "Investment"], ["vehicle", "Vehicle"], ["digital_asset", "Digital Asset"], ["other", "Other"]];
const BENEFICIARY_FILTERS = [["All", "All"], ["PERSON", "Person"], ["ORGANISATION", "Organisation"], ["CHARITY", "Charity"], ["TRUST", "Trust"], ["OTHER", "Other"]];

function date(value) {
  if (!value) return "Not updated yet";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function shortDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}
function sortRecords(items, sort, valueKey = "") {
  return [...items].sort((a, b) => {
    if (sort === "name") return String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""));
    if (sort === "value") return String(b.estimatedValue || "").localeCompare(String(a.estimatedValue || ""), undefined, { numeric: true });
    if (sort === "allocation") return String(b.allocation || "").localeCompare(String(a.allocation || ""), undefined, { numeric: true });
    return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
  });
}

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return <div className="rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 mb-4 text-[11px] text-danger flex items-start justify-between gap-3"><span>{message}</span><button type="button" onClick={onDismiss} className="font-bold">×</button></div>;
}

export default function WillInheritance() {
  const [unlocked, setUnlocked] = useState(Boolean(getVaultToken("will")));
  const [will, setWill] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [assetQuery, setAssetQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState("All");
  const [assetSort, setAssetSort] = useState("recent");
  const [beneficiaryQuery, setBeneficiaryQuery] = useState("");
  const [beneficiaryFilter, setBeneficiaryFilter] = useState("All");
  const [beneficiarySort, setBeneficiarySort] = useState("recent");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { will: data } = await willApi.get();
      setWill(data); setUnlocked(true);
    } catch (err) {
      console.error("[WillInheritance] load failed", err);
      if (err.requiresVault) {
        clearVaultToken("will"); setUnlocked(false); setWill(null);
      } else setError(err.message || "We couldn't load your Will right now. Please try again.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (unlocked) load(); }, [unlocked, load]);

  function lock() {
    clearVaultToken("will"); setUnlocked(false); setWill(null); setError(""); setNotice(""); setModal(null);
  }
  function flash(message) { setNotice(message); window.setTimeout(() => setNotice(""), 3500); }
  function closeModal() { if (!busy) setModal(null); }

  async function saveProfile(form) {
    if (!form.title.trim()) return setError("Document title is required.");
    setBusy(true); setError("");
    try {
      const { will: data } = await willApi.update(form);
      setWill(data); setModal(null); flash("Will title updated.");
    } catch (err) { console.error("[WillInheritance] profile update failed", err); setError(err.message || "We couldn't update the Will title."); }
    finally { setBusy(false); }
  }

  async function saveDetail(form) {
    if (!form.title.trim()) return setError("Detail title is required.");
    if (!form.content.trim()) return setError("Detail content is required.");
    setBusy(true); setError("");
    try {
      const response = modal.id ? await willApi.details.update(modal.id, form) : await willApi.details.create(form);
      setWill((current) => ({ ...current, details: modal.id ? current.details.map((x) => x.id === response.detail.id ? response.detail : x) : [response.detail, ...(current.details || [])] }));
      setModal(null); flash(modal.id ? "Will detail updated." : "Will detail added.");
    } catch (err) { console.error("[WillInheritance] detail save failed", err); setError(err.message || "We couldn't save this Will detail."); }
    finally { setBusy(false); }
  }

  async function saveAsset(form) {
    if (!form.name.trim()) return setError("Asset name is required.");
    setBusy(true); setError("");
    try {
      const { supportingFiles = [], ...assetFields } = form;
      const response = modal.id ? await willApi.assets.update(modal.id, assetFields) : await willApi.assets.create(assetFields);
      let nextAsset = response.asset;
      for (const file of supportingFiles) {
        const body = new FormData(); body.append("file", file); body.append("scopeType", "asset"); body.append("scopeId", nextAsset.id);
        const uploaded = await willApi.documents.upload(body);
        nextAsset = { ...nextAsset, documents: [uploaded.document, ...(nextAsset.documents || [])] };
      }
      setWill((current) => ({ ...current, assets: modal.id ? current.assets.map((x) => x.id === nextAsset.id ? nextAsset : x) : [nextAsset, ...(current.assets || [])], documents: [...(supportingFiles.length ? nextAsset.documents.slice(0, supportingFiles.length) : []), ...(current.documents || [])] }));
      setModal(null); flash(modal.id ? "Asset updated." : "Asset added.");
    } catch (err) { console.error("[WillInheritance] asset save failed", err); setError(err.message || "We couldn't save this asset."); }
    finally { setBusy(false); }
  }

  async function createBeneficiaryFromAsset(form) {
    const { beneficiary } = await willApi.beneficiaries.create({ ...EMPTY_BENEFICIARY, ...form });
    setWill(current => ({ ...current, beneficiaries: [beneficiary, ...(current.beneficiaries || [])] }));
    return beneficiary;
  }

  async function saveBeneficiary(form) {
    if (!form.name.trim()) return setError("Beneficiary name is required.");
    setBusy(true); setError("");
    try {
      const response = modal.id ? await willApi.beneficiaries.update(modal.id, form) : await willApi.beneficiaries.create(form);
      setWill((current) => ({ ...current, beneficiaries: modal.id ? current.beneficiaries.map((x) => x.id === response.beneficiary.id ? response.beneficiary : x) : [response.beneficiary, ...(current.beneficiaries || [])] }));
      setModal(null); flash(modal.id ? "Beneficiary updated." : "Beneficiary added.");
    } catch (err) { console.error("[WillInheritance] beneficiary save failed", err); setError(err.message || "We couldn't save this beneficiary."); }
    finally { setBusy(false); }
  }

  async function saveContact(form) {
    if (!form.name.trim()) return setError("Contact name is required.");
    setBusy(true); setError("");
    try {
      const response = modal.id ? await willApi.contacts.update(modal.id, form) : await willApi.contacts.create(form);
      setWill((current) => ({ ...current, contacts: modal.id ? current.contacts.map((x) => x.id === response.contact.id ? response.contact : x) : [response.contact, ...(current.contacts || [])] }));
      setModal(null); flash(modal.id ? "Contact updated." : "Contact added.");
    } catch (err) { console.error("[WillInheritance] contact save failed", err); setError(err.message || "We couldn't save this contact."); }
    finally { setBusy(false); }
  }

  async function saveExecutor(form) {
    if (!form.name.trim()) return setError("Executor name is required.");
    setBusy(true); setError("");
    try {
      const response = modal.id ? await willApi.executors.update(modal.id, form) : await willApi.executors.create(form);
      setWill((current) => ({ ...current, executors: modal.id ? current.executors.map((x) => x.id === response.executor.id ? response.executor : x) : [response.executor, ...(current.executors || [])] }));
      setModal(null); flash(modal.id ? "Executor updated." : "Executor added.");
    } catch (err) { console.error("[WillInheritance] executor save failed", err); setError(err.message || "We couldn't save this executor."); }
    finally { setBusy(false); }
  }

  async function deleteRecord() {
    if (!deleteTarget) return;
    setBusy(true); setError("");
    try {
      const { type, id } = deleteTarget;
      if (type === "detail") await willApi.details.remove(id);
      if (type === "asset") await willApi.assets.remove(id);
      if (type === "beneficiary") await willApi.beneficiaries.remove(id);
      if (type === "contact") await willApi.contacts.remove(id);
      if (type === "executor") await willApi.executors.remove(id);
      setWill((current) => ({ ...current, [type === "detail" ? "details" : `${type}s`]: (current[type === "detail" ? "details" : `${type}s`] || []).filter((x) => x.id !== id) }));
      setDeleteTarget(null); flash(`${deleteTarget.label} removed.`);
    } catch (err) { console.error("[WillInheritance] delete failed", err); setError(err.message || `We couldn't remove this ${deleteTarget.label.toLowerCase()}.`); }
    finally { setBusy(false); }
  }

  const assets = will?.assets || [];
  const beneficiaries = will?.beneficiaries || [];
  const details = will?.details || [];
  const contacts = will?.contacts || [];
  const executors = will?.executors || [];
  const documents = will?.documents || [];
  const activities = will?.activities || [];

  const filteredAssets = useMemo(() => sortRecords(assets.filter((x) => (!assetQuery || `${x.name} ${x.description || ""}`.toLowerCase().includes(assetQuery.toLowerCase())) && (assetFilter === "All" || String(x.type || "").toLowerCase() === String(assetFilter).toLowerCase())), assetSort), [assets, assetQuery, assetFilter, assetSort]);
  const filteredBeneficiaries = useMemo(() => sortRecords(beneficiaries.filter((x) => (!beneficiaryQuery || `${x.name} ${x.relationship || ""}`.toLowerCase().includes(beneficiaryQuery.toLowerCase())) && (beneficiaryFilter === "All" || String(x.beneficiaryType || "").toUpperCase() === String(beneficiaryFilter).toUpperCase())), beneficiarySort), [beneficiaries, beneficiaryQuery, beneficiaryFilter, beneficiarySort]);

  const completionItems = useMemo(() => [
    { key: "title", label: "Document title", complete: Boolean(will?.title?.trim()), help: "Give your Will a clear title." },
    { key: "wishes", label: "Personal wishes", complete: Boolean(will?.wishes?.trim()), help: "Add your personal wishes." },
    { key: "assets", label: "Assets", complete: assets.length > 0, help: "Add at least one important asset." },
    { key: "beneficiaries", label: "Beneficiaries", complete: beneficiaries.length > 0, help: "Add at least one beneficiary." },
    { key: "contacts", label: "Important contacts", complete: contacts.length > 0, help: "Add a person who may need to help." },
    { key: "executor", label: "Executor / representative", complete: executors.length > 0, help: "Add a trusted personal representative." },
    { key: "digital", label: "Digital legacy", complete: details.some((x) => String(x.type || "").replaceAll("_", "-") === "digital-legacy"), help: "Document how you want digital assets handled." },
    { key: "documents", label: "Supporting documents", complete: documents.length > 0, help: "Attach important supporting documents." },
  ], [will, assets.length, beneficiaries.length, contacts.length, executors.length, details, documents.length]);

  const attentionItems = useMemo(() => {
    const items = [];
    const unassigned = assets.filter(asset => !(asset.allocations || []).length).length;
    const incomplete = assets.filter(asset => { const total = (asset.allocations || []).filter(item => item.allocationType === "PERCENTAGE").reduce((sum, item) => sum + (Number(item.percentage) || 0), 0); return total > 0 && total < 100 && !(asset.allocations || []).some(item => item.allocationType === "REMAINDER"); }).length;
    const undocumented = assets.filter(asset => !(asset.documents || []).length).length;
    if (unassigned) items.push(`${unassigned} asset${unassigned === 1 ? " has" : "s have"} no beneficiary allocation.`);
    if (incomplete) items.push(`${incomplete} asset${incomplete === 1 ? " has" : "s have"} an incomplete percentage allocation.`);
    if (!executors.length) items.push("No executor or personal representative is assigned.");
    if (undocumented) items.push(`${undocumented} asset${undocumented === 1 ? " has" : "s have"} no supporting document.`);
    if (will?.updatedAt && Date.now() - new Date(will.updatedAt).getTime() > 365 * 24 * 60 * 60 * 1000) items.push("This estate record has not been reviewed in the last 12 months.");
    return items;
  }, [assets, executors.length, will?.updatedAt]);

  const estimatedEstateValue = useMemo(() => assets.reduce((sum, asset) => { const value = Number(String(asset.estimatedValue || "").replace(/[^0-9.-]/g, "")); return sum + (Number.isFinite(value) ? value : 0); }, 0), [assets]);

  if (!unlocked) return <div className="max-w-[620px] mx-auto"><div className="mb-7"><span className="eyebrow">PRIVATE & SENSITIVE</span><h1 className="page-title text-[30px] font-bold mt-1.5">Will & Inheritance</h1><p className="text-[13px] text-ink-muted mt-1.5">A protected workspace for your wishes, assets, beneficiaries and estate instructions.</p></div><VaultGate vault="will" onUnlock={() => setUnlocked(true)} /></div>;
  if (!will) return (
    <div className="max-w-[980px] mx-auto py-8">
      <span className="eyebrow">PRIVATE & SENSITIVE</span>
      <h1 className="page-title text-[28px] sm:text-[30px] font-bold tracking-tight mt-1.5">Will & Inheritance</h1>
      <p className="text-[13px] text-ink-muted mt-1.5">Your protected estate workspace.</p>
      {error ? (
        <div className="inline-error mt-5" role="alert">
          <span>{error} Your estate records have not been changed.</span>
          <button type="button" onClick={load} disabled={loading}>Retry</button>
        </div>
      ) : <p className="collection-inline-status mt-5" role="status">Opening your protected estate records…</p>}
    </div>
  );

  return (
    <div className="max-w-[1120px] mx-auto pb-10">
      <header className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0"><span className="eyebrow">PRIVATE & SENSITIVE</span><div className="flex items-center gap-2 mt-1.5"><h1 className="page-title text-[28px] sm:text-[30px] font-bold tracking-tight truncate">{will?.title || "My Will & Inheritance"}</h1><span className="chip shrink-0">🔐 Protected</span></div><p className="text-[11.5px] text-ink-muted mt-1">Last updated {date(will?.updatedAt)}</p></div>
          <div className="flex flex-wrap gap-2 shrink-0"><button type="button" className="btn-outline" onClick={() => setModal({ type: "profile", initial: { title: will?.title || "My Will & Inheritance" } })}>Edit title</button><button type="button" className="btn-outline" onClick={lock}>🔒 Lock</button></div>
        </div>
      </header>

      <ErrorBanner message={error} onDismiss={() => setError("")} />
      {notice && <div className="rounded-xl border border-accent-notes/30 bg-accent-notes/5 px-3.5 py-3 mb-4 text-[11px] text-accent-notes">✓ {notice}</div>}

      <div className="grid gap-4">
        <div className="estate-summary-grid"><div><span>Total assets</span><strong>{assets.length}</strong><small>Across {new Set(assets.map(item => item.type)).size} categories</small></div><div><span>Estimated value</span><strong>{estimatedEstateValue ? estimatedEstateValue.toLocaleString() : "—"}</strong><small>Based on values you recorded</small></div><div><span>Beneficiaries</span><strong>{beneficiaries.length}</strong><small>{assets.reduce((sum, asset) => sum + (asset.allocations?.length || 0), 0)} asset allocations</small></div><div><span>Protected files</span><strong>{documents.length}</strong><small>Stored inside the Will vault</small></div></div>
        <CompletionCard items={completionItems} attention={attentionItems} />

        <Section eyebrow="01 · WILL DETAILS" title="Your wishes & instructions" count={`${details.length} ${details.length === 1 ? "detail" : "details"}`} description="Create focused records instead of putting your entire estate plan into one long form." action={<button type="button" className="btn-primary" onClick={() => setModal({ type: "detail", initial: EMPTY_DETAIL })}>+ Add Will Detail</button>}>
          {details.length === 0 ? <EmptyState title="No Will details yet" description="Add personal wishes, funeral wishes, digital legacy instructions, family messages or other special requests." action={<button type="button" className="btn-outline" onClick={() => setModal({ type: "detail", initial: EMPTY_DETAIL })}>+ Add Will Detail</button>} /> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">{details.map((item) => <RecordCard key={item.id} to={`/will/details/${item.id}`} title={item.title} meta={`Updated ${shortDate(item.updatedAt)}`} badge={item.type.replaceAll("-", " ")} description={item.content} actions={<><button type="button" className="text-[10px] font-semibold text-ink-soft" onClick={() => setModal({ type: "detail", id: item.id, initial: { type: item.type, title: item.title, content: item.content } })}>Edit</button><button type="button" className="text-[10px] font-semibold text-danger" onClick={() => setDeleteTarget({ type: "detail", id: item.id, label: "Will detail", name: item.title })}>Delete</button></>} />)}</div>}
        </Section>

        <Section eyebrow="02 · ASSETS" title="What you own" count={`${assets.length} ${assets.length === 1 ? "asset" : "assets"}`} description="Keep concise summaries here. Open an asset to see its full record and supporting documents." action={<button type="button" className="btn-primary" onClick={() => setModal({ type: "asset", initial: EMPTY_ASSET })}>+ Add Asset</button>}>
          {assets.length > 0 && <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 mb-4"><input className="input" value={assetQuery} onChange={(e) => setAssetQuery(e.target.value)} placeholder="Search assets…" /><select className="input sm:w-[170px]" value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)}>{ASSET_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="input sm:w-[170px]" value={assetSort} onChange={(e) => setAssetSort(e.target.value)}><option value="recent">Recently updated</option><option value="name">Name</option><option value="value">Estimated value</option></select></div>}
          {assets.length === 0 ? <EmptyState title="No assets yet" description="Keep property, accounts, investments, vehicles, valuables and digital assets organised here." action={<button type="button" className="btn-outline" onClick={() => setModal({ type: "asset", initial: EMPTY_ASSET })}>+ Add Asset</button>} /> : filteredAssets.length === 0 ? <EmptyState title="No matching assets" description="Try another search or filter." /> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">{filteredAssets.map((item) => <RecordCard key={item.id} to={`/will/assets/${item.id}`} title={item.name} meta={item.estimatedValue || "Value not specified"} badge={item.type} description={item.description} actions={<><button type="button" className="text-[10px] font-semibold text-ink-soft" onClick={() => setModal({ type: "asset", id: item.id, initial: { ...EMPTY_ASSET, ...item } })}>Edit</button><button type="button" className="text-[10px] font-semibold text-danger" onClick={() => setDeleteTarget({ type: "asset", id: item.id, label: "Asset", name: item.name })}>Delete</button></>} />)}</div>}
        </Section>

        <Section eyebrow="03 · BENEFICIARIES" title="Who should receive what" count={`${beneficiaries.length} ${beneficiaries.length === 1 ? "beneficiary" : "beneficiaries"}`} description="Record people, organisations, charities or trusts and describe their entitlement clearly." action={<button type="button" className="btn-primary" onClick={() => setModal({ type: "beneficiary", initial: EMPTY_BENEFICIARY })}>+ Add Beneficiary</button>}>
          {beneficiaries.length > 0 && <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 mb-4"><input className="input" value={beneficiaryQuery} onChange={(e) => setBeneficiaryQuery(e.target.value)} placeholder="Search beneficiaries…" /><select className="input sm:w-[170px]" value={beneficiaryFilter} onChange={(e) => setBeneficiaryFilter(e.target.value)}>{BENEFICIARY_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="input sm:w-[170px]" value={beneficiarySort} onChange={(e) => setBeneficiarySort(e.target.value)}><option value="recent">Recently updated</option><option value="name">Name</option><option value="allocation">Allocation</option></select></div>}
          {beneficiaries.length === 0 ? <EmptyState title="No beneficiaries yet" description="Add the people or organisations you want your Will to recognise." action={<button type="button" className="btn-outline" onClick={() => setModal({ type: "beneficiary", initial: EMPTY_BENEFICIARY })}>+ Add Beneficiary</button>} /> : filteredBeneficiaries.length === 0 ? <EmptyState title="No matching beneficiaries" description="Try another search or filter." /> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">{filteredBeneficiaries.map((item) => <RecordCard key={item.id} to={`/will/beneficiaries/${item.id}`} title={item.name} meta={item.allocation || "Entitlement not specified"} badge={item.beneficiaryType} description={item.relationship || item.specificEntitlement} actions={<><button type="button" className="text-[10px] font-semibold text-ink-soft" onClick={() => setModal({ type: "beneficiary", id: item.id, initial: { ...EMPTY_BENEFICIARY, ...item } })}>Edit</button><button type="button" className="text-[10px] font-semibold text-danger" onClick={() => setDeleteTarget({ type: "beneficiary", id: item.id, label: "Beneficiary", name: item.name })}>Delete</button></>} />)}</div>}
        </Section>

        <Section eyebrow="04 · DIGITAL LEGACY" title="Your digital estate" count={`${details.filter((x) => String(x.type || "").replaceAll("_", "-") === "digital-legacy").length} ${details.filter((x) => String(x.type || "").replaceAll("_", "-") === "digital-legacy").length === 1 ? "record" : "records"}`} description="Document how you want email, domains, cloud files, subscriptions, cryptocurrency and other digital assets handled. Never store raw passwords here." action={<button type="button" className="btn-outline" onClick={() => setModal({ type: "detail", initial: { ...EMPTY_DETAIL, type: "digital-legacy", title: "Digital Legacy" } })}>+ Add Digital Legacy</button>}>
          {details.filter((x) => String(x.type || "").replaceAll("_", "-") === "digital-legacy").length === 0 ? <EmptyState title="No digital legacy record yet" description="Create a focused record for digital accounts, files, domains, subscriptions or cryptocurrency instructions." /> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">{details.filter((x) => String(x.type || "").replaceAll("_", "-") === "digital-legacy").map((item) => <RecordCard key={item.id} to={`/will/details/${item.id}`} title={item.title} meta={`Updated ${shortDate(item.updatedAt)}`} badge="digital legacy" description={item.content} actions={<><button type="button" className="text-[10px] font-semibold text-ink-soft" onClick={() => setModal({ type: "detail", id: item.id, initial: { type: item.type, title: item.title, content: item.content } })}>Edit</button><button type="button" className="text-[10px] font-semibold text-danger" onClick={() => setDeleteTarget({ type: "detail", id: item.id, label: "Will detail", name: item.title })}>Delete</button></>} />)}</div>}
        </Section>

        <div className="grid lg:grid-cols-2 gap-4">
          <Section eyebrow="05 · EXECUTORS" title="Personal representatives" count={`${executors.length} ${executors.length === 1 ? "executor" : "executors"}`} description="Optionally record the people you trust to help administer your wishes." action={<button type="button" className="btn-outline" onClick={() => setModal({ type: "executor", initial: EMPTY_EXECUTOR })}>+ Add Executor</button>}>
            {executors.length === 0 ? <EmptyState title="No executor added" description="Add one or more personal representatives if appropriate." /> : <div className="grid gap-2.5">{executors.map((item) => <RecordCard key={item.id} to={`/will/executors/${item.id}`} title={item.name} meta={item.relationship || "Personal representative"} description={item.contact} actions={<><button type="button" className="text-[10px] font-semibold text-ink-soft" onClick={() => setModal({ type: "executor", id: item.id, initial: { ...EMPTY_EXECUTOR, ...item } })}>Edit</button><button type="button" className="text-[10px] font-semibold text-danger" onClick={() => setDeleteTarget({ type: "executor", id: item.id, label: "Executor", name: item.name })}>Delete</button></>} />)}</div>}
          </Section>

          <Section eyebrow="06 · IMPORTANT CONTACTS" title="People who may need to help" count={`${contacts.length} ${contacts.length === 1 ? "contact" : "contacts"}`} action={<button type="button" className="btn-outline" onClick={() => setModal({ type: "contact", initial: EMPTY_CONTACT })}>+ Add Contact</button>}>
            {contacts.length === 0 ? <EmptyState title="No important contacts" description="Lawyers, advisers, family members and other people can be kept here." /> : <div className="grid gap-2.5">{contacts.map((item) => <RecordCard key={item.id} to={`/will/contacts/${item.id}`} title={item.name} meta={item.type} description={[item.phone, item.email].filter(Boolean).join(" · ")} actions={<><button type="button" className="text-[10px] font-semibold text-ink-soft" onClick={() => setModal({ type: "contact", id: item.id, initial: { ...EMPTY_CONTACT, ...item } })}>Edit</button><button type="button" className="text-[10px] font-semibold text-danger" onClick={() => setDeleteTarget({ type: "contact", id: item.id, label: "Contact", name: item.name })}>Delete</button></>} />)}</div>}
          </Section>
        </div>

        <Section eyebrow="07 · DOCUMENTS" title="Supporting documents" count={`${documents.length} ${documents.length === 1 ? "file" : "files"}`} description="Documents are stored separately from the Will text and can be attached to specific records from their detail pages." action={<Link to="/will" className="text-[10.5px] font-semibold text-accent-notes">Protected files</Link>}>
          <WillDocuments documents={documents} onChange={(next) => setWill((current) => ({ ...current, documents: next }))} />
        </Section>

        <Section eyebrow="08 · ACTIVITY" title="Recent activity" description="A lightweight audit trail of changes made inside this protected workspace.">
          {activities.length === 0 ? <p className="text-[10.5px] text-ink-muted">No activity recorded yet.</p> : <div className="grid gap-2">{activities.slice(0, 8).map((item) => <div key={item.id} className="flex items-start justify-between gap-4 rounded-lg border border-app-border bg-app-panel2 px-3 py-2.5"><div><p className="text-[10.5px] font-semibold">{item.message}</p><p className="text-[9.5px] text-ink-muted mt-0.5">{item.action} · {item.entityType}</p></div><time className="text-[9.5px] text-ink-muted shrink-0">{shortDate(item.createdAt)}</time></div>)}</div>}
        </Section>

        <p className="text-[9.5px] text-ink-muted leading-relaxed max-w-3xl">Veynote is a private record-keeping workspace. Information stored here is not a substitute for a legally executed Will, estate-planning instrument or professional legal advice. Review important arrangements with a qualified professional where appropriate.</p>
      </div>

      <WillModal open={modal?.type === "profile"} title="Edit Will Title" onClose={closeModal}><WillProfileForm initialTitle={modal?.initial?.title} onSubmit={saveProfile} onCancel={closeModal} busy={busy} /></WillModal>
      <WillModal open={modal?.type === "detail"} title={modal?.id ? "Edit Will Detail" : "Add Will Detail"} description="Create one focused record for a specific part of your wishes." onClose={closeModal}><WillDetailForm initial={modal?.initial || EMPTY_DETAIL} onSubmit={saveDetail} onCancel={closeModal} busy={busy} /></WillModal>
      <WillModal open={modal?.type === "asset"} title={modal?.id ? "Review & Edit Asset" : "Build an Asset Record"} wide onClose={closeModal}><AssetForm initial={modal?.initial || EMPTY_ASSET} beneficiaries={beneficiaries} executors={executors} onCreateBeneficiary={createBeneficiaryFromAsset} onSubmit={saveAsset} onCancel={closeModal} busy={busy} /></WillModal>
      <WillModal open={modal?.type === "beneficiary"} title={modal?.id ? "Edit Beneficiary" : "Add Beneficiary"} description="Describe the intended entitlement clearly." wide onClose={closeModal}><BeneficiaryForm initial={modal?.initial || EMPTY_BENEFICIARY} assets={assets} onSubmit={saveBeneficiary} onCancel={closeModal} busy={busy} /></WillModal>
      <WillModal open={modal?.type === "contact"} title={modal?.id ? "Edit Contact" : "Add Important Contact"} onClose={closeModal}><ContactForm initial={modal?.initial || EMPTY_CONTACT} onSubmit={saveContact} onCancel={closeModal} busy={busy} /></WillModal>
      <WillModal open={modal?.type === "executor"} title={modal?.id ? "Edit Executor" : "Add Executor"} description="You can add more than one personal representative." wide onClose={closeModal}><ExecutorForm initial={modal?.initial || EMPTY_EXECUTOR} onSubmit={saveExecutor} onCancel={closeModal} busy={busy} /></WillModal>
      <DeleteConfirmation open={Boolean(deleteTarget)} title={`Delete ${deleteTarget?.label || "record"}?`} message={`Are you sure you want to remove ${deleteTarget?.name ? `“${deleteTarget.name}”` : "this record"}? This action cannot be undone.`} busy={busy} onCancel={() => !busy && setDeleteTarget(null)} onConfirm={deleteRecord} />
    </div>
  );
}
