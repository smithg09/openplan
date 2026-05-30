export interface Plan {
  slug: string;
  projectSlug: string;
  title: string;
  content: string;
  version: number;
}

export interface Version {
  number: number;
  path: string;
  createdAt: string;
}

export interface PlanMeta {
  slug: string;
  title: string;
  projectSlug: string;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'approved' | 'denied';
  currentVersion: number;
  totalVersions: number;
}

export interface Settings {
  autoSaveOnApprove: boolean;
  defaultSaveDestination: string;
  autoCloseDelay: '0' | '3' | 'off';
  browser: string;
  theme: 'light' | 'dark' | 'system';
  port: number;
  servePort: number;
}

export interface HookEvent {
  hook_event_name: string;
  session_id: string;
  tool_name: string;
  tool_input: {
    plan: string;
    [key: string]: unknown;
  };
  cwd: string;
}

export interface DecisionApprove {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest';
    decision: {
      behavior: 'allow';
    };
  };
}

export interface DecisionDeny {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest';
    decision: {
      behavior: 'deny';
      message: string;
    };
  };
}

export type Decision = DecisionApprove | DecisionDeny;

export interface PlanApiResponse {
  plan: string;
  slug: string;
  projectSlug: string;
  version: number;
}

export interface ConfigApiResponse {
  mode: 'hook' | 'serve' | 'annotate-dir';
  autoCloseDelay: '0' | '3' | 'off';
  theme: string;
}

export interface ApproveRequest {
  ok: boolean;
}

export interface DenyRequest {
  message: string;
}

export type AnnotationType =
  | 'comment'
  | 'question'
  | 'emoji'
  | 'deletion'
  | 'suggestion';

export interface Annotation {
  id: string;
  type: AnnotationType;
  selectedText: string;
  from: number;
  to: number;
  body?: string;
  emoji?: string;
  suggestion?: string;
  color?: string;
  author: string;
  createdAt: string;
  resolved: boolean;
}

export interface AnnotationEventDetail {
  selectedText: string;
  from: number;
  to: number;
  body?: string;
  emoji?: string;
  suggestion?: string;
  color?: string;
}

export interface DraftState {
  planSlug: string;
  content: string;
  annotations: Annotation[];
  savedAt: string;
}

export interface VersionMeta {
  number: number;
  createdAt: string;
  label?: string;
}

export interface AnnotationsFile {
  version: number;
  annotations: Annotation[];
}

export interface ProjectSummary {
  projectSlug: string;
  plans: PlanMeta[];
}

export interface SessionRecord {
  pid: number;
  port: number;
  url: string;
  mode: 'plan' | 'annotate' | 'archive';
  project: string;
  startedAt: string;
  label: string;
}
