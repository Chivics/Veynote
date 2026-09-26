import { Link } from "react-router-dom";
import "./auth.css";

export default function AuthFrame({ eyebrow = "Your private workspace", title, description, children, footer }) {
  return <main className="auth-experience">
    <section className="auth-experience-main">
      <Link className="auth-brand" to="/login" aria-label="Veynote sign in">
        <img src="/logo.png" alt="" />
        <span>Veynote</span>
      </Link>
      <div className="auth-experience-center">
        <div className="auth-experience-heading">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {children}
      </div>
      <footer className="auth-experience-footer"><span>veynote.app</span><span>{footer || "A quieter place for important work."}</span></footer>
    </section>
    <aside className="auth-experience-story" aria-label="About Veynote">
      <div className="auth-story-orbit" aria-hidden="true"><i /><i /><i /></div>
      <div className="auth-story-content">
        <span className="eyebrow">Ideas today. A brighter tomorrow.</span>
        <h2>A private place for work that matters.</h2>
        <p>Your writing, decisions, trades, and business records stay connected as your history grows.</p>
        <div className="auth-story-record" aria-hidden="true">
          <span>YOUR RECORDS, CONNECTED</span>
          <strong>Capture the thought.<br />Keep the context.</strong>
          <div><i /> Writing <b>→</b> Decision <b>→</b> Outcome</div>
        </div>
        <small>Return with clarity, wherever your work takes you.</small>
      </div>
    </aside>
  </main>;
}

export function GoogleIcon() {
  return <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 -8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4c-7.4 0-13.8 4.1-17.1 10.1-.3.5-.5 1-.6 1.6z" />
    <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.5 26.9 36.4 24 36.4c-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.1 39.8 16 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.5 36.5 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z" />
  </svg>;
}
