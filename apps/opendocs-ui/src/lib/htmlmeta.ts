// Titles and plain text from a document's HTML, for the documents home and search.
// DOMParser builds an inert document: scripts in it never run.

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

export function htmlTitle(html: string, fallback: string): string {
  const d = parse(html);
  const t = d.querySelector('h1')?.textContent?.trim() || d.title.trim();
  return t || fallback;
}

export function htmlText(html: string): string {
  const d = parse(html);
  d.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove());
  return (d.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
