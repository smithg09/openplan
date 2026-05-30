import React from 'react';
import { diffLines, type Change } from 'diff';

export interface DiffLine {
  kind: 'add' | 'remove' | 'context' | 'collapsed';
  text: string;
}

interface DiffPaneProps {
  oldContent: string;
  newContent: string;
  activeVersion: number;
  mode: 'inline' | 'side';
  onModeChange: (m: 'inline' | 'side') => void;
}

function computeDiffLines(oldText: string, newText: string): DiffLine[] {
  const changes: Change[] = diffLines(oldText, newText);
  const lines: DiffLine[] = [];

  for (const change of changes) {
    const changeLines = change.value.replace(/\n$/, '').split('\n');
    const kind: DiffLine['kind'] = change.added ? 'add' : change.removed ? 'remove' : 'context';

    // For large unchanged blocks, collapse the middle
    if (kind === 'context' && changeLines.length > 6) {
      // Show first 3 and last 3
      for (let i = 0; i < 3; i++) {
        lines.push({ kind: 'context', text: changeLines[i] });
      }
      lines.push({ kind: 'collapsed', text: `@@ ${changeLines.length - 6} unchanged lines @@` });
      for (let i = changeLines.length - 3; i < changeLines.length; i++) {
        lines.push({ kind: 'context', text: changeLines[i] });
      }
    } else {
      for (const line of changeLines) {
        lines.push({ kind, text: line });
      }
    }
  }

  return lines;
}

export const DiffPane: React.FC<DiffPaneProps> = ({ oldContent, newContent, activeVersion, mode, onModeChange }) => {
  const prevV = Math.max(1, activeVersion - 1);

  const diffResult = React.useMemo(
    () => computeDiffLines(oldContent, newContent),
    [oldContent, newContent],
  );

  return (
    <div className="op-diff-pane">
      <div className="op-diff-pane-head">
        <span>// comparing v{prevV} → v{activeVersion}</span>
        <div className="op-grow" />
        <button className={`op-btn op-btn-sm ${mode === 'inline' ? 'op-btn-outline' : 'op-btn-ghost'}`} onClick={() => onModeChange('inline')}>inline</button>
        <button className={`op-btn op-btn-sm ${mode === 'side' ? 'op-btn-outline' : 'op-btn-ghost'}`} onClick={() => onModeChange('side')}>side-by-side</button>
      </div>
      <div className="op-diff-pane-body">
        {mode === 'inline' ? (
          diffResult.map((d, i) => (
            <div key={i} className={`op-diff-line ${d.kind}`}>
              {d.kind === 'collapsed' ? (
                <span>{d.text}</span>
              ) : (
                <>
                  <span className="sign">{d.kind === 'add' ? '+' : d.kind === 'remove' ? '−' : ' '}</span>
                  <span className="num">{i + 1}</span>
                  <span className="text">{d.text || ' '}</span>
                </>
              )}
            </div>
          ))
        ) : (
          <div style={{ display: 'flex', gap: 1, background: 'var(--border)' }}>
            <div style={{ flex: 1, background: 'var(--bg-base)', padding: 8 }}>
              {diffResult.filter(d => d.kind !== 'add').map((d, i) => (
                <div key={i} className={`op-diff-line ${d.kind === 'remove' ? 'remove' : d.kind === 'collapsed' ? 'collapsed' : 'context'}`}>
                  {d.kind === 'collapsed' ? (
                    <span>{d.text}</span>
                  ) : (
                    <>
                      <span className="sign"> </span>
                      <span className="num">{i + 1}</span>
                      <span className="text">{d.text || ' '}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, background: 'var(--bg-base)', padding: 8 }}>
              {diffResult.filter(d => d.kind !== 'remove').map((d, i) => (
                <div key={i} className={`op-diff-line ${d.kind === 'add' ? 'add' : d.kind === 'collapsed' ? 'collapsed' : 'context'}`}>
                  {d.kind === 'collapsed' ? (
                    <span>{d.text}</span>
                  ) : (
                    <>
                      <span className="sign"> </span>
                      <span className="num">{i + 1}</span>
                      <span className="text">{d.text || ' '}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
