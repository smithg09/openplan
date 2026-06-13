import { useEffect, useRef, useCallback, type RefObject } from 'react';
import Highlighter from 'web-highlighter';

export interface HighlightMeta {
  parentTagName: string;
  parentIndex: number;
  textOffset: number;
}

export interface SelectionSource {
  id: string;
  text: string;
  startMeta: HighlightMeta;
  endMeta: HighlightMeta;
}

export interface UseHighlighterReturn {
  /**
   * Commit a Range into a web-highlighter highlight and get back startMeta/endMeta.
   * Returns null (with 500ms timeout) if the library can't process the range —
   * callers should handle null gracefully and fall back to text-only annotation.
   */
  commitSelection: (range: Range) => Promise<SelectionSource | null>;
  /**
   * Apply highlight for one annotation. Uses fromStore (precise, handles duplicates)
   * when meta is present; falls back to text search for old annotations without meta.
   */
  applyAnnotation: (id: string, text: string, startMeta?: HighlightMeta, endMeta?: HighlightMeta, onClick?: (id: string) => void) => void;
  /** Remove all current highlights from both the DOM and the library registry, then re-apply the given set. */
  resetAndApply: (annotations: Array<{ id: string; text: string; startMeta?: HighlightMeta; endMeta?: HighlightMeta }>, onClick: (id: string) => void) => void;
  removeAnnotation: (id: string) => void;
  /** Get live (in-document) elements for an annotation id. */
  getElements: (id: string) => Element[];
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

function unwrapMark(el: Element) {
  const parent = el.parentNode;
  while (el.firstChild) parent?.insertBefore(el.firstChild, el);
  el.remove();
}

function findTextInDOM(container: HTMLElement, searchText: string): Range | null {
  const needle = searchText.trim().replace(/\s+/g, ' ');
  if (!needle) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let buffer = '';
  const nodeEntries: { node: Text; start: number; length: number }[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent || '';
    nodeEntries.push({ node, start: buffer.length, length: text.length });
    buffer += text;
  }

  let normalizedBuf = '';
  const origIndexMap: number[] = [];
  let i = 0;
  while (i < buffer.length) {
    if (/\s/.test(buffer[i])) {
      origIndexMap.push(i);
      normalizedBuf += ' ';
      while (i < buffer.length && /\s/.test(buffer[i])) i++;
    } else {
      origIndexMap.push(i);
      normalizedBuf += buffer[i];
      i++;
    }
  }

  const normIdx = normalizedBuf.indexOf(needle);
  if (normIdx === -1) return null;
  const startIdx = origIndexMap[normIdx];
  const normEndIdx = normIdx + needle.length;
  const endIdx = normEndIdx < origIndexMap.length ? origIndexMap[normEndIdx] : buffer.length;

  let charCount = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  for (const entry of nodeEntries) {
    if (!startNode && charCount + entry.length > startIdx) {
      startNode = entry.node;
      startOffset = startIdx - charCount;
    }
    if (startNode && charCount + entry.length >= endIdx) {
      endNode = entry.node;
      endOffset = endIdx - charCount;
      break;
    }
    charCount += entry.length;
  }

  if (startNode && endNode) {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }
  return null;
}

function wrapRangeWithMark(range: Range, id: string, className: string, onClick?: (id: string) => void) {
  const textNodes: { node: Text; start: number; end: number }[] = [];
  const ancestor = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentNode!
    : range.commonAncestorContainer;
  const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT, null);
  let walkNode: Text | null;
  while ((walkNode = walker.nextNode() as Text | null)) {
    if (range.intersectsNode(walkNode)) {
      const text = walkNode.textContent || '';
      if (/^\s*$/.test(text)) continue;
      const start = walkNode === range.startContainer ? range.startOffset : 0;
      const end = walkNode === range.endContainer ? range.endOffset : walkNode.length;
      if (end > start) textNodes.push({ node: walkNode, start, end });
    }
  }
  textNodes.reverse().forEach(({ node: textNode, start, end }) => {
    try {
      const nodeRange = document.createRange();
      nodeRange.setStart(textNode, start);
      nodeRange.setEnd(textNode, end);
      const mark = document.createElement('mark');
      mark.className = className;
      mark.dataset.bindId = id;
      nodeRange.surroundContents(mark);
      if (onClick) mark.addEventListener('click', (e) => { e.stopPropagation(); onClick(id); });
    } catch { /* surroundContents can fail on partial nodes */ }
  });
}

