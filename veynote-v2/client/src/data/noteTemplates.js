// Built-in document structures. The chooser previews the same HTML the editor uses.
export const NOTE_TEMPLATES = [
  {
    id: "daily-journal",
    category: "Reflection", destination: "/journal/new", description: "Review today’s experiences and carry the lessons forward.", symbol: "sun",
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
    id: "weekly-retrospective", category: "Reflection", destination: "/journal/new", symbol: "clock",
    name: "Weekly Retrospective", title: "Weekly retrospective", description: "Review the week through progress, decisions, energy, and the next deliberate move.",
    html: "<h2>The week in one sentence</h2><p><br></p><h3>Work that moved forward</h3><p><br></p><h3>Decisions and lessons</h3><p><br></p><h3>What created or drained energy</h3><p><br></p><h3>Unfinished work worth carrying forward</h3><p><br></p><h3>Next week's focus</h3><p><br></p>",
  },
  {
    id: "monthly-retrospective", category: "Reflection", destination: "/journal/new", symbol: "calendar",
    name: "Monthly Retrospective", title: "Monthly retrospective", description: "Preserve the month’s arc, meaningful changes, and evidence for the priorities ahead.",
    html: "<h2>The month in perspective</h2><p><br></p><h3>Important outcomes</h3><p><br></p><h3>What changed my thinking</h3><p><br></p><h3>People, places, and moments to remember</h3><p><br></p><h3>Commitments still open</h3><p><br></p><h3>Priorities for the next month</h3><p><br></p>",
  },
  {
    id: "quarterly-retrospective", category: "Reflection", destination: "/journal/new", symbol: "chart",
    name: "Quarterly Retrospective", title: "Quarterly retrospective", description: "Review outcomes, strategic choices, patterns, and priorities across the quarter.",
    html: "<h2>The quarter in perspective</h2><p><br></p><h3>Outcomes and evidence</h3><p><br></p><h3>Decisions that shaped the quarter</h3><p><br></p><h3>Goals and commitments</h3><p><br></p><h3>Patterns worth addressing</h3><p><br></p><h3>What changes next quarter</h3><p><br></p>",
  },
  {
    id: "annual-retrospective", category: "Reflection", destination: "/journal/new", symbol: "sun",
    name: "Annual Retrospective", title: "Annual retrospective", description: "Create a durable record of the year, its turning points, and the direction that follows.",
    html: "<h2>The year in perspective</h2><p><br></p><h3>Defining moments</h3><p><br></p><h3>Work and relationships that mattered</h3><p><br></p><h3>Decisions that changed the direction</h3><p><br></p><h3>Lessons supported by evidence</h3><p><br></p><h3>What I am leaving behind</h3><p><br></p><h3>The direction ahead</h3><p><br></p>",
  },
  {
    id: "decision-journal", category: "Work & decisions", destination: "/journal/new", symbol: "tasks",
    name: "Decision Record", title: "Decision record", description: "Keep the context, evidence, confidence, and later outcome of an important decision together.",
    html: "<h2>The decision</h2><p><br></p><h3>Context and constraints</h3><p><br></p><h3>Evidence available now</h3><p><br></p><h3>Options considered</h3><p><br></p><h3>Assumptions and confidence</h3><p><br></p><h3>Expected outcome</h3><p><br></p><h3>Review date and actual outcome</h3><p><br></p>",
  },
  {
    id: "confidence-calibration", category: "Work & decisions", destination: "/journal/new", symbol: "chart",
    name: "Confidence Calibration", title: "Confidence calibration", description: "Record a forecast before the outcome, then compare confidence with what actually happened.",
    html: "<h2>The forecast</h2><p><br></p><h3>Confidence percentage</h3><p><br></p><h3>Evidence for and against</h3><p><br></p><h3>What would change my mind</h3><p><br></p><h3>Resolution date</h3><p><br></p><h3>Outcome</h3><p><br></p><h3>Calibration lesson</h3><p><br></p>",
  },
  {
    id: "guided-reflection", category: "Reflection", destination: "/journal/new", symbol: "book",
    name: "Guided Reflection", title: "Reflection", description: "Examine an experience, the meaning you made from it, and what should change next.",
    html: "<h2>What happened</h2><p><br></p><h3>What I noticed</h3><p><br></p><h3>What I felt and why</h3><p><br></p><h3>The perspective I may be missing</h3><p><br></p><h3>What I want to carry forward</h3><p><br></p>",
  },
  {
    id: "mood-check-in", category: "Reflection", destination: "/journal/new", symbol: "sun",
    name: "Mood Check-in", title: "Mood check-in", description: "Capture emotional context, intensity, contributing events, and what support would help.",
    html: "<h2>How I feel</h2><p><br></p><h3>Intensity and energy</h3><p><br></p><h3>What may be contributing</h3><p><br></p><h3>What I need now</h3><p><br></p><h3>Related events or decisions</h3><p><br></p>",
  },
  {
    id: "lesson-record", category: "Reflection", destination: "/journal/new", symbol: "sparkle",
    name: "Lesson Record", title: "Lesson learned", description: "Turn experience into a reusable principle with evidence and a future review point.",
    html: "<h2>The lesson</h2><p><br></p><h3>Source and context</h3><p><br></p><h3>Evidence</h3><p><br></p><h3>Where this pattern has appeared before</h3><p><br></p><h3>How I will apply it</h3><p><br></p><h3>Review date</h3><p><br></p>",
  },
  {
    id: "meeting-notes",
    category: "Work & decisions", destination: "/notes/new", description: "Turn a conversation into clear decisions and accountable next steps.", symbol: "brief",
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
    category: "Learning & research", destination: "/notes/new", description: "Build understanding through concepts, examples, and open questions.", symbol: "book",
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
    legacyOnly: true,
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
  {
    id: "decision-brief", name: "Decision Brief", title: "Decision brief", category: "Work & decisions", destination: "/notes/new", symbol: "tasks",
    description: "Keep the evidence, alternatives, and reasoning behind an important decision.",
    html: "<h3>The decision</h3><p><br></p><h3>Context & evidence</h3><p><br></p><h3>Options considered</h3><p><br></p><h3>Recommendation & reasoning</h3><p><br></p><h3>Risks & open questions</h3><p><br></p><h3>Next steps & review date</h3><p><br></p>",
  },
  {
    id: "project-brief", name: "Project Brief", title: "Project brief", category: "Work & decisions", destination: "/notes/new", symbol: "folder",
    description: "Establish the purpose, scope, milestones, and measures of success.",
    html: "<h3>Purpose & desired outcome</h3><p><br></p><h3>Scope</h3><p><br></p><h3>People & responsibilities</h3><p><br></p><h3>Milestones</h3><p><br></p><h3>Dependencies & risks</h3><p><br></p><h3>Success criteria</h3><p><br></p>",
  },
  {
    id: "research-notes", name: "Research Notes", title: "Research notes", category: "Learning & research", destination: "/notes/new", symbol: "search",
    description: "Connect observations to sources, findings, and questions worth pursuing.",
    html: "<h3>Research question</h3><p><br></p><h3>Sources & references</h3><p><br></p><h3>Observations</h3><p><br></p><h3>Findings & limitations</h3><p><br></p><h3>Questions to explore</h3><p><br></p><h3>Summary</h3><p><br></p>",
  },
  {
    id: "essay-outline", name: "Essay Outline", title: "", category: "Writing", destination: "/notes/new", symbol: "note",
    description: "Give a long-form idea a clear argument, structure, and supporting evidence.",
    html: "<h3>Central idea</h3><p><br></p><h3>Opening</h3><p><br></p><h3>Argument & supporting evidence</h3><p><br></p><h3>Alternative perspectives</h3><p><br></p><h3>Conclusion</h3><p><br></p><h3>References</h3><p><br></p>",
  },
];

export const WRITING_TEMPLATES = NOTE_TEMPLATES.filter(template => !template.legacyOnly);
export function findWritingTemplates(category = "All", query = "") {
  const needle = query.trim().toLocaleLowerCase();
  return WRITING_TEMPLATES.filter(template => (category === "All" || template.category === category) && (!needle || `${template.name} ${template.category} ${template.description}`.toLocaleLowerCase().includes(needle)));
}

export function getTemplate(id) {
  return NOTE_TEMPLATES.find((t) => t.id === id) || null;
}
