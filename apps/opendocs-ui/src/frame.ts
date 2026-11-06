// Builds the sandboxed document the same way the Go server does (render.Frame):
// the bridge script and highlight stylesheet are injected at the start of <head>.
// Used only by the hosted web app, where there is no Go server to do it.
import bridgeJS from '../../cli/internal/opendocs/render/bridge.js?raw';
import bridgeCSS from '../../cli/internal/opendocs/render/bridge.css?raw';

export function buildFrame(html: string): string {
  const inject = `<style id="opendocs-bridge-style">${bridgeCSS}</style><script>${bridgeJS}</script>`;
  const m = /<head[\s>]/i.exec(html) ?? /<html[\s>]/i.exec(html);
  if (!m) return inject + html;
  const end = html.indexOf('>', m.index);
  return html.slice(0, end + 1) + inject + html.slice(end + 1);
}
