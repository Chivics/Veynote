import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";

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
  { initialHTML, onChange, placeholder, onSlash, onImageDrop, fontSize = "14px" },
  ref
) {
  const containerRef = useRef(null);
  const pageRefs = useRef([]);
  const [pageCount, setPageCount] = useState(1);
  const reflowScheduled = useRef(false);
  const savedRange = useRef(null);

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
            onBlur={() => {
              saveSelection();
              reflow();
            }}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
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
