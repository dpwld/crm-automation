

export type BlockTag = "p" | "h1" | "h2" | "h3" | "blockquote" | "pre";

const BLOCK_TAGS = ["P", "H1", "H2", "H3", "BLOCKQUOTE", "PRE", "LI", "DIV"];


export function currentBlock(root: HTMLElement, node: Node | null): HTMLElement | null {
  let el: Node | null = node;
  while (el && el !== root) {
    if (el.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.includes((el as HTMLElement).tagName)) {
      return el as HTMLElement;
    }
    el = el.parentNode;
  }
  if (!node || !root.contains(node)) return null;

  // Caret sits in inline content directly under the root — wrap the run of
  // inline siblings around it into a fresh <p>.
  let top: Node = node;
  while (top.parentNode && top.parentNode !== root) top = top.parentNode;
  const p = document.createElement("p");
  root.insertBefore(p, top);
  let cur: Node | null = top;
  while (cur && !(cur.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.includes((cur as HTMLElement).tagName))) {
    const next: Node | null = cur.nextSibling;
    p.appendChild(cur);
    cur = next;
  }
  return p;
}

function placeCaretAtEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}


function liftFromList(li: HTMLElement, tag: string): HTMLElement {
  const list = li.parentElement as HTMLElement; // UL/OL
  const replacement = document.createElement(tag);
  while (li.firstChild) replacement.appendChild(li.firstChild);

  const after = document.createElement(list.tagName);
  let sib = li.nextSibling;
  while (sib) {
    const next = sib.nextSibling;
    after.appendChild(sib);
    sib = next;
  }
  li.remove();
  list.parentNode?.insertBefore(replacement, list.nextSibling);
  if (after.childNodes.length) replacement.parentNode?.insertBefore(after, replacement.nextSibling);
  if (!list.childNodes.length) list.remove();
  return replacement;
}


export function applyBlockTag(root: HTMLElement, tag: BlockTag): void {
  const sel = window.getSelection();
  const block = currentBlock(root, sel?.anchorNode ?? null);
  if (!block) return;

  let target: HTMLElement;
  if (block.tagName === "LI") {
    target = liftFromList(block, tag);
  } else if (block.tagName.toLowerCase() === tag) {
    return; // already that block
  } else {
    target = document.createElement(tag);
    while (block.firstChild) target.appendChild(block.firstChild);
    block.replaceWith(target);
  }
  // Deleting "/" leaves an empty Text node. Without a BR, the new heading
  // has no rendered caret position and the browser can type outside it.
  if (!(target.textContent ?? "").length && !target.querySelector("br")) target.appendChild(document.createElement("br"));
  placeCaretAtEnd(target);
}


export function insertTodo(root: HTMLElement): void {
  const block = currentBlock(root, window.getSelection()?.anchorNode ?? null);
  const div = document.createElement("div");
  div.innerHTML = '<input type="checkbox"> ';
  if (block) {
    if (!(block.textContent ?? "").trim()) block.replaceWith(div);
    else block.parentNode?.insertBefore(div, block.nextSibling);
  } else root.appendChild(div);
  placeCaretAtEnd(div);
}


export function toggleList(root: HTMLElement, type: "ul" | "ol"): void {
  const sel = window.getSelection();
  const block = currentBlock(root, sel?.anchorNode ?? null);
  if (!block) return;

  if (block.tagName === "LI") {
    const list = block.parentElement as HTMLElement;
    if (list.tagName.toLowerCase() === type) {
      const p = liftFromList(block, "p");
      placeCaretAtEnd(p);
    } else {
      const swapped = document.createElement(type);
      while (list.firstChild) swapped.appendChild(list.firstChild);
      list.replaceWith(swapped);
      placeCaretAtEnd(swapped.querySelector("li") ?? swapped);
    }
    return;
  }

  const list = document.createElement(type);
  const li = document.createElement("li");
  while (block.firstChild) li.appendChild(block.firstChild);
  if (!li.childNodes.length) li.appendChild(document.createElement("br"));
  list.appendChild(li);
  block.replaceWith(list);
  placeCaretAtEnd(li);
}