function trimRangeEnd(range: Range): Range {
  const r = range.cloneRange();

  const prevTextNode = (node: Node): Text | null => {
    // Walk backwards through siblings and their descendants to find the last text node
    let cur: Node | null = node;
    while (cur) {
      const prev: ChildNode | null = cur.previousSibling;
      if (prev) {
        if (prev.nodeType === Node.TEXT_NODE) return prev as Text;
        // Descend into last text node of element
        const walker = document.createTreeWalker(prev, NodeFilter.SHOW_TEXT);
        let last: Text | null = null;
        let n: Text | null;
        while ((n = walker.nextNode() as Text | null)) last = n;
        if (last) return last;
        cur = prev;
      } else {
        cur = cur.parentNode;
      }
    }
    return null;
  };

  while (r.toString().length > 0 && /\s$/.test(r.toString())) {
    const offset = r.endOffset;
    if (offset > 0) {
      r.setEnd(r.endContainer, offset - 1);
    } else {
      const prev = prevTextNode(r.endContainer);
      if (!prev) break;
      r.setEnd(prev, prev.length);
    }
  }
  return r;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useHighlighter(
  containerRef: RefObject<HTMLElement | null>,
  highlightClass = 'op-anno-highlight',
): UseHighlighterReturn {
  const highlighterRef = useRef<Highlighter | null>(null);
  // Track all IDs the library knows about so we can remove them from its registry
  const libraryIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!containerRef.current) return;
    const h = new Highlighter({
      $root: containerRef.current,
      exceptSelectors: [`.${highlightClass}`, '.op-sel-toolbar', '.op-popover'],
      wrapTag: 'mark',
      style: { className: highlightClass },
    });
    highlighterRef.current = h;
    libraryIdsRef.current = new Set();
    return () => {
      h.dispose();
      highlighterRef.current = null;
      libraryIdsRef.current = new Set();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getElements = useCallback((id: string): Element[] => {
    const h = highlighterRef.current;
    if (h) {
      try {
        const doms = h.getDoms(id);
        // Only return elements that are actually in the live document
        const live = Array.from(doms ?? []).filter(el => document.contains(el));
        if (live.length) return live;
      } catch {}
    }
    return Array.from(containerRef.current?.querySelectorAll(`[data-bind-id="${id}"]`) ?? []);
  }, [containerRef]);

  const commitSelection = useCallback((range: Range): Promise<SelectionSource | null> => {
    const h = highlighterRef.current;
    if (!h) return Promise.resolve(null);

    // Trim trailing whitespace/newlines from the range end.
    // The browser often includes a trailing \n text node (between </p> and <pre>)
    // when the user double-clicks or drags to the end of a block element.
    const trimmedRange = trimRangeEnd(range);

    return new Promise(resolve => {
      // Safety timeout: if fromRange fails silently, resolve with null so callers don't hang
      const timeout = setTimeout(() => {
        h.off(Highlighter.event.CREATE, handler);
        resolve(null);
      }, 500);

      const handler = ({ sources }: { sources: any[] }) => {
        clearTimeout(timeout);
        h.off(Highlighter.event.CREATE, handler);
        const source = sources[0];
        if (!source) { resolve(null); return; }
        libraryIdsRef.current.add(source.id);
        resolve({ id: source.id, text: source.text, startMeta: source.startMeta, endMeta: source.endMeta });
      };
      h.on(Highlighter.event.CREATE, handler);

      try {
        h.fromRange(trimmedRange);
      } catch {
        clearTimeout(timeout);
        h.off(Highlighter.event.CREATE, handler);
        resolve(null);
      }
    });
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    try {
      highlighterRef.current?.remove(id);
      libraryIdsRef.current.delete(id);
    } catch {}
    containerRef.current?.querySelectorAll(`[data-bind-id="${id}"]`).forEach(unwrapMark);
    containerRef.current?.normalize();
  }, [containerRef]);

  const resetAndApply = useCallback((
    annotations: Array<{ id: string; text: string; startMeta?: HighlightMeta; endMeta?: HighlightMeta }>,
    onClick: (id: string) => void,
  ) => {
    const h = highlighterRef.current;
    const container = containerRef.current;
    if (!container) return;

    // Remove all known IDs from the library registry first
    if (h) {
      for (const id of libraryIdsRef.current) {
        try { h.remove(id); } catch {}
      }
    }
    libraryIdsRef.current = new Set();

    // Clear all DOM marks
    container.querySelectorAll('[data-bind-id]').forEach(unwrapMark);
    container.normalize();

    // Re-apply each annotation fresh
    for (const ann of annotations) {
      if (!ann.text) continue;

      let applied = false;

      if (h && ann.startMeta && ann.endMeta) {
        try {
          h.fromStore(ann.startMeta, ann.endMeta, ann.text, ann.id);
          const doms = h.getDoms(ann.id);
          const live = Array.from(doms ?? []).filter(el => document.contains(el));
          if (live.length) {
            libraryIdsRef.current.add(ann.id);
            live.forEach(el => {
              // Unwrap marks that contain only whitespace (newlines between block elements)
              if (/^\s*$/.test(el.textContent ?? '')) { unwrapMark(el); return; }
              (el as HTMLElement).dataset.bindId = ann.id;
              el.addEventListener('click', (e) => { e.stopPropagation(); onClick(ann.id); });
            });
            applied = true;
          }
        } catch {}
      }

      if (!applied) {
        const range = findTextInDOM(container, ann.text);
        if (range) wrapRangeWithMark(range, ann.id, highlightClass, onClick);
      }
    }
  }, [containerRef, highlightClass]);

  const applyAnnotation = useCallback((
    id: string,
    text: string,
    startMeta?: HighlightMeta,
    endMeta?: HighlightMeta,
    onClick?: (id: string) => void,
  ) => {
    const container = containerRef.current;
    const h = highlighterRef.current;
    if (!container) return;
    if (getElements(id).length > 0) return;

    if (h && startMeta && endMeta) {
      try {
        h.fromStore(startMeta, endMeta, text, id);
        const doms = h.getDoms(id);
        const live = Array.from(doms ?? []).filter(el => document.contains(el));
        if (live.length) {
          libraryIdsRef.current.add(id);
          live.forEach(el => {
            if (/^\s*$/.test(el.textContent ?? '')) { unwrapMark(el); return; }
            (el as HTMLElement).dataset.bindId = id;
            if (onClick) el.addEventListener('click', (e) => { (e as MouseEvent).stopPropagation(); onClick(id); });
          });
          return;
        }
      } catch {}
    }

    const range = findTextInDOM(container, text);
    if (!range) return;
    wrapRangeWithMark(range, id, highlightClass, onClick);
  }, [containerRef, getElements, highlightClass]);

  return { commitSelection, applyAnnotation, resetAndApply, removeAnnotation, getElements };
}
