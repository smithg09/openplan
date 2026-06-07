import React from 'react';
import { marked } from 'marked';
import type { Annotation } from '@openplan/shared';
import { SelectionToolbar, CommentPopover, SuggestionPopover } from '@openplan/toolbar';
import './PlanEditor.css';

// ── Markdown → HTML rendering ───────────────────────────────────────────

marked.setOptions({ gfm: true, breaks: false });

function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

// ── DOM-based text search (ported from Plannotator) ─────────────────────

/**
 * Search for an exact or whitespace-normalized substring inside a container's text tree.
 * Returns a Range spanning the match, handling both single-node and cross-node cases.
 */
function findTextInDOM(container: HTMLElement, searchText: string): Range | null {
  if (!searchText || !container) return null;

  const needle = searchText.trim().replace(/\s+/g, ' ');
  if (!needle) return null;

  // Walk all text nodes and collect them
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let buffer = '';
  const nodeEntries: { node: Text; start: number; length: number }[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent || '';
    nodeEntries.push({ node, start: buffer.length, length: text.length });
    buffer += text;
  }

  // Create a map between normalized buffer and original buffer indices
  let normalizedBuf = '';
  const origIndexMap: number[] = [];

  let i = 0;
  while (i < buffer.length) {
    if (/\s/.test(buffer[i])) {
      origIndexMap.push(i);
      normalizedBuf += ' ';
      while (i < buffer.length && /\s/.test(buffer[i])) {
        i++;
      }
    } else {
      origIndexMap.push(i);
      normalizedBuf += buffer[i];
      i++;
    }
  }

  // Search for needle in normalizedBuf
  const normIdx = normalizedBuf.indexOf(needle);
  if (normIdx === -1) return null;

  // Find original start and end indices
  const startIdx = origIndexMap[normIdx];
  const normEndIdx = normIdx + needle.length;
  const endIdx = normEndIdx < origIndexMap.length 
    ? origIndexMap[normEndIdx] 
    : buffer.length;

  // Map original start/end indices back to individual Text nodes
  let charCount = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  for (const entry of nodeEntries) {
    const nodeLength = entry.length;

    if (!startNode && charCount + nodeLength > startIdx) {
      startNode = entry.node;
      startOffset = startIdx - charCount;
    }

    if (startNode && charCount + nodeLength >= endIdx) {
      endNode = entry.node;
      endOffset = endIdx - charCount;
      break;
    }

    charCount += nodeLength;
  }

  if (startNode && endNode) {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  return null;
}

/**
 * Apply DOM highlights for a list of annotations.
 */
function applyAnnotationHighlights(
  container: HTMLElement,
  annotations: Annotation[],
  onClickAnnotation: (id: string) => void,
) {
  for (const anno of annotations) {
    if (!anno.selectedText) continue;

    // Skip if already highlighted
    if (container.querySelector(`[data-bind-id="${anno.id}"]`)) continue;

    const range = findTextInDOM(container, anno.selectedText);
    if (!range) continue;

    try {
      const textNodes: { node: Text; start: number; end: number }[] = [];
      const ancestor = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentNode!
        : range.commonAncestorContainer;
      const walker = document.createTreeWalker(ancestor, NodeFilter.SHOW_TEXT, null);

      let walkNode: Text | null;
      while ((walkNode = walker.nextNode() as Text | null)) {
        if (range.intersectsNode(walkNode)) {
          // Skip wrapping whitespace-only nodes that contain newlines (like inter-block formatting)
          const text = walkNode.textContent || '';
          if (/^\s*$/.test(text) && text.includes('\n')) {
            continue;
          }

          const start = walkNode === range.startContainer ? range.startOffset : 0;
          const end = walkNode === range.endContainer ? range.endOffset : walkNode.length;
          if (end > start) {
            textNodes.push({ node: walkNode, start, end });
          }
        }
      }

      if (textNodes.length === 0) continue;

      // Wrap in reverse order so earlier offsets within the same node stay valid
      textNodes.reverse().forEach(({ node: textNode, start, end }) => {
        try {
          const nodeRange = document.createRange();
          nodeRange.setStart(textNode, start);
          nodeRange.setEnd(textNode, end);

          const mark = document.createElement('mark');
          mark.className = 'op-anno-highlight';
          mark.dataset.bindId = anno.id;
          mark.dataset.type = anno.type;
          if (anno.resolved) mark.dataset.resolved = 'true';

          nodeRange.surroundContents(mark);

          mark.addEventListener('click', (e) => {
            e.stopPropagation();
            onClickAnnotation(anno.id);
          });
        } catch {
          // surroundContents can fail — silently skip this text node
        }
      });
    } catch {
      // silently skip this annotation
    }
  }
}

/**
 * Remove all DOM highlights (unwrap <mark> elements back to text nodes).
 */
function clearAllHighlights(container: HTMLElement) {
  const marks = container.querySelectorAll('[data-bind-id]');
  marks.forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) {
      parent?.insertBefore(el.firstChild, el);
    }
    el.remove();
  });
  container.normalize();
}

/**
 * Remove a single annotation highlight from the DOM by id.
 */
function removeHighlightById(container: HTMLElement, id: string) {
  const marks = container.querySelectorAll(`[data-bind-id="${id}"]`);
  marks.forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) {
      parent?.insertBefore(el.firstChild, el);
    }
    el.remove();
  });
  container.normalize();
}


// ── Main PlanEditor ─────────────────────────────────────────────────────

