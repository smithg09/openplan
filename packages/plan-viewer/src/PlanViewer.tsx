import React from 'react';
import type { Annotation } from '@openplan/shared';
import { parsePlan, type Block } from './parsers';
import { AnnoIcon, ANNOTATION_TYPES, CustomIcon } from './icons';
import { SelectionToolbar } from '@openplan/toolbar';
import { CommentPopover } from '@openplan/toolbar';
import { SuggestionPopover } from '@openplan/toolbar';

// ── Inline markup renderer ──────────────────────────────────────────────────

function renderInlineMarkup(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<React.Fragment key={idx++}>{text.slice(last, m.index)}</React.Fragment>);
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={idx++}>{tok.slice(2, -2)}</strong>);
    else parts.push(<code key={idx++}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(<React.Fragment key={idx++}>{text.slice(last)}</React.Fragment>);
  return parts;
}

// ── Syntax highlighter ──────────────────────────────────────────────────────

const KW = new Set(['async', 'function', 'await', 'const', 'let', 'return', 'new']);

function highlightCode(text: string): React.ReactNode[] {
  const re = /(\/\/[^\n]*|`[^`]*`|'[^']*'|"[^"]*"|\b\d+\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[\s\S])/g;
  const tokens: React.ReactNode[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    const t = m[0];
    let cls = '';
    if (/^\/\//.test(t)) cls = 'tok-comment';
    else if (/^['"`]/.test(t)) cls = 'tok-string';
    else if (KW.has(t)) cls = 'tok-keyword';
    else if (/^[A-Z]/.test(t)) cls = 'tok-const';
    else if (/^[a-z][A-Za-z0-9_]*$/.test(t) && text[m.index + t.length] === '(') cls = 'tok-fn';
    tokens.push(cls ? <span key={i++} className={cls}>{t}</span> : <React.Fragment key={i++}>{t}</React.Fragment>);
  }
  return tokens;
}

// ── Inline render with annotation highlights ────────────────────────────────

function renderInline(
  text: string,
  annos: Annotation[],
  onClickAnno: (id: string) => void,
  focusId: string | null,
): React.ReactNode[] {
  const matches: { start: number; end: number; anno: Annotation }[] = [];
  for (const a of annos) {
    const anchor = a.selectedText;
    if (!anchor) continue;
    const idx = text.indexOf(anchor);
    if (idx >= 0) matches.push({ start: idx, end: idx + anchor.length, anno: a });
  }
  matches.sort((x, y) => x.start - y.start);

  const segments: { kind: 'text' | 'anno'; text: string; anno?: Annotation }[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue;
    if (m.start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, m.start) });
    segments.push({ kind: 'anno', text: text.slice(m.start, m.end), anno: m.anno });
    cursor = m.end;
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });

  return segments.map((s, i) => {
    if (s.kind === 'anno' && s.anno) {
      return (
        <span
          key={i}
          className={`op-anno-highlight ${s.anno.resolved ? 'is-resolved' : ''} ${focusId === s.anno.id ? 'is-focus' : ''}`}
          data-type={s.anno.type}
          data-anno-id={s.anno.id}
          onClick={e => { e.stopPropagation(); onClickAnno(s.anno!.id); }}
        >
          {renderInlineMarkup(s.text)}
        </span>
      );
    }
    return <React.Fragment key={i}>{renderInlineMarkup(s.text)}</React.Fragment>;
  });
}

// ── Block renderer ──────────────────────────────────────────────────────────

const BlockRenderer: React.FC<{
  block: Block;
  annos: Annotation[];
  onClickAnno: (id: string) => void;
  focusId: string | null;
}> = ({ block, annos, onClickAnno, focusId }) => {
  const inline = (text: string) => renderInline(text, annos, onClickAnno, focusId);
  switch (block.kind) {
    case 'h1': return <h1 data-block="true">{inline(block.text ?? '')}</h1>;
    case 'h2': return <h2 data-block="true">{inline(block.text ?? '')}</h2>;
    case 'h3': return <h3 data-block="true">{inline(block.text ?? '')}</h3>;
    case 'ul': return <ul data-block="true">{(block.items ?? []).map((it, i) => <li key={i}>{inline(it)}</li>)}</ul>;
    case 'code': return <pre data-block="true"><code>{highlightCode(block.text ?? '')}</code></pre>;
    default: return <p data-block="true">{inline(block.text ?? '')}</p>;
  }
};

// ── Gutter stack ────────────────────────────────────────────────────────────

