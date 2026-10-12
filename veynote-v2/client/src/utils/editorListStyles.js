// These values map directly to persisted <ul>/<ol> list markers. Keep the
// choices small enough to scan, and use ordinary semantic list markup.
export const BULLET_STYLES = [
  { label: "Disc", value: "disc", sample: "•" },
  { label: "Circle", value: "circle", sample: "○" },
  { label: "Square", value: "square", sample: "▪" },
  { label: "Dash", value: "dash", sample: "–" },
];

export const NUMBERED_STYLES = [
  { label: "1, 2, 3", value: "decimal", sample: "1." },
  { label: "01, 02, 03", value: "decimal-leading-zero", sample: "01." },
  { label: "a, b, c", value: "lower-alpha", sample: "a." },
  { label: "A, B, C", value: "upper-alpha", sample: "A." },
  { label: "i, ii, iii", value: "lower-roman", sample: "i." },
  { label: "I, II, III", value: "upper-roman", sample: "I." },
];

export function listDescriptor(list) {
  if (!list) return null;
  if (list.classList.contains("veynote-checklist")) return { kind: "checklist", style: "checklist" };
  if (list.tagName === "OL") return { kind: "numbered", style: list.style.listStyleType || "decimal" };
  return { kind: "bullet", style: list.classList.contains("list-dash") ? "dash" : list.style.listStyleType || "disc" };
}
