// Open a folder of HTML files with the File System Access API (Chromium).
// Files are read in the browser and imported into the local opendocs store as
// versions; nothing is uploaded anywhere else.

export interface LocalFile { path: string; handle: FileSystemFileHandle }
export interface LocalFolder { name: string; files: LocalFile[] }

interface DirHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterable<FileSystemHandle>;
}

export const fsAccessSupported = (): boolean => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);
const MAX_FILES = 500;
const MAX_DEPTH = 6;

async function walk(dir: DirHandle, prefix: string, depth: number, out: LocalFile[]): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  for await (const entry of dir.values()) {
    if (out.length >= MAX_FILES) return;
    if (entry.kind === 'directory') {
      if (!SKIP.has(entry.name) && !entry.name.startsWith('.')) await walk(entry as DirHandle, `${prefix}${entry.name}/`, depth + 1, out);
    } else if (/\.html?$/i.test(entry.name)) {
      out.push({ path: prefix + entry.name, handle: entry as FileSystemFileHandle });
    }
  }
}

export async function pickFolder(): Promise<LocalFolder | null> {
  try {
    const dir = (await (window as unknown as { showDirectoryPicker: () => Promise<DirHandle> }).showDirectoryPicker());
    const files: LocalFile[] = [];
    await walk(dir, '', 0, files);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { name: dir.name, files };
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') return null;
    throw e;
  }
}

export async function readFile(f: LocalFile): Promise<string> {
  return (await f.handle.getFile()).text();
}

/** Same slug rule as the Go store (lowercase, non-alphanumerics → "-"). */
export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'document';
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
