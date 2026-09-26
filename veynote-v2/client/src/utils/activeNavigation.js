// Select the most specific destination. A create route or query action must
// never highlight its directory at the same time.
export function activeNavigationIndex(pathname, search, destinations) {
  const current = new URL(pathname + search, "https://navigation.invalid");
  let selected = -1, specificity = -1;
  destinations.forEach(([, to], index) => {
    const target = new URL(to, current.origin);
    const matches = pathname === target.pathname || index !== 0 && pathname.startsWith(`${target.pathname}/`);
    if (!matches || [...target.searchParams].some(([key, value]) => current.searchParams.get(key) !== value)) return;
    const score = target.pathname.length + target.searchParams.size;
    if (score > specificity) { selected = index; specificity = score; }
  });
  return selected;
}
