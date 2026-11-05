// Package render prepares agent-authored HTML for review: it injects the
// opendocs bridge (and a default highlight style) into the document so the
// reviewer can select text and comment on it. The document is meant to be
// served into a sandboxed iframe (sandbox="allow-scripts", no
// allow-same-origin) by the opendocs-ui host, which keeps it isolated — the
// bridge reaches the host only via postMessage.
//
// The anchoring concept (TextQuoteSelector + offset hint) is ported from
// slashdocs (MIT); see LICENSE.slashdocs in this directory.
package render

import (
	_ "embed"
	"strings"
)

//go:embed bridge.js
var bridgeJS string

// defaultStyle makes highlights visible even when the document ships no CSS for
// them. Scoped to the bridge's class so it cannot clobber document styles.
const defaultStyle = `<style id="opendocs-bridge-style">` +
	`.opendocs-hl{cursor:pointer;border-radius:2px;transition:background .15s;` +
	`background:rgba(167,139,250,.22);border-bottom:2px solid rgba(167,139,250,.75)}` +
	`.opendocs-hl:hover{background:rgba(167,139,250,.34)}` +
	`.opendocs-hl[data-type="question"]{background:rgba(56,189,248,.2);border-bottom-color:rgba(56,189,248,.8)}` +
	`.opendocs-hl[data-type="suggestion"]{background:rgba(45,212,191,.2);border-bottom-color:rgba(45,212,191,.8)}` +
	`.opendocs-hl[data-type="deletion"]{background:rgba(239,68,68,.16);border-bottom:0;text-decoration:line-through;text-decoration-color:rgba(239,68,68,.9)}` +
	`.opendocs-hl[data-status="resolved"]{background:rgba(34,197,94,.12);border-bottom-color:rgba(34,197,94,.5);text-decoration:none}` +
	`.opendocs-hl[data-status="orphaned"]{background:rgba(150,150,150,.18);border-bottom:0}` +
	`html[data-opendocs-theme="dark"]{color-scheme:dark}html[data-opendocs-theme="light"]{color-scheme:light}` +
	`</style>`

// BridgeJS returns the embedded bridge source (used by tests and the server's
// CSP accounting).
func BridgeJS() string { return bridgeJS }

// Frame returns the document HTML with the bridge style and script injected,
// ready to be served into the sandboxed review iframe. The bridge is placed at
// the start of <head> (falling back to <html>, then the doctype, then the very
// front) so it initializes before the document's own scripts can run.
func Frame(userHTML []byte) []byte {
	inject := defaultStyle + "<script>" + bridgeJS + "</script>"
	return []byte(insertAfterOpening(string(userHTML), inject))
}

// insertAfterOpening places inject immediately after the first <head> or <html>
// start tag, else after the doctype, else at the front.
func insertAfterOpening(html, inject string) string {
	lower := strings.ToLower(html)
	for _, tag := range []string{"head", "html"} {
		if end := startTagEnd(lower, tag); end >= 0 {
			return html[:end+1] + inject + html[end+1:]
		}
	}
	if idx := strings.Index(lower, "<!doctype"); idx >= 0 {
		if rel := strings.IndexByte(lower[idx:], '>'); rel >= 0 {
			at := idx + rel + 1
			return html[:at] + inject + html[at:]
		}
	}
	return inject + html
}

// startTagEnd returns the index of the '>' that closes the first "<tag ...>"
// start tag in lowerHTML, or -1. It skips "<tagfoo" false matches by requiring
// the next char to be whitespace or '>'.
func startTagEnd(lowerHTML, tag string) int {
	needle := "<" + tag
	for offset := 0; ; {
		idx := strings.Index(lowerHTML[offset:], needle)
		if idx < 0 {
			return -1
		}
		pos := offset + idx
		after := pos + len(needle)
		if after >= len(lowerHTML) {
			return -1
		}
		c := lowerHTML[after]
		if c == '>' || c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '/' {
			if close := strings.IndexByte(lowerHTML[pos:], '>'); close >= 0 {
				return pos + close
			}
			return -1
		}
		offset = after
	}
}
