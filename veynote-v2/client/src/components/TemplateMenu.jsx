import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NOTE_TEMPLATES } from "../data/noteTemplates";
import NavigationIcon from "./layout/NavigationIcon.jsx";
import "../pages/notes/notes.css";

const presentation = {
  "daily-journal": { icon: "sun", description: "Reflect on today and set a direction for tomorrow.", outline: ["Today’s focus", "Reflections & lessons", "Tomorrow"] },
  "meeting-notes": { icon: "brief", description: "Turn a conversation into decisions and next actions.", outline: ["Agenda & participants", "Discussion & decisions", "Action items"] },
  "study-notes": { icon: "book", description: "Organize a subject into concepts, questions, and a summary.", outline: ["Key concepts", "Examples & questions", "Summary"] },
  "trading-review": { icon: "chart", description: "Reflect on the context, execution, and lessons of a trade.", outline: ["Context & setup", "Execution & psychology", "Lessons & next actions"] },
};

export default function TemplateMenu() {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null), trigger = useRef(null);
  const headingId = useId();
  const navigate = useNavigate();
  useEffect(() => {
    const node = dialog.current;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(true)} className="btn-outline" aria-haspopup="dialog"><NavigationIcon name="files" size={17} /> From template</button>
    <dialog ref={dialog} className="notes-template-dialog" aria-labelledby={headingId} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
      <header><div><span className="eyebrow">A considered starting point</span><h2 id={headingId}>Start with structure.</h2><p>Choose an outline. Make the writing your own.</p></div><button type="button" aria-label="Close templates" onClick={close}><NavigationIcon name="close" size={20} /></button></header>
      <div className="notes-template-grid">{NOTE_TEMPLATES.map(template => {
        const design = presentation[template.id];
        return <button type="button" className="notes-template-option" key={template.id} onClick={() => { close(); navigate(`${template.id === "daily-journal" ? "/journal/new" : "/notes/new"}?template=${template.id}`); }}>
          <span className="notes-template-icon"><NavigationIcon name={design.icon} size={22} /></span><h3>{template.name}</h3><p>{design.description}</p><div className="notes-template-outline">{design.outline.map(section => <span key={section}>{section}</span>)}</div><span className="notes-template-use">Use template <NavigationIcon name="chevron" size={15} /></span>
        </button>;
      })}</div>
      <footer>Templates create a new document. Your existing writing stays intact.</footer>
    </dialog>
  </>;
}
