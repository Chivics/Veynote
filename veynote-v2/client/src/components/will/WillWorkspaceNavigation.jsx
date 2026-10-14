import { NavLink } from "react-router-dom";
import NavigationIcon from "../layout/NavigationIcon";

const ITEMS = [
  ["Overview", "/will", "home"],
  ["Assets", "/will/assets", "brief"],
  ["Liabilities", "/will/liabilities", "archive"],
  ["Beneficiaries", "/will/beneficiaries", "heart"],
  ["People", "/will/people", "account"],
  ["Instructions", "/will/instructions", "note"],
  ["Digital legacy", "/will/digital-legacy", "key"],
  ["Documents", "/will/documents", "files"],
  ["Activity", "/will/activity", "clock"],
  ["Security", "/will/security", "shield"],
];

export default function WillWorkspaceNavigation() {
  return <nav className="estate-workspace-nav" aria-label="Will and inheritance workspace">
    {ITEMS.map(([label, to, icon]) => <NavLink key={to} to={to} end={to === "/will"}>
      {({ isActive }) => <><NavigationIcon name={icon} size={15} /><span>{label}</span>{isActive && <i aria-hidden="true" />}</>}
    </NavLink>)}
  </nav>;
}
