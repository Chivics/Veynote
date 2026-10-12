import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { handleLinkPaste } from "../utils/linkify";
import { observeMedia, persistentHTML, storedMediaName } from "../utils/media";
import { safeHtml, escapeHtml } from "../utils/safeHtml";
import { listDescriptor } from "../utils/editorListStyles.js";
import { logicalDocumentHTML, splitListToFit, splitListItemToFit, splitTableToFit, splitTextBlockToFit } from "../utils/editorPagination.js";

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
 * Page fragments are only visual: serialization reunites split paragraphs
 * before autosave, export, search, and history see the logical document.
 */

const PAGE_HEIGHT_PX = 760; // ≈ a comfortable "sheet" of writing space
const PAGE_GROWTH = 8;
const MAX_HISTORY_STEPS = 150;
const MAX_HISTORY_CHARACTERS = 2_000_000; // bound snapshot memory for long manuscripts

function mediaState(media) {
  const align = ["left", "right"].find(value => media.classList.contains(`align-${value}`)) || "center";
  const size = ["small", "medium"].find(value => media.classList.contains(`size-${value}`)) || "wide";
  return { align, size };
}

const TEXT_BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,blockquote,pre";

function hasBlockContent(block) {
  return Boolean(block.textContent?.trim() || block.querySelector("img,video,audio,table,hr,.editor-inline-file"));
}

