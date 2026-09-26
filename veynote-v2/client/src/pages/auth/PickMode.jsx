import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import AuthFrame from "../../components/auth/AuthFrame";

const choices = [
  { id: "NOTES", symbol: "✎", title: "Writing & knowledge", description: "Notes, journal, Library, and the things you want to remember." },
  { id: "TRADING", symbol: "↗", title: "Trading & review", description: "Trades, accounts, analysis, and a clearer view of your process." },
];

export default function PickMode() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [picked, setPicked] = useState("NOTES");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await updateUser({ defaultMode: picked });
      navigate(picked === "NOTES" ? "/notes" : "/trading", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Your starting workspace could not be saved. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return <AuthFrame eyebrow="One final preference" title="Where will you begin?" description="Choose the workspace you want to open first. Every workspace stays available, and you can change this later.">
    <div className="auth-choice-list" role="group" aria-label="Starting workspace">
      {choices.map((choice) => <button key={choice.id} type="button" className={`auth-choice ${picked === choice.id ? "is-active" : ""}`} aria-pressed={picked === choice.id} onClick={() => setPicked(choice.id)}>
        <span className="auth-choice-symbol" aria-hidden="true">{choice.symbol}</span>
        <span><strong>{choice.title}</strong><small>{choice.description}</small></span>
        <i aria-hidden="true" />
      </button>)}
    </div>
    {error && <p className="auth-form-error" role="alert">{error}</p>}
    <button type="button" onClick={handleContinue} disabled={loading} className="auth-submit">{loading ? "Saving your choice…" : "Continue to Veynote"}</button>
  </AuthFrame>;
}
