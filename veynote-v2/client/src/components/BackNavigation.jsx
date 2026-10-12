import { Link } from "react-router-dom";
import "./backNavigation.css";

export function BackChevron() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m14 5-7 7 7 7" /></svg>;
}

/** Shared visual treatment; callers retain their own guarded navigation behavior. */
export default function BackNavigation({ label, to, onClick, disabled = false, className = "", ...props }) {
  const content = <><BackChevron /><strong>{label}</strong></>;
  const attributes = { ...props, className: `veynote-back-navigation ${className}`.trim(), "aria-label": props["aria-label"] || `Back to ${label}` };
  if (to && !disabled) return <Link {...attributes} to={to} onClick={onClick}>{content}</Link>;
  return <button {...attributes} type="button" disabled={disabled} onClick={onClick}>{content}</button>;
}
