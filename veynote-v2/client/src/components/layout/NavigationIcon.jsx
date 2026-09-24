const paths = {
  home: <path d="M3 10 12 3l9 7v11h-6v-7H9v7H3Z" />,
  note: <><path d="M6 3h9l4 4v14H6Z M14 3v6h5 M9 13h7 M9 17h5" /></>,
  book: <><path d="M3 4h6l3 2 3-2h6v16h-6l-3 2-3-2H3Z M12 6v16" /></>,
  search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 5 5" /></>,
  calendar: <path d="M4 5h16v16H4Z M4 10h16 M8 3v5 M16 3v5" />,
  plus: <path d="M12 4v16 M4 12h16" />,
  folder: <path d="M3 6h7l2 3h9v12H3Z" />,
  files: <><path d="M6 3h9l4 4v14H6Z M14 3v6h5 M9 13h7" /></>,
  heart: <path d="M20.8 8.3c0 4.4-8.8 10.8-8.8 10.8S3.2 12.7 3.2 8.3A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8.8 1.3Z" />,
  lock: <path d="M6 10h12v11H6Z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3" />,
  shield: <><path d="M12 3 3 7v6c1 5 9 9 9 9s8-4 9-9V7Z" /><path d="m8 12 3 3 5-6" /></>,
  tasks: <path d="M4 4h16v16H4Z m4 8 3 3 6-7" />,
  tag: <path d="M3 3h8l10 10-8 8L3 11Z M7 7h.1" />,
  archive: <path d="M3 4h18v5H3Z M5 9v12h14V9 M9 13h6" />,
  trash: <path d="M3 6h18 M8 6V3h8v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7" />,
  chart: <path d="M4 3v18h17 M7 15l4-6 4 3 6-7" />,
  play: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3Z" /></>,
  brief: <path d="M3 7h18v14H3Z M8 7V3h8v4 M3 12h18" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  close: <path d="m6 6 12 12 M6 18 18 6" />,
  logout: <path d="M10 3H4v18h6 M14 7l5 5-5 5 M8 12h11" />,
};

export default function NavigationIcon({ name, size = 19, className = "" }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.note}</svg>;
}
