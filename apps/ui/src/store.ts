import { create } from 'zustand';
import type { Annotation, AnnotationType } from '@openplan/shared';
import { getMode, getInitialPlan, getInitialMeta, type AppMode } from './lib/mode';
import type { Theme } from './lib/theme';

export interface ApproveFlow {
  phase: 'submitting' | 'countdown' | 'closeFailed';
  countdown: number;
  decision: 'approve' | 'changes' | 'annotations' | string;
  mode?: string;
  savedTo?: string[];
  body?: string;
}

export interface VersionMeta {
  version: number;
  label?: string;
  source: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'denied' | 'superseded' | 'current';
  annotations: number;
}

interface AppState {
  mode: AppMode;
  plan: string;
  slug: string;
  project: string;
  version: number;
  pid: number;
  title: string;
  annotations: Annotation[];
  focusedAnnotationId: string | null;
  hasEdits: boolean;
  savedAgo: number;
  panelOpen: boolean;
  theme: Theme;
  accent: string;
  approveFlow: ApproveFlow | null;
  toasts: Array<{ id: string; text: string }>;
  versions: VersionMeta[];

  // API-driven state
  initialized: boolean;
  loading: boolean;
  dirFiles: string[];
  selectedFile: string | null;
  fileAnnotationCounts: Record<string, number>;
  autoCloseDelay: string;

  // Local file system access (GitHub Pages mode)
  localDirHandle: any;
  localFileHandles: Record<string, any>;
  openLocalDirectory: () => Promise<void>;

  // Actions
  setTheme: (theme: Theme) => void;
  setAccent: (accent: string) => void;
  setPlanContent: (content: string) => void;
  markEdited: () => void;
  tickSavedAgo: () => void;
  addAnnotation: (ann: Omit<Annotation, 'id' | 'createdAt' | 'resolved'>) => void;
  resolveAnnotation: (id: string) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, body: string) => void;
  setFocusedAnnotation: (id: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  startApprove: (mode?: string) => void;
  startSend: (kind: string, body?: string) => void;
  tickCountdown: () => void;
  finishCountdown: () => void;
  resetApprove: () => void;
  pushToast: (text: string) => void;
  dismissToast: (id: string) => void;

  // API-driven actions
  initializeFromAPI: (data: {
    mode?: AppMode;
    plan?: string;
    slug?: string;
    project?: string;
    title?: string;
    version?: number;
    annotations?: Annotation[];
    versions?: VersionMeta[];
    dirFiles?: string[];
    fileAnnotationCounts?: Record<string, number>;
    autoCloseDelay?: string;
  }) => void;
  setSelectedFile: (path: string) => void;
  setLoading: (loading: boolean) => void;
}

