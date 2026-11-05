import type { ApiComment } from '../api';

export function download(filename: string, data: BlobPart, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TYPE_LABEL: Record<string, string> = { comment: 'Comment', question: 'Question', suggestion: 'Suggestion', deletion: 'Delete', emoji: 'Reaction' };

/** Comments as Markdown: open threads first, each with the quoted text. */
export function commentsToMarkdown(title: string, comments: ApiComment[]): string {
  const roots = comments.filter((c) => !c.rootCommentId);
  const replies = (id: string) => comments.filter((c) => c.rootCommentId === id);
  const out: string[] = [`# Review comments — ${title}`, ''];
  const block = (c: ApiComment) => {
    const label = TYPE_LABEL[c.type ?? 'comment'] ?? 'Comment';
    const lines = [`### ${label}${c.author ? ` — ${c.author}` : ''}${c.status === 'resolved' ? ' (resolved)' : ''}`];
    if (c.anchor?.quote) lines.push(`> ${c.anchor.quote.replace(/\n+/g, ' ')}`);
    if (c.type === 'deletion') lines.push('_Remove this text._');
    if (c.suggestion) lines.push(`**Suggested:** ${c.suggestion}`);
    if (c.body) lines.push('', c.body);
    for (const r of replies(c.id)) lines.push('', `- **${r.author || 'Reply'}:** ${r.body}`);
    return lines.join('\n');
  };
  const open = roots.filter((c) => c.status !== 'resolved');
  const done = roots.filter((c) => c.status === 'resolved');
  if (open.length) out.push('## Open', '', ...open.map(block).flatMap((b) => [b, '']));
  if (done.length) out.push('## Resolved', '', ...done.map(block).flatMap((b) => [b, '']));
  if (!roots.length) out.push('_No comments._');
  return out.join('\n').trimEnd() + '\n';
}

export function commentsToJSON(comments: ApiComment[]): string {
  return JSON.stringify(comments.map(({ mine: _m, ...c }) => c), null, 2) + '\n';
}
