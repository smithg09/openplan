import React from 'react';
import { Chevron } from './Primitives';
import { slugify } from '@openplan/plan-viewer';
import { IS_GITHUB_PAGES } from '../lib/mode';
import { useStore } from '../store';

const OutlineIcon = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2.5 3h7M2.5 6h5M2.5 9h6" /></svg>;
const FolderIcon = () => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M1.5 3.5h3l1 1h5v5.5h-9z" /></svg>;
const FileIcon = () => <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 1.5h4.5L9.5 3.5v7h-6.5z" /><path d="M7.5 1.5v2h2" /></svg>;

interface OutlineItem {
  level: 1 | 2 | 3;
  text: string;
  id: string;
}

interface FilePlan {
  slug: string;
  title: string;
  project: string;
  status: string;
}

const SAMPLE_FILE_PLANS: FilePlan[] = [
  { slug: 'refactor-db-layer-to-postgres', title: 'Refactor DB Layer to Postgres', project: 'platform-core', status: 'pending' },
  { slug: 'add-auth-middleware', title: 'Add Auth Middleware', project: 'api-gateway', status: 'approved' },
  { slug: 'split-billing-from-monolith', title: 'Split billing from monolith', project: 'platform-core', status: 'approved' },
  { slug: 'websocket-presence-v2', title: 'WebSocket presence v2', project: 'realtime', status: 'denied' },
  { slug: 'delete-legacy-cron', title: 'Delete legacy cron jobs', project: 'platform-core', status: 'approved' },
  { slug: 'ingest-clickhouse', title: 'Ingest events into ClickHouse', project: 'analytics', status: 'pending' },
];

// ── Directory file list (API-driven) ────────────────────────────────────