export interface PlanEditorProps {
  plan: string;
  annotations: Annotation[];
  focusId: string | null;
  onFocusAnnotation: (id: string | null) => void;
  onAddAnnotation: (ann: Omit<Annotation, 'id' | 'createdAt' | 'resolved'>) => void;
  onRemoveAnnotation: (id: string) => void;
}

export const PlanEditor: React.FC<PlanEditorProps> = ({
  plan, annotations,
  focusId, onFocusAnnotation,
  onAddAnnotation, onRemoveAnnotation,
}) => {
  const [selectionState, setSelectionState] = React.useState<{ pos: { x: number; y: number }; text: string } | null>(null);
  const [popover, setPopover] = React.useState<{ pos: { x: number; y: number }; type: string; quote: string } | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const onFocusAnnotationRef = React.useRef(onFocusAnnotation);
  React.useEffect(() => { onFocusAnnotationRef.current = onFocusAnnotation; }, [onFocusAnnotation]);

  // Render markdown to HTML
  const html = React.useMemo(() => renderMarkdown(plan), [plan]);

  // Apply annotation highlights after render
  React.useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const raf = requestAnimationFrame(() => {
      clearAllHighlights(container);
      applyAnnotationHighlights(container, annotations, (id) => {
        onFocusAnnotationRef.current(id);
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [annotations, html]);

  // Selection detection for annotation toolbar
  React.useEffect(() => {
    const detectSelection = (e: MouseEvent | KeyboardEvent) => {
      if ((e.target as Element)?.closest?.('.op-sel-toolbar, .op-popover')) return;
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

        // Only handle selections inside our content area
        if (!contentRef.current?.contains(sel.anchorNode)) return;

        const selectedText = sel.toString().trim();
        if (!selectedText) {
          setSelectionState(null);
          return;
        }

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const TB_W = 168;
        const TB_H = 40;
        let x = rect.left + rect.width / 2 - TB_W / 2;
        let y = rect.top - TB_H - 10;
        if (y < 60) y = rect.bottom + 10;
        x = Math.max(12, Math.min(window.innerWidth - TB_W - 12, x));

        setSelectionState({ pos: { x, y }, text: selectedText });
      }, 10);
    };

    document.addEventListener('mouseup', detectSelection);
    document.addEventListener('keyup', detectSelection);
    return () => {
      document.removeEventListener('mouseup', detectSelection);
      document.removeEventListener('keyup', detectSelection);
    };
  }, []);

  // Focus annotation: scroll to it and add focused class
  React.useEffect(() => {
    if (!focusId) return;
    const container = contentRef.current;
    if (!container) return;

    container.querySelectorAll('.op-anno-highlight.is-focus').forEach(el => {
      el.classList.remove('is-focus');
    });

    const targets = container.querySelectorAll(`[data-bind-id="${focusId}"]`);
    if (targets.length === 0) return;

    targets.forEach(el => el.classList.add('is-focus'));
    targets[0].scrollIntoView({ behavior: 'smooth', block: 'center' });

    const timer = setTimeout(() => {
      targets.forEach(el => el.classList.remove('is-focus'));
    }, 2000);
    return () => clearTimeout(timer);
  }, [focusId]);

  const onToolbarAction = (type: string, meta?: { emoji?: string }) => {
    if (!selectionState) return;
    const quote = selectionState.text;
    const pos = { x: selectionState.pos.x, y: selectionState.pos.y + 50 };
    if (type === 'comment' || type === 'question') {
      setPopover({ pos, type, quote });
    } else if (type === 'suggestion') {
      setPopover({ pos, type, quote });
    } else if (type === 'emoji' && meta?.emoji) {
      onAddAnnotation({ type: 'emoji', selectedText: quote, from: 0, to: 0, emoji: meta.emoji, author: 'you' });
      window.getSelection()?.removeAllRanges();
      setSelectionState(null);
    } else {
      onAddAnnotation({ type: type as Annotation['type'], selectedText: quote, from: 0, to: 0, author: 'you' });
      window.getSelection()?.removeAllRanges();
      setSelectionState(null);
    }
  };

  const onPopoverSave = (body: string, suggestion?: string) => {
    if (!popover) return;
    onAddAnnotation({
      type: popover.type as Annotation['type'],
      selectedText: popover.quote,
      from: 0,
      to: 0,
      body,
      suggestion,
      author: 'you',
    });
    setPopover(null);
    setSelectionState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleRemoveAnnotation = (id: string) => {
    const container = contentRef.current;
    if (container) removeHighlightById(container, id);
    onRemoveAnnotation(id);
  };

  return (
    <div
      className="op-plan-wrap"
      ref={wrapRef}
      onClick={e => {
        if ((e.target as Element).closest('.op-anno-highlight, .op-sel-toolbar, .op-popover')) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim()) return;
        setSelectionState(null);
        setPopover(null);
      }}
    >
      <div
        ref={contentRef}
        className="op-plan-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {selectionState && !popover && (
        <SelectionToolbar pos={selectionState.pos} onAction={onToolbarAction} />
      )}
      {popover && popover.type === 'suggestion' ? (
        <SuggestionPopover
          pos={popover.pos}
          quote={popover.quote}
          onSave={(body, suggestion) => onPopoverSave(body, suggestion)}
          onCancel={() => { setPopover(null); setSelectionState(null); }}
        />
      ) : popover ? (
        <CommentPopover
          pos={popover.pos}
          type={popover.type}
          quote={popover.quote}
          onSave={body => onPopoverSave(body)}
          onCancel={() => { setPopover(null); setSelectionState(null); }}
        />
      ) : null}
    </div>
  );
};