const GutterStack: React.FC<{
  blockIdx: number;
  annos: Annotation[];
  onClick: (id: string) => void;
  focusId: string | null;
}> = ({ blockIdx, annos, onClick, focusId }) => {
  const [top, setTop] = React.useState(0);

  React.useLayoutEffect(() => {
    const blocks = document.querySelectorAll('.op-plan-body [data-block]');
    const target = blocks[blockIdx] as HTMLElement | undefined;
    const planEl = document.querySelector('.op-plan') as HTMLElement | null;
    if (!target || !planEl) return;
    const planTop = planEl.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    setTop(targetTop - planTop + 4);
  });

  return (
    <div style={{ position: 'absolute', top, left: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {annos.slice(0, 3).map(a => (
        <div
          key={a.id}
          className={`op-gutter-marker ${a.resolved ? 'is-resolved' : ''} ${focusId === a.id ? 'is-focus' : ''}`}
          onClick={() => onClick(a.id)}
          title={a.body ?? ANNOTATION_TYPES[a.type]?.label}
        >
          <span className="op-gutter-marker-line" />
          <AnnoIcon type={a.type} size={11} />
        </div>
      ))}
      {annos.length > 3 && (
        <div className="op-gutter-marker" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
          +{annos.length - 3}
        </div>
      )}
    </div>
  );
};

// ── Inline annotation card ──────────────────────────────────────────────────

const InlineCard: React.FC<{
  anno: Annotation;
  onClose: () => void;
  onResolve: () => void;
}> = ({ anno, onClose, onResolve }) => {
  return (
    <div className={`op-inline-card t-${anno.type}`}>
      <div className="op-inline-card-head">
        <AnnoIcon type={anno.type} size={12} />
        <span>{ANNOTATION_TYPES[anno.type]?.label}</span>
        <span>·</span>
        <span>{relTime(anno.createdAt)}</span>
        <div className="op-inline-card-head-spacer" />
        <button className="op-sel-btn" onClick={onClose} style={{ padding: '0 6px', height: 22 }}>×</button>
      </div>
      {anno.type !== 'highlight' && anno.type !== 'approval' && anno.type !== 'deletion' && (
        <div className="op-inline-card-quote">
          "{(anno.selectedText?.length ?? 0) > 140 ? anno.selectedText!.slice(0, 138) + '…' : anno.selectedText}"
        </div>
      )}
      {anno.body && <div className="op-inline-card-body">{anno.body}</div>}
      {anno.type === 'suggestion' && anno.suggestion && (
        <div className="op-anno-card-suggestion" style={{ marginTop: 8 }}>
          <div className="from">{anno.selectedText}</div>
          <div className="to">{anno.suggestion}</div>
        </div>
      )}
      {anno.type === 'emoji' && <div style={{ fontSize: 28, marginTop: 6 }}>{anno.emoji}</div>}
      <div className="op-inline-card-actions">
        <button className="op-btn op-btn-ghost op-btn-sm" onClick={onResolve}>
          {anno.resolved ? 'Reopen' : 'Mark resolved'}
        </button>
      </div>
    </div>
  );
};

function relTime(iso: string): string {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Plan body (memoized to preserve cursor after edits) ─────────────────────

interface PlanBodyProps {
  blocks: Block[];
  annoByBlock: Record<number, Annotation[]>;
  handleAnnoClick: (id: string) => void;
  focusId: string | null;
  expandedAnnoId: string | null;
  onCloseInline: () => void;
  onResolveInline: (id: string) => void;
  onInput: () => void;
  readonly: boolean;
  editedRef: React.MutableRefObject<boolean>;
}

const PlanBody = React.memo(function PlanBody(props: PlanBodyProps) {
  const { blocks, annoByBlock, handleAnnoClick, focusId, expandedAnnoId, onCloseInline, onResolveInline, onInput, readonly } = props;
  return (
    <div
      className="op-plan-body"
      data-content="plan"
      contentEditable={!readonly}
      suppressContentEditableWarning
      spellCheck={false}
      onInput={onInput}
    >
      {blocks.map((b, i) => {
        const annos = annoByBlock[i] ?? [];
        const expanded = annos.find(a => a.id === expandedAnnoId);
        return (
          <React.Fragment key={i}>
            <BlockRenderer block={b} annos={annos} onClickAnno={handleAnnoClick} focusId={focusId} />
            {expanded && (
              <InlineCard
                anno={expanded}
                onClose={onCloseInline}
                onResolve={() => onResolveInline(expanded.id)}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}, (prev, next) => prev.editedRef.current === true);

// ── Main PlanViewer ─────────────────────────────────────────────────────────

export interface PlanViewerProps {
  plan: string;
  annotations: Annotation[];
  readonly?: boolean;
  focusId: string | null;
  onFocusAnnotation: (id: string | null) => void;
  onAddAnnotation: (ann: Omit<Annotation, 'id' | 'createdAt' | 'resolved'>) => void;
  onResolveAnnotation: (id: string) => void;
  onEdit?: () => void;
}

export const PlanViewer: React.FC<PlanViewerProps> = ({
  plan, annotations, readonly = false,
  focusId, onFocusAnnotation,
  onAddAnnotation, onResolveAnnotation, onEdit,
}) => {
  const [selectionState, setSelectionState] = React.useState<{ pos: { x: number; y: number }; text: string } | null>(null);
  const [popover, setPopover] = React.useState<{ pos: { x: number; y: number }; type: string; quote: string } | null>(null);
  const [expandedAnnoId, setExpandedAnnoId] = React.useState<string | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const editedRef = React.useRef(false);

  const blocks = React.useMemo(() => parsePlan(plan), [plan]);

  const annoByBlock = React.useMemo(() => {
    const map: Record<number, Annotation[]> = {};
    for (const a of annotations) {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const text = b.text ?? (b.items ? b.items.join(' ') : '');
        if (text && a.selectedText && text.includes(a.selectedText)) {
          (map[i] = map[i] ?? []).push(a);
          break;
        }
      }
    }
    return map;
  }, [blocks, annotations]);

  // Selection detection
  React.useEffect(() => {
    if (readonly) return;
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if ((e.target as Element)?.closest?.('.op-sel-toolbar, .op-popover')) return;
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          setSelectionState(null);
          return;
        }
        if (!wrapRef.current?.contains(sel.anchorNode)) return;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        const TB_W = 360;
        const TB_H = 36;
        let x = rect.left + rect.width / 2 - TB_W / 2;
        let y = rect.top - TB_H - 10;
        if (y < 60) y = rect.bottom + 10;
        x = Math.max(12, Math.min(window.innerWidth - TB_W - 12, x));
        setSelectionState({ pos: { x, y }, text: sel.toString() });
      }, 10);
    };
    document.addEventListener('mouseup', handler);
    document.addEventListener('keyup', handler);
    return () => {
      document.removeEventListener('mouseup', handler);
      document.removeEventListener('keyup', handler);
    };
  }, [readonly]);

  const onToolbarAction = (type: string) => {
    if (!selectionState) return;
    const quote = selectionState.text;
    const pos = { x: selectionState.pos.x, y: selectionState.pos.y + 50 };
    if (type === 'comment' || type === 'question' || type === 'action-item') {
      setPopover({ pos, type, quote });
    } else if (type === 'suggestion') {
      setPopover({ pos, type, quote });
    } else {
      // Immediate annotations: highlight, approval, emoji, deletion
      onAddAnnotation({ type: type as Annotation['type'], selectedText: quote, from: 0, to: quote.length, author: 'you' });
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
      to: popover.quote.length,
      body,
      suggestion,
      author: 'you',
    });
    setPopover(null);
    setSelectionState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleAnnoClick = (id: string) => {
    onFocusAnnotation(id);
    setExpandedAnnoId(expandedAnnoId === id ? null : id);
  };

  const handleInput = React.useCallback(() => {
    if (!editedRef.current) {
      editedRef.current = true;
      onEdit?.();
    }
  }, [onEdit]);

  return (
    <div
      className="op-plan-wrap"
      ref={wrapRef}
      onClick={e => {
        if ((e.target as Element).closest('.op-anno-highlight, .op-sel-toolbar, .op-popover, .op-gutter-marker')) return;
        setSelectionState(null);
        setPopover(null);
      }}
    >
      <div className="op-plan">
        <div className="op-plan-gutter">
          {Object.entries(annoByBlock).map(([blockIdx, list]) => (
            <GutterStack
              key={blockIdx}
              blockIdx={Number(blockIdx)}
              annos={list}
              onClick={handleAnnoClick}
              focusId={focusId}
            />
          ))}
        </div>
        <PlanBody
          blocks={blocks}
          annoByBlock={annoByBlock}
          handleAnnoClick={handleAnnoClick}
          focusId={focusId}
          expandedAnnoId={expandedAnnoId}
          onCloseInline={() => setExpandedAnnoId(null)}
          onResolveInline={id => { onResolveAnnotation(id); setExpandedAnnoId(null); }}
          onInput={handleInput}
          readonly={readonly}
          editedRef={editedRef}
        />
      </div>

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