const DirFilesList: React.FC<{
  files: string[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  fileAnnotationCounts?: Record<string, number>;
}> = ({ files, selectedFile, onSelectFile, fileAnnotationCounts = {} }) => {
  // Group files by directory
  const grouped: Record<string, string[]> = {};
  for (const f of files) {
    const parts = f.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    (grouped[dir] = grouped[dir] ?? []).push(f);
  }
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed(s => ({ ...s, [k]: !s[k] }));

  return (
    <div className="op-files-tree">
      {Object.entries(grouped).map(([dir, dirFiles]) => (
        <React.Fragment key={dir}>
          {dir !== '.' && (
            <button className="op-files-row op-files-folder" onClick={() => toggle(dir)}>
              <Chevron dir={collapsed[dir] ? 'right' : 'down'} size={9} />
              <FolderIcon />
              <span>{dir}/</span>
              {(() => {
                const count = dirFiles.reduce((sum, f) => sum + (fileAnnotationCounts[f] ?? 0), 0);
                return count > 0 ? (
                  <span className="op-files-count" style={{ background: 'var(--border-strong)', borderRadius: '8px', padding: '0 6px', fontSize: '10px', marginLeft: 'auto', color: 'var(--text-primary)' }}>
                    {count}
                  </span>
                ) : (
                  <span className="op-files-count">{dirFiles.length}</span>
                );
              })()}
            </button>
          )}
          {(!collapsed[dir]) && (
            <div className="op-files-children" style={{ paddingLeft: dir !== '.' ? 16 : 0 }}>
              {dirFiles.map(f => {
                const basename = f.split('/').pop() ?? f;
                return (
                  <button
                    key={f}
                    className={`op-files-row op-files-file ${f === selectedFile ? 'is-active' : ''}`}
                    onClick={() => onSelectFile(f)}
                    title={f}
                  >
                    <FileIcon />
                    <span className="op-files-name">{basename}</span>
                    {fileAnnotationCounts[f] > 0 && (
                      <span className="op-files-count" style={{ background: 'var(--accent)', color: 'white', borderRadius: '8px', padding: '0 6px', fontSize: '10px', marginLeft: 'auto' }}>
                        {fileAnnotationCounts[f]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ── Storage plan file tree (original) ───────────────────────────────────

const FilesTree: React.FC<{ currentSlug: string; onOpenFile?: (slug: string) => void }> = ({ currentSlug, onOpenFile }) => {
  const grouped: Record<string, FilePlan[]> = {};
  for (const p of SAMPLE_FILE_PLANS) {
    (grouped[p.project] = grouped[p.project] ?? []).push(p);
  }
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed(s => ({ ...s, [k]: !s[k] }));

  return (
    <div className="op-files-tree">
      <div className="op-files-root">
        <Chevron dir="down" size={9} />
        <FolderIcon />
        <span>~/.openplan</span>
      </div>
      <div className="op-files-children">
        <div className="op-files-row">
          <span style={{ width: 9, display: 'inline-block' }} />
          <FileIcon />
          <span>config.json</span>
        </div>
        <div className="op-files-row">
          <Chevron dir="down" size={9} />
          <FolderIcon />
          <span>plans/</span>
        </div>
        <div className="op-files-children" style={{ paddingLeft: 12 }}>
          {Object.entries(grouped).map(([project, plans]) => (
            <React.Fragment key={project}>
              <button className="op-files-row op-files-folder" onClick={() => toggle(project)}>
                <Chevron dir={collapsed[project] ? 'right' : 'down'} size={9} />
                <FolderIcon />
                <span>{project}/</span>
                <span className="op-files-count">{plans.length}</span>
              </button>
              {!collapsed[project] && (
                <div className="op-files-children" style={{ paddingLeft: 16 }}>
                  {plans.map(p => (
                    <button
                      key={p.slug}
                      className={`op-files-row op-files-file ${p.slug === currentSlug ? 'is-active' : ''}`}
                      onClick={() => onOpenFile?.(p.slug)}
                      title={p.title}
                    >
                      <FileIcon />
                      <span className="op-files-name">{p.slug}.md</span>
                      {p.status === 'pending' && <span className="op-files-dot" style={{ background: 'var(--warning)' }} />}
                    </button>
                  ))}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="op-files-row">
          <span style={{ width: 9, display: 'inline-block' }} />
          <FolderIcon /><span>drafts/</span>
        </div>
        <div className="op-files-row">
          <span style={{ width: 9, display: 'inline-block' }} />
          <FolderIcon /><span>sessions/</span>
        </div>
      </div>
    </div>
  );
};

interface OutlineFilesPanelProps {
  plan: string;
  mode: 'hook' | 'standalone' | 'share';
  slug: string;
  dirFiles?: string[];
  selectedFile?: string | null;
  fileAnnotationCounts?: Record<string, number>;
  onOpenFile?: (slug: string) => void;
}

export const OutlineFilesPanel: React.FC<OutlineFilesPanelProps> = ({ plan, mode, slug, dirFiles = [], selectedFile = null, fileAnnotationCounts = {}, onOpenFile }) => {
  const openLocalDirectory = useStore(state => state.openLocalDirectory);
  const hasDirFiles = mode === 'standalone' && dirFiles.length > 0;
  const showTabs = mode === 'standalone' && (dirFiles.length > 0 || IS_GITHUB_PAGES);
  const [tab, setTab] = React.useState<'outline' | 'files'>(hasDirFiles || IS_GITHUB_PAGES ? 'files' : 'outline');
  const activeTab = showTabs ? tab : 'outline';
  const [activeHeading, setActiveHeading] = React.useState<string | null>(null);

  const outline = React.useMemo<OutlineItem[]>(() => {
    const items: OutlineItem[] = [];
    for (const l of plan.split('\n')) {
      if (l.startsWith('### ')) items.push({ level: 3, text: l.slice(4), id: slugify(l.slice(4)) });
      else if (l.startsWith('## ')) items.push({ level: 2, text: l.slice(3), id: slugify(l.slice(3)) });
      else if (l.startsWith('# ')) items.push({ level: 1, text: l.slice(2), id: slugify(l.slice(2)) });
    }
    return items;
  }, [plan]);

  React.useEffect(() => {
    const planEl = document.querySelector('.op-plan-wrap');
    if (!planEl) return;
    const headings = planEl.querySelectorAll('h1, h2, h3');
    headings.forEach(h => { h.id = 'h-' + slugify(h.textContent ?? ''); });
    const handler = () => {
      let best: Element | null = null;
      let bestTop = -Infinity;
      headings.forEach(h => {
        const rect = h.getBoundingClientRect();
        if (rect.top < 120 && rect.top > bestTop) { bestTop = rect.top; best = h; }
      });
      if (best) setActiveHeading((best as HTMLElement).id.replace('h-', ''));
    };
    handler();
    planEl.addEventListener('scroll', handler);
    return () => planEl.removeEventListener('scroll', handler);
  }, [plan]);

  const scrollToHeading = (id: string) => {
    const el = document.getElementById('h-' + id);
    const planEl = document.querySelector('.op-plan-wrap');
    if (el && planEl) {
      const rect = el.getBoundingClientRect();
      const planRect = planEl.getBoundingClientRect();
      planEl.scrollTo({ top: planEl.scrollTop + rect.top - planRect.top - 24, behavior: 'smooth' });
    }
  };

  return (
    <div className="op-outline">
      {showTabs ? (
        <div className="op-outline-tabs">
          <button className={`op-outline-tab ${activeTab === 'outline' ? 'is-active' : ''}`} onClick={() => setTab('outline')}>
            <OutlineIcon /><span>outline</span>
          </button>
          <button className={`op-outline-tab ${activeTab === 'files' ? 'is-active' : ''}`} onClick={() => setTab('files')}>
            <FolderIcon /><span>files</span>
          </button>
        </div>
      ) : (
        <div className="op-outline-head">
          <OutlineIcon /><span>outline</span>
        </div>
      )}

      {activeTab === 'outline' && (
        <div className="op-outline-list">
          {outline.length === 0 ? (
            <div className="op-outline-empty">// no headings</div>
          ) : (
            outline.map(h => (
              <button
                key={h.id}
                className={`op-outline-item op-outline-h${h.level} ${activeHeading === h.id ? 'is-active' : ''}`}
                onClick={() => scrollToHeading(h.id)}
                title={h.text}
              >
                <span className="op-outline-bar" />
                <span className="op-outline-text">{h.text}</span>
              </button>
            ))
          )}
        </div>
      )}

      {activeTab === 'files' && (
        hasDirFiles ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {IS_GITHUB_PAGES && (
              <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span>Local Files</span>
                <button 
                  onClick={openLocalDirectory} 
                  className="op-btn op-btn-ghost op-btn-sm" 
                  title="Change Directory"
                  style={{ height: '20px', padding: '0 6px', fontSize: '10px' }}
                >
                  <FolderIcon /> Change
                </button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <DirFilesList
                files={dirFiles}
                selectedFile={selectedFile}
                fileAnnotationCounts={fileAnnotationCounts}
                onSelectFile={(path) => onOpenFile?.(path)}
              />
            </div>
          </div>
        ) : IS_GITHUB_PAGES ? (
          <div style={{
            padding: '32px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '12px',
            color: 'var(--text-muted)'
          }}>
            <div style={{ opacity: 0.35 }}>
              <FolderIcon />
            </div>
            <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Open Local Directory</div>
            <div style={{ fontSize: '11px', lineHeight: '1.5', opacity: 0.8 }}>
              Select a local project folder to review its plan markdown files directly in this page.
            </div>
            <button 
              onClick={openLocalDirectory} 
              className="op-btn op-btn-primary op-btn-sm" 
              style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}
            >
              Open Folder
            </button>
          </div>
        ) : (
          <FilesTree currentSlug={slug} onOpenFile={onOpenFile} />
        )
      )}
    </div>
  );
};
