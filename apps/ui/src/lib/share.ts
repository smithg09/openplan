import type { Annotation } from '@openplan/shared';

export interface SharePayload {
  version: 1;
  title: string;
  plan: string;
  annotations: Annotation[];
}

export async function encodeSharePayload(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(compressed)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#share?hash=${b64}`;
}

export async function decodeSharePayload(hash: string): Promise<SharePayload> {
  const b64 = new URLSearchParams(hash.slice(hash.indexOf('?'))).get('hash') ?? '';
  const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const decompressed = await new Response(ds.readable).arrayBuffer();
  const json = new TextDecoder().decode(decompressed);
  return JSON.parse(json) as SharePayload;
}

export function isShareHash(hash: string): boolean {
  return hash.startsWith('#share?hash=');
}
