import React, { useState, useEffect, useRef } from 'react';
import type { Annotation } from '@openplan/shared';
import { SelectionToolbar, CommentPopover, SuggestionPopover } from '@openplan/toolbar';
import { AnnoCard } from '@openplan/annotations';
import { CheckSmIcon, CopyIcon } from '../icons';

// ── DOM search and highlight logic ──

function shouldSkipNode(node: Node): boolean {
  if (!node.parentElement) return false;
  return !!node.parentElement.closest('.dw, .op-sel-toolbar, .op-popover, .op-floating-bar, .op-floating-card');
}

function findTextInDOM(container: HTMLElement, searchText: string): Range | null {
  if (!searchText || !container) return null;

  const needle = searchText.trim().replace(/\s+/g, ' ');
  if (!needle) return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let buffer = '';
  const nodeEntries: { node: Text; start: number; length: number }[] = [];
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    if (shouldSkipNode(node)) {
      continue;
    }

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
      while (i < buffer.length && /\s/.test(buffer[i])) {
        i++;
      }
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
  const endIdx = normEndIdx < origIndexMap.length
    ? origIndexMap[normEndIdx]
    : buffer.length;

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

function applyAnnotationHighlights(
  container: HTMLElement,
  annotations: Annotation[],
  onClickAnnotation: (id: string, element: HTMLElement) => void
) {
  for (const anno of annotations) {
    if (!anno.selectedText) continue;

    // Skip if already highlighted
    if (container.querySelector(`[data-page-anno-id="${anno.id}"]`)) continue;

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
        if (shouldSkipNode(walkNode)) continue;

        if (range.intersectsNode(walkNode)) {
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

      textNodes.reverse().forEach(({ node: textNode, start, end }) => {
        try {
          const nodeRange = document.createRange();
          nodeRange.setStart(textNode, start);
          nodeRange.setEnd(textNode, end);

          const mark = document.createElement('mark');
          mark.className = 'op-anno-highlight';
          mark.dataset.pageAnnoId = anno.id;
          mark.dataset.type = anno.type;
          if (anno.resolved) mark.dataset.resolved = 'true';

          nodeRange.surroundContents(mark);

          mark.addEventListener('click', (e) => {
            e.stopPropagation();
            onClickAnnotation(anno.id, mark);
          });
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
  }
}

function clearAllPageHighlights(container: HTMLElement) {
  const marks = container.querySelectorAll('[data-page-anno-id]');
  marks.forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) {
      parent?.insertBefore(el.firstChild, el);
    }
    el.remove();
  });
  container.normalize();
}

function exportPageAnnotationsToMarkdown(annotations: Annotation[]): string {
  const activeAnns = annotations.filter(a => !a.resolved);
  if (activeAnns.length === 0) {
    return 'No active landing page annotations found.';
  }

  const sorted = [...activeAnns].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let output = `# OpenPlan Landing Page Feedback\n\n`;
  output += `Here is the annotated feedback collected from the landing page:\n\n`;

  sorted.forEach((ann, index) => {
    output += `### ${index + 1}. [${ann.type.toUpperCase()}] on text: "${ann.selectedText}"\n`;
    if (ann.type === 'suggestion' && ann.suggestion) {
      output += `Suggested Change:\n\`\`\`diff\n- ${ann.selectedText}\n+ ${ann.suggestion}\n\`\`\`\n`;
    }
    if (ann.body) {
      output += `> ${ann.body}\n`;
    }
    if (ann.emoji) {
      output += `Reaction: ${ann.emoji}\n`;
    }
    output += `\n`;
  });

  return output;
}

interface PageAnnotatorProps {
  children: React.ReactNode;
  theme: 'dark' | 'light';
}

export default function PageAnnotator({ children, theme }: PageAnnotatorProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    const now = new Date().toISOString();
    return [
      {
        id: 'page_predefined_1',
        type: 'comment',
        selectedText: 'annotate',
        from: 0,
        to: 0,
        body: 'Leaving context-specific comments directly on the text makes plan review faster.',
        author: 'Reviewer',
        createdAt: now,
        resolved: false,
      },
      {
        id: 'page_predefined_2',
        type: 'suggestion',
        selectedText: 'before any code is written',
        from: 0,
        to: 0,
        suggestion: 'before a single line is written',
        body: 'More emphasis?',
        author: 'Developer',
        createdAt: now,
        resolved: false,
      },
      {
        id: 'page_predefined_3',
        type: 'deletion',
        selectedText: 'Early access',
        from: 0,
        to: 0,
        body: 'We\'re stable enough, drop the label.',
        author: 'Developer',
        createdAt: now,
        resolved: false,
      },
    ];
  });

  const [selectionState, setSelectionState] = useState<{ pos: { x: number; y: number }; text: string } | null>(null);
  const [popover, setPopover] = useState<{ pos: { x: number; y: number }; type: string; quote: string } | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<{ anno: Annotation; pos: { x: number; y: number } } | null>(null);
  const [showHighlights, setShowHighlights] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Trigger toast timer
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Handle click on highlight mark to show tooltip card
  const handleHighlightClick = (id: string, element: HTMLElement) => {
    if (!showHighlights) return;
    const anno = annotations.find(a => a.id === id);
    if (!anno) return;

    const rect = element.getBoundingClientRect();
    const CARD_W = 280;
    let x = rect.left + rect.width / 2 - CARD_W / 2;
    let y = rect.bottom + 8;

    x = Math.max(12, Math.min(window.innerWidth - CARD_W - 12, x));

    // Ensure it fits vertically, else place above the highlight
    if (y + 190 > window.innerHeight) {
      y = rect.top - 190 - 8;
    }
    y = Math.max(12, y);

    setActiveTooltip({ anno, pos: { x, y } });
  };

  // Redraw highlights when state, theme, or visibility changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const raf = requestAnimationFrame(() => {
      clearAllPageHighlights(container);
      if (showHighlights) {
        applyAnnotationHighlights(container, annotations, handleHighlightClick);
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [annotations, theme, showHighlights]);

  // Detect and position Selection Toolbar
  useEffect(() => {
    const detectSelection = (e: MouseEvent | KeyboardEvent) => {
      if ((e.target as Element)?.closest('.op-sel-toolbar, .op-popover, .op-floating-bar, .op-floating-card')) return;

      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

        if (!containerRef.current?.contains(sel.anchorNode)) return;

        // Ignore selections inside the Live Demo widget or toolbars/popovers
        if ((sel.anchorNode as Node).parentElement?.closest('.dw, .op-sel-toolbar, .op-popover, .op-floating-bar, .op-floating-card')) {
          setSelectionState(null);
          return;
        }

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

    const handleScroll = () => {
      // Clear selection toolbars on scroll to avoid orphan elements
      setSelectionState(null);
    };

    document.addEventListener('mouseup', detectSelection);
    document.addEventListener('keyup', detectSelection);
    window.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mouseup', detectSelection);
      document.removeEventListener('keyup', detectSelection);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleToolbarAction = (type: string, meta?: { emoji?: string }) => {
    if (!selectionState) return;
    const quote = selectionState.text;
    const pos = { x: selectionState.pos.x, y: selectionState.pos.y + 50 };

    if (type === 'comment' || type === 'question' || type === 'suggestion') {
      setPopover({ pos, type, quote });
    } else if (type === 'emoji' && meta?.emoji) {
      handleAddAnnotation({ type: 'emoji', selectedText: quote, from: 0, to: 0, emoji: meta.emoji, author: 'admin' });
    } else {
      handleAddAnnotation({ type: type as Annotation['type'], selectedText: quote, from: 0, to: 0, author: 'admin' });
    }
  };

  const onPopoverSave = (body: string, suggestion?: string) => {
    if (!popover) return;
    handleAddAnnotation({
      type: popover.type as Annotation['type'],
      selectedText: popover.quote,
      from: 0,
      to: 0,
      body,
      suggestion,
      author: 'you',
    });
  };

  const handleAddAnnotation = (ann: Omit<Annotation, 'id' | 'createdAt' | 'resolved'>) => {
    const newAnno: Annotation = {
      ...ann,
      id: `page_${Date.now()}`,
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    const updated = [...annotations, newAnno];
    setAnnotations(updated);

    setPopover(null);
    setSelectionState(null);
    window.getSelection()?.removeAllRanges();
    setToast('Annotation added!');
  };

  const handleEditAnnotation = (id: string, body: string) => {
    const updated = annotations.map(a => a.id === id ? { ...a, body } : a);
    setAnnotations(updated);
    setActiveTooltip(prev => prev && prev.anno.id === id ? { ...prev, anno: { ...prev.anno, body } } : prev);
    setToast('Comment updated!');
  };

  const handleRemoveAnnotation = (id: string) => {
    const updated = annotations.filter(a => a.id !== id);
    setAnnotations(updated);
    setActiveTooltip(null);
    setToast('Annotation removed.');
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all page annotations?')) {
      setAnnotations([]);
      setActiveTooltip(null);
      setToast('Cleared all page annotations.');
    }
  };

  const handleCopyMarkdown = () => {
    const md = exportPageAnnotationsToMarkdown(annotations);
    navigator.clipboard.writeText(md).then(
      () => setToast('Copied markdown feedback!'),
      () => setToast('Failed to copy to clipboard.')
    );
  };

  const handlePageClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-page-anno-id], .op-sel-toolbar, .op-popover, .op-floating-bar, .op-floating-card')) return;
    setSelectionState(null);
    setPopover(null);
    setActiveTooltip(null);
  };

  const activeCount = annotations.filter(a => !a.resolved).length;

  return (
    <div
      ref={containerRef}
      className={`op-page-annotator-root ${!showHighlights ? 'op-hide-highlights' : ''}`}
      onClick={handlePageClick}
      style={{ minHeight: '100vh', position: 'relative' }}
    >
      {children}

      {/* Viewport Selection Toolbar */}
      {selectionState && !popover && (
        <SelectionToolbar pos={selectionState.pos} onAction={handleToolbarAction} />
      )}

      {/* Popovers */}
      {popover && popover.type === 'suggestion' ? (
        <SuggestionPopover
          pos={popover.pos}
          quote={popover.quote}
          onSave={onPopoverSave}
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

      {/* Floating Tooltip Card */}
      {activeTooltip && (
        <div
          className="op-floating-card"
          style={{
            position: 'fixed',
            left: activeTooltip.pos.x,
            top: activeTooltip.pos.y,
            width: 280,
            zIndex: 250,
          }}
        >
          <AnnoCard
            anno={activeTooltip.anno}
            isFocus={true}
            onClick={() => { }}
            onEdit={handleEditAnnotation}
            onRemove={() => handleRemoveAnnotation(activeTooltip.anno.id)}
          />
        </div>
      )}

      {/* Sleek Floating Control Pill */}
      <div className="op-floating-bar">
        <div className="op-floating-bar-inner">
          <div className="op-floating-bar-brand">
            <span style={{ color: 'var(--accent-fg)', fontWeight: 700 }}>$</span>
            <span style={{ color: 'var(--text-faint)' }}>/</span>
            <span style={{ fontWeight: 600 }}>select-to-annotate</span>
          </div>

          <div className="op-floating-bar-divider" />

          <button
            className="op-floating-bar-btn"
            onClick={() => setShowHighlights(!showHighlights)}
            title={showHighlights ? 'Hide highlights' : 'Show highlights'}
          >
            {showHighlights ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
            <span className="op-btn-label">{showHighlights ? 'Hide' : 'Show'}</span>
          </button>

          <div className="op-floating-bar-badge" title="Active landing page annotations">
            {activeCount}
          </div>

          {activeCount > 0 && (
            <>
              <button
                className="op-floating-bar-btn-icon"
                onClick={handleCopyMarkdown}
                title="Copy annotations as Markdown"
              >
                <CopyIcon />
                <span className="op-btn-label op-btn-label-desktop-hide">Copy MD</span>
              </button>

              <button
                className="op-floating-bar-btn-icon danger"
                onClick={handleClearAll}
                title="Clear all annotations"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span className="op-btn-label op-btn-label-desktop-hide">Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toast popup */}
      {toast && (
        <div className="op-toast-notification">
          <CheckSmIcon />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
