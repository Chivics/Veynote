// Derives word/character/reading-time stats directly from the note's
// HTML, using a real (detached) DOM parse rather than regex-stripping
// tags — that handles entities and nested markup correctly, which a
// naive replace(/<[^>]*>/g, "") would get wrong for anything with an
// escaped "&lt;" in it.
export function computeStats(html) {
  const empty = { words: 0, characters: 0, charactersNoSpaces: 0, readingMinutes: 0, headings: 0, tasks: 0, tasksDone: 0 };
  if (!html) return empty;

  const container = document.createElement("div");
  container.innerHTML = html;

  const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6").length;
  const items = container.querySelectorAll(".cl-item");
  const tasks = items.length;
  const tasksDone = Array.from(items).filter((i) => i.dataset.checked === "true").length;

  const plainText = (container.textContent || "").replace(/\u00a0/g, " ").trim();
  const words = plainText.length ? plainText.split(/\s+/).length : 0;
  const characters = plainText.length;
  const charactersNoSpaces = plainText.replace(/\s/g, "").length;
  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.round(words / 200));

  return { words, characters, charactersNoSpaces, readingMinutes, headings, tasks, tasksDone };
}

export function formatStats(stats) {
  if (stats.words === 0) return "";
  const parts = [
    `${stats.words.toLocaleString()} word${stats.words === 1 ? "" : "s"}`,
    `${stats.characters.toLocaleString()} characters`,
    `${stats.readingMinutes} min read`,
  ];
  if (stats.tasks > 0) parts.push(`${stats.tasksDone}/${stats.tasks} tasks complete`);
  return parts.join(" · ");
}
