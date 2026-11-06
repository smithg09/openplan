// Adapts opendocs' flat, doc-scoped comment list (ApiComment) into the shape
// AnnoCard renders (@openplan/shared Annotation), grouping replies under their
// thread root.

import type { Annotation, CommentReply, CommentReaction } from '@openplan/shared';
import type { ApiComment, ApiReaction } from './api';

export interface Thread {
  root: ApiComment;
  replies: ApiComment[];
}

/** Group a flat comment list into threads (roots + their replies). */
export function buildThreads(comments: ApiComment[]): Thread[] {
  const roots = comments.filter((c) => !c.rootCommentId);
  const byRoot = new Map<string, ApiComment[]>();
  for (const c of comments) {
    if (c.rootCommentId) {
      const arr = byRoot.get(c.rootCommentId) ?? [];
      arr.push(c);
      byRoot.set(c.rootCommentId, arr);
    }
  }
  return roots.map((root) => ({
    root,
    replies: (byRoot.get(root.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));
}

function mapReactions(reactions: ApiReaction[] | undefined, me: string): CommentReaction[] {
  return (reactions ?? []).map((r) => ({
    emoji: r.emoji,
    count: r.users.length,
    reactedByMe: r.users.includes(me),
    reactors: r.users,
  }));
}

function mapReplies(replies: ApiComment[], me: string): CommentReply[] {
  return replies.map((r) => ({
    id: r.id,
    body: r.body,
    author: r.author || 'You',
    createdAt: r.createdAt,
    edited: r.edited,
    reactions: mapReactions(r.reactions, me),
  }));
}

/** Convert a thread into the Annotation AnnoCard expects. */
export function threadToAnnotation(t: Thread, me: string): Annotation {
  const c = t.root;
  return {
    id: c.id,
    type: c.type ?? 'comment',
    suggestion: c.suggestion,
    selectedText: c.anchor?.quote ?? '',
    from: 0,
    to: 0,
    body: c.body,
    author: c.author || 'You',
    createdAt: c.createdAt,
    resolved: c.status === 'resolved',
    edited: c.edited,
    anchor: c.anchor
      ? {
          quote: c.anchor.quote,
          prefix: c.anchor.prefix,
          suffix: c.anchor.suffix,
          startOffset: c.anchor.start,
          endOffset: c.anchor.end,
        }
      : undefined,
    replies: mapReplies(t.replies, me),
    reactions: mapReactions(c.reactions, me),
  };
}

const AUTHOR_KEY = 'opendocs:author';

export function localAuthor(): string {
  try {
    return localStorage.getItem(AUTHOR_KEY) || 'You';
  } catch {
    return 'You';
  }
}

export function setLocalAuthor(name: string): void {
  try {
    localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    /* ignore */
  }
}
