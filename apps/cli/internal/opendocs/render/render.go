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
	`.opendocs-hl{background:rgba(47,102,245,.18);border-radius:2px;cursor:pointer;` +
	`box-shadow:0 0 0 1px rgba(47,102,245,.28)}` +
	`.opendocs-hl[data-status="resolved"]{background:rgba(31,157,85,.15);box-shadow:0 0 0 1px rgba(31,157,85,.3)}` +
	`.opendocs-hl[data-status="orphaned"]{background:rgba(150,150,150,.18);box-shadow:none}` +
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
