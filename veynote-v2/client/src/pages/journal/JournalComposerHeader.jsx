import { Link } from "react-router-dom";
import NavigationIcon from "../../components/layout/NavigationIcon";
import { escapeHtml } from "../../utils/safeHtml";
import "./journalComposer.css";

const COMPOSERS = {
  daily:{ eyebrow:"DAILY RECORD", title:"Give the day a durable shape.", lead:"Preserve the moments, decisions, and unfinished threads that will matter when today is no longer fresh.", prompts:["What changed today?","What deserves to be remembered?","What should happen next?"] },
  reflection:{ eyebrow:"GUIDED REFLECTION", title:"Look again, with enough distance.", lead:"Separate the event from your interpretation and carry forward the perspective that remains useful.", prompts:["What happened?","What did it change in me?","What would I do differently?"] },
  mood:{ eyebrow:"MOOD & ENERGY", title:"Record context, not a diagnosis.", lead:"Capture intensity, contributing events, and the support that may help without reducing the day to a score.", prompts:["What am I feeling?","What may have contributed?","What support would help?"] },
  decision:{ eyebrow:"DECISION PROVENANCE", title:"Preserve the reasoning before the outcome.", lead:"Document the alternatives, evidence, assumptions, risks, and conviction available at the moment of choice.", prompts:["Context and constraints","Options considered","Reasoning and expected outcome"] },
  calibration:{ eyebrow:"CONFIDENCE CALIBRATION", title:"Make the forecast explicit.", lead:"Record what you expect and why before later evidence can rewrite the original belief.", prompts:["Forecast","Evidence and assumptions","What would change my mind?"] },
  lesson:{ eyebrow:"LESSON RECORD", title:"Turn experience into future judgment.", lead:"Keep the source, recurring pattern, and next application connected to one reusable lesson.", prompts:["What happened?","What pattern does this reveal?","Where will I apply it next?"] },
  weekly:{ eyebrow:"WEEKLY RETROSPECTIVE", title:"Keep the week in perspective.", lead:"Review evidence from the week and decide what deserves attention next.", prompts:["Progress and wins","Friction and unfinished work","Next week's priority"] },
  monthly:{ eyebrow:"MONTHLY RETROSPECTIVE", title:"See the shape of the month.", lead:"Gather outcomes, changes, decisions, and themes into one considered record.", prompts:["What moved forward?","What repeated?","What changes next month?"] },
  quarterly:{ eyebrow:"QUARTERLY RETROSPECTIVE", title:"Review direction, not only activity.", lead:"Connect strategy, outcomes, recurring signals, and the commitments for the next quarter.", prompts:["Outcomes","Strategic decisions","Next-quarter priorities"] },
  annual:{ eyebrow:"ANNUAL RETROSPECTIVE", title:"Give the year a durable record.", lead:"Preserve turning points, relationships, lessons, and the direction that follows.", prompts:["Turning points","People and decisions","What the next year asks of me"] },
};

export default function JournalComposerHeader({ type, entryDate, onInsertPrompt }) {
  const config=COMPOSERS[type]||COMPOSERS.daily;
  const date=new Date(`${entryDate}T12:00:00`);
  const display=Number.isNaN(date.getTime())?"Undated":date.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  return <section className="journal-composer-header" aria-label={`${config.eyebrow} writing workflow`}>
    <div className="journal-composer-copy"><Link to={type==="daily"?"/journal/today":type==="mood"?"/journal/mood":type==="decision"?"/journal/decisions":["weekly","monthly","quarterly","annual"].includes(type)?`/journal/reviews/${type}`:"/journal"}><NavigationIcon name="back" size={15}/> Journal</Link><span className="eyebrow">{config.eyebrow}</span><h1>{config.title}</h1><p>{config.lead}</p></div>
    <div className="journal-composer-date"><span>{display}</span><strong>{String(date.getDate()||"").padStart(2,"0")}</strong><small>{date.toLocaleDateString(undefined,{month:"short"}).toUpperCase()}</small></div>
    <div className="journal-composer-path" aria-label="Writing stages"><span className="is-active"><i>1</i>Context</span><b/><span><i>2</i>Writing</span><b/><span><i>3</i>Review</span></div>
    <div className="journal-composer-prompts"><span>Begin with a useful structure</span>{config.prompts.map(prompt=><button type="button" key={prompt} onClick={()=>onInsertPrompt?.(`<h2>${escapeHtml(prompt)}</h2><p><br></p>`)}>{prompt}<NavigationIcon name="plus" size={13}/></button>)}</div>
  </section>;
}
