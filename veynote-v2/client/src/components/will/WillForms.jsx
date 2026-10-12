import { useEffect, useState } from "react";
import { Field } from "./WillSection";
import EstateAssetWizard from "./EstateAssetWizard.jsx";

const inputClass = "input w-full";
const textareaClass = "input w-full min-h-[110px] resize-y";

export const EMPTY_DETAIL = {
  type: "personal-wishes",
  title: "",
  content: "",
};

export const EMPTY_ASSET = {
  name: "",
  type: "property",
  description: "",
  estimatedValue: "",
  currency: "",
  location: "",
  institution: "",
  accountReference: "",
  ownership: "",
  instructionType: "",
  instructions: "",
  responsibleExecutorId: "",
  allocations: [],
};

export const EMPTY_BENEFICIARY = {
  name: "",
  beneficiaryType: "PERSON",
  relationship: "",
  contact: "",
  allocation: "",
  specificEntitlement: "",
  specificAssetId: "",
  notes: "",
  specialInstructions: "",
};

export const EMPTY_CONTACT = {
  name: "",
  type: "OTHER",
  phone: "",
  email: "",
  notes: "",
};

export const EMPTY_EXECUTOR = {
  name: "",
  relationship: "",
  contact: "",
  address: "",
  notes: "",
  instructions: "",
};

export const EMPTY_LIABILITY = {
  name: "",
  type: "mortgage",
  lender: "",
  amount: "",
  currency: "",
  accountReference: "",
  assetId: "",
  dueDate: "",
  status: "ACTIVE",
  notes: "",
};

const LIABILITY_TYPES = [
  ["mortgage", "Mortgage"], ["loan", "Loan"], ["credit", "Credit obligation"],
  ["tax", "Tax liability"], ["business", "Business obligation"], ["other", "Other"],
];

export const DETAIL_TYPES = [
  ["personal-wishes", "Personal wishes"],
  ["funeral-wishes", "Funeral wishes"],
  ["medical-preferences", "Medical preferences"],
  ["digital-legacy", "Digital legacy"],
  ["important-instructions", "Important instructions"],
  ["family-message", "Family message"],
  ["guardian-info", "Guardian information"],
  ["special-requests", "Special requests"],
  ["other", "Other"],
];

export const ASSET_TYPES = [
  ["property", "Property"],
  ["bank", "Bank account"],
  ["investment", "Investment"],
  ["vehicle", "Vehicle"],
  ["business", "Business"],
  ["cryptocurrency", "Cryptocurrency"],
  ["jewellery", "Jewellery"],
  ["personal_valuables", "Personal valuables"],
  ["insurance", "Insurance"],
  ["intellectual_property", "Intellectual property"],
  ["digital_asset", "Digital asset"],
  ["other", "Other"],
];

export const BENEFICIARY_TYPES = [
  ["PERSON", "Person"],
  ["ORGANISATION", "Organisation"],
  ["CHARITY", "Charity"],
  ["TRUST", "Trust"],
  ["OTHER", "Other"],
];

export const CONTACT_TYPES = [
  ["LAWYER", "Lawyer"],
  ["EXECUTOR", "Executor"],
  ["FAMILY", "Family member"],
  ["FINANCIAL_ADVISER", "Financial adviser"],
  ["ACCOUNTANT", "Accountant"],
  ["DOCTOR", "Doctor"],
  ["INSURANCE", "Insurance contact"],
  ["OTHER", "Other"],
];

function Buttons({ busy, cancelLabel = "Cancel", saveLabel = "Save" , onCancel }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
      <button type="button" className="btn-outline" disabled={busy} onClick={onCancel}>
        {cancelLabel}
      </button>
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Saving..." : saveLabel}
      </button>
    </div>
  );
}

function FormShell({ children, onSubmit }) {
  return <form onSubmit={onSubmit} className="space-y-5">{children}</form>;
}

export function WillProfileForm({ initialTitle = "My Will & Inheritance", onSubmit, onCancel, busy = false }) {
  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({ title: initialTitle });
  };

  return <ProfileEditor initialTitle={initialTitle} onSubmit={onSubmit} onCancel={onCancel} busy={busy} />;
}

function ProfileEditor({ initialTitle, onSubmit, onCancel, busy }) {
  const [title, setTitle] = useLocalValue(initialTitle);
  return (
    <FormShell onSubmit={(event) => { event.preventDefault(); onSubmit({ title }); }}>
      <Field label="Will title" hint="Use a name that makes this private workspace easy to recognise.">
        <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </Field>
      <Buttons busy={busy} saveLabel="Save title" onCancel={onCancel} />
    </FormShell>
  );
}

