import { Link } from "react-router-dom";
import NavigationIcon from "./layout/NavigationIcon.jsx";
import "./quickCaptureBar.css";

const actions = [
  { label: "Quick note", icon: "note", to: "/notes/new" },
  { label: "Daily reflection", icon: "book", to: "/journal/new" },
  { label: "Meeting notes", icon: "files", to: "/notes/new?template=meeting-notes" },
  { label: "New task", icon: "tasks", to: "/notes/tasks?new=1" },
];

export default function QuickCaptureBar({ compact = false }) {
  return <section className={`quick-capture-bar${compact ? " is-compact" : ""}`} aria-label="Quick capture">
    <div className="quick-capture-intro"><span className="quick-capture-mark"><NavigationIcon name="plus" size={19} /></span><span><strong>Capture while it matters.</strong><small>A thought, a commitment, or the context behind your day.</small></span></div>
    <nav className="quick-capture-actions" aria-label="Choose what to capture">{actions.map(action => <Link key={action.to} to={action.to}><NavigationIcon name={action.icon} size={17} />{action.label}</Link>)}</nav>
  </section>;
}
