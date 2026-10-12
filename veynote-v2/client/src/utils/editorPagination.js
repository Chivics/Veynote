// Page layout is presentation state. Continuation fragments are merged before
// persistence so a paragraph is still one logical block in the document.
export function logicalDocumentHTML(pages, persistentHTML) {
  const documentRoot = document.createElement("div");
  for (const page of pages.filter(Boolean)) {
    const fragment = document.createElement("div");
    fragment.innerHTML = persistentHTML(page);
    while (fragment.firstChild) {
      const node = fragment.firstChild;
      if (node.nodeType === 1 && node.dataset.pageContinuation === "true") {
        node.removeAttribute("data-page-continuation");
        const previous = documentRoot.lastElementChild;
        if (previous?.tagName === node.tagName && ["P", "BLOCKQUOTE", "UL", "OL", "TABLE"].includes(node.tagName)) {
          if (node.tagName === "TABLE") {
            const previousBody = previous.tBodies[0];
            const nextBody = node.tBodies[0];
            if (previousBody && nextBody) {
              while (nextBody.firstChild) previousBody.appendChild(nextBody.firstChild);
              node.remove();
              continue;
            }
          }
          if (["UL", "OL"].includes(node.tagName) && node.firstElementChild?.dataset.pageItemContinuation === "true") {
            const item = node.firstElementChild;
            item.removeAttribute("data-page-item-continuation");
            const previousItem = previous.lastElementChild;
            if (previousItem?.tagName === "LI") {
              while (item.firstChild) previousItem.appendChild(item.firstChild);
              item.remove();
            }
          }
          while (node.firstChild) previous.appendChild(node.firstChild);
          node.remove();
          continue;
        }
      }
      documentRoot.appendChild(node);
    }
  }
  return documentRoot.innerHTML;
}

export function splitListToFit(page, list, pageHeight) {
  if (!list || !["UL", "OL"].includes(list.tagName) || list.children.length < 2) return null;
  const continuation = list.cloneNode(false);
  continuation.removeAttribute("id");
  continuation.dataset.pageContinuation = "true";
  let moved = 0;
  while (page.scrollHeight > pageHeight && list.children.length > 1) {
    continuation.insertBefore(list.lastElementChild, continuation.firstChild);
    moved++;
  }
  if (!moved || (page.scrollHeight > pageHeight && page.childNodes.length > 1)) {
    while (continuation.firstChild) list.appendChild(continuation.firstChild);
    return null;
  }
  if (list.tagName === "OL") continuation.start = (list.start || 1) + list.children.length;
  list.after(continuation);
  return continuation;
}

// Tables created by the editor have one tbody. Move complete rows so cells
// stay editable and a continuation can be reunited before saving.
export function splitTableToFit(page, table, pageHeight) {
  if (table?.tagName !== "TABLE" || table.tBodies.length !== 1 || table.tHead || table.tFoot ||
    table.children.length !== 1 || table.querySelector("[rowspan]") || table.tBodies[0].rows.length < 2) return null;
  const body = table.tBodies[0];
  const continuation = table.cloneNode(false);
  continuation.removeAttribute("id");
  continuation.dataset.pageContinuation = "true";
  const nextBody = body.cloneNode(false);
  continuation.appendChild(nextBody);
  let moved = 0;
  while (page.scrollHeight > pageHeight && body.rows.length > 1) {
    nextBody.insertBefore(body.lastElementChild, nextBody.firstChild);
    moved++;
  }
  if (!moved || (page.scrollHeight > pageHeight && page.childNodes.length > 1)) {
    while (nextBody.firstChild) body.appendChild(nextBody.firstChild);
    return null;
  }
  table.after(continuation);
  return continuation;
}

function textPoint(block, offset) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let node, last = null, remaining = offset;
  while ((node = walker.nextNode())) {
    last = node;
    if (remaining <= node.length) return { node, offset: remaining };
    remaining -= node.length;
  }
  return last ? { node: last, offset: last.length } : null;
}