function useLocalValue(value) {
  const [state, setState] = useState(value ?? "");
  useEffect(() => setState(value ?? ""), [value]);
  return [state, setState];
}

export function WillDetailForm({ initial = EMPTY_DETAIL, onSubmit, onCancel, busy = false }) {
  const [value, setValue] = useLocalValueObject({ ...EMPTY_DETAIL, ...initial });
  return (
    <FormShell onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
      <Field label="Section type">
        <select className={inputClass} value={value.type} onChange={(e) => setValue({ ...value, type: e.target.value })}>
          {DETAIL_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </Field>
      <Field label="Title">
        <input className={inputClass} value={value.title} onChange={(e) => setValue({ ...value, title: e.target.value })} required />
      </Field>
      <Field label="Content" hint="Never store passwords, PINs, recovery codes, private keys or other authentication secrets in ordinary Will fields.">
        <textarea className={textareaClass} value={value.content} onChange={(e) => setValue({ ...value, content: e.target.value })} required />
      </Field>
      <Buttons busy={busy} saveLabel="Save section" onCancel={onCancel} />
    </FormShell>
  );
}

export function AssetForm({ initial = EMPTY_ASSET, beneficiaries = [], executors = [], onCreateBeneficiary, onSubmit, onCancel, busy = false }) {
  return <EstateAssetWizard initial={{ ...EMPTY_ASSET, ...initial }} beneficiaries={beneficiaries} executors={executors} onCreateBeneficiary={onCreateBeneficiary} onSubmit={onSubmit} onCancel={onCancel} busy={busy} />;
}

export function BeneficiaryForm({ initial = EMPTY_BENEFICIARY, assets = [], onSubmit, onCancel, busy = false }) {
  const [value, setValue] = useLocalValueObject({ ...EMPTY_BENEFICIARY, ...initial });
  return (
    <FormShell onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
      <Field label="Beneficiary name"><input className={inputClass} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} required /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Beneficiary type"><select className={inputClass} value={String(value.beneficiaryType || "PERSON").toUpperCase()} onChange={(e) => setValue({ ...value, beneficiaryType: e.target.value })}>{BENEFICIARY_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Relationship"><input className={inputClass} value={value.relationship} onChange={(e) => setValue({ ...value, relationship: e.target.value })} placeholder="e.g. Daughter" /></Field>
      </div>
      <Field label="Contact"><input className={inputClass} value={value.contact} onChange={(e) => setValue({ ...value, contact: e.target.value })} placeholder="Phone or other contact information" /></Field>
      <Field label="Allocation"><input className={inputClass} value={value.allocation} onChange={(e) => setValue({ ...value, allocation: e.target.value })} placeholder="e.g. 50%" /></Field>
      <Field label="Specific entitlement"><textarea className={textareaClass} value={value.specificEntitlement} onChange={(e) => setValue({ ...value, specificEntitlement: e.target.value })} placeholder="What should this beneficiary receive?" /></Field>
      <Field label="Specific asset" hint="Optional. Select an asset already recorded in this Will."><select className={inputClass} value={value.specificAssetId || ""} onChange={(e) => setValue({ ...value, specificAssetId: e.target.value })}><option value="">None</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></Field>
      <Field label="Notes"><textarea className={textareaClass} value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} /></Field>
      <Field label="Special instructions"><textarea className={textareaClass} value={value.specialInstructions} onChange={(e) => setValue({ ...value, specialInstructions: e.target.value })} /></Field>
      <Buttons busy={busy} saveLabel="Save beneficiary" onCancel={onCancel} />
    </FormShell>
  );
}

