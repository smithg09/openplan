import React from 'react';
import { Button, Chevron, Icon } from './ui';
import type { LocalFolder } from '../lib/localfs';

export interface Heading { id: string; level: number; text: string; top: number }

interface Props {
  mode: 'local' | 'proxy';
  docs: string[];
  currentDoc: string;
  headings: Heading[];
  scrollTop: number;
  folder: LocalFolder | null;
  fsSupported: boolean;
  openCounts: Record<string, number>;
  onOpenDoc: (slug: string) => void;
  onHeading: (id: string) => void;
  onPickFolder: () => void;
  onOpenLocalFile: (path: string) => void;
  importing: string | null;
}

export const LeftPanel: React.FC<Props> = (p) => {
  const showFiles = p.mode === 'local';
  const [tab, setTab] = React.useState<'outline' | 'files'>(showFiles ? 'files' : 'outline');
  const active = showFiles ? tab : 'outline';
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});

  // Highlight the heading nearest above the viewport top.
  const activeHeading = React.useMemo(() => {
    let best: Heading | null = null;
    for (const h of p.headings) if (h.top <= p.scrollTop + 96) best = h;
    return best?.id ?? p.headings[0]?.id ?? null;
  }, [p.headings, p.scrollTop]);

  const grouped = React.useMemo(() => {
    const g: Record<string, { path: string; name: string }[]> = {};
    for (const f of p.folder?.files ?? []) {
      const i = f.path.lastIndexOf('/');
      const dir = i < 0 ? '.' : f.path.slice(0, i);
      (g[dir] = g[dir] ?? []).push({ path: f.path, name: i < 0 ? f.path : f.path.slice(i + 1) });
    }
    return g;
  }, [p.folder]);

  return (
    <div className="op-outline">
      {showFiles ? (
        <div className="op-outline-tabs">
          <button className={`op-outline-tab ${active === 'outline' ? 'is-active' : ''}`} onClick={() => setTab('outline')}><Icon name="format_list_bulleted" size={14} /><span>outline</span></button>
          <button className={`op-outline-tab ${active === 'files' ? 'is-active' : ''}`} onClick={() => setTab('files')}><Icon name="folder" size={14} /><span>files</span></button>
        </div>
      ) : (
        <div className="op-outline-head"><Icon name="format_list_bulleted" size={14} /><span>outline</span></div>
      )}

      {active === 'outline' && (
        <div className="op-outline-list">
          {p.headings.length === 0 ? (
            <div className="op-outline-empty">// no headings in this document</div>
          ) : p.headings.map((h) => (
            <button key={h.id} className={`op-outline-item op-outline-h${Math.min(h.level, 3)} ${activeHeading === h.id ? 'is-active' : ''}`} onClick={() => p.onHeading(h.id)} title={h.text}>
              <span className="op-outline-bar" /><span className="op-outline-text">{h.text}</span>
            </button>
          ))}
        </div>
      )}

      {active === 'files' && (
        <div className="op-files-tree">
          <div className="od-files-label">documents</div>
          {p.docs.length === 0 && <div className="op-outline-empty" style={{ padding: '6px 6px 12px' }}>// none yet — open a folder below or run <code>opendocs open file.html</code></div>}
          {p.docs.map((d) => (
            <button key={d} className={`op-files-row op-files-file ${d === p.currentDoc ? 'is-active' : ''}`} onClick={() => p.onOpenDoc(d)} title={d}>
              <Icon name="description" size={13} /><span className="op-files-name">{d}</span>
              {(p.openCounts[d] ?? 0) > 0 && <span className="op-files-count">{p.openCounts[d]}</span>}
            </button>
          ))}

          <div className="od-files-label" style={{ marginTop: 14 }}>local folder</div>
          {!p.folder ? (
            <div className="od-folder-empty">
              <Icon name="folder_open" size={22} />
              <div>Open a folder of HTML files from your machine and review them here.</div>
              {p.fsSupported
                ? <Button kind="primary" size="sm" style={{ width: '100%', justifyContent: 'center' }} onClick={p.onPickFolder}>Open folder</Button>
                : <div className="op-faint" style={{ fontSize: 10.5 }}>This browser can’t open folders (use Chrome, Edge or Arc) — or run <code>opendocs open file.html</code>.</div>}
            </div>
          ) : (
            <>
              <div className="op-files-row" style={{ color: 'var(--text-primary)' }}>
                <Icon name="folder_open" size={14} /><span className="op-files-name">{p.folder.name}/</span>
                <Button size="sm" kind="ghost" title="Choose another folder" onClick={p.onPickFolder} style={{ height: 20, padding: '0 6px', fontSize: 10 }}>change</Button>
              </div>
              {p.folder.files.length === 0 && <div className="op-outline-empty" style={{ padding: '6px 6px' }}>// no .html files found</div>}
              {Object.entries(grouped).map(([dir, files]) => (
                <React.Fragment key={dir}>
                  {dir !== '.' && (
                    <button className="op-files-row op-files-folder" onClick={() => setCollapsed((s) => ({ ...s, [dir]: !s[dir] }))}>
                      <Chevron dir={collapsed[dir] ? 'right' : 'down'} size={9} /><Icon name="folder" size={13} /><span className="op-files-name">{dir}/</span>
                    </button>
                  )}
                  {!collapsed[dir] && (
                    <div className="op-files-children" style={dir === '.' ? { paddingLeft: 0 } : undefined}>
                      {files.map((f) => (
                        <button key={f.path} className="op-files-row op-files-file" onClick={() => p.onOpenLocalFile(f.path)} title={f.path} disabled={p.importing === f.path}>
                          <Icon name="description" size={13} /><span className="op-files-name">{f.name}</span>
                          {p.importing === f.path && <span className="op-files-count">…</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