const PaginatedEditor = forwardRef(function PaginatedEditor(
  { initialHTML, onChange, onSelectionChange, onHistoryChange, placeholder, onSlash, onNoteLink, onFileOpen, onImageDrop, onTableFocus, onMediaFocus, fontSize = "14px" },
  ref
) {
  const containerRef = useRef(null);
  const pageRefs = useRef([]);
  useEffect(() => containerRef.current ? observeMedia(containerRef.current) : undefined, []);
  const [pageCount, setPageCount] = useState(1);
  const reflowScheduled = useRef(false);
  const pendingReflowRange = useRef(null);
  const isComposing = useRef(false);
  const compositionCheckpoint = useRef(null);
  const reflowSelection = useRef(null);
  const pendingNativeInput = useRef(null);
  const lastSerializedHTML = useRef("");
  const savedRange = useRef(null);
  const activeCellRef = useRef(null); // { cell, row, table } — the table cell the cursor was last in
  const activeMediaRef = useRef(null);
  const replacementTargetsRef = useRef(new Map());
  const nextReplacementTokenRef = useRef(0);
  const searchMatchesRef = useRef([]); // [{ node, start, end }] — recomputed on every findAll() call
  const currentMatchIndexRef = useRef(-1);
  const undoHistory = useRef([]);
  const redoHistory = useRef([]);
  function reportHistory() {
    onHistoryChange?.({ canUndo: undoHistory.current.length > 0, canRedo: redoHistory.current.length > 0 });
  }
  function historyCheckpoint() {
    return { html: documentHTML(), undo: [...undoHistory.current], redo: [...redoHistory.current] };
  }
  function discardNoopHistory(checkpoint) {
    if (documentHTML() !== checkpoint.html) return;
    undoHistory.current = checkpoint.undo; redoHistory.current = checkpoint.redo;
    reportHistory();
  }

  function documentHTML() { return logicalDocumentHTML(pageRefs.current, persistentHTML); }

  function selectionBookmark() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    let node = selection.anchorNode;
    const pageIndex = pageRefs.current.findIndex(page => page?.contains(node));
    if (pageIndex < 0) return null;
    const page = pageRefs.current[pageIndex];
    let block = node;
    while (block?.parentNode && block.parentNode !== page) block = block.parentNode;
    const blockIndex = block === page ? -1 : pageRefs.current.slice(0, pageIndex)
      .reduce((count, previousPage) => count + (previousPage?.childNodes.length || 0), 0)
      + [...page.childNodes].indexOf(block);
    const path = [];
    while (node && node !== block) {
      const parent = node.parentNode;
      path.unshift([...parent.childNodes].indexOf(node)); node = parent;
    }
    return { blockIndex, path, offset: selection.anchorOffset };
  }

  function rememberEdit() {
    const html = documentHTML();
    if (undoHistory.current.at(-1)?.html !== html) {
      undoHistory.current.push({ html, bookmark: selectionBookmark() });
      while (undoHistory.current.length > 1 &&
        (undoHistory.current.length > MAX_HISTORY_STEPS ||
          undoHistory.current.reduce((total, entry) => total + entry.html.length, 0) > MAX_HISTORY_CHARACTERS)) {
        undoHistory.current.shift();
      }
    }
    redoHistory.current = [];
    reportHistory();
  }

  function restoreDocument(snapshot) {
    const first = pageRefs.current[0];
    if (!first) return;
    // A queued reflow can hold nodes from the document being replaced.
    // Preserve the snapshot bookmark instead of reusing that stale caret.
    reflowSelection.current = null;
    pendingReflowRange.current = null;
    pendingNativeInput.current = null;
    first.innerHTML = safeHtml(snapshot.html);
    pageRefs.current.slice(1).forEach(page => { if (page) page.innerHTML = ""; });
    savedRange.current = null; activeCellRef.current = null; activeMediaRef.current = null; replacementTargetsRef.current.clear();
    onTableFocus?.(null); onMediaFocus?.(null);
    hydrateChecklists(); hydrateMediaControls();
    const bookmark = snapshot.bookmark;
    let node = bookmark?.blockIndex >= 0
      ? first.childNodes[bookmark.blockIndex] || first.lastChild || first
      : first;
    if (bookmark?.blockIndex >= 0) {
      for (const index of bookmark.path) node = node?.childNodes[index] || node?.lastChild || node;
    }
    try {
      const range = document.createRange();
      range.setStart(node, Math.min(bookmark?.offset || 0, node.nodeType === Node.TEXT_NODE ? node.textContent.length : node.childNodes.length));
      range.collapse(true);
      first.focus({ preventScroll: true });
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    } catch { first.focus({ preventScroll: true }); }
    saveSelection(); reportSelection(); reflow(true);
  }

  function stepHistory(direction) {
    const source = direction === "undo" ? undoHistory.current : redoHistory.current;
    const destination = direction === "undo" ? redoHistory.current : undoHistory.current;
    if (!source.length) return false;
    destination.push({ html: documentHTML(), bookmark: selectionBookmark() });
    restoreDocument(source.pop()); reportHistory(); return true;
  }

  function withActiveCell(fn) {
    const ctx = activeCellRef.current;
    if (ctx && document.body.contains(ctx.cell)) fn(ctx.cell, ctx.row, ctx.table);
  }

  function tableFragments(table) {
    const blocks = pageRefs.current.filter(Boolean).flatMap(page => [...page.children]);
    const index = blocks.indexOf(table);
    if (index < 0) return [table];
    let first = index, last = index;
    while (first > 0 && blocks[first].dataset.pageContinuation === "true" && blocks[first - 1].tagName === "TABLE") first--;
    while (last + 1 < blocks.length && blocks[last + 1].tagName === "TABLE" && blocks[last + 1].dataset.pageContinuation === "true") last++;
    return blocks.slice(first, last + 1);
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
    if (!savedRange.current) { pageRefs.current[0]?.focus({ preventScroll: true }); return; }
    const page = pageRefs.current.find(p => p?.contains(savedRange.current.startContainer));
    if (!page) { pageRefs.current[0]?.focus({ preventScroll: true }); return; }
    page.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.current);
  }

  function selectionContext() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const anchor = selection.anchorNode?.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
    const page = pageRefs.current.find(p => p && p.contains(anchor));
    if (!page) return null;
    const item = anchor?.closest?.("li"), list = item?.parentElement?.matches("ul,ol") ? item.parentElement : anchor?.closest?.("ul,ol");
    return { selection, anchor, page, item: item && page.contains(item) ? item : null, list: list && page.contains(list) ? list : null };
  }

  function formatState() {
    const context = selectionContext();
    if (!context) return null;
    const { anchor, list } = context;
    const block = anchor?.closest?.("h1,h2,h3,h4,h5,h6,p,blockquote,pre,li") || null;
    return {
      bold: Boolean(anchor?.closest?.("b,strong")), italic: Boolean(anchor?.closest?.("i,em")),
      underline: Boolean(anchor?.closest?.("u")), strike: Boolean(anchor?.closest?.("s,strike,del")),
      code: Boolean(anchor?.closest?.("code,pre")), block: block?.tagName || "P", list: listDescriptor(list),
    };
  }

  function reportSelection() { const state = formatState(); if (state) onSelectionChange?.(state); }

  function normalizeListNesting(pages = pageRefs.current.filter(Boolean)) {
    // Chromium's native indent command sometimes emits <ul><li>A</li><ul>
    // <li>B</li></ul></ul>. A list may only contain <li> children. Move
    // the sublist into the preceding item before saving or displaying it.
    pages.filter(Boolean).forEach(page => {
      page.querySelectorAll("ul,ol").forEach(list => {
        [...list.children].filter(child => child.matches("ul,ol")).forEach(nested => {
          const previous = nested.previousElementSibling;
          if (previous?.tagName === "LI") previous.appendChild(nested);
        });
      });
      // The matching native outdent can leave <li> directly inside another
      // <li> (without an intervening list). Promote it to the parent list.
      page.querySelectorAll("li").forEach(parent => {
        if (!parent.parentElement?.matches("ul,ol")) return;
        let cursor = parent;
        [...parent.children].filter(child => child.tagName === "LI").forEach(item => {
          cursor.after(item); cursor = item;
        });
      });
    });
  }

  function hydrateChecklists(pages = pageRefs.current.filter(Boolean)) {
    normalizeListNesting(pages);
    pages.filter(Boolean).forEach(page => {
      page.querySelectorAll("ul.veynote-checklist, ul.veynote-checklist ul").forEach(list => {
        list.classList.add("veynote-checklist");
        [...list.children].filter(child => child.tagName === "LI").forEach(item => {
          item.classList.add("cl-item");
          if (!item.dataset.checked) item.dataset.checked = "false";
          let box = [...item.children].find(child => child.classList.contains("cl-box"));
          if (!box) { box = document.createElement("span"); box.className = "cl-box"; item.prepend(box); }
          // Keep the item's own text separate from child tasks. A line-through
          // applied to an LI paints across descendants even when nested lists
          // override text-decoration, so completion must target this span.
          let content = [...item.children].find(child => child.classList.contains("cl-item-content"));
          if (!content) { content = document.createElement("span"); content.className = "cl-item-content"; box.after(content); }
          [...item.childNodes].filter(child => child !== box && child !== content && !(child.nodeType === 1 && child.matches("ul,ol"))).forEach(child => content.append(child));
          box.contentEditable = "false"; box.tabIndex = 0; box.setAttribute("role", "checkbox");
          box.setAttribute("aria-label", "Completed"); box.setAttribute("aria-checked", item.dataset.checked);
          box.textContent = item.dataset.checked === "true" ? "✓" : "☐";
        });
      });
    });
  }

  function applyList(kind, style) {
    restoreSelection();
    const context = selectionContext();
    if (!context) return false;
    const checkpoint = historyCheckpoint();
    const tag = kind === "numbered" ? "OL" : "UL";
    let list = context.list;
    let remembered = false;
    function rememberOnce() { if (!remembered) { rememberEdit(); remembered = true; } }
    if (list && list.tagName !== tag) {
      rememberOnce();
      const converted = document.createElement(tag);
      while (list.firstChild) converted.appendChild(list.firstChild);
      list.replaceWith(converted);
      list = converted;
    } else if (!list) {
      // Native list commands on a restored range can create <p><ul> and
      // even turn the *next* heading into styled paragraph text. Preserve
      // adjacent document blocks by changing only the current block.
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      const startNode = range?.startContainer?.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range?.startContainer;
      const block = startNode?.closest?.("p,h1,h2,h3,h4,h5,h6,blockquote,pre") || context.anchor?.closest?.("p,h1,h2,h3,h4,h5,h6,blockquote,pre") || currentBlock();
      if (!block || block === context.page || block.parentElement !== context.page) return false;
      let blocks = [block];
      if (range && !selection.isCollapsed && !block.contains(range.endContainer)) {
        const endNode = range.endContainer;
        const endElement = endNode.nodeType === Node.TEXT_NODE ? endNode.parentElement : endNode;
        const endBlock = endElement?.closest?.("p,h1,h2,h3,h4,h5,h6,blockquote,pre");
        if (!endBlock || endBlock.parentElement !== context.page) return false;
        const siblings = [...context.page.children];
        const start = siblings.indexOf(block), end = siblings.indexOf(endBlock);
        if (start < 0 || end < start || !siblings.slice(start, end + 1).every(candidate => candidate.matches("p,h1,h2,h3,h4,h5,h6,blockquote,pre"))) return false;
        blocks = siblings.slice(start, end + 1);
      }
      rememberOnce();
      list = document.createElement(tag);
      blocks.forEach(source => {
        const item = document.createElement("li");
        while (source.firstChild) item.appendChild(source.firstChild);
        if (!item.firstChild) item.append(document.createElement("br"));
        list.append(item);
      });
      block.replaceWith(list);
      blocks.slice(1).forEach(source => source.remove());
      const caret = document.createRange(); caret.selectNodeContents(list.lastElementChild); caret.collapse(false);
      selection.removeAllRanges(); selection.addRange(caret);
    }
    if (!list || list.tagName !== tag) return false;
    rememberOnce();
    if (tag === "OL") {
      list.classList.remove("list-dash", "veynote-checklist");
      list.style.listStyleType = style || "decimal";
      [...list.children].forEach(item => { item.classList.remove("cl-item"); item.removeAttribute("data-checked"); item.querySelector(":scope > .cl-box")?.remove(); });
    } else if (kind === "checklist") {
      list.classList.remove("list-dash"); list.classList.add("veynote-checklist");
      list.style.removeProperty("list-style-type");
      hydrateChecklists([context.page]);
    } else {
      list.classList.remove("veynote-checklist"); list.classList.toggle("list-dash", style === "dash");
      if (style === "dash") list.style.removeProperty("list-style-type");
      else list.style.listStyleType = style || "disc";
      // A converted checklist must no longer contain checkbox controls.
      [...list.children].forEach(item => { item.classList.remove("cl-item"); item.removeAttribute("data-checked"); item.querySelector(":scope > .cl-box")?.remove(); });
    }
    discardNoopHistory(checkpoint);
    saveSelection(); reportSelection(); reflow(); return true;
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

  function editorBlocks() {
    return pageRefs.current.filter(Boolean).flatMap(page => [...page.children]).filter(hasBlockContent);
  }

  function selectedMediaState(media) {
    const blocks = editorBlocks();
    const index = blocks.indexOf(media);
    return { ...mediaState(media), canMoveUp: index > 0, canMoveDown: index >= 0 && index < blocks.length - 1 };
  }

  function selectMedia(media) {
    activeMediaRef.current = media;
    onMediaFocus?.(media.getBoundingClientRect(), selectedMediaState(media));
  }

  function hydrateMediaControls(pages = pageRefs.current.filter(Boolean)) {
    pages.filter(Boolean).forEach(page => {
      page.querySelectorAll(".editor-media").forEach(media => {
        media.tabIndex = 0;
        media.contentEditable = "false";
        media.setAttribute("role", "group");
        media.setAttribute("aria-label", `Image: ${media.querySelector("img")?.alt || "Document image"}`);
        media.setAttribute("aria-description", "Press Space for image controls, Enter to edit the caption, or Delete to remove the image.");
        const caption = media.querySelector(".editor-caption");
        if (caption) { caption.contentEditable = "true"; caption.setAttribute("aria-label", "Image caption"); }
      });
    });
  }

  // Insert a standalone block at the caret. Splitting a text block keeps
  // writing on both sides of the image or file instead of moving the block
  // to the end of the entire paragraph.
  function insertStandaloneBlock(inserted) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return false;
    const range = selection.getRangeAt(0);
    const page = pageRefs.current.find(candidate => candidate?.contains(range.startContainer) && candidate.contains(range.endContainer));
    if (!page) return false;
    const topLevel = node => {
      while (node && node !== page && node.parentNode !== page) node = node.parentNode;
      return node;
    };
    const startBlock = topLevel(range.startContainer);
    if (startBlock !== topLevel(range.endContainer)) return false;
    rememberEdit();
    if (!range.collapsed) range.deleteContents();
    const insertionBlock = topLevel(range.startContainer);
    let trailing = null;
    if (range.startContainer === page) {
      page.insertBefore(inserted, page.childNodes[range.startOffset] || null);
    } else if (insertionBlock?.matches?.(TEXT_BLOCK_SELECTOR)) {
      const afterRange = range.cloneRange();
      afterRange.setEnd(insertionBlock, insertionBlock.childNodes.length);
      trailing = insertionBlock.cloneNode(false);
      trailing.append(afterRange.extractContents());
      if (hasBlockContent(insertionBlock)) insertionBlock.after(inserted);
      else insertionBlock.replaceWith(inserted);
      if (hasBlockContent(trailing)) inserted.after(trailing);
      else trailing = null;
    } else if (insertionBlock && insertionBlock !== page) {
      insertionBlock.after(inserted);
    } else {
      page.append(inserted);
    }
    const next = trailing || (inserted.nextElementSibling?.matches(TEXT_BLOCK_SELECTOR) ? inserted.nextElementSibling : null);
    const focusBlock = next || document.createElement("p");
    if (!next) { focusBlock.append(document.createElement("br")); inserted.after(focusBlock); }
    const caret = document.createRange(); caret.selectNodeContents(focusBlock); caret.collapse(true);
    const focusPage = focusBlock.closest(".editor-page");
    focusPage?.focus({ preventScroll: true });
    selection.removeAllRanges(); selection.addRange(caret);
    saveSelection(); reportSelection(); reflow();
    return true;
  }

  function removeSelectedMedia() {
    const media = activeMediaRef.current;
    if (!media || !document.body.contains(media)) return false;
    rememberEdit();
    const page = media.closest(".editor-page");
    let focusBlock = media.nextElementSibling?.matches(TEXT_BLOCK_SELECTOR) ? media.nextElementSibling : null;
    if (!focusBlock) {
      focusBlock = document.createElement("p"); focusBlock.append(document.createElement("br")); media.after(focusBlock);
    }
    media.remove(); activeMediaRef.current = null; onMediaFocus?.(null);
    page?.focus({ preventScroll: true });
    const caret = document.createRange(); caret.selectNodeContents(focusBlock); caret.collapse(true);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(caret);
    saveSelection(); reportSelection(); reflow(); return true;
  }

  useImperativeHandle(ref, () => ({
    getHTML: documentHTML,
    getSelectionQuote: () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return "";
      const pages = pageRefs.current.filter(Boolean);
      const inside = pages.some(page => page.contains(selection.anchorNode)) && pages.some(page => page.contains(selection.focusNode));
      return inside ? selection.toString().replace(/\s+/g, " ").trim().slice(0, 500) : "";
    },

    exec: (cmd, arg) => {
      if (cmd === "undo" || cmd === "redo") return stepHistory(cmd);
      if (cmd === "insertUnorderedList") return applyList("bullet", "disc");
      if (cmd === "insertOrderedList") return applyList("numbered", "decimal");
      restoreSelection();
      const checkpoint = historyCheckpoint();
      rememberEdit();
      const success = document.execCommand(cmd, false, arg);
      discardNoopHistory(checkpoint);
      if (success) { reportSelection(); reflow(); }
      return success;
    },

    setList: applyList,
    getFormatState: formatState,
    removeAttachmentReferences: value => {
      const name = storedMediaName(value);
      if (!name) return;
      let removed = false;
      pageRefs.current.filter(Boolean).forEach(page => {
        page.querySelectorAll("a.editor-inline-file-link[href],.editor-media img[src]").forEach(element => {
          if (storedMediaName(element.getAttribute("href") || element.getAttribute("src")) !== name) return;
          const block = element.closest(".editor-inline-file,.editor-media") || element;
          if (block) { block.remove(); removed = true; }
        });
      });
      if (removed) { savedRange.current = null; undoHistory.current = []; redoHistory.current = []; reportHistory(); reflow(); }
    },
    insertFileCard: attachment => {
      const name = storedMediaName(attachment?.url);
      if (!name) return false;
      restoreSelection();
      const card = document.createElement("div"); card.className = "editor-inline-file"; card.dataset.type = "file";
      const link = document.createElement("a"); link.className = "editor-inline-file-link"; link.href = `/uploads/${name}`;
      const mark = document.createElement("span"); mark.className = "editor-inline-file-mark"; mark.textContent = "↧";
      const details = document.createElement("span"); details.className = "editor-inline-file-details";
      const title = document.createElement("strong"); title.textContent = attachment.originalName || "Attached file";
      const metadata = document.createElement("small");
      const bytes = Number(attachment.sizeBytes) || 0;
      const size = bytes < 1024 ? `${bytes} B` : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
      metadata.textContent = `${attachment.mimeType || "File"} · ${size}`;
      details.append(title, metadata);
      const action = document.createElement("span"); action.className = "editor-inline-file-open"; action.textContent = "Open file →";
      link.append(mark, details, action); card.append(link);
      return insertStandaloneBlock(card);
    },
    insertImageBlock: attachment => {
      const name = storedMediaName(attachment?.url);
      if (!name) return false;
      restoreSelection();
      const media = document.createElement("div");
      media.className = "editor-media align-center size-wide"; media.dataset.type = "image";
      const image = document.createElement("img"); image.src = `/uploads/${name}`; image.alt = attachment.originalName || "Document image";
      const caption = document.createElement("div"); caption.className = "editor-caption";
      media.append(image, caption);
      const inserted = insertStandaloneBlock(media);
      if (inserted) hydrateMediaControls();
      return inserted;
    },
    inlineCode: () => {
      restoreSelection();
      const selection = window.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed || !selection.toString().trim()) return false;
      const range = selection.getRangeAt(0);
      const start = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
      const end = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : range.endContainer;
      const page = pageRefs.current.find(candidate => candidate?.contains(start) && candidate.contains(end));
      const startBlock = start?.closest?.("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre");
      const endBlock = end?.closest?.("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre");
      if (!page || startBlock !== endBlock) return false;
      rememberEdit();
      const inserted = document.execCommand("insertHTML", false, `<code>${escapeHtml(selection.toString())}</code>`);
      if (inserted) { saveSelection(); reportSelection(); reflow(); }
      return inserted;
    },

    insertHTML: (html) => {
      restoreSelection();
      rememberEdit();
      document.execCommand("insertHTML", false, safeHtml(html));
      reflow();
    },

    // Same as insertHTML, but if the HTML contains an element with
    // data-focus-target, the cursor is placed inside it afterward —
    // used so inserting a callout or table drops you straight into the
    // first editable spot instead of leaving the cursor wherever
    // execCommand happened to land.
    insertBlock: (html) => {
      restoreSelection();
      rememberEdit();
      document.execCommand("insertHTML", false, safeHtml(html));
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
      rememberEdit();
      const newRow = row.cloneNode(true);
      Array.from(newRow.children).forEach((td) => { td.innerHTML = "&nbsp;"; });
      row.parentNode.insertBefore(newRow, position === "above" ? row : row.nextSibling);
      onTableFocus?.(table.getBoundingClientRect());
      reflow();
    }),
    tableAddColumn: (position) => withActiveCell((cell, row, table) => {
      rememberEdit();
      const cellIndex = Array.from(row.children).indexOf(cell);
      tableFragments(table).flatMap(fragment => [...fragment.querySelectorAll("tr")]).forEach((tr) => {
        const ref = tr.children[cellIndex];
        const td = document.createElement(ref.tagName);
        td.innerHTML = "&nbsp;";
        tr.insertBefore(td, position === "left" ? ref : ref.nextSibling);
      });
      onTableFocus?.(table.getBoundingClientRect());
      reflow();
    }),
    tableDeleteRow: () => withActiveCell((cell, row, table) => {
      rememberEdit();
      const rows = tableFragments(table).flatMap(fragment => [...fragment.querySelectorAll("tr")]);
      if (rows.length <= 1) {
        tableFragments(table).forEach(fragment => fragment.remove());
        onTableFocus?.(null);
      } else {
        row.remove();
        if (!table.querySelector("tr")) table.remove();
        onTableFocus?.(table.isConnected ? table.getBoundingClientRect() : null);
      }
      reflow();
    }),
    tableDeleteColumn: () => withActiveCell((cell, row, table) => {
      rememberEdit();
      const cellIndex = Array.from(row.children).indexOf(cell);
      const fragments = tableFragments(table);
      const rows = fragments.flatMap(fragment => [...fragment.querySelectorAll("tr")]);
      if (row.children.length <= 1) {
        fragments.forEach(fragment => fragment.remove());
        onTableFocus?.(null);
      } else {
        rows.forEach((tr) => tr.children[cellIndex]?.remove());
        onTableFocus?.(table.getBoundingClientRect());
      }
      reflow();
    }),
    tableDelete: () => withActiveCell((cell, row, table) => {
      rememberEdit();
      tableFragments(table).forEach(fragment => fragment.remove());
      onTableFocus?.(null);
      reflow(true);
    }),
    tableToggleHeaderRow: () => withActiveCell((cell, row, table) => {
      const first = tableFragments(table)[0]?.querySelector("tr");
      if (!first) return;
      rememberEdit();
      const makeHeader = first.firstElementChild?.tagName !== "TH";
      const cellIndex = [...row.children].indexOf(cell);
      [...first.children].forEach((oldCell, index) => {
        const replacement = document.createElement(makeHeader ? "th" : "td");
        while (oldCell.firstChild) replacement.append(oldCell.firstChild);
        oldCell.replaceWith(replacement);
        if (row === first && index === cellIndex) activeCellRef.current = { cell: replacement, row: first, table };
      });
      onTableFocus?.(table.getBoundingClientRect()); reflow();
    }),

    mediaAlign: (align) => {
      const media = activeMediaRef.current;
      if (!media || !document.body.contains(media)) return;
      if (!["left", "center", "right"].includes(align)) return;
      if (media.classList.contains(`align-${align}`)) return;
      rememberEdit();
      media.classList.remove("align-left", "align-center", "align-right");
      media.classList.add(`align-${align}`);
      selectMedia(media);
      reflow();
    },
    mediaSize: (size) => {
      const media = activeMediaRef.current;
      if (!media || !document.body.contains(media)) return;
      if (!["small", "medium", "wide"].includes(size)) return;
      if (media.classList.contains(`size-${size}`)) return;
      rememberEdit();
      media.classList.remove("size-small", "size-medium", "size-wide");
      media.classList.add(`size-${size}`);
      selectMedia(media);
      reflow();
    },
    mediaMove: direction => {
      const media = activeMediaRef.current;
      if (!media || !document.body.contains(media) || !["up", "down"].includes(direction)) return false;
      const blocks = editorBlocks();
      const index = blocks.indexOf(media);
      if (index < 0) return false;
      const neighbor = blocks[index + (direction === "up" ? -1 : 1)];
      if (!neighbor) return false;
      rememberEdit();
      if (direction === "up") neighbor.before(media);
      else neighbor.after(media);
      selectMedia(media); reflow();
      requestAnimationFrame(() => { if (media.isConnected) selectMedia(media); });
      return true;
    },
    prepareMediaReplace: () => {
      const media = activeMediaRef.current;
      if (!media?.isConnected) return null;
      const token = ++nextReplacementTokenRef.current;
      replacementTargetsRef.current.set(token, media);
      return token;
    },
    focusActiveMedia: () => activeMediaRef.current?.focus({ preventScroll: true }),
    cancelMediaReplace: token => replacementTargetsRef.current.delete(token),
    mediaReplace: (src, alt, token) => {
      const media = token ? replacementTargetsRef.current.get(token) : activeMediaRef.current;
      if (token) replacementTargetsRef.current.delete(token);
      const image = media?.querySelector("img");
      const name = storedMediaName(src);
      if (!media?.isConnected || !image || !name) return false;
      rememberEdit();
      image.src = `/uploads/${name}`; image.alt = alt || "Document image";
      hydrateMediaControls(); selectMedia(media); reflow(); return true;
    },
    mediaRemove: removeSelectedMedia,

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
      rememberEdit();
      const text = m.node.textContent;
      m.node.textContent = text.slice(0, m.start) + replacement + text.slice(m.end);
      reflow();
    },

    replaceAll: (query, replacement) => {
      clearSearchHighlight();
      if (!query) return 0;
      rememberEdit();
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
      rememberEdit();
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
      if (block) { const checkpoint = historyCheckpoint(); rememberEdit(); block.style[styleProp] = value; discardNoopHistory(checkpoint); }
      reflow();
    },

    focus: () => pageRefs.current[0]?.focus(),
    saveSelection,
  }));

  // Split the initial HTML into the first page; reflow() will spread it
  // across further pages on mount if it's already longer than one page.
  useEffect(() => {
    if (pageRefs.current[0]) {
      pageRefs.current[0].innerHTML = safeHtml(initialHTML);
      pageRefs.current.slice(1).forEach(page => { if (page) page.innerHTML = ""; });
      pageRefs.current.forEach(page => { if (page) { delete page._pendingOverflow; delete page.dataset.extended; } });
      hydrateChecklists(); hydrateMediaControls();
      // Parsing or laying out an existing document is not a user edit. Keep a
      // normalized baseline so opening/blur cannot create saves or versions.
      lastSerializedHTML.current = persistentHTML(pageRefs.current[0]);
      savedRange.current = null;
      reflowSelection.current = null;
      pendingReflowRange.current = null;
      isComposing.current = false; compositionCheckpoint.current = null;
      activeMediaRef.current = null; replacementTargetsRef.current.clear(); onMediaFocus?.(null);
      undoHistory.current = []; redoHistory.current = [];
      reportHistory();
      reflow(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHTML]);

  function ensurePage(index) {
    if (!pageRefs.current[index]) {
      setPageCount((c) => Math.max(c, index + PAGE_GROWTH));
    }
  }

  function pageIndexFor(source) {
    const node = source || reflowSelection.current?.anchorNode || window.getSelection()?.anchorNode || document.activeElement;
    const page = node?.nodeType === Node.ELEMENT_NODE
      ? node.closest?.(".editor-page")
      : node?.parentElement?.closest?.(".editor-page");
    return pageRefs.current.indexOf(page);
  }

  function rememberSelectionForReflow(force = false) {
    if (reflowSelection.current && !force) return;
    const pages = pageRefs.current.filter(Boolean);
    const selection = window.getSelection();
    if (!selection?.rangeCount ||
      !pages.some(page => page.contains(document.activeElement)) ||
      !pages.some(page => page.contains(selection.anchorNode)) ||
      !pages.some(page => page.contains(selection.focusNode))) return;
    reflowSelection.current = {
      anchorNode: selection.anchorNode, anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode, focusOffset: selection.focusOffset,
    };
  }

  function rememberNativeTextInput(event) {
    pendingNativeInput.current = null;
    const native = event.nativeEvent;
    // React may synthesize beforeinput from a textInput event, which carries
    // `data` but no `inputType` in Chromium.
    const plainText = native?.inputType === "insertText" ||
      (!native?.inputType && typeof native?.data === "string" && !/[\r\n]/.test(native.data));
    if (isComposing.current || native?.isComposing || !plainText || !native.data) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed || !event.currentTarget.contains(selection.anchorNode)) return;
    const anchor = selection.anchorNode.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
    const block = anchor?.closest?.("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,.editor-caption");
    if (!block || !event.currentTarget.contains(block)) return;
    const prefix = document.createRange();
    prefix.selectNodeContents(block);
    prefix.setEnd(selection.anchorNode, selection.anchorOffset);
    // Range.toString() normalizes whitespace and can undercount a paragraph.
    // DOM text-node lengths match Selection offsets exactly.
    pendingNativeInput.current = { block, offset: prefix.cloneContents().textContent.length + native.data.length };
  }

  function restoreNativeTextInput() {
    const pending = pendingNativeInput.current;
    pendingNativeInput.current = null;
    if (!pending?.block.isConnected) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    if (pending.block.contains(selection.anchorNode)) {
      const current = document.createRange();
      current.selectNodeContents(pending.block);
      current.setEnd(selection.anchorNode, selection.anchorOffset);
      const expected = Math.min(pending.offset, pending.block.textContent.length);
      if (Math.abs(current.cloneContents().textContent.length - expected) <= 1) return;
    }
    // Chromium can place the caret at the start of the following paragraph
    // or at the start of the same paragraph when typing wraps at the clipped
    // edge of a contentEditable page. Put the caret after the inserted text
    // before pagination moves that block.
    const walker = document.createTreeWalker(pending.block, NodeFilter.SHOW_TEXT);
    // Chromium can normalize a space at a wrapping boundary, so the text it
    // inserted may be one character shorter than beforeinput.data. Clamp
    // against actual DOM text before walking nodes or the caret wraps to 1.
    let remaining = Math.min(pending.offset, pending.block.textContent.length), node, last = null;
    while ((node = walker.nextNode())) {
      last = node;
      if (remaining <= node.textContent.length) break;
      remaining -= node.textContent.length;
    }
    if (!last) return;
    const range = document.createRange();
    range.setStart(last, Math.min(remaining, last.textContent.length)); range.collapse(true);
    const page = pending.block.closest(".editor-page");
    page?.focus({ preventScroll: true });
    selection.removeAllRanges(); selection.addRange(range);
  }

  const reflow = useCallback((source = null) => {
    // Capture synchronously, before another queued frame can detach the
    // selected block. A second edit can arrive while a reflow is scheduled.
    if (!isComposing.current) rememberSelectionForReflow();
    const index = source === true ? -1 : pageIndexFor(source);
    const full = source === true || index < 0;
    const previous = pendingReflowRange.current;
    pendingReflowRange.current = {
      start: Math.min(previous?.start ?? Infinity, full ? 0 : Math.max(0, index - 1)),
      end: Math.max(previous?.end ?? 0, full ? pageRefs.current.length - 1 : index),
      full: Boolean(previous?.full || full),
    };
    if (reflowScheduled.current) return;
    reflowScheduled.current = true;

    requestAnimationFrame(() => {
      reflowScheduled.current = false;
      const pending = pendingReflowRange.current;
      pendingReflowRange.current = null;
      // Moving an active block between contentEditable pages can make the
      // browser collapse its selection to the old page. Hold the actual text
      // nodes and offsets until the final page has been mounted and balanced.
      // During IME composition the browser owns that range: never move it.
      if (isComposing.current) return;
      const pages = pageRefs.current.filter(Boolean);
      if (!pages.length || !pending) return;
      const selection = window.getSelection();
      rememberSelectionForReflow();
      let needsMorePages = false;
      let retryFrom = null;
      let overflowUntil = pending.full ? pages.length - 1 : pending.end;
      let lastTouched = pending.end;

      for (let i = pending.start; i < pages.length; i++) {
        const page = pages[i];
        let guard = 0;
        let moved = false;
        while (page.scrollHeight > PAGE_HEIGHT_PX && page.lastChild && guard < 500) {
          // A long paragraph is divided on a rendered line boundary. The
          // continuation is merged back into one block for persistence.
          if (page.lastChild.nodeType === Node.ELEMENT_NODE) {
            const block = page.lastChild;
            if (!splitListToFit(page, block, PAGE_HEIGHT_PX) &&
                !splitListItemToFit(page, block, reflowSelection.current, PAGE_HEIGHT_PX) &&
                !splitTableToFit(page, block, PAGE_HEIGHT_PX))
              splitTextBlockToFit(page, block, reflowSelection.current, PAGE_HEIGHT_PX);
          }
          // A truly indivisible block (e.g. a single tall image/table row)
          // cannot be moved endlessly onto new empty pages.
          if (page.childNodes.length <= 1) break;
          guard++;
          const overflowNode = page.lastChild;
          page.removeChild(overflowNode);
          moved = true;
          overflowUntil = Math.max(overflowUntil, i + 1);
          lastTouched = Math.max(lastTouched, i + 1);

          if (!pages[i + 1]) {
            needsMorePages = true;
            page._pendingOverflow = page._pendingOverflow || [];
            page._pendingOverflow.unshift(overflowNode);
            break;
          } else {
            pages[i + 1].insertBefore(overflowNode, pages[i + 1].firstChild);
          }
        }
        if (guard >= 500 && page.scrollHeight > PAGE_HEIGHT_PX && page.childNodes.length > 1)
          retryFrom = Math.min(retryFrom ?? i, i);
        if (!pending.full && i >= overflowUntil && !moved) break;
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
          reflow(nextPage);
        });
        return;
      }

      let pullUntil = pending.full ? pages.length - 2 : Math.max(pending.end, overflowUntil);
      for (let i = pending.start; i < pages.length - 1; i++) {
        const page = pages[i];
        const next = pages[i + 1];
        let guard = 0;
        let moved = false;
        while (next && next.firstChild && guard < 500) {
          guard++;
          const candidate = next.firstChild;
          page.appendChild(candidate);
          if (page.scrollHeight > PAGE_HEIGHT_PX && page.childNodes.length > 1) {
            next.insertBefore(candidate, next.firstChild);
            break;
          }
          moved = true;
          pullUntil = Math.max(pullUntil, i + 1);
          lastTouched = Math.max(lastTouched, i + 1);
        }
        if (guard >= 500 && next?.firstChild && page.scrollHeight <= PAGE_HEIGHT_PX)
          retryFrom = Math.min(retryFrom ?? i, i);
        if (!pending.full && i >= pullUntil && !moved) break;
      }

      if (retryFrom !== null) {
        requestAnimationFrame(() => reflow(pages[retryFrom]));
        return;
      }

      let lastNonEmpty = 0;
      for (let i = pending.start; i <= Math.min(lastTouched, pages.length - 1); i++) {
        const p = pages[i];
        if (p.scrollHeight > PAGE_HEIGHT_PX && p.childNodes.length === 1) p.dataset.extended = "true";
        else delete p.dataset.extended;
      }
      for (let i = pages.length - 1; i >= 0; i--) {
        const p = pages[i];
        // A trailing blank paragraph is still the writer's active page.
        // Removing that page after Enter would discard the insertion point
        // and make the next keystroke land back in the previous paragraph.
        if (p.childNodes.length > 0 &&
          (p.textContent.trim() !== "" || p.querySelector("img,video,audio,table,hr") ||
            p.contains(document.activeElement) || p.contains(reflowSelection.current?.anchorNode)))
          { lastNonEmpty = i; break; }
      }
      const target = Math.max(1, lastNonEmpty + 1);
      if (target < pages.length) {
        setPageCount(target);
      }

      const touchedPages = pages.slice(pending.start, Math.min(lastTouched + 1, pages.length));
      hydrateChecklists(touchedPages); hydrateMediaControls(touchedPages);

      const cursor = reflowSelection.current;
      if (cursor) {
        const activePage = pages.find(page => page.contains(document.activeElement));
        const cursorPage = pages.find(page => page.contains(cursor.anchorNode));
        if (activePage && cursorPage && pages.some(page => page.contains(cursor.focusNode))) {
          const anchorLimit = cursor.anchorNode.nodeType === Node.TEXT_NODE
            ? cursor.anchorNode.textContent.length : cursor.anchorNode.childNodes.length;
          const focusLimit = cursor.focusNode.nodeType === Node.TEXT_NODE
            ? cursor.focusNode.textContent.length : cursor.focusNode.childNodes.length;
          try {
            if (document.activeElement !== cursorPage && !cursorPage.contains(document.activeElement))
              cursorPage.focus({ preventScroll: true });
            selection.setBaseAndExtent(cursor.anchorNode, Math.min(cursor.anchorOffset, anchorLimit),
              cursor.focusNode, Math.min(cursor.focusOffset, focusLimit));
            saveSelection();
          } catch { /* The user may have deleted the selected block meanwhile. */ }
        }
        reflowSelection.current = null;
      }

      const activeCell = activeCellRef.current?.cell;
      const owningTable = activeCell?.closest("table");
      if (owningTable && owningTable !== activeCellRef.current.table) {
        activeCellRef.current = { cell: activeCell, row: activeCell.closest("tr"), table: owningTable };
        onTableFocus?.(owningTable.getBoundingClientRect());
      }

      const html = logicalDocumentHTML(pages, persistentHTML);
      if (html !== lastSerializedHTML.current) {
        lastSerializedHTML.current = html;
        onChange?.(html);
      }
    });
  }, [onChange]);

  function handleInput(e) {
    hydrateChecklists([e.currentTarget]);
    restoreNativeTextInput();
    saveSelection();
    if (isComposing.current || e.nativeEvent?.isComposing) return;
    // A native input can land after an earlier frame was queued. Its new
    // caret position supersedes the snapshot captured before that keystroke.
    rememberSelectionForReflow(true);
    reflow();
    updateActiveCell();
    reportSelection();

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
    const file = e.target.closest?.("a.editor-inline-file-link[href]");
    if (file) { e.preventDefault(); onFileOpen?.(file.getAttribute("href")); return; }
    const box = e.target.closest?.(".cl-box");
    if (box) {
      const item = box.closest(".cl-item");
      toggleChecklistItem(item);
      reflow();
      return;
    }
    const media = e.target.closest?.(".editor-media");
    if (media) {
      selectMedia(media);
    } else if (activeMediaRef.current && !e.target.closest?.(".media-toolbar")) {
      activeMediaRef.current = null;
      onMediaFocus?.(null);
    }
  }

  function toggleChecklistItem(item) {
    if (!item) return;
    rememberEdit();
    const checked = item.dataset.checked === "true";
    item.dataset.checked = checked ? "false" : "true";
    const box = item.querySelector(":scope > .cl-box");
    if (box) { box.textContent = checked ? "☐" : "✓"; box.setAttribute("aria-checked", checked ? "false" : "true"); }
    // Legacy standalone checklist blocks may carry inline completion styles.
    item.style.removeProperty("opacity"); item.style.removeProperty("text-decoration");
  }

  function caretAt(node, offset = 0) {
    const range = document.createRange(), selection = window.getSelection();
    range.setStart(node, offset); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range); saveSelection(); reportSelection();
  }

  function changeListDepth(context, outdent) {
    const { item, list } = context;
    if (!item || !list || item.parentElement !== list) return false;
    rememberEdit();
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const anchorOffset = selection?.anchorOffset || 0;
    if (!outdent) {
      const previous = item.previousElementSibling;
      if (!previous || previous.tagName !== "LI") return false;
      let nested = [...previous.children].find(child => child.matches("ul,ol") && child.tagName === list.tagName);
      if (!nested) { nested = list.cloneNode(false); previous.append(nested); }
      nested.append(item);
    } else if (list.parentElement?.tagName === "LI") {
      const parentItem = list.parentElement;
      const outerList = parentItem.parentElement;
      if (!outerList?.matches("ul,ol")) return false;
      parentItem.after(item);
      if (!list.children.length) list.remove();
    } else {
      // Outdenting a root item leaves the list without discarding the items
      // before or after it. Its own text becomes an ordinary paragraph.
      const following = [...list.children].slice([...list.children].indexOf(item) + 1);
      const remainder = following.length ? list.cloneNode(false) : null;
      following.forEach(child => remainder.append(child));
      const paragraph = document.createElement("p");
      const ownNodes = [...item.childNodes].filter(child => !(child.nodeType === 1 && child.matches(".cl-box,ul,ol")));
      ownNodes.forEach(child => {
        if (child.nodeType === 1 && child.classList.contains("cl-item-content")) while (child.firstChild) paragraph.append(child.firstChild);
        else paragraph.append(child);
      });
      if (!paragraph.childNodes.length) paragraph.append(document.createElement("br"));
      list.after(paragraph);
      [...item.children].filter(child => child.matches("ul,ol")).forEach(child => paragraph.after(child));
      if (remainder) paragraph.after(remainder);
      item.remove(); if (!list.children.length) list.remove();
      caretAt(paragraph, 0);
    }
    hydrateChecklists();
    if (anchorNode?.isConnected) {
      try {
        const range = document.createRange();
        range.setStart(anchorNode, Math.min(anchorOffset, anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.textContent.length : anchorNode.childNodes.length));
        range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
      } catch { /* The item may have been converted to a paragraph. */ }
    }
    saveSelection(); reportSelection(); reflow(); return true;
  }

  function exitEmptyChecklist(item, list) {
    rememberEdit();
    const paragraph = document.createElement("p"); paragraph.append(document.createElement("br"));
    const following = [...list.children].slice([...list.children].indexOf(item) + 1);
    if (following.length) {
      const remainder = list.cloneNode(false);
      following.forEach(child => remainder.append(child));
      list.after(paragraph, remainder);
    } else list.after(paragraph);
    item.remove(); if (!list.children.length) list.remove();
    caretAt(paragraph, 0); reflow();
  }

  function markdownBlock(event, context) {
    if (event.key !== " " || !context?.selection?.isCollapsed) return false;
    let block = context.anchor;
    while (block && block.parentElement !== context.page) block = block.parentElement;
    if (!block || block === context.page || !block.matches("p,div")) return false;
    const marker = block.textContent.trim();
    const heading = marker.match(/^(#{1,6})$/);
    const list = marker === "-" || marker === "*" ? "bullet" : marker === "1." ? "numbered" : /^\[ ?\]$/.test(marker) ? "checklist" : null;
    if (!heading && !list && marker !== ">") return false;
    event.preventDefault();
    rememberEdit();
    let replacement;
    if (heading || marker === ">") {
      replacement = document.createElement(heading ? `h${heading[1].length}` : "blockquote");
      replacement.append(document.createElement("br"));
      block.replaceWith(replacement); caretAt(replacement, 0);
    } else {
      replacement = document.createElement(list === "numbered" ? "ol" : "ul");
      if (list === "checklist") replacement.className = "veynote-checklist";
      const item = document.createElement("li"); item.append(document.createElement("br")); replacement.append(item);
      block.replaceWith(replacement); hydrateChecklists(); caretAt(item, item.querySelector(":scope > .cl-box") ? 1 : 0);
    }
    reflow(); return true;
  }

  function handleKeyDown(event) {
    if (isComposing.current || event.nativeEvent?.isComposing || event.keyCode === 229) return;
    const media = event.target.closest?.(".editor-media");
    if (media) {
      if (event.key === "Escape" && event.target !== media) {
        event.preventDefault(); media.focus(); selectMedia(media); return;
      }
      if (event.target === media) {
        if (event.key === " " || event.key === "Spacebar") {
          event.preventDefault(); selectMedia(media);
          requestAnimationFrame(() => document.querySelector(".media-toolbar button:not(:disabled)")?.focus());
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault(); media.querySelector(".editor-caption")?.focus(); return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault(); activeMediaRef.current = media; removeSelectedMedia(); return;
        }
      }
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")) {
      event.preventDefault(); stepHistory(event.key.toLowerCase() === "z" && !event.shiftKey ? "undo" : "redo"); return;
    }
    const box = event.target.closest?.(".cl-box");
    if (box && (event.key === " " || event.key === "Enter")) {
      event.preventDefault(); toggleChecklistItem(box.closest(".cl-item")); reflow(); return;
    }
    const context = selectionContext();
    if (!context || context.page !== event.currentTarget) return;
    if (event.key === "Tab" && context.item && context.list) {
      event.preventDefault();
      changeListDepth(context, event.shiftKey);
      return;
    }
    if (context.item?.classList.contains("cl-item") && event.key === "Enter" && !event.shiftKey) {
      const ownText = [...context.item.childNodes].filter(node => node.nodeType === Node.TEXT_NODE || node.nodeType === 1 && !node.matches(".cl-box,ul,ol")).map(node => node.textContent).join("").trim();
      if (!ownText) { event.preventDefault(); exitEmptyChecklist(context.item, context.list); return; }
      // Chromium splits a checklist LI containing a non-editable checkbox
      // across the wrong side of its content span: the original text moves
      // into the new item. Build the next item explicitly instead.
      event.preventDefault();
      rememberEdit();
      const content = context.item.querySelector(":scope > .cl-item-content");
      const next = document.createElement("li");
      next.className = "cl-item"; next.dataset.checked = "false";
      const nextContent = document.createElement("span"); nextContent.className = "cl-item-content";
      const range = context.selection.rangeCount ? context.selection.getRangeAt(0) : null;
      if (range && content?.contains(range.startContainer)) {
        if (!range.collapsed) range.deleteContents();
        const trailing = range.cloneRange(); trailing.setEnd(content, content.childNodes.length);
        nextContent.append(trailing.extractContents());
      }
      if (!nextContent.childNodes.length) nextContent.append(document.createElement("br"));
      next.append(nextContent); context.item.after(next);
      hydrateChecklists(); caretAt(nextContent, 0); reflow();
      return;
    }
    markdownBlock(event, context);
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
            onCompositionStart={() => {
              if (isComposing.current) return;
              pendingNativeInput.current = null;
              compositionCheckpoint.current = historyCheckpoint();
              rememberEdit();
              isComposing.current = true;
            }}
            onCompositionEnd={() => {
              isComposing.current = false;
              if (compositionCheckpoint.current) discardNoopHistory(compositionCheckpoint.current);
              compositionCheckpoint.current = null;
              saveSelection(); reportSelection(); reflow();
            }}
            onBeforeInput={event => {
              const type = event.nativeEvent?.inputType;
              if (type === "historyUndo" || type === "historyRedo") { event.preventDefault(); stepHistory(type === "historyUndo" ? "undo" : "redo"); }
              else if (!isComposing.current && !event.nativeEvent?.isComposing && type !== "insertFromComposition") {
                rememberNativeTextInput(event);
                rememberEdit();
              }
            }}
            onPaste={(event) => {
              const images = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith("image/"));
              if (images.length && onImageDrop) { event.preventDefault(); onImageDrop(images); return; }
              if (handleLinkPaste(event)) reflow();
            }}
            onKeyDown={handleKeyDown}
            onFocusCapture={event => {
              const media = event.target.closest?.(".editor-media");
              if (media) selectMedia(media);
            }}
            onBlur={(event) => {
              pendingNativeInput.current = null;
              saveSelection();
              if (isComposing.current) {
                isComposing.current = false;
                if (compositionCheckpoint.current) discardNoopHistory(compositionCheckpoint.current);
                compositionCheckpoint.current = null;
              }
              reflow();
              // Keyboard users move focus from the cell to the contextual
              // toolbar. Keep its table context until they leave that UI.
              if (!event.relatedTarget?.closest?.(".table-toolbar") && !document.activeElement?.closest?.(".table-toolbar")) onTableFocus?.(null);
            }}
            onKeyUp={() => { saveSelection(); rememberSelectionForReflow(true); updateActiveCell(); reportSelection(); }}
            onMouseUp={() => { saveSelection(); rememberSelectionForReflow(true); updateActiveCell(); reportSelection(); }}
            onClick={handleClick}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            style={{ minHeight: PAGE_HEIGHT_PX, maxHeight: PAGE_HEIGHT_PX, fontSize }}
            className="border border-app-border/70 bg-app-panel p-6 sm:p-8 md:p-9 leading-[1.85] text-ink-soft outline-none focus:border-accent-notes/60 overflow-hidden rounded-2xl shadow-sm empty-placeholder editor-page transition-colors"
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