export function buildTable(rows: number, cols: number): HTMLTableElement {
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement("tr");
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement(r === 0 ? "th" : "td");
      cell.innerHTML = "&nbsp;";
      tr.appendChild(cell);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}


export function tableOp(table: HTMLTableElement, cell: HTMLElement | null, op: "addRow" | "delRow" | "addCol" | "delCol"): void {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return;
  const row = cell?.closest("tr") ?? rows[rows.length - 1];
  const rowIndex = rows.indexOf(row as HTMLTableRowElement);
  const colIndex = cell ? Array.from(row.children).indexOf(cell.closest("th,td") as Element) : row.children.length - 1;

  if (op === "addRow") {
    const tr = document.createElement("tr");
    for (let i = 0; i < row.children.length; i++) {
      const td = document.createElement("td");
      td.innerHTML = "&nbsp;";
      tr.appendChild(td);
    }
    row.parentNode?.insertBefore(tr, row.nextSibling);
  } else if (op === "delRow") {
    if (rows.length <= 1) return;
    row.remove();
  } else if (op === "addCol") {
    for (const r of rows) {
      const isHeader = r.children[0]?.tagName === "TH";
      const c = document.createElement(isHeader ? "th" : "td");
      c.innerHTML = "&nbsp;";
      const ref = r.children[colIndex] ?? null;
      r.insertBefore(c, ref ? ref.nextSibling : null);
    }
  } else if (op === "delCol") {
    if ((rows[0]?.children.length ?? 0) <= 1) return;
    for (const r of rows) r.children[Math.min(colIndex, r.children.length - 1)]?.remove();
  }
  void rowIndex;
}


export function exitToParagraph(block: HTMLElement): void {
  const p = document.createElement("p");
  p.appendChild(document.createElement("br"));
  block.parentNode?.insertBefore(p, block.nextSibling);
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(p);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}


export function handleBlockEnter(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false;
  const block = currentBlock(root, sel.anchorNode);
  if (!block) return false;
  const tag = block.tagName;

  if (tag === "H1" || tag === "H2" || tag === "H3") {
    const range = sel.getRangeAt(0);
    const rest = range.cloneRange();
    rest.selectNodeContents(block);
    rest.setStart(range.endContainer, range.endOffset);
    const frag = rest.extractContents();
    const p = document.createElement("p");
    p.appendChild(frag);
    if (!(p.textContent ?? "").length) {
      p.textContent = "";
      p.appendChild(document.createElement("br"));
    }
    block.parentNode?.insertBefore(p, block.nextSibling);
    const nr = document.createRange();
    nr.selectNodeContents(p);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
    return true;
  }

  if (tag === "PRE" || tag === "BLOCKQUOTE") {
    const range = sel.getRangeAt(0);

    // Is the caret on an empty line? Walk backwards: only whitespace until a
    // line break (BR or "\n") or the block start counts as empty.
    const lineEmpty = (() => {
      let node: Node | null;
      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const beforeText = (range.startContainer.textContent ?? "").slice(0, range.startOffset);
        if (beforeText.trim() !== "") return /\n\s*$/.test(beforeText) && beforeText.endsWith("\n");
        if (beforeText.includes("\n")) return true;
        node = range.startContainer.previousSibling;
      } else {
        node = range.startContainer.childNodes[range.startOffset - 1] ?? null;
      }
      while (node) {
        if (node.nodeName === "BR") return true;
        const t = node.textContent ?? "";
        if (t.trim() !== "") return /\n\s*$/.test(t);
        node = node.previousSibling;
      }
      return true; // start of the block
    })();

    // Is everything after the caret just whitespace/blank lines?
    const tail = range.cloneRange();
    tail.selectNodeContents(block);
    tail.setStart(range.endContainer, range.endOffset);
    const restEmpty = tail.toString().trim() === "";

    if (lineEmpty && restEmpty) {
      // Enter on a blank final line → leave the block. Trim the dangling
      // blank line(s) first so the block doesn't keep growing.
      for (let i = 0; i < 4; i++) {
        const last = block.lastChild;
        if (last?.nodeName === "BR") last.remove();
        else if (last?.nodeType === Node.TEXT_NODE && !(last.textContent ?? "").trim()) last.remove();
        else if (last?.nodeType === Node.TEXT_NODE && /\n\s*$/.test(last.textContent ?? "")) {
          last.textContent = (last.textContent ?? "").replace(/\n\s*$/, "");
          break;
        } else break;
      }
      if (!block.childNodes.length) block.appendChild(document.createElement("br"));
      exitToParagraph(block);
      return true;
    }

    // Otherwise: line break INSIDE the block (the browser default would
    // split quotes into separate blockquotes / mishandle pre endings).
    range.deleteContents();
    const br = document.createElement("br");
    range.insertNode(br);
    if (!br.nextSibling) block.appendChild(document.createElement("br"));
    range.setStartAfter(br);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }
  return false;
}


