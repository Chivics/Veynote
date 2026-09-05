// Static, built-in starter templates. Not user-customizable in this
// pass — that would mean a DB-backed template model, which is a
// reasonable next step but a separate piece of work from "give people a
// running start on four common note types."
export const NOTE_TEMPLATES = [
  {
    id: "daily-journal",
    name: "Daily Journal",
    icon: "☀️",
    title: "",
    html:
      "<h3>Today's Focus</h3><p><br></p>" +
      "<h3>What Happened</h3><p><br></p>" +
      "<h3>What I Learned</h3><p><br></p>" +
      "<h3>What I Need to Improve</h3><p><br></p>" +
      "<h3>Tomorrow</h3><p><br></p>",
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    icon: "🗓️",
    title: "Meeting",
    html:
      "<p><strong>Date:</strong> </p>" +
      "<p><strong>Attendees:</strong> </p>" +
      "<h3>Agenda</h3><p><br></p>" +
      "<h3>Discussion</h3><p><br></p>" +
      "<h3>Decisions</h3><p><br></p>" +
      "<h3>Action Items</h3><p><br></p>",
  },
  {
    id: "study-notes",
    name: "Study Notes",
    icon: "📚",
    title: "",
    html:
      "<p><strong>Topic:</strong> </p>" +
      "<h3>Definition</h3><p><br></p>" +
      "<h3>Key Concepts</h3><p><br></p>" +
      "<h3>Examples</h3><p><br></p>" +
      "<h3>Questions</h3><p><br></p>" +
      "<h3>Summary</h3><p><br></p>",
  },
  {
    id: "trading-review",
    name: "Trading Review",
    icon: "📈",
    title: "Trade Review",
    html:
      "<h3>Market Context</h3><p><br></p>" +
      "<h3>Setup</h3><p><br></p>" +
      "<h3>Entry</h3><p><br></p>" +
      "<h3>Psychology</h3><p><br></p>" +
      "<h3>What Went Right</h3><p><br></p>" +
      "<h3>What Went Wrong</h3><p><br></p>" +
      "<h3>Lesson</h3><p><br></p>" +
      "<h3>Next Action</h3><p><br></p>",
  },
];

export function getTemplate(id) {
  return NOTE_TEMPLATES.find((t) => t.id === id) || null;
}
