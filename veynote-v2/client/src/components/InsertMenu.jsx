import { useEffect, useId, useRef, useState } from "react";
import NavigationIcon from "./layout/NavigationIcon";
import { INSERT_BLOCKS, INSERT_GROUPS, searchInsertBlocks } from "../utils/insertCommands.js";
import "./editorToolbar.css";

export { INSERT_BLOCKS };

function optionIcon(block) {
  if (block.key === "image") return <NavigationIcon name="image" size={19} />;
  if (block.key === "file") return <NavigationIcon name="files" size={19} />;
  if (block.key === "table") return <NavigationIcon name="grid" size={19} />;
  if (block.key === "checklist") return <NavigationIcon name="tasks" size={19} />;
  return block.icon;
}

export default function InsertMenu({ x, y, onPick, onClose }) {
  const dialog = useRef(null), searchInput = useRef(null), optionRefs = useRef(new Map()), heading = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const visible = searchInsertBlocks(query);
  const selected = Math.min(active, visible.length - 1);
  const hasQuery = Boolean(query.trim());

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
    searchInput.current?.focus();
    return () => { if (dialog.current?.open) dialog.current.close(); };
  }, []);
  useEffect(() => {
    optionRefs.current.get(visible[selected]?.key)?.scrollIntoView({ block: "nearest" });
  }, [selected, query]);

  function close() {
    if (dialog.current?.open) dialog.current.close();
    onClose();
  }
  function choose(block) {
    if (dialog.current?.open) dialog.current.close();
    onPick(block);
  }
  function move(delta) {
    if (!visible.length) return;
    setActive(index => (index + delta + visible.length) % visible.length);
  }

  const menuWidth = Math.min(390, window.innerWidth - 24);
  const menuHeight = Math.min(580, window.innerHeight - 24);
  const left = Math.max(12, Math.min(x, window.innerWidth - menuWidth - 12));
  const top = y + menuHeight <= window.innerHeight - 12
    ? Math.max(12, y)
    : Math.max(12, Math.min(y - menuHeight - 10, window.innerHeight - menuHeight - 12));
  const sections = hasQuery
    ? [["Results", visible]]
    : INSERT_GROUPS.map(group => [group, visible.filter(block => block.group === group)]);

  return <dialog ref={dialog} className="writing-format-dialog writing-insert-dialog" style={{ "--insert-x": left + "px", "--insert-y": top + "px" }} aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const rect = dialog.current.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }}>
    <header><div><span className="writing-insert-eyebrow">Writing tools</span><h2 id={heading}>Insert a block</h2></div><button type="button" aria-label="Close insert menu" onClick={close}><NavigationIcon name="close" size={20} /></button></header>
    <label className="writing-insert-search"><NavigationIcon name="search" size={17} /><input ref={searchInput} role="combobox" aria-label="Find a block" aria-autocomplete="list" aria-expanded="true" aria-controls={heading + "-options"} aria-activedescendant={visible[selected] ? heading + "-" + visible[selected].key : undefined} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1); }
      if (event.key === "Enter" && visible[selected]) { event.preventDefault(); choose(visible[selected]); }
    }} placeholder="Search blocks, tasks, images…" /></label>
    <div className="writing-format-body" id={heading + "-options"} role="listbox" aria-label="Document blocks">{sections.map(([label, blocks]) => blocks.length > 0 && <section key={label} role="group" aria-label={label}><h3>{label}</h3><div className="writing-insert-options">{blocks.map(block => <button type="button" role="option" id={heading + "-" + block.key} aria-selected={visible[selected]?.key === block.key} key={block.key} ref={element => { if (element) optionRefs.current.set(block.key, element); else optionRefs.current.delete(block.key); }} onMouseEnter={() => setActive(visible.findIndex(option => option.key === block.key))} onClick={() => choose(block)}><span aria-hidden="true" className="writing-insert-symbol">{optionIcon(block)}</span><span className="writing-insert-copy"><strong>{block.label}</strong><small>{block.description}</small></span></button>)}</div></section>)}{!visible.length && <p className="writing-insert-empty" role="status">No matching blocks. Try “heading”, “table”, “task”, or “image”.</p>}</div>
    <footer className="writing-insert-hint"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Insert</span><span><kbd>Esc</kbd> Close</span></footer>
  </dialog>;
}
