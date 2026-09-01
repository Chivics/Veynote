import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function PickMode() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [picked, setPicked] = useState("NOTES");
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    setLoading(true);
    try {
      await updateUser({ defaultMode: picked });
    } finally {
      navigate(picked === "NOTES" ? "/notes" : "/trading");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-[340px] flex flex-col items-center gap-5">
        <div className="w-[42px] h-[42px] flex items-center justify-center"><img src="/logo.png" alt="Veynote" className="w-full h-full object-contain" /></div>
        <div className="text-center">
          <h1 className="text-[19px] font-bold mb-1">What brings you to Veynote?</h1>
          <p className="text-[11.5px] text-ink-muted m-0">Just picks where you land first — you'll always have both.</p>
        </div>

        <div className="flex gap-2.5 w-full">
          <button
            onClick={() => setPicked("NOTES")}
            className={`flex-1 rounded-xl p-4 text-center text-[11.5px] border transition ${
              picked === "NOTES"
                ? "border-accent-notes bg-accent-notes-soft text-white"
                : "border-app-border bg-app-panel text-ink-soft"
            }`}
          >
            📓
            <br />
            Journaling
          </button>
          <button
            onClick={() => setPicked("TRADING")}
            className={`flex-1 rounded-xl p-4 text-center text-[11.5px] border transition ${
              picked === "TRADING"
                ? "border-accent-notes bg-accent-notes-soft text-white"
                : "border-app-border bg-app-panel text-ink-soft"
            }`}
          >
            📈
            <br />
            Trading
          </button>
        </div>

        <button onClick={handleContinue} disabled={loading} className="btn-primary w-full justify-center disabled:opacity-60">
          {loading ? "Setting up…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
