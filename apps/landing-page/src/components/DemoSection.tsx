import React, { useState, useCallback } from 'react';
import type { Annotation } from '@openplan/shared';
import { SAMPLE_PLAN } from '@openplan/shared';
import { PlanEditor } from '@openplan/plan-viewer';
import { AnnotationsPanel } from '@openplan/annotations';
import { ActionBar } from '@openplan/toolbar';
import { CheckIcon, UndoIcon } from '../icons';

// ── Seed annotations matching the plan text
function makeInitialAnnotations(): Annotation[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'q1', type: 'question',
      selectedText: 'annotate, version, review, and manage',
      from: 0, to: 37, author: 'you', createdAt: now, resolved: false,
      body: 'Should we add a shareable link feature for external reviewers?',
    },
    {
      id: 'a1', type: 'comment',
      selectedText: 'Interactive Annotations',
      from: 0, to: 22, author: 'you', createdAt: now, resolved: false,
      body: 'We should highlight the diff viewer feature here too.',
    },
    {
      id: 's1', type: 'suggestion',
      selectedText: 'openplan annotate <file.md>',
      from: 0, to: 25, author: 'you', createdAt: now, resolved: false,
      body: 'Support glob patterns for reviewing multiple files at once.',
      suggestion: 'openplan annotate <file.md|glob>',
    },
  ];
}

type FlyupMode = 'ask' | 'changes' | null;

export default function DemoSection() {
  const [annotations, setAnnotations] = useState<Annotation[]>(makeInitialAnnotations);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [flyup, setFlyup] = useState<FlyupMode>(null);
  const [flyTxt, setFlyTxt] = useState('');
  const [decision, setDecision] = useState<'approved' | 'denied' | null>(null);

  const handleAddAnnotation = useCallback((ann: Omit<Annotation, 'id' | 'createdAt' | 'resolved'>) => {
    const newAnno: Annotation = {
      ...ann,
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    setAnnotations(prev => [...prev, newAnno]);
    setFocusId(newAnno.id);
    setPanelOpen(true);
  }, []);

  const handleResolve = useCallback((id: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, resolved: !a.resolved } : a));
  }, []);

  const handleEdit = useCallback((id: string, body: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, body } : a));
  }, []);

  const handleRemove = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (focusId === id) setFocusId(null);
  }, [focusId]);

  const handleFocus = useCallback((id: string) => setFocusId(id), []);

  const approve = () => { setDecision('approved'); setFlyup(null); };
  const deny = () => { if (!flyTxt.trim()) return; setDecision('denied'); setFlyup(null); setFlyTxt(''); };
  const reset = () => {
    setDecision(null);
    setAnnotations(makeInitialAnnotations());
    setPanelOpen(false);
    setFocusId(null);
  };

  return (
    <section className="lp-demo-section">
      <div className="wrap sc">
        <div className="slabel">// live demo</div>
        <h2 className="stitle">Annotate right here</h2>
        <p className="ssub">
          Select any text to annotate. Click a highlighted mark to open the sidebar.
          Approve or request changes when done.
        </p>

        {/* Demo widget — exact same UI as the real app */}
        <div className="dw">

          {/* Title bar */}
          <div className="dtb">
            <span className="tbd" style={{ background: '#ff5f56' }} />
            <span className="tbd" style={{ background: '#ffbd2e' }} />
            <span className="tbd" style={{ background: '#27c93f' }} />
            <span className="tbt">Welcome to OpenPlan — plan review</span>
            <button
              className="tbp"
              style={{ cursor: 'pointer' }}
              onClick={() => setPanelOpen(o => !o)}
            >
              {annotations.filter(a => !a.resolved).length} annotation{annotations.filter(a => !a.resolved).length !== 1 ? 's' : ''}
            </button>
          </div>

          {/* Main area — PlanViewer left, AnnotationsPanel right */}
          <div className="dmain">
            {/* Real PlanEditor from @openplan/plan-viewer */}
            <div className="lp-plan-area">
              <PlanEditor
                plan={SAMPLE_PLAN}
                annotations={annotations}
                focusId={focusId}
                onFocusAnnotation={(id) => {
                  setFocusId(id);
                  if (id) setPanelOpen(true);
                }}
                onAddAnnotation={handleAddAnnotation}
                onRemoveAnnotation={handleRemove}
              />
            </div>

            {/* Real AnnotationsPanel from @openplan/annotations */}
            {panelOpen && (
              <div className="lp-anno-panel">
                <AnnotationsPanel
                  annotations={annotations}
                  focusId={focusId}
                  onFocus={handleFocus}
                  onEdit={handleEdit}
                  onRemove={handleRemove}
                  onClose={() => setPanelOpen(false)}
                />
              </div>
            )}
          </div>

          {/* Flyup panel */}
          {flyup && (
            <div className="dfl">
              <div className="fll">{flyup === 'changes' ? 'Request changes' : 'Ask Claude to…'}</div>
              <textarea
                className="flt"
                autoFocus
                placeholder={flyup === 'changes' ? 'Describe what needs to change…' : 'What should Claude revise in this plan?'}
                value={flyTxt}
                onChange={e => setFlyTxt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setFlyup(null); setFlyTxt(''); } }}
              />
              <div className="fla">
                <button className="flc" onClick={() => { setFlyup(null); setFlyTxt(''); }}>Cancel</button>
                <button
                  className={`fls ${flyup === 'changes' ? 'fls-deny' : 'fls-ask'}`}
                  onClick={flyup === 'changes' ? deny : () => { setFlyup(null); setFlyTxt(''); }}
                >
                  {flyup === 'changes' ? 'Send feedback' : 'Send'}
                </button>
              </div>
            </div>
          )}

          {/* Real ActionBar from @openplan/toolbar */}
          <ActionBar
            hasEdits={false}
            annotationsCount={annotations.filter(a => !a.resolved).length}
            onApprove={() => approve()}
            onRequestChanges={() => { setFlyup('changes'); setFlyTxt(''); }}
            onAskClaude={(kind) => { setFlyup('ask'); setFlyTxt(`Please run the ${kind} skill...`); }}
            alwaysEnableApprove={true}
          />

          {/* Decision overlay */}
          {decision && (
            <div className="dov">
              <div className={`doi doi-${decision}`}>
                {decision === 'approved' ? <CheckIcon size={24} /> : <UndoIcon size={22} />}
              </div>
              <div className="dot">{decision === 'approved' ? 'Plan approved' : 'Changes requested'}</div>
              <div className="dos">
                {decision === 'approved'
                  ? 'Decision returned to agent — execution begins'
                  : 'Feedback sent — awaiting revised plan'}
              </div>
              <button className="dor" onClick={reset}>↩ reset demo</button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          Powered by openplan ·&nbsp;
          <a href="https://openplan.smithgajjar.dev/app/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-fg)' }}>
            Try the full experience →
          </a>
        </div>
      </div>
    </section>
  );
}
