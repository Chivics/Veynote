import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AccountEmailVerification() {
  const { user } = useAuth();
  const verified = Boolean(user?.emailVerifiedAt);
  return <section className="px-5 py-[18px] border-b border-app-border flex items-start justify-between gap-4 flex-wrap" aria-labelledby="account-email-heading">
    <div className="min-w-0"><h2 id="account-email-heading" className="text-sm font-bold">Recovery email</h2><p className="text-xs text-ink-muted mt-1 break-all">{user?.email}</p><p className="text-xs text-ink-muted mt-2">{verified ? "Email verified. Your account recovery address is confirmed." : "Confirm your address so you can securely recover your account."}</p></div>
    {verified ? <span className="text-success text-xs font-semibold">Verified</span> : <Link className="btn-outline" to="/verify-email">Verify email</Link>}
  </section>;
}
