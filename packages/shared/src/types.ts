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

export interface HighlightMeta {
  parentTagName: string;
  parentIndex: number;
  textOffset: number;
}

export interface Annotation {
  id: string;
  type: AnnotationType;
  selectedText: string;
  from: number;
  to: number;
  startMeta?: HighlightMeta;
  endMeta?: HighlightMeta;
  body?: string;
  emoji?: string;
  suggestion?: string;
  color?: string;
  author: string;
  createdAt: string;
  resolved: boolean;
  // ── opendocs / richer-comment fields (all optional; openplan ignores them) ──
  /** Quote-based anchor (W3C TextQuote/TextPosition). Preferred over startMeta/endMeta for HTML docs. */
  anchor?: CommentAnchor;
  /** Version this annotation was first created on (opendocs immutable versioning). */
  createdOnVersion?: number;
  /** Threaded replies (doc-scoped comment model). */
  replies?: CommentReply[];
  /** Emoji reactions aggregated by emoji. */
  reactions?: CommentReaction[];
  /** True once edited after creation. */
  edited?: boolean;
  /** Timestamp the annotation was resolved (companion to `resolved`). */
  resolvedAt?: string;
}

/**
 * Quote-based comment anchor — the slashdocs / W3C Web Annotation wire shape.
 * `quote`+`prefix`+`suffix` → TextQuoteSelector (re-anchors across versions);
 * `startOffset`/`endOffset` → TextPositionSelector (char offsets into body textContent).
 */
export interface CommentAnchor {
  quote: string;
  prefix?: string;
  suffix?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface CommentAuthor {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface CommentReaction {
  emoji: string;
  count: number;
  /** Whether the current viewer has reacted with this emoji. */
  reactedByMe?: boolean;
  reactors?: string[];
}

export interface CommentReply {
  id: string;
  body: string;
  author: string;
  createdAt: string;
  edited?: boolean;
  reactions?: CommentReaction[];
}

// ── opendocs document model (HTML docs; doc-scoped comments) ─────────────────

export interface DocVersion {
  /** Stable id (e.g. content hash or ULID). */
  id: string;
  number: number;
  /** Parent version id, for lineage. */
  parentId?: string;
  contentHash: string;
  createdAt: string;
  label?: string;
  /** Short "what changed" summary. */
  summary?: string;
}

export interface DocComment {
  id: string;
  /** Document-scoped; carries the version it was authored on. */
  createdOnVersionId: string;
  anchor: CommentAnchor;
  body: string;
  author: CommentAuthor;
  createdAt: string;
  status: 'open' | 'resolved';
  resolvedAt?: string;
  edited?: boolean;
  /** null/undefined = top-level; otherwise the thread root id. */
  rootCommentId?: string;
  replies?: DocComment[];
  reactions?: CommentReaction[];
  /** True when the anchor could not be re-matched in the viewed version. */
  orphaned?: boolean;
}

export interface DocMeta {
  id: string;
  slug: string;
  title: string;
  projectSlug?: string;
  createdAt: string;
  updatedAt: string;
  currentVersionId: string;
  totalVersions: number;
  labels?: string[];
  folderId?: string;
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

export interface SharePayload {
  version: 1;
  title: string;
  plan: string;
  annotations: Annotation[];
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
