import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import InstallApp from "../components/InstallApp";

const TABS = ["Profile", "Preferences", "Security"];

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState("Profile");
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

  return (
    <div>
      <span className="eyebrow">ACCOUNT</span>
      <h1 className="page-title text-[30px] tracking-tight my-1.5 mb-6">Settings</h1>
      <div className="mb-6"><InstallApp /></div>
      <div role="status" className="text-sm mb-3">{saving ? "Saving preferences…" : saved ? "Saved" : ""}</div>
      {saveError && <p role="alert" className="text-danger mb-3">{saveError} Your preference was not saved. Try the control again.</p>}

      <div className="flex gap-[22px] border-b border-app-border mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[12.5px] font-semibold pb-2.5 -mb-px border-b-2 transition whitespace-nowrap ${
              tab === t ? "text-ink border-accent-notes" : "text-ink-muted border-transparent"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="card max-w-[640px] overflow-hidden">
        {tab === "Profile" && (
          <div className="p-5 flex flex-col gap-4">
            <div>
              <label className="text-[11px] text-ink-muted block mb-1.5">Full name</label>
              <input aria-label="Full name" className="input" disabled={saving} value={name} onChange={(e) => setName(e.target.value)} onBlur={saveProfile} />
            </div>
            <div>
              <label className="text-[11px] text-ink-muted block mb-1.5">Email</label>
              <input className="input opacity-60" value={user?.email || ""} disabled />
            </div>
            {saved && <p className="text-success text-[11px] m-0">Saved.</p>}
          </div>
        )}

        {tab === "Preferences" && (
          <>
            <SettingRow title="Theme" desc="Choose your preferred interface theme.">
              <div className="flex gap-1.5 flex-wrap">
                {["dark", "light", "system"].map((t) => (
                  <button
                    key={t}
                    disabled={saving}
                    onClick={() => saveTheme(t)}
                    className={`text-[11px] rounded-lg px-2.5 py-1.5 border border-app-border capitalize ${
                      theme === t ? "bg-ink text-app-bg" : "bg-app-panel2 text-ink"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </SettingRow>
            <SettingRow title="Editor font size" desc="Choose the default reading size for your writing canvas.">
              <div className="flex gap-1.5 flex-wrap">
                {["small", "medium", "comfort", "large", "display", "xlarge"].map((s) => (
                  <button
                    key={s}
                    disabled={saving}
                    onClick={() => saveFontSize(s)}
                    className={`text-[11px] rounded-lg px-2.5 py-1.5 border border-app-border capitalize ${
                      fontSize === s ? "bg-ink text-app-bg" : "bg-app-panel2 text-ink"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </SettingRow>
          </>
        )}

        {tab === "Security" && <ChangePasswordSection hasPassword={user?.hasPassword} />}
      </div>
    </div>
  );
}

function ChangePasswordSection({ hasPassword }) {
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
      const { message } = await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
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
    <div className="px-5 py-[18px] border-b border-app-border last:border-0 flex justify-between items-center gap-4 flex-wrap">
      <div>
        <b className="block text-[12.5px] mb-0.5">{title}</b>
        <span className="text-[11px] text-ink-muted">{desc}</span>
      </div>
      {children}
    </div>
  );
}
