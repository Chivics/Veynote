import { NavLink } from "react-router-dom";

const GROUPS = [
  {
    label: "Reading",
    items: [{ to: "/notes/library/reading", label: "All" }],
  },
  {
    label: "Life",
    items: [
      { to: "/notes/library/goals", label: "Life Goals" },
      { to: "/notes/library/travel", label: "Travel Plans" },
      { to: "/notes/library/bucket", label: "Bucket List" },
    ],
  },
  {
    label: "Ideas & Work",
    items: [
      { to: "/notes/library/ideas", label: "Ideas" },
      { to: "/notes/library/projects", label: "Projects" },
    ],
  },
];

export default function LibrarySidebar() {
  return (
    <div className="w-[190px] shrink-0 border-r border-app-border pr-4 mr-[22px] hidden md:block">
      {GROUPS.map((g) => (
        <div key={g.label} className="mb-1">
          <div className="text-[9.5px] font-bold tracking-widest text-[#5a6070] uppercase mt-3.5 mb-1.5">{g.label}</div>
          {g.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block text-[12px] px-2 py-1.5 rounded-md ${isActive ? "bg-app-panel2 text-ink" : "text-ink-muted hover:text-ink"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </div>
  );
}
