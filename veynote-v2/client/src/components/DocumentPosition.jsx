import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NavigationIcon from "./layout/NavigationIcon";
import "./documentPosition.css";

// Measure the writing itself, never the application's navigation or footer.
export default function DocumentPosition({ documentRef, documentKey, focusMode = false }) {
  const geometry = useRef({ start:0, end:0, pages:[], headings:[] });
  const dialog = useRef(null), trigger = useRef(null), idle = useRef(null);
  const [position, setPosition] = useState({ visible:false, percent:0, page:1, total:1 });
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(false);
  const [headings, setHeadings] = useState([]);
  const [target, setTarget] = useState(0);

  useEffect(() => {
    const root = documentRef.current;
    if (!root) return;
    const scrollRoot = focusMode ? root.closest(".note-editor-shell.is-focus") : null;
    const scrollTop = () => scrollRoot ? scrollRoot.scrollTop : window.scrollY;
    const viewportHeight = () => scrollRoot ? scrollRoot.clientHeight : window.innerHeight;
    const pageTop = node => node.getBoundingClientRect().top - (scrollRoot?.getBoundingClientRect().top || 0) + scrollTop();
    const offset = focusMode ? 80 : 150;
    let frame, measureTimer;
    const readPosition = () => {
      const data = geometry.current;
      const viewport = viewportHeight();
      const distance = Math.max(1, data.end - data.start - viewport + offset);
      const percent = Math.round(Math.max(0, Math.min(1, (scrollTop() + offset - data.start) / distance)) * 100);
      let page = 1;
      for (let i=0; i<data.pages.length; i++) { if (data.pages[i].top <= scrollTop() + offset + 10) page=i+1; else break; }
      const next = { visible:data.end - data.start > viewport * 1.75, percent, page, total:data.pages.length };
      setPosition(previous => Object.keys(next).every(key => next[key] === previous[key]) ? previous : next);
    };
    const measure = () => {
      const pages = [...root.querySelectorAll('.editor-page')].map(node => ({ node, top:pageTop(node) }));
      if (!pages.length) return;
      const last = pages[pages.length-1].node;
      geometry.current = {
        start:pages[0].top, end:pageTop(last) + last.getBoundingClientRect().height, pages,
        headings:[...root.querySelectorAll('.editor-page :is(h1,h2,h3,h4,h5,h6)')].map(node => ({ node, text:node.textContent.trim() || "Untitled section", level:Number(node.tagName[1]) })),
      };
      readPosition();
    };
    const scroll = () => {
      cancelAnimationFrame(frame); frame=requestAnimationFrame(readPosition);
      setActive(true); clearTimeout(idle.current); idle.current=setTimeout(() => setActive(false), 1800);
    };
    const scheduleMeasure = () => { clearTimeout(measureTimer); measureTimer=setTimeout(measure, 120); };
    const resize = new ResizeObserver(scheduleMeasure); resize.observe(root);
    const changes = new MutationObserver(scheduleMeasure); changes.observe(root, { childList:true, subtree:true, characterData:true });
    (scrollRoot || window).addEventListener("scroll", scroll, { passive:true }); window.addEventListener("resize", scheduleMeasure);
    measure();
    return () => { resize.disconnect(); changes.disconnect(); cancelAnimationFrame(frame); clearTimeout(measureTimer); clearTimeout(idle.current); (scrollRoot || window).removeEventListener("scroll",scroll); window.removeEventListener("resize",scheduleMeasure); };
  }, [documentRef, documentKey, focusMode]);

  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus({ preventScroll:true }); }
  function scrollRoot() { return focusMode ? documentRef.current?.closest(".note-editor-shell.is-focus") : null; }
  function viewportHeight() { return scrollRoot()?.clientHeight || window.innerHeight; }
  function pageTop(node) { const root=scrollRoot(); return node.getBoundingClientRect().top - (root?.getBoundingClientRect().top || 0) + (root?.scrollTop ?? window.scrollY); }
  function jumpTo(top) { close(); (scrollRoot() || window).scrollTo({ top:Math.max(0,top), behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  function jumpToPercent(value) { const data=geometry.current, offset=focusMode ? 80 : 150; jumpTo(data.start-offset + (data.end-data.start-viewportHeight()+offset)*value/100); }
  function show() { setHeadings(geometry.current.headings); setTarget(position.percent); setOpen(true); dialog.current?.showModal(); }

  if (!position.visible) return null;
  return <><div className="document-end-marker"><span /><NavigationIcon name="check" size={15} /><span>End of document · {position.total} writing pages</span><span /></div>{createPortal(<>
    <button ref={trigger} type="button" className={`document-position-trigger${active || open ? " is-active" : ""}${position.percent >= 95 ? " is-ending" : ""}${focusMode ? " is-focus" : ""}`} onClick={show} aria-label={`Document position: page ${position.page} of ${position.total}, ${position.percent} percent. Open section navigator`} aria-haspopup="dialog" aria-expanded={open} style={{ "--document-progress":`${position.percent}%` }}>
      <span className="document-position-track" aria-hidden="true"><i /></span><span className="document-position-label"><strong>{position.page}<span> / {position.total}</span></strong><small>{position.percent === 100 ? "At the end" : `${position.percent}%`}</small></span>
    </button>
    <dialog ref={dialog} className="document-position-dialog" aria-labelledby="document-position-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if(event.target!==event.currentTarget)return; const r=event.currentTarget.getBoundingClientRect(); if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)close(); }}>
      <header><div><span className="eyebrow">YOUR PLACE IN THE WRITING</span><h2 id="document-position-title">Document navigator</h2></div><button type="button" aria-label="Close document navigator" onClick={close}><NavigationIcon name="close" size={20} /></button></header>
      <div className="document-position-summary"><strong>Page {position.page}<span> of {position.total}</span></strong><span>{position.percent}% through the document</span></div>
      <label className="document-position-range"><span>Choose a position · {target}%</span><input type="range" min="0" max="100" value={target} aria-label="Document position percentage" onChange={event => setTarget(Number(event.target.value))} /></label>
      <button type="button" className="btn-primary document-position-jump" onClick={() => jumpToPercent(target)}>Go to {target}%</button>
      <div className="document-position-bookends"><button type="button" onClick={() => jumpToPercent(0)}>Beginning</button><button type="button" onClick={() => jumpToPercent(100)}>End of document</button></div>
      {headings.length > 0 && <nav aria-label="Document sections">{headings.map((heading,index) => <button type="button" key={index} style={{ "--heading-depth":heading.level }} onClick={() => jumpTo(pageTop(heading.node) - (focusMode ? 90 : 160))}><small>H{heading.level}</small><span>{heading.text}</span><NavigationIcon name="chevron" size={14} /></button>)}</nav>}
      <footer>Position follows this document’s current layout. Page counts change with screen size and formatting.</footer>
    </dialog>
  </>, document.body)}</>;
}
