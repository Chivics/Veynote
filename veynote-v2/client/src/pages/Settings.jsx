import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import SessionPanel from "../components/SessionPanel";
import AccountPasskeys from "../components/AccountPasskeys";
import AccountEmailVerification from "../components/AccountEmailVerification";
import SessionProtectionSettings from "../components/SessionProtectionSettings";
import NavigationIcon from "../components/layout/NavigationIcon";
import "./settingsWorkspace.css";

const TABS = [
  { id: "Profile", icon: "account", label: "Profile", description: "Identity and account details" },
  { id: "Preferences", icon: "settings", label: "Preferences", description: "Appearance and writing defaults" },
  { id: "Security", icon: "shield", label: "Security", description: "Access, devices and recovery" },
];
const TAB_IDS = TABS.map((item) => item.id);

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = TAB_IDS.includes(params.get("tab")) ? params.get("tab") : "Profile";
  const setTab = next => setParams(current => { const updated = new URLSearchParams(current); updated.set("tab", next); return updated; }, { replace: true });
  const [name, setName] = useState(user?.name || "");
  const [theme, setTheme] = useState(user?.theme || "dark");
  const [fontSize, setFontSize] = useState(user?.editorFontSize || "medium");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function persist(patch) {
    setSaving(true); setSaved(false); setSaveError("");
    try { await updateUser(patch); flash(); return true; }
    catch (err) { setSaveError(err.message); return false; }
    finally { setSaving(false); }
  }

  async function saveProfile() {
    await persist({ name });
  }
  async function saveTheme(next) {
    if (await persist({ theme: next })) setTheme(next);
  }
  async function saveFontSize(next) {
    if (await persist({ editorFontSize: next })) setFontSize(next);
  }
  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const initials = (user?.name || user?.email || "V")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <main className="settings-workspace">
      <header className="settings-hero">
        <div className="settings-hero-copy">
          <span className="eyebrow">ACCOUNT CONSOLE</span>
          <h1>Your workspace, governed with clarity.</h1>
          <p>Control your identity, writing environment, trusted devices, and account protection from one private place.</p>
        </div>
        <div className="settings-identity-card" aria-label="Signed-in account">
          <span className="settings-avatar">{initials}</span>
          <span><strong>{user?.name || "Veynote member"}</strong><small>{user?.email}</small></span>
          <span className="settings-account-state"><i /> Protected</span>
        </div>
      </header>

      <div className="settings-feedback" aria-live="polite">
        {saving ? "Saving changes…" : saved ? "Changes saved" : ""}
        {saveError && <span role="alert">{saveError} Try the control again.</span>}
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <span className="settings-nav-label">Account settings</span>
          {TABS.map((item) => (
            <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)} className={tab === item.id ? "is-active" : ""}>
              <NavigationIcon name={item.icon} size={18} />
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <NavigationIcon name="chevronRight" size={15} />
            </button>
          ))}
          <div className="settings-nav-trust">
            <NavigationIcon name="lock" size={17} />
            <span><strong>Private by design</strong><small>Sensitive controls require your authenticated session.</small></span>
          </div>
        </nav>

        <section className="settings-content">
          <div className="settings-section-heading">
            <span className="settings-section-icon"><NavigationIcon name={TABS.find((item) => item.id === tab)?.icon} size={20} /></span>
            <div><span className="eyebrow">{tab.toUpperCase()}</span><h2>{TABS.find((item) => item.id === tab)?.description}</h2></div>
          </div>

          <div className="settings-card">
        {tab === "Profile" && (
          <div className="settings-profile-panel">
            <div className="settings-card-intro"><span className="settings-avatar settings-avatar-large">{initials}</span><div><h3>Your Veynote identity</h3><p>This information represents you across shared work and collaboration.</p></div></div>
            <div className="settings-field-grid">
            <div className="settings-field">
              <label>Full name</label>
              <input aria-label="Full name" className="input" disabled={saving} value={name} onChange={(e) => setName(e.target.value)} onBlur={saveProfile} />
            </div>
            <div className="settings-field">
              <label>Email address</label>
              <input className="input opacity-60" value={user?.email || ""} disabled />
            </div>
            </div>
            <div className="settings-profile-brief"><div><span>Workspace identity</span><strong>Personal</strong></div><div><span>Sign-in access</span><strong>{user?.hasPassword ? "Password + device" : "Device / connected account"}</strong></div></div>
          </div>
        )}

        {tab === "Preferences" && (
          <>
            <SettingRow title="Theme" desc="Choose your preferred interface theme.">
              <div className="settings-choice-grid theme-choices">
                {["dark", "light", "system"].map((t) => (
                  <button
                    key={t}
                    disabled={saving}
                    onClick={() => saveTheme(t)}
                    className={theme === t ? "is-selected" : ""}
                  >
                    <span className={`theme-preview theme-preview-${t}`}><i /><i /><i /></span><strong>{t}</strong>
                  </button>
                ))}
              </div>
            </SettingRow>
            <SettingRow title="Editor font size" desc="Choose the default reading size for your writing canvas.">
              <div className="settings-choice-grid type-choices">
                {["small", "medium", "comfort", "large", "display", "xlarge"].map((s) => (
                  <button
                    key={s}
                    disabled={saving}
                    onClick={() => saveFontSize(s)}
                    className={fontSize === s ? "is-selected" : ""}
                  >
                    <span className="type-sample">Aa</span><strong>{s}</strong>
                  </button>
                ))}
              </div>
            </SettingRow>
          </>
        )}

        {tab === "Security" && <><AccountEmailVerification /><SessionProtectionSettings /><ChangePasswordSection hasPassword={user?.hasPassword} /><AccountPasskeys /><SettingRow title="Locked Notes passkeys" desc="Use a passkey to unlock protected notes. Locked Notes access is managed separately from account sign-in."><Link to="/vault/documents" className="btn-outline">Open Locked Notes</Link></SettingRow><SessionPanel /></>}
          </div>
        </section>
      </div>
    </main>
  );
}

function ChangePasswordSection({ hasPassword }) {
  const { replaceSessionToken, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const { message, token } = await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      if (token) replaceSessionToken(token);
      await refresh({ block: false });
      setSuccess(message || "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setOpen(false), 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <SettingRow
        title={hasPassword ? "Password" : "Set a password"}
        desc={hasPassword ? "Change your account password." : "You signed up with Google — add a password to also be able to log in with email."}
      >
        {!open && (
          <button onClick={() => setOpen(true)} className="btn-outline">
            {hasPassword ? "Change password" : "Set password"}
          </button>
        )}
      </SettingRow>

      {open && (
        <form onSubmit={submit} className="px-5 py-[18px] border-b border-app-border last:border-0 flex flex-col gap-3">
          {hasPassword && (
            <div>
              <label className="text-[11px] text-ink-muted block mb-1.5">Current password</label>
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}
          <div>
            <label className="text-[11px] text-ink-muted block mb-1.5">New password</label>
            <input
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="text-[11px] text-ink-muted block mb-1.5">Confirm new password</label>
            <input
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-danger text-[11.5px] m-0">{error}</p>}
          {success && <p className="text-success text-[11.5px] m-0">{success}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
              {loading ? "Saving…" : "Save password"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError("");
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
              className="btn-outline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function SettingRow({ title, desc, children }) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <strong>{title}</strong>
        <span>{desc}</span>
      </div>
      {children}
    </div>
  );
}
