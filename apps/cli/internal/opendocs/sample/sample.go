// Package sample embeds a small, well-formed interactive document — the kind of
// HTML an agent is expected to produce (self-contained, light/dark aware, with
// an interactive chart, a checklist and tabs). It is the first-run document in
// the app, the `opendocs demo` command, and the reference the guidelines point at.
package sample

import _ "embed"

//go:embed retry-storm.html
var retryStorm string

// Slug is the document slug the sample is stored under.
const Slug = "retry-storm"

// HTML returns the sample document.
func HTML() string { return retryStorm }
