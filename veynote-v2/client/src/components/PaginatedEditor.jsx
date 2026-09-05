import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { handleLinkPaste } from "../utils/linkify";

/**
 * A writing surface that behaves like a document: once a page's visible
 * area is full, the overflowing content automatically moves onto a new
 * page below (and flows back if you delete enough that a page has room
 * again) — instead of one endlessly-scrolling box.
 *
 * Also the actual rich-text engine: bold/italic/underline/strike,
 * headings, lists, checklists (real, clickable), blockquote, code block,
 * divider, links, text color, highlight, font size, alignment, and
 * line/paragraph spacing all live here as imperative methods the parent
 * (NoteEditor) calls from its toolbar.
 *
 * SCOPE NOTE (flagging rather than quietly shipping less): pagination
 * reflows whole block-level elements across pages, not individual
 * characters mid-paragraph — a single unbroken paragraph taller than one
 * full page will overflow that page rather than being split mid-text.
 * True character-level pagination is a much larger feature; this covers
 * "move to the next page when it's full" for normal writing correctly.
 */

const PAGE_HEIGHT_PX = 760; // ≈ a comfortable "sheet" of writing space

const PaginatedEditor = forwardRef(function PaginatedEditor(
  { initialHTML, onChange, placeholder, onSlash, onNoteLink, onImageDrop, onTableFocus, fontSize = "14px" },
  ref
) {
  const containerRef = useRef(null);
  const pageRefs = useRef([]);
  const [pageCount, setPageCount] = useState(1);
  const reflowScheduled = useRef(false);
  const savedRange = useRef(null);
  const activeCellRef = useRef(null); // { cell, row, table } — the table cell the cursor was last in
  const searchMatchesRef = useRef([]); // [{ node, start, end }] — recomputed on every findAll() call
  const currentMatchIndexRef = useRef(-1);

  function withActiveCell(fn) {
    const ctx = activeCellRef.current;
    if (ctx && document.body.contains(ctx.cell)) fn(ctx.cell, ctx.row, ctx.table);
  }

  // Unwraps any <mark class="search-hit"> left over from a previous
  // find-navigation step, merging its text back into the surrounding
  // text node (normalize()) so later searches see plain, unsplit text.
  function clearSearchHighlight() {
    pageRefs.current.forEach((page) => {
      if (!page) return;
      page.querySelectorAll("mark.search-hit").forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      });
    });
  }

  // Tracks whether the cursor is currently inside a table cell, so the
  // parent can show/hide a contextual "add row / add column / delete"
  // toolbar positioned against the table itself.
  function updateActiveCell() {
    if (!onTableFocus) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const cell = node?.closest?.("td, th");
    const table = node?.closest?.("table");
    if (cell && table) {
      activeCellRef.current = { cell, row: cell.parentElement, table };
      onTableFocus(table.getBoundingClientRect());
    } else {
      onTableFocus(null);
    }
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRange.current = sel.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    if (!savedRange.current) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.current);
  }

  // Finds the nearest block-level ancestor of the current selection that
  // lives inside one of our editable pages (so block-level style changes
  // like alignment/line-height land on the right element).
  function currentBlock() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const page = pageRefs.current.find((p) => p && p.contains(node));
    if (!page) return null;
    while (node && node !== page && node.parentElement !== page) {
      node = node.parentElement;
    }
    return node && node !== page ? node : page.firstElementChild || page;
  }

  useImperativeHandle(ref, () => ({
    getHTML: () => pageRefs.current.filter(Boolean).map((p) => p.innerHTML).join(""),

    exec: (cmd, arg) => {
      restoreSelection();
      document.execCommand(cmd, false, arg);
      reflow();
    },

    insertHTML: (html) => {
      restoreSelection();
      document.execCommand("insertHTML", false, html);
      reflow();
    },

    // Same as insertHTML, but if the HTML contains an element with
    // data-focus-target, the cursor is placed inside it afterward —
    // used so inserting a callout or table drops you straight into the
    // first editable spot instead of leaving the cursor wherever
    // execCommand happened to land.
    insertBlock: (html) => {
      restoreSelection();
      document.execCommand("insertHTML", false, html);
      reflow();
      requestAnimationFrame(() => {
        for (const page of pageRefs.current) {
          const target = page?.querySelector("[data-focus-target]");
          if (target) {
            target.removeAttribute("data-focus-target");
            const range = document.createRange();
            range.selectNodeContents(target);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            target.focus?.();
            break;
          }
        }
      });
    },

    // ---- table editing (operates on the cell the cursor was last in) ----
    tableAddRow: (position) => withActiveCell((cell, row, table) => {
      const newRow = row.cloneNode(true);
      Array.from(newRow.children).forEach((td) => { td.innerHTML = "&nbsp;"; });
      row.parentNode.insertBefore(newRow, position === "above" ? row : row.nextSibling);
      onTableFocus?.(table.getBoundingClientRect());
      reflow();
    }),
    tableAddColumn: (position) => withActiveCell((cell, row, table) => {
      const cellIndex = Array.from(row.children).indexOf(cell);
      Array.from(table.querySelectorAll("tr")).forEach((tr) => {
        const ref = tr.children[cellIndex];
        const td = document.createElement(ref.tagName);
        td.innerHTML = "&nbsp;";
        tr.insertBefore(td, position === "left" ? ref : ref.nextSibling);
      });
      onTableFocus?.(table.getBoundingClientRect());
      reflow();
    }),
    tableDeleteRow: () => withActiveCell((cell, row, table) => {
      const rows = table.querySelectorAll("tr");
      if (rows.length <= 1) {
        table.remove();
        onTableFocus?.(null);
      } else {
        row.remove();
        onTableFocus?.(table.getBoundingClientRect());
      }
      reflow();
    }),
    tableDeleteColumn: () => withActiveCell((cell, row, table) => {
      const cellIndex = Array.from(row.children).indexOf(cell);
      const rows = table.querySelectorAll("tr");
      if (row.children.length <= 1) {
        table.remove();
        onTableFocus?.(null);
      } else {
        rows.forEach((tr) => tr.children[cellIndex]?.remove());
        onTableFocus?.(table.getBoundingClientRect());
      }
      reflow();
    }),
    tableDelete: () => withActiveCell((cell, row, table) => {
      table.remove();
      onTableFocus?.(null);
      reflow();
    }),

    // ---- find & replace ----
    // Only one match is ever visually highlighted at a time (the current
    // one) rather than marking every occurrence simultaneously — simpler
    // and avoids the DOM-node-splitting bookkeeping of tracking many
    // simultaneous <mark> wraps across a paginated, editable document,
    // while still covering "find text, step through matches, replace".
    findAll: (query) => {
      clearSearchHighlight();
      searchMatchesRef.current = [];
      currentMatchIndexRef.current = -1;
      if (!query) return 0;
      const lowerQuery = query.toLowerCase();
      pageRefs.current.forEach((page) => {
        if (!page) return;
        const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) => (node.parentElement?.closest(".cl-box") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        let node;
        while ((node = walker.nextNode())) {
          const lowerText = node.textContent.toLowerCase();
          let idx = 0;
          while ((idx = lowerText.indexOf(lowerQuery, idx)) !== -1) {
            searchMatchesRef.current.push({ node, start: idx, end: idx + query.length });
            idx += query.length;
          }
        }
      });
      return searchMatchesRef.current.length;
    },

    goToMatch: (index) => {
      clearSearchHighlight();
      const m = searchMatchesRef.current[index];
      if (!m || !document.body.contains(m.node)) return;
      currentMatchIndexRef.current = index;
      const range = document.createRange();
      range.setStart(m.node, m.start);
      range.setEnd(m.node, m.end);
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      try {
        range.surroundContents(mark);
        mark.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {
        // Selection crossed a node boundary unexpectedly — rare, and not
        // worth failing the whole find over; just skip the visual highlight.
      }
    },

    replaceCurrentMatch: (replacement) => {
      const idx = currentMatchIndexRef.current;
      const m = searchMatchesRef.current[idx];
      if (!m || !document.body.contains(m.node)) return;
      const text = m.node.textContent;
      m.node.textContent = text.slice(0, m.start) + replacement + text.slice(m.end);
      reflow();
    },

    replaceAll: (query, replacement) => {
      clearSearchHighlight();
      if (!query) return 0;
      let count = 0;
      const lowerQuery = query.toLowerCase();
      pageRefs.current.forEach((page) => {
        if (!page) return;
        const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) => (node.parentElement?.closest(".cl-box") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);
        textNodes.forEach((tn) => {
          const lowerText = tn.textContent.toLowerCase();
          if (!lowerText.includes(lowerQuery)) return;
          const text = tn.textContent;
          let result = "";
          let cursor = 0;
          let idx;
          while ((idx = lowerText.indexOf(lowerQuery, cursor)) !== -1) {
            result += text.slice(cursor, idx) + replacement;
            cursor = idx + query.length;
            count++;
          }
          result += text.slice(cursor);
          tn.textContent = result;
        });
      });
      searchMatchesRef.current = [];
      currentMatchIndexRef.current = -1;
      reflow();
      return count;
    },

    // Wraps the current text selection in an inline style (used for text
    // color, highlight, and font size). Falls back gracefully to a no-op
    // note via the caller if nothing is selected.
    applyInlineStyle: (styleProp, value) => {
      restoreSelection();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style[styleProp] = value;
      try {
        range.surroundContents(span);
      } catch {
        // Selection crosses element boundaries surroundContents can't
        // handle cleanly — extract and re-wrap instead.
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
      }
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.addRange(newRange);
      reflow();
      return true;
    },

    // Applies a style to the current block (paragraph/heading/list item)
    // rather than the selection — used for alignment and line/paragraph
    // spacing, which apply to a whole block, not a text run.
    applyBlockStyle: (styleProp, value) => {
      restoreSelection();
      const block = currentBlock();
      if (block) block.style[styleProp] = value;
      reflow();
    },

    focus: () => pageRefs.current[0]?.focus(),
    saveSelection,
  }));

  // Split the initial HTML into the first page; reflow() will spread it
  // across further pages on mount if it's already longer than one page.
  useEffect(() => {
    if (pageRefs.current[0]) {
      pageRefs.current[0].innerHTML = initialHTML || "";
      reflow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHTML]);

  function ensurePage(index) {
    if (!pageRefs.current[index]) {
      setPageCount((c) => Math.max(c, index + 1));
    }
  }

  const reflow = useCallback(() => {
    if (reflowScheduled.current) return;
    reflowScheduled.current = true;

    requestAnimationFrame(() => {
      reflowScheduled.current = false;
      const pages = pageRefs.current.filter(Boolean);
      let needsMorePages = false;

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        let guard = 0;
        while (page.scrollHeight > PAGE_HEIGHT_PX && page.lastChild && guard < 500) {
          guard++;
          const overflowNode = page.lastChild;
          page.removeChild(overflowNode);

          if (!pages[i + 1]) {
            needsMorePages = true;
            page._pendingOverflow = page._pendingOverflow || [];
            page._pendingOverflow.unshift(overflowNode);
            break;
          } else {
            pages[i + 1].insertBefore(overflowNode, pages[i + 1].firstChild);
          }
        }
      }

      if (needsMorePages) {
        ensurePage(pages.length);
        requestAnimationFrame(() => {
          const last = pages[pages.length - 1];
          const nextPage = pageRefs.current[pages.length];
          if (last?._pendingOverflow && nextPage) {
            last._pendingOverflow.forEach((node) => nextPage.appendChild(node));
            last._pendingOverflow = null;
          }
          reflow();
        });
        return;
      }

      for (let i = 0; i < pages.length - 1; i++) {
        const page = pages[i];
        const next = pages[i + 1];
        let guard = 0;
        while (next && next.firstChild && guard < 500) {
          guard++;
          const candidate = next.firstChild;
          page.appendChild(candidate);
          if (page.scrollHeight > PAGE_HEIGHT_PX) {
            next.insertBefore(candidate, next.firstChild);
            break;
          }
        }
      }

      let lastNonEmpty = 0;
      pages.forEach((p, i) => {
        if (p.childNodes.length > 0 && p.textContent.trim() !== "") lastNonEmpty = i;
      });
      const target = Math.max(1, lastNonEmpty + 1);
      if (target < pages.length) {
        setPageCount(target);
      }

      onChange?.(pages.map((p) => p.innerHTML).join(""));
    });
  }, [onChange]);

  function handleInput(e) {
    saveSelection();
    reflow();
    updateActiveCell();

    // Slash-command detection: fires only when "/" is the ONLY character
    // typed so far in the current block (so "5/10" while writing normal
    // text never triggers it).
    if (onSlash) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).startContainer;
        const blockEl = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        if (blockEl && blockEl.textContent === "/") {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          onSlash({ x: rect.left, y: rect.bottom, blockEl });
          return;
        }
      }
    }

    // [[ note-link detection — same "only thing in the block so far" rule
    // as slash commands, for the same reason (never trigger mid-sentence
    // off two literal brackets someone actually meant to type).
    if (onNoteLink) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).startContainer;
        const blockEl = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        if (blockEl && blockEl.textContent === "[[") {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          onNoteLink({ x: rect.left, y: rect.bottom, blockEl });
          return;
        }
      }
    }
  }

  function handleClick(e) {
    const box = e.target.closest?.(".cl-box");
    if (box) {
      const item = box.closest(".cl-item");
      const checked = item.dataset.checked === "true";
      item.dataset.checked = checked ? "false" : "true";
      box.textContent = checked ? "☐" : "☑";
      item.style.textDecoration = checked ? "none" : "line-through";
      item.style.opacity = checked ? "1" : "0.6";
      reflow();
    }
  }

  function handleDrop(e) {
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0 && onImageDrop) {
      e.preventDefault();
      onImageDrop(files);
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {Array.from({ length: pageCount }).map((_, i) => (
        <div key={i} className="relative">
          <div
            ref={(el) => (pageRefs.current[i] = el)}
            contentEditable
            suppressContentEditableWarning
            data-placeholder={i === 0 ? placeholder : undefined}
            onInput={handleInput}
            onPaste={handleLinkPaste}
            onBlur={() => {
              saveSelection();
              reflow();
              onTableFocus?.(null); // safe: toolbar buttons preventDefault on mousedown, so this only fires on a genuine focus change elsewhere
            }}
            onKeyUp={() => { saveSelection(); updateActiveCell(); }}
            onMouseUp={() => { saveSelection(); updateActiveCell(); }}
            onClick={handleClick}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            style={{ minHeight: PAGE_HEIGHT_PX, maxHeight: PAGE_HEIGHT_PX, fontSize }}
            className="border border-app-border bg-app-panel p-6 leading-[1.8] text-ink-soft outline-none focus:border-accent-notes overflow-hidden rounded-xl empty-placeholder editor-page"
          />
          <div className="text-center text-[10px] text-ink-muted mt-1.5 select-none">
            Page {i + 1}
            {pageCount > 1 ? ` of ${pageCount}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
});

export default PaginatedEditor;