export function isTodoLine(block: HTMLElement): boolean {
  return (
    block.tagName === "DIV" &&
    block.firstElementChild instanceof HTMLInputElement &&
    block.firstElementChild.type === "checkbox"
  );
}

function todoText(block: HTMLElement): string {
  return (block.textContent ?? "").trim();
}

function caretAfter(node: Node) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}


export function handleListEnter(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false;
  const block = currentBlock(root, sel.anchorNode);
  if (!block || !isTodoLine(block)) return false;

  if (!todoText(block)) {
    // Empty to-do → leave the list: become a plain paragraph.
    const p = document.createElement("p");
    p.appendChild(document.createElement("br"));
    block.replaceWith(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  const next = document.createElement("div");
  next.style.marginLeft = block.style.marginLeft;
  const cb = document.createElement("input");
  cb.type = "checkbox";
  next.appendChild(cb);
  next.appendChild(document.createTextNode(" "));
  block.parentNode?.insertBefore(next, block.nextSibling);
  caretAfter(next.lastChild as Node);
  return true;
}

const INDENT_PX = 24;
const MAX_INDENT_PX = 96;


export function handleTab(root: HTMLElement, shift: boolean): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const block = currentBlock(root, sel.anchorNode);
  if (!block) return false;

  if (block.tagName === "LI") {
    const list = block.parentElement as HTMLElement; // UL/OL
    if (!shift) {
      const prev = block.previousElementSibling as HTMLElement | null;
      if (!prev || prev.tagName !== "LI") return true; // first item can't nest — swallow the tab
      let nested = prev.lastElementChild as HTMLElement | null;
      if (!nested || (nested.tagName !== "UL" && nested.tagName !== "OL")) {
        nested = document.createElement(list.tagName);
        prev.appendChild(nested);
      }
      nested.appendChild(block);
    } else {
      const outerLi = list.parentElement?.closest("li");
      if (!outerLi) return true; // top level already
      const outerList = outerLi.parentElement;
      outerList?.insertBefore(block, outerLi.nextSibling);
      if (!list.childNodes.length) list.remove();
    }
    placeCaretAtEnd(block);
    return true;
  }

  if (isTodoLine(block)) {
    const cur = parseInt(block.style.marginLeft || "0", 10) || 0;
    const next = shift ? Math.max(0, cur - INDENT_PX) : Math.min(MAX_INDENT_PX, cur + INDENT_PX);
    block.style.marginLeft = next ? `${next}px` : "";
    return true;
  }

  if (block.tagName === "PRE" && !shift) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const sp = document.createTextNode("  ");
    range.insertNode(sp);
    range.setStartAfter(sp);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }
  return false;
}
