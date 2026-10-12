import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { WORKSPACES } from "../../components/layout/navigationConfig";
import { startingWorkspace } from "../../utils/workspace";
import "../../components/auth/auth.css";

const details = {
  Notes: { description: "A clear space for ideas, writing, and knowledge.", areas: ["Write", "Organize", "Remember"], accent: "var(--accent-notes)" },
  Trading: { description: "Document your process. Review your decisions.", areas: ["Journal", "Analyze", "Refine"], accent: "var(--accent-trade)" },
  Business: { description: "Keep your customers, opportunities, and work connected.", areas: ["Customers", "Pipeline", "Follow-ups"], accent: "var(--success)" },
  Library: { description: "Make room for what you want to read, explore, and achieve.", areas: ["Reading", "Experiences", "Goals"], accent: "var(--accent-gold)" },
  Journal: { description: "Capture today. Understand how your story changes.", areas: ["Reflect", "Timeline", "Insights"], accent: "var(--accent-notes)" },
  Vault: { description: "An independent boundary for your sensitive records.", areas: ["Locked notes", "Estate planning"], accent: "var(--accent-gold)" },
};

export default function PickMode() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [picked, setPicked] = useState(() => startingWorkspace(user));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await updateUser({ defaultWorkspace: picked, defaultMode: picked === "Trading" ? "TRADING" : "NOTES" });
      navigate(WORKSPACES[picked].home, { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Your workspace preference couldn't be saved. Retry or open it for this visit.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="workspace-arrival">
    <header className="workspace-arrival-header">
      <div className="auth-brand"><img src="/logo.png" alt="" /><span>Veynote</span></div>
      <button type="button" className="workspace-account" disabled={loading} onClick={() => { logout(); navigate("/login", { replace: true }); }}><NavigationIcon name="logout" size={16} /><span>Switch account</span></button>
    </header>
    <div className="workspace-arrival-content">
      <div className="workspace-arrival-heading">
        <span className="eyebrow">YOUR WORK, CONNECTED</span>
        <h1>Choose your workspace.</h1>
        <p>Welcome{user?.name ? `, ${user.name.trim().split(/\s+/)[0]}` : " back"}. Choose your starting workspace. Everything else stays within reach.</p>
      </div>
      <fieldset className="workspace-arrival-grid" disabled={loading}>
        <legend className="sr-only">Choose a starting workspace</legend>
        {Object.entries(WORKSPACES).map(([name, workspace]) => <label key={name} className={`workspace-destination ${picked === name ? "is-selected" : ""}`} style={{ "--workspace-accent": "var(--accent-notes)" }}>
          <input type="radio" name="workspace" value={name} checked={picked === name} onChange={() => { setPicked(name); setError(""); }} />
          <div className="workspace-destination-top"><span className="workspace-destination-icon"><NavigationIcon name={workspace.icon} size={23} /></span><span className="workspace-selection-mark" aria-hidden="true">{picked === name && <NavigationIcon name="check" size={14} />}</span></div>
          <strong>{name}</strong><p>{details[name].description}</p>
          <div className="workspace-destination-areas">{details[name].areas.map(area => <span key={area}>{area}</span>)}</div>
        </label>)}
      </fieldset>
      <div className="workspace-arrival-continuation">
        <div><span className="eyebrow">YOUR STARTING WORKSPACE</span><strong>{picked}</strong><p>Saved to your account when you continue. Switch anytime.</p></div>
        <button type="button" className="auth-submit" onClick={handleContinue} disabled={loading}>{loading ? "Saving your preference…" : `Enter ${picked}`}<NavigationIcon name="chevron" size={17} /></button>
      </div>
      {error && <div className="auth-form-error" role="alert"><p>{error}</p><button className="auth-secondary-action" type="button" onClick={() => navigate(WORKSPACES[picked].home, { replace: true })}>Open {picked} without saving preference</button></div>}
      <p className="workspace-arrival-security"><NavigationIcon name="shield" size={14} /> Your records stay private. Vault access requires its own verification.</p>
    </div>
    <footer className="workspace-arrival-footer"><span>veynote.app</span><span>Capture. Connect. Remember.</span></footer>
  </main>;
}
