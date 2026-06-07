import React from 'react';
import { useStore } from './store';
import { applyTheme } from './lib/theme';
import { TopBar } from './components/TopBar';
import { HookBanner } from './components/HookBanner';
import { OutlineFilesPanel } from './components/OutlineFilesPanel';
import { ActionBar } from '@openplan/toolbar';
import { SessionComplete } from './components/SessionComplete';
import { ShareDialog } from './components/ShareDialog';
import { SettingsPanel } from './components/SettingsPanel';
import { EmptyState } from './components/EmptyState';
import { RequestChangesFlyup } from './components/RequestChangesFlyup';
import { ToastStack } from './components/Primitives';
import { PlanEditor } from '@openplan/plan-viewer';
import { UpdateBanner } from './components/UpdateBanner';
import { AnnotationsPanel } from '@openplan/annotations';
import type { Annotation } from '@openplan/shared';

export default function App() {
  const {
    mode, plan, theme, accent, annotations, focusedAnnotationId, panelOpen,
    approveFlow, toasts, slug, title, version, initialized, loading, selectedFile, dirFiles,
    fileAnnotationCounts,
    setTheme,
    addAnnotation, removeAnnotation, updateAnnotation, setFocusedAnnotation, setPanelOpen,
    startApprove, startSend, tickCountdown, resetApprove,
    pushToast, dismissToast,
    initializeFromAPI, setLoading, setSelectedFile, setPlanContent, hasEdits,
  } = useStore();

  // Apply theme whenever theme or accent changes
  React.useEffect(() => { applyTheme(theme, accent); }, [theme, accent]);

  // Update browser title when plan title changes
  React.useEffect(() => {
    document.title = title ? `${title} — openplan` : 'openplan';
  }, [title]);

  const [binVersion, setBinVersion] = React.useState('');

  // ── Startup: fetch all data from API ──────────────────────────────────
  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/api/plan').then(r => r.json()),
    ]).then(async ([cfg, planData]) => {
      if (cfg.version) setBinVersion(cfg.version);
      const [versionRes, annoRes, filesRes] = await Promise.all([
        fetch('/api/versions').then(r => r.json()),
        fetch(`/api/annotations/${planData.version}`).then(r => r.json()),
        cfg.mode === 'annotate-dir' ? fetch('/api/files').then(r => r.json()) : Promise.resolve(null),
      ]);
      // Map API version shape {number, createdAt} → VersionMeta {version, timestamp, source, status, annotations}
      const rawVersions = (versionRes.versions ?? []) as Array<{ number: number; createdAt: string }>;
      const currentVer = versionRes.currentVersion ?? planData.version ?? 1;
      const mappedVersions = rawVersions.map((v: { number: number; createdAt: string }) => ({
        version: v.number,
        timestamp: v.createdAt,
        source: 'cli',
        status: v.number === currentVer ? 'current' as const : v.number < currentVer ? 'superseded' as const : 'pending' as const,
        annotations: 0,
        label: v.number === currentVer ? 'current' : undefined,
      })).reverse(); // newest first

      initializeFromAPI({
        mode: cfg.mode === 'serve' || cfg.mode === 'annotate-dir' ? 'standalone' : 'hook',
        plan: planData.plan,
        slug: planData.slug,
        project: planData.projectSlug,
        title: planData.title,
        version: planData.version,
        annotations: annoRes.annotations ?? [],
        versions: mappedVersions,
        dirFiles: filesRes?.files ?? [],
        fileAnnotationCounts: filesRes?.annotationCounts ?? {},
        autoCloseDelay: cfg.autoCloseDelay,
      });
    }).catch(() => {
      // No backend available (e.g. static demo site) — show sample plan
      const savedAnno = localStorage.getItem('openplan:annotations:demo/welcome-to-openplan');
      const savedDraft = localStorage.getItem('openplan:draft:demo/welcome-to-openplan');

      let annotations = [];
      if (savedAnno) {
        try {
          annotations = JSON.parse(savedAnno);
        } catch {
          annotations = [];
        }
      } else {
        // Pre-populate default demo annotations of each type
        annotations = [
          {
            id: 'ann_demo1',
            type: 'comment',
            selectedText: 'interactive plan review tool for Claude Code',
            from: 0,
            to: 0,
            body: 'This is super helpful for reviewing AI-generated changes!',
            author: 'Gajjar',
            createdAt: new Date().toISOString(),
            resolved: false,
          },
          {
            id: 'ann_demo2',
            type: 'suggestion',
            selectedText: 'Navigate to a project containing your planning markdown files.',
            from: 0,
            to: 0,
            body: 'Slightly clearer wording.',
            suggestion: 'Change directory to your project folder containing markdown plans.',
            author: 'Smith',
            createdAt: new Date().toISOString(),
            resolved: false,
          },
          {
            id: 'ann_demo3',
            type: 'question',
            selectedText: 'openplan annotate <file.md>',
            from: 0,
            to: 0,
            body: 'Does this command automatically open the default web browser?',
            author: 'Developer',
            createdAt: new Date().toISOString(),
            resolved: false,
          },
          {
            id: 'ann_demo4',
            type: 'emoji',
            selectedText: 'beautiful browser-based UI',
            from: 0,
            to: 0,
            body: 'I love the dark mode design!',
            emoji: '✨',
            author: 'Designer',
            createdAt: new Date().toISOString(),
            resolved: false,
          },
          {
            id: 'ann_demo5',
            type: 'deletion',
            selectedText: 'propose deletions,',
            from: 0,
            to: 0,
            body: 'Simplify this wording.',
            author: 'Reviewer',
            createdAt: new Date().toISOString(),
            resolved: false,
          }
        ];
      }

      initializeFromAPI({
        mode: 'standalone',
        title: 'Welcome to OpenPlan',
        slug: 'welcome-to-openplan',
        project: 'demo',
        plan: savedDraft || undefined,
        annotations,
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Decision handlers ─────────────────────────────────────────────────
  const handleApprove = (approveMode?: string) => {
    startApprove(approveMode);
    fetch('/api/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editedContent: plan, mode: approveMode ?? 'default' }),
    }).catch(() => {
      resetApprove();
      pushToast('Failed to send decision');
    });
  };

  const handleRequestChanges = (message: string, includeEdits: boolean) => {
    const activeAnnotations = annotations.filter(a => !a.resolved);
    const hasAnnos = activeAnnotations.length > 0;

    let feedbackText = '';
    if (hasAnnos) {
      feedbackText = exportAnnotationsToMarkdown(activeAnnotations, plan);
      if (message.trim()) {
        feedbackText += `\n\n**Overall comment:** ${message.trim()}`;
      }
    } else {
      feedbackText = message.trim() || 'Request changes.';
    }

    const prompt = buildDenyPrompt(feedbackText);
    startSend('changes', message);

    const promises: Promise<unknown>[] = [
      fetch('/api/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, editedContent: includeEdits ? plan : '' }),
      }),
    ];

    if (hasAnnos) {
      promises.push(fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: activeAnnotations, version }),
      }));
    }

    Promise.all(promises).catch(() => {
      resetApprove();
      pushToast('Failed to send decision');
    });
  };

  const handleAskClaude = (kind: string) => {
    const messages: Record<string, string> = {
      'phases': 'Convert this plan to phases: break into handoff documents',
      'grill': 'Grill this plan: challenge the approach and identify weaknesses',
      'improve': 'Improve this plan: enhance clarity, completeness, and feasibility',
      'handoff': 'Create a handoff document from this plan',
    };
    startSend('skill-' + kind);
    fetch('/api/deny', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messages[kind] }),
    }).catch(() => {
      resetApprove();
      pushToast('Failed');
    });
  };

  // ── Auto-save draft (debounced 2s) ────────────────────────────────────
  React.useEffect(() => {
    if (!initialized || !hasEdits) return;
    const id = setTimeout(() => {
      const state = useStore.getState();
      const isLocal = selectedFile && (state as any).localFileHandles?.[selectedFile];
      const isGHPagesDemo = import.meta.env.VITE_GITHUB_PAGES === 'true' && !selectedFile;

      if (isLocal || isGHPagesDemo) {
        const key = isLocal ? `openplan:draft:${selectedFile}` : `openplan:draft:demo/welcome-to-openplan`;
        localStorage.setItem(key, plan);
        return;
      }
      fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: plan }),
      });
    }, 2000);
    return () => clearTimeout(id);
  }, [plan, initialized, hasEdits, selectedFile]);

  // ── Annotations auto-save (debounced 1s) ──────────────────────────────
  React.useEffect(() => {
    if (!initialized) return;
    const id = setTimeout(() => {
      const state = useStore.getState();
      const isLocal = selectedFile && (state as any).localFileHandles?.[selectedFile];
      const isGHPagesDemo = import.meta.env.VITE_GITHUB_PAGES === 'true' && !selectedFile;

      if (isLocal || isGHPagesDemo) {
        const key = isLocal ? `openplan:annotations:${selectedFile}` : `openplan:annotations:demo/welcome-to-openplan`;
        localStorage.setItem(key, JSON.stringify(annotations));
        return;
      }
      fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations, version }),
      });
    }, 1000);
    return () => clearTimeout(id);
  }, [annotations, initialized, version, selectedFile]);

  // ── Selected file effect (dir mode) ───────────────────────────────────
  React.useEffect(() => {
    if (!selectedFile) return;

    // Check if we are handling it locally via File System API
    const state = useStore.getState();
    if ((state as any).localFileHandles && (state as any).localFileHandles[selectedFile]) {
      return;
    }

    fetch(`/api/file?path=${encodeURIComponent(selectedFile)}`)
      .then(r => r.json())
      .then(d => {
        // Map versions exactly like start block
        const rawVersions = d.versions ?? [];
        const currentVer = d.version ?? 1;
        const mappedVersions = rawVersions.map((v: any) => ({
          version: v.version,
          timestamp: v.timestamp,
          source: 'cli',
          status: v.version === currentVer ? 'current' as const : v.version < currentVer ? 'superseded' as const : 'pending' as const,
          annotations: 0,
          label: v.version === currentVer ? 'current' : undefined,
        }));
        initializeFromAPI({
          mode: mode,
          plan: d.content,
          slug: d.slug,
          version: d.version,
          annotations: d.annotations ?? [],
          versions: mappedVersions,
          dirFiles: dirFiles,
        });
      });
  }, [selectedFile, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Session timer (hook mode cosmetic clock)
  const [timer, setTimer] = React.useState('00:42');
  React.useEffect(() => {
    let n = 42;
    const id = setInterval(() => {
      n++;
      const mm = String(Math.floor(n / 60)).padStart(2, '0');
      const ss = String(n % 60).padStart(2, '0');
      setTimer(`${mm}:${ss}`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Countdown ticker for approve flow
  React.useEffect(() => {
    if (approveFlow?.phase !== 'countdown') return;
    const id = setTimeout(() => tickCountdown(), 900);
    return () => clearTimeout(id);
  }, [approveFlow, tickCountdown]);

  // Keyboard shortcuts
  const [showShare, setShowShare] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showRequestChanges, setShowRequestChanges] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !approveFlow) {
        e.preventDefault();
        handleApprove();
      }
      if (e.key === 'Escape') {
        if (showShare) setShowShare(false);
        else if (showSettings) setShowSettings(false);
        else if (showRequestChanges) setShowRequestChanges(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [approveFlow, showShare, showSettings, showRequestChanges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading state ─────────────────────────────────────────────────────
  if (!initialized) {
    return <div className="op-loading-center"><span className="op-spinner" /></div>;
  }

  // Session complete overlay takes over entire screen
  if (approveFlow) {
    return (
      <>
        <SessionComplete flow={approveFlow} onCancelClose={resetApprove} />
        {approveFlow.phase === 'closeFailed' && (
          <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 500 }}>
            <button className="op-btn op-btn-ghost op-btn-sm" onClick={resetApprove}>↺ restart prototype</button>
          </div>
        )}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const isShare = mode === 'share';



  return (
    <div className="op-app">
      {mode === 'hook' && <HookBanner timer={timer} />}

      <TopBar
        onExport={fmt => {
          if (fmt === 'markdown') {
            const md = exportAnnotationsToMarkdown(annotations, plan);
            const a = Object.assign(document.createElement('a'), {
              href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })),
              download: `${slug}-annotations.md`,
            });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
          } else if (fmt === 'json') {
            const a = Object.assign(document.createElement('a'), {
              href: URL.createObjectURL(new Blob([JSON.stringify(annotations, null, 2)], { type: 'application/json' })),
              download: `${slug}-annotations.json`,
            });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
          }
        }}
        onDownload={() => {
          const a = Object.assign(document.createElement('a'), {
            href: URL.createObjectURL(new Blob([plan], { type: 'text/markdown' })),
            download: `${slug}.md`,
          });
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }}
      />

      <div className="op-app-body">
        <OutlineFilesPanel
          plan={plan}
          mode={mode}
          slug={slug}
          dirFiles={dirFiles}
          selectedFile={selectedFile}
          fileAnnotationCounts={fileAnnotationCounts}
          onOpenFile={(fileOrSlug) => {
            if (dirFiles.length > 0) {
              setSelectedFile(fileOrSlug);
            } else {
              pushToast('// file open is a prototype stub');
            }
          }}
        />

        {mode === 'standalone' && dirFiles.length > 0 && !selectedFile ? (
          <EmptyState />
        ) : (
          <PlanEditor
            plan={plan}
            annotations={annotations}
            focusId={focusedAnnotationId}
            onFocusAnnotation={(id) => { setFocusedAnnotation(id); if (id) setPanelOpen(true); }}
            onAddAnnotation={addAnnotation}
            onRemoveAnnotation={removeAnnotation}
          />
        )}

        {panelOpen && (
          <AnnotationsPanel
            annotations={annotations}
            focusId={focusedAnnotationId}
            onFocus={setFocusedAnnotation}
            onEdit={updateAnnotation}
            onRemove={removeAnnotation}
            onClose={() => setPanelOpen(false)}
            onCopyMD={() => {
              const md = exportAnnotationsToMarkdown(annotations, plan);
              navigator.clipboard.writeText(md).then(
                () => pushToast('Annotations copied to clipboard'),
                () => pushToast('Failed to copy to clipboard'),
              );
            }}
          />
        )}
      </div>

      {mode === 'hook' && (
        <ActionBar
          hasEdits={hasEdits}
          annotationsCount={annotations.filter(a => !a.resolved).length}
          onApprove={handleApprove}
          onRequestChanges={() => setShowRequestChanges(true)}
          onAskClaude={handleAskClaude}
        />
      )}

      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          style={{
            position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)',
            writingMode: 'vertical-rl', padding: '12px 6px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRight: 'none',
            borderRadius: '5px 0 0 5px', fontFamily: 'var(--font-mono)', fontSize: 10,
            color: 'var(--text-muted)', cursor: 'pointer',
          }}
        >
          annotations [{annotations.filter(a => !a.resolved).length}]
        </button>
      )}

      {showRequestChanges && (
        <RequestChangesFlyup
          onCancel={() => setShowRequestChanges(false)}
          onSend={(text, includeEdits) => {
            setShowRequestChanges(false);
            handleRequestChanges(text, includeEdits);
          }}
        />
      )}

      {showShare && <ShareDialog onClose={() => setShowShare(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      <UpdateBanner currentVersion={binVersion} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function findLineNumber(planContent: string, selectedText: string): string | null {
  if (!selectedText || !planContent) return null;

  const normalizedPlan = planContent.replace(/\r\n/g, '\n');
  const cleanSelected = selectedText.replace(/\r\n/g, '\n');

  const index = normalizedPlan.indexOf(cleanSelected);
  if (index !== -1) {
    const linesBefore = normalizedPlan.substring(0, index).split('\n');
    const startLine = linesBefore.length;
    const linesSpan = cleanSelected.split('\n').length;
    if (linesSpan > 1) {
      return `lines ${startLine}–${startLine + linesSpan - 1}`;
    }
    return `line ${startLine}`;
  }

  // Fallback to searching line-by-line for prefix
  const prefix = cleanSelected.substring(0, Math.min(30, cleanSelected.length)).trim();
  if (prefix) {
    const lines = normalizedPlan.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(prefix)) {
        const startLine = i + 1;
        const linesSpan = cleanSelected.split('\n').length;
        if (linesSpan > 1) {
          return `lines ${startLine}–${startLine + linesSpan - 1}`;
        }
        return `line ${startLine}`;
      }
    }
  }

  return null;
}

function exportAnnotationsToMarkdown(annotations: Annotation[], planContent: string): string {
  const activeAnns = annotations.filter(a => !a.resolved);
  if (activeAnns.length === 0) {
    return 'No active annotations found.';
  }

  // Sort annotations by their start position (from index) if available, else by createdAt
  const sorted = [...activeAnns].sort((a, b) => {
    if (typeof a.from === 'number' && typeof b.from === 'number') {
      return a.from - b.from;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  let output = `I've reviewed this plan and have ${sorted.length} piece${sorted.length > 1 ? 's' : ''} of feedback:\n\n`;

  sorted.forEach((ann, index) => {
    output += `### ${index + 1}. `;

    const lineLabel = findLineNumber(planContent, ann.selectedText);
    if (lineLabel) {
      output += `(${lineLabel}) `;
    }

    switch (ann.type) {
      case 'deletion':
        output += `Remove this:\n`;
        output += `\`\`\`\n${ann.selectedText}\n\`\`\`\n`;
        output += `> I don't want this in the plan.\n`;
        break;

      case 'suggestion':
        output += `Suggestion on: "${ann.selectedText}"\n`;
        if (ann.suggestion) {
          output += `Proposed change:\n\`\`\`diff\n- ${ann.selectedText}\n+ ${ann.suggestion}\n\`\`\`\n`;
        }
        if (ann.body) {
          output += `> ${ann.body}\n`;
        }
        break;

      case 'comment':
      case 'question':
        output += `${ann.type.charAt(0).toUpperCase() + ann.type.slice(1)} on: "${ann.selectedText}"\n`;
        if (ann.body) {
          output += `> ${ann.body}\n`;
        }
        break;

      case 'emoji':
        output += `Reaction on: "${ann.selectedText}"\n`;
        if (ann.emoji) {
          output += `> Emoji: ${ann.emoji}\n`;
        }
        if (ann.body) {
          output += `> ${ann.body}\n`;
        }
        break;

      default:
        output += `Feedback on: "${ann.selectedText}"\n`;
        if (ann.body) {
          output += `> ${ann.body}\n`;
        }
        break;
    }

    output += '\n';
  });

  return output;
}

function buildDenyPrompt(feedbackText: string, toolName: string = 'ExitPlanMode'): string {
  return `YOUR PLAN WAS NOT APPROVED.

You MUST revise the plan to address ALL of the feedback below before calling ${toolName} again.

Rules:
- Do not resubmit the same plan unchanged.
- Do NOT change the plan title (first # heading) unless the user explicitly asks you to.

${feedbackText}`;
}
