import { Link, useSearchParams } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import NoteEditor from "../notes/NoteEditor";
import "./journalEntryGateway.css";

const RECORDS = [
  { type:"daily", icon:"sun", eyebrow:"THE DAY", title:"Daily entry", description:"Preserve what happened, what mattered, and what should travel with you into tomorrow." },
  { type:"reflection", icon:"book", eyebrow:"PERSPECTIVE", title:"Guided reflection", description:"Examine an experience, relationship, transition, or question with considered prompts." },
  { type:"decision", icon:"tasks", eyebrow:"PROVENANCE", title:"Decision record", description:"Keep the context, options, assumptions, confidence, and later outcome together." },
  { type:"mood", icon:"sun", eyebrow:"CONTEXT", title:"Mood & energy", description:"Record emotional context, intensity, contributing events, and what may help." },
  { type:"lesson", icon:"sparkle", eyebrow:"PATTERN", title:"Lesson learned", description:"Turn experience into a reusable lesson with its source, significance, and review point." },
  { type:"calibration", icon:"chart", eyebrow:"FORECAST", title:"Confidence calibration", description:"State an expectation before the outcome is known, then return to compare belief with reality." },
];

const REVIEWS = [
  ["weekly","Weekly","A deliberate view of the week"],
  ["monthly","Monthly","The shape and movement of the month"],
  ["quarterly","Quarterly","Direction, outcomes, and recurring signals"],
  ["annual","Annual","A durable record of the year"],
];

export default function JournalEntryGateway() {
  const [params] = useSearchParams();
  // Contextual actions (Today, Decisions, Mood, Retrospectives, templates) have
  // already selected a purpose. They proceed directly to the writing workspace.
  if ([...params.keys()].length) return <NoteEditor kind="JOURNAL" />;

  const today = new Date();
  const linkFor = type => `/journal/new?type=${encodeURIComponent(type)}&date=${today.toISOString().slice(0,10)}`;
  return <main className="journal-entry-gateway">
    <header>
      <div><span className="eyebrow">NEW JOURNAL RECORD</span><h1>Choose the shape of what you need to <em>remember.</em></h1><p>Journal records share one private history, but each begins with the structure its purpose requires.</p></div>
      <div className="journal-entry-gateway-date"><span>{today.toLocaleDateString(undefined,{month:"short"})}</span><strong>{today.getDate()}</strong><small>{today.toLocaleDateString(undefined,{weekday:"long"})}</small></div>
    </header>

    <section className="journal-entry-gateway-primary" aria-label="Journal record types">
      {RECORDS.map((record,index) => <Link key={record.type} to={linkFor(record.type)}>
        <span className="journal-entry-gateway-index">{String(index+1).padStart(2,"0")}</span>
        <span className="journal-entry-gateway-icon"><NavigationIcon name={record.icon} size={20}/></span>
        <span className="journal-entry-gateway-copy"><small>{record.eyebrow}</small><strong>{record.title}</strong><span>{record.description}</span></span>
        <NavigationIcon name="chevron" size={16}/>
      </Link>)}
    </section>

    <section className="journal-entry-gateway-reviews">
      <div><span className="eyebrow">RETROSPECTIVES</span><h2>Review a longer horizon.</h2><p>Start from the evidence already preserved in Journal and carry the useful context forward.</p></div>
      <nav>{REVIEWS.map(([type,label,description]) => <Link key={type} to={linkFor(type)}><span><strong>{label}</strong><small>{description}</small></span><NavigationIcon name="chevron" size={14}/></Link>)}</nav>
    </section>

    <footer><NavigationIcon name="shield" size={17}/><span>Journal records remain private, searchable, recoverable, and connected to their original revision history.</span><Link to="/journal/timeline">Open timeline</Link></footer>
  </main>;
}
