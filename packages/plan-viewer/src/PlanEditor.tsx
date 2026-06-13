import React from 'react';
import { marked } from 'marked';
import type { Annotation } from '@openplan/shared';
import { useHighlighter, type HighlightMeta } from '@openplan/highlighter';
import { SelectionToolbar, CommentPopover, SuggestionPopover } from '@openplan/toolbar';
import './PlanEditor.css';

marked.setOptions({ gfm: true, breaks: false });

function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

export interface PlanEditorProps {
  plan: string;
  annotations: Annotation[];
  focusId: string | null;
  author?: string;
  onFocusAnnotation: (id: string | null) => void;
  onAddAnnotation: (ann: Omit<Annotation, 'id' | 'createdAt' | 'resolved'>) => void;
  onRemoveAnnotation: (id: string) => void;
}

export const PlanEditor: React.FC<PlanEditorProps> = ({
  plan, annotations,
  focusId, onFocusAnnotation,
  onAddAnnotation, onRemoveAnnotation,
  author = 'anonymous',
}) => {
  const [selectionState, setSelectionState] = React.useState<{
    pos: { x: number; y: number };
    text: string;
    range: Range;
  } | null>(null);
  const [popover, setPopover] = React.useState<{
    pos: { x: number; y: number };
    type: string;
    quote: string;
  } | null>(null);
  const pendingMetaRef = React.useRef<{ startMeta?: HighlightMeta; endMeta?: HighlightMeta }>({});

  const contentRef = React.useRef<HTMLDivElement>(null);
  const onFocusAnnotationRef = React.useRef(onFocusAnnotation);
  React.useEffect(() => { onFocusAnnotationRef.current = onFocusAnnotation; }, [onFocusAnnotation]);

  const html = React.useMemo(() => renderMarkdown(plan), [plan]);

  const { commitSelection, resetAndApply, removeAnnotation, getElements } = useHighlighter(contentRef);

  // ── Re-apply all highlights when annotations or rendered HTML change ──────
  React.useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const raf = requestAnimationFrame(() => {
      const items = annotations
        .filter(a => a.selectedText)
        .map(a => ({ id: a.id, text: a.selectedText, startMeta: a.startMeta, endMeta: a.endMeta }));

      resetAndApply(items, (id) => onFocusAnnotationRef.current(id));

      // Sync type/resolved data attributes for CSS styling
      for (const ann of annotations) {
        container.querySelectorAll(`[data-bind-id="${ann.id}"]`).forEach(el => {
          (el as HTMLElement).dataset.type = ann.type;
          if (ann.resolved) (el as HTMLElement).dataset.resolved = 'true';
          else delete (el as HTMLElement).dataset.resolved;
        });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [annotations, html, resetAndApply]);

  // ── Selection detection (identical to original working code) ─────────────
  React.useEffect(() => {
    const onMouseOrKey = (e: MouseEvent | KeyboardEvent) => {
      if ((e.target as Element)?.closest?.('.op-sel-toolbar, .op-popover')) return;
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setSelectionState(null);
          return;
        }
        if (!contentRef.current?.contains(sel.anchorNode)) {
          setSelectionState(null);
          return;
        }
        const selectedText = sel.toString().trim();
        if (!selectedText) { setSelectionState(null); return; }

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const TB_W = 168;
        const TB_H = 40;
        let x = rect.left + rect.width / 2 - TB_W / 2;
        let y = rect.top - TB_H - 10;
        if (y < 60) y = rect.bottom + 10;
        x = Math.max(12, Math.min(window.innerWidth - TB_W - 12, x));

        setSelectionState({ pos: { x, y }, text: selectedText, range: range.cloneRange() });
      }, 10);
    };

    document.addEventListener('mouseup', onMouseOrKey);
    document.addEventListener('keyup', onMouseOrKey);
    return () => {
      document.removeEventListener('mouseup', onMouseOrKey);
      document.removeEventListener('keyup', onMouseOrKey);
    };
  }, []);

  // ── Scroll to and pulse focused annotation ───────────────────────────────
  React.useEffect(() => {
    if (!focusId) return;
    const container = contentRef.current;
    if (!container) return;
    container.querySelectorAll('.op-anno-highlight.is-focus').forEach(el => el.classList.remove('is-focus'));
    const targets = getElements(focusId);
    if (!targets.length) return;
    targets.forEach(el => el.classList.add('is-focus'));
    targets[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => targets.forEach(el => el.classList.remove('is-focus')), 2000);
    return () => clearTimeout(timer);
  }, [focusId, getElements]);

  // ── Toolbar action ────────────────────────────────────────────────────────
  const onToolbarAction = async (type: string, meta?: { emoji?: string }) => {
    if (!selectionState) return;
    const { text: quote, range, pos } = selectionState;
    const popoverPos = { x: pos.x, y: pos.y + 50 };

    setSelectionState(null);

    // Ask web-highlighter to wrap the range and extract DOM meta.
    // Falls back to null (500ms timeout) if the range crosses existing marks.
    const source = await commitSelection(range);
    const startMeta = source?.startMeta;
    const endMeta = source?.endMeta;
    window.getSelection()?.removeAllRanges();

    if (type === 'comment' || type === 'question' || type === 'suggestion') {
      pendingMetaRef.current = { startMeta, endMeta };
      setPopover({ pos: popoverPos, type, quote: source?.text ?? quote });
    } else if (type === 'emoji' && meta?.emoji) {
      onAddAnnotation({ type: 'emoji', selectedText: source?.text ?? quote, startMeta, endMeta, from: 0, to: 0, emoji: meta.emoji, author });
    } else {
      onAddAnnotation({ type: type as Annotation['type'], selectedText: source?.text ?? quote, startMeta, endMeta, from: 0, to: 0, author });
    }
  };

  const onPopoverSave = (body: string, suggestion?: string) => {
    if (!popover) return;
    const { startMeta, endMeta } = pendingMetaRef.current;
    onAddAnnotation({
      type: popover.type as Annotation['type'],
      selectedText: popover.quote,
      startMeta, endMeta,
      from: 0, to: 0,
      body, suggestion,
      author,
    });
    pendingMetaRef.current = {};
    setPopover(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleRemoveAnnotation = (id: string) => {
    removeAnnotation(id);
    onRemoveAnnotation(id);
  };

  return (
    <div
      className="op-plan-wrap"
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
          onCancel={() => { setPopover(null); pendingMetaRef.current = {}; }}
        />
      ) : popover ? (
        <CommentPopover
          pos={popover.pos}
          type={popover.type}
          quote={popover.quote}
          onSave={body => onPopoverSave(body)}
          onCancel={() => { setPopover(null); pendingMetaRef.current = {}; }}
        />
      ) : null}
    </div>
  );
};