async function scanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  path = ''
): Promise<{ files: string[]; handles: Record<string, FileSystemFileHandle> }> {
  let files: string[] = [];
  let handles: Record<string, FileSystemFileHandle> = {};

  for await (const entry of dirHandle.values()) {
    const relativePath = path ? `${path}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') {
      if (['node_modules', '.git', '.openplan', 'dist', 'build', '.next', '.turbo', 'vendor'].includes(entry.name)) {
        continue;
      }
      const sub = await scanDirectory(entry, relativePath);
      files = files.concat(sub.files);
      handles = { ...handles, ...sub.handles };
    } else if (entry.kind === 'file') {
      if (entry.name.endsWith('.md')) {
        files.push(relativePath);
        handles[relativePath] = entry;
      }
    }
  }
  return { files, handles };
}

function derivePlanSlug(content: string): string {
  const lines = content.split('\n').slice(0, 10);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      const title = trimmed.replace(/^#+\s*/, '').trim();
      if (title) {
        return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      }
    }
  }
  return `plan-${Math.floor(Date.now() / 1000)}`;
}

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '')
    .join(' ');
}

const meta = getInitialMeta();

export const useStore = create<AppState>((set, get) => ({
  mode: getMode(),
  plan: getInitialPlan(),
  slug: meta.slug,
  project: meta.project,
  version: meta.version,
  pid: meta.pid,
  title: meta.title,
  annotations: [],
  focusedAnnotationId: null,
  hasEdits: false,
  savedAgo: 0,
  panelOpen: true,
  theme: 'dark',
  accent: '#0067bc',
  approveFlow: null,
  toasts: [],
  versions: [],

  // API-driven state
  initialized: false,
  loading: false,
  dirFiles: [],
  selectedFile: null,
  fileAnnotationCounts: {},
  autoCloseDelay: '3',

  // Local file system access (GitHub Pages mode)
  localDirHandle: null,
  localFileHandles: {},

  setTheme: (theme) => set({ theme }),
  setAccent: (accent) => set({ accent }),
  setPlanContent: (plan) => set({ plan }),
  markEdited: () => set({ hasEdits: true, savedAgo: 0 }),
  tickSavedAgo: () => set(s => ({ savedAgo: s.savedAgo + 1 })),

  addAnnotation: (ann) => {
    const id = 'ann_' + Math.random().toString(36).slice(2, 8);
    const newAnn: Annotation = {
      ...ann,
      id,
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    set(s => {
      const newAnns = [newAnn, ...s.annotations];
      const newCounts = { ...s.fileAnnotationCounts };
      if (s.selectedFile) {
        newCounts[s.selectedFile] = newAnns.length;
      }
      return { annotations: newAnns, fileAnnotationCounts: newCounts };
    });
    get().pushToast(`+ ${ann.type} added`);
  },

  resolveAnnotation: (id) => {
    set(s => ({
      annotations: s.annotations.map(a =>
        a.id === id ? { ...a, resolved: !a.resolved } : a
      ),
    }));
  },

  removeAnnotation: (id) => {
    set(s => {
      const newAnns = s.annotations.filter(a => a.id !== id);
      const newCounts = { ...s.fileAnnotationCounts };
      if (s.selectedFile) {
        newCounts[s.selectedFile] = newAnns.length;
      }
      return { annotations: newAnns, fileAnnotationCounts: newCounts };
    });
    get().pushToast('annotation removed');
  },

  updateAnnotation: (id, body) => {
    set(s => ({
      annotations: s.annotations.map(a => a.id === id ? { ...a, body } : a),
    }));
  },

  setFocusedAnnotation: (id) => set({ focusedAnnotationId: id }),
  setPanelOpen: (open) => set({ panelOpen: open }),

  startApprove: (mode = 'default') => {
    const savedTo = [`~/.openplan/plans/${get().project}/${get().slug}/v${get().version + 1}.md`];
    set({ approveFlow: { phase: 'submitting', countdown: 3, decision: 'approve', mode, savedTo } });
    setTimeout(() => {
      set(s => s.approveFlow ? { approveFlow: { ...s.approveFlow, phase: 'countdown', countdown: 3 } } : {});
    }, 900);
  },

  startSend: (kind, body) => {
    set({ approveFlow: { phase: 'submitting', countdown: 3, decision: kind, body, savedTo: [] } });
    setTimeout(() => {
      set(s => s.approveFlow ? { approveFlow: { ...s.approveFlow, phase: 'countdown', countdown: 3 } } : {});
    }, 900);
  },

  tickCountdown: () => {
    const flow = get().approveFlow;
    if (!flow || flow.phase !== 'countdown') return;
    if (flow.countdown <= 0) {
      setTimeout(() => {
        set(s => s.approveFlow ? { approveFlow: { ...s.approveFlow, phase: 'closeFailed' } } : {});
      }, 300);
      return;
    }
    set(s => s.approveFlow ? { approveFlow: { ...s.approveFlow, countdown: s.approveFlow.countdown - 1 } } : {});
  },

  finishCountdown: () => {
    set(s => s.approveFlow ? { approveFlow: { ...s.approveFlow, phase: 'closeFailed' } } : {});
  },

  resetApprove: () => {
    set({
      approveFlow: null,
      hasEdits: false,
      savedAgo: 0,
    });
  },

  pushToast: (text) => {
    const id = Math.random().toString(36).slice(2, 8);
    set(s => ({ toasts: [...s.toasts, { id, text }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 3200);
  },

  dismissToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  // API-driven actions
  initializeFromAPI: (data) => {
    set({
      initialized: true,
      loading: false,
      mode: data.mode ?? getMode(),
      plan: data.plan ?? getInitialPlan(),
      slug: data.slug ?? meta.slug,
      project: data.project ?? meta.project,
      title: data.title ?? meta.title,
      version: data.version ?? meta.version,
      annotations: data.annotations ?? [],
      versions: data.versions ?? [],
      dirFiles: data.dirFiles ?? [],
      fileAnnotationCounts: data.fileAnnotationCounts ?? get().fileAnnotationCounts,
      autoCloseDelay: data.autoCloseDelay ?? '3',
    });
  },

  setSelectedFile: async (path) => {
    set({ selectedFile: path });
    const localHandles = get().localFileHandles;
    if (localHandles && localHandles[path]) {
      try {
        const handle = localHandles[path];
        const file = await handle.getFile();
        const content = await file.text();

        // Load annotations and draft from localStorage
        const annoKey = `openplan:annotations:${path}`;
        const savedAnno = localStorage.getItem(annoKey);
        const annotations = savedAnno ? JSON.parse(savedAnno) : [];

        const draftKey = `openplan:draft:${path}`;
        const savedDraft = localStorage.getItem(draftKey);

        // Derive slug and title
        const slug = derivePlanSlug(content);
        const title = slugToTitle(slug);

        set({
          plan: savedDraft || content,
          slug,
          title,
          version: 1,
          annotations,
          versions: [
            {
              version: 1,
              timestamp: new Date(file.lastModified).toISOString(),
              source: 'local',
              status: 'current',
              annotations: annotations.length,
              label: 'current',
            }
          ],
        });
      } catch (err) {
        console.error("Failed to load local file", err);
        get().pushToast("Failed to load local file");
      }
    }
  },
  openLocalDirectory: async () => {
    try {
      if (!window.showDirectoryPicker) {
        get().pushToast("File System Access API is not supported in this browser.");
        return;
      }
      const dirHandle = await window.showDirectoryPicker();
      get().setLoading(true);
      const { files, handles } = await scanDirectory(dirHandle);
      
      // Calculate annotation counts for all files from localStorage
      const counts: Record<string, number> = {};
      for (const f of files) {
        const annoKey = `openplan:annotations:${f}`;
        const savedAnno = localStorage.getItem(annoKey);
        if (savedAnno) {
          try {
            counts[f] = JSON.parse(savedAnno).length;
          } catch {
            counts[f] = 0;
          }
        }
      }

      set({
        localDirHandle: dirHandle,
        localFileHandles: handles,
        dirFiles: files,
        fileAnnotationCounts: counts,
        selectedFile: null,
      });
      get().pushToast(`Opened directory: ${dirHandle.name}`);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        get().pushToast("Failed to open local directory");
      }
    } finally {
      get().setLoading(false);
    }
  },
  setLoading: (loading) => set({ loading }),
}));