function textOffset(block, node, offset) {
  if (!block.contains(node)) return null;
  const range = document.createRange();
  range.selectNodeContents(block);
  range.setEnd(node, offset);
  return range.cloneContents().textContent.length;
}

// Split only text blocks whose *rendered lines* cross the physical page edge.
// Rich inline marks survive Range.extractContents; media, tables and structural
// blocks are intentionally handled separately rather than cut mid-element.
function splitRichTextToFit(page, block, cursor, pageHeight) {
  const total = block.textContent.length;
  if (total < 2) return null;
  const first = textPoint(block, 0);
  if (!first) return null;
  const bottom = page.getBoundingClientRect().top + pageHeight - parseFloat(getComputedStyle(page).paddingBottom || "0") - 2;
  const fits = count => {
    const end = textPoint(block, count);
    const range = document.createRange();
    range.setStart(first.node, 0);
    range.setEnd(end.node, end.offset);
    const rectangles = [...range.getClientRects()].filter(rect => rect.height > 0);
    return Boolean(rectangles.length && rectangles.at(-1).bottom <= bottom);
  };
  if (!fits(1)) return null;
  let low = 1, high = total - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  let splitAt = low;
  const previousSpace = block.textContent.lastIndexOf(" ", splitAt);
  if (previousSpace >= Math.max(1, splitAt - 80)) splitAt = previousSpace + 1;
  if (splitAt <= 0 || splitAt >= total || (page.childNodes.length > 1 && splitAt < 24)) return null;

  const bookmark = cursor ? {
    anchor: textOffset(block, cursor.anchorNode, cursor.anchorOffset),
    focus: textOffset(block, cursor.focusNode, cursor.focusOffset),
  } : null;
  const split = textPoint(block, splitAt);
  const suffix = document.createRange();
  suffix.setStart(split.node, split.offset);
  suffix.setEnd(block, block.childNodes.length);
  const continuation = block.cloneNode(false);
  continuation.removeAttribute("id");
  continuation.dataset.pageContinuation = "true";
  continuation.appendChild(suffix.extractContents());
  block.after(continuation);
  if (cursor && bookmark) {
    for (const key of ["anchor", "focus"]) {
      if (bookmark[key] === null) continue;
      const target = bookmark[key] >= splitAt ? continuation : block;
      const point = textPoint(target, bookmark[key] >= splitAt ? bookmark[key] - splitAt : bookmark[key]);
      if (point) { cursor[`${key}Node`] = point.node; cursor[`${key}Offset`] = point.offset; }
    }
  }
  return continuation;
}

export function splitTextBlockToFit(page, block, cursor, pageHeight) {
  if (!block || !["P", "BLOCKQUOTE"].includes(block.tagName) || block.querySelector("img,video,audio,table,.editor-inline-file,br")) return null;
  return splitRichTextToFit(page, block, cursor, pageHeight);
}

export function splitListItemToFit(page, list, cursor, pageHeight) {
  if (!list || !["UL", "OL"].includes(list.tagName) || list.children.length !== 1) return null;
  const item = list.firstElementChild;
  // A checklist has a non-editable checkbox; nested lists and explicit breaks
  // also need their own pagination rules rather than a text-range cut.
  if (item?.tagName !== "LI" || item.querySelector("img,video,audio,table,ul,ol,br,.cl-box,.editor-inline-file")) return null;
  const continuationItem = splitRichTextToFit(page, item, cursor, pageHeight);
  if (!continuationItem) return null;
  continuationItem.dataset.pageItemContinuation = "true";
  continuationItem.style.listStyleType = "none";
  const continuation = list.cloneNode(false);
  continuation.removeAttribute("id");
  continuation.dataset.pageContinuation = "true";
  if (list.tagName === "OL") continuation.start = list.start || 1;
  continuation.appendChild(continuationItem);
  list.after(continuation);
  return continuation;
}