export function ContactForm({ initial = EMPTY_CONTACT, onSubmit, onCancel, busy = false }) {
  const [value, setValue] = useLocalValueObject({ ...EMPTY_CONTACT, ...initial });
  return (
    <FormShell onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
      <Field label="Name"><input className={inputClass} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} required /></Field>
      <Field label="Contact type"><select className={inputClass} value={String(value.type || "OTHER").toUpperCase()} onChange={(e) => setValue({ ...value, type: e.target.value })}>{CONTACT_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Phone"><input className={inputClass} value={value.phone} onChange={(e) => setValue({ ...value, phone: e.target.value })} /></Field>
        <Field label="Email"><input className={inputClass} type="email" value={value.email} onChange={(e) => setValue({ ...value, email: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><textarea className={textareaClass} value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} /></Field>
      <Buttons busy={busy} saveLabel="Save contact" onCancel={onCancel} />
    </FormShell>
  );
}

export function ExecutorForm({ initial = EMPTY_EXECUTOR, onSubmit, onCancel, busy = false }) {
  const [value, setValue] = useLocalValueObject({ ...EMPTY_EXECUTOR, ...initial });
  return (
    <FormShell onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
      <Field label="Name"><input className={inputClass} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} required /></Field>
      <Field label="Relationship / role"><input className={inputClass} value={value.relationship} onChange={(e) => setValue({ ...value, relationship: e.target.value })} placeholder="e.g. Brother, solicitor, trusted friend" /></Field>
      <Field label="Contact"><input className={inputClass} value={value.contact} onChange={(e) => setValue({ ...value, contact: e.target.value })} /></Field>
      <Field label="Address"><textarea className={textareaClass} value={value.address} onChange={(e) => setValue({ ...value, address: e.target.value })} /></Field>
      <Field label="Notes"><textarea className={textareaClass} value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} /></Field>
      <Field label="Instructions"><textarea className={textareaClass} value={value.instructions} onChange={(e) => setValue({ ...value, instructions: e.target.value })} /></Field>
      <Buttons busy={busy} saveLabel="Save executor" onCancel={onCancel} />
    </FormShell>
  );
}

export function LiabilityForm({ initial = EMPTY_LIABILITY, assets = [], onSubmit, onCancel, busy = false }) {
  const prepared = { ...EMPTY_LIABILITY, ...initial, dueDate: initial?.dueDate ? String(initial.dueDate).slice(0, 10) : "" };
  const [value, setValue] = useLocalValueObject(prepared);
  return (
    <FormShell onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
      <div className="estate-form-intro"><span>OBLIGATION RECORD</span><strong>Document what the estate must settle.</strong><p>Connect a mortgage, loan, tax liability, or other obligation to the asset it affects so the net position remains understandable.</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Liability name"><input className={inputClass} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} placeholder="e.g. Victoria Island mortgage" required /></Field>
        <Field label="Type"><select className={inputClass} value={value.type} onChange={(e) => setValue({ ...value, type: e.target.value })}>{LIABILITY_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Lender / creditor"><input className={inputClass} value={value.lender} onChange={(e) => setValue({ ...value, lender: e.target.value })} /></Field>
        <Field label="Account / reference"><input className={inputClass} value={value.accountReference} onChange={(e) => setValue({ ...value, accountReference: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Outstanding amount"><input className={inputClass} inputMode="decimal" value={value.amount} onChange={(e) => setValue({ ...value, amount: e.target.value })} placeholder="0.00" /></Field>
        <Field label="Currency"><input className={inputClass} value={value.currency} onChange={(e) => setValue({ ...value, currency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="NGN" /></Field>
        <Field label="Status"><select className={inputClass} value={value.status} onChange={(e) => setValue({ ...value, status: e.target.value })}><option value="ACTIVE">Active</option><option value="DISPUTED">Disputed</option><option value="SETTLED">Settled</option><option value="FORGIVEN">Forgiven</option></select></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Related asset" hint="Optional. This relationship remains visible from the estate overview."><select className={inputClass} value={value.assetId || ""} onChange={(e) => setValue({ ...value, assetId: e.target.value })}><option value="">No specific asset</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></Field>
        <Field label="Due / review date"><input className={inputClass} type="date" value={value.dueDate || ""} onChange={(e) => setValue({ ...value, dueDate: e.target.value })} /></Field>
      </div>
      <Field label="Settlement notes" hint="Record practical instructions. Do not store online banking passwords, PINs, or security codes."><textarea className={textareaClass} value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} /></Field>
      <Buttons busy={busy} saveLabel="Save liability" onCancel={onCancel} />
    </FormShell>
  );
}

function useLocalValueObject(value) {
  const [state, setState] = useState(value);
  useEffect(() => setState(value), [JSON.stringify(value)]);
  return [state, setState];
}

// Backwards-compatible exports for any older Will page still importing these names.
export const WillAssetForm = AssetForm;
export const WillBeneficiaryForm = BeneficiaryForm;
export const WillContactForm = ContactForm;
export const WillExecutorForm = ExecutorForm;
