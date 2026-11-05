# Writing an opendocs document

opendocs renders a **single self-contained HTML file** for a person to review: they highlight exact
words and comment, you read the comments, then you publish the next version. Follow these rules so
the document renders and so comments keep pointing at the right words across versions.

## Hard requirements

- **One file.** Inline all CSS in `<style>` and all JS in `<script>`. No external stylesheets,
  scripts, fonts or CDN links — the document is shown in a sandbox and must work offline.
- **Images are data URIs** (`data:image/svg+xml;base64,…`, `data:image/png;base64,…`) or inline `<svg>`.
  Keep the whole file under ~4 MB.
- **A full document**: `<!doctype html>`, `<html lang>`, `<head>` with `<meta charset>` and a real
  `<title>`, then `<body>`.
- **No network, storage or navigation.** The page runs in an opaque-origin sandbox: `fetch` to other
  origins, cookies, `localStorage`/`sessionStorage`, `window.top` navigation, popups and forms that
  submit all fail. Don't depend on them. Anchor links (`#section`) work.

## Make it good to review

- **Real text, real structure.** Use headings (`h1`–`h3`), paragraphs, lists and tables. Reviewers
  select text, so avoid putting prose in images or canvas. Charts should be inline SVG with `<text>`
  labels, or have the key numbers also stated in prose.
- **Responsive and theme-aware.** Readable at ~700px wide (the document pane is narrow next to the
  comment rail). The app tells your page whether it is shown in light or dark mode by setting
  `data-theme="dark"|"light"` (and a matching `dark`/`light` class) on `<html>`, plus `color-scheme`.
  Style both: put your palette in CSS variables and override them under `html[data-theme="dark"]`
  (also add `@media (prefers-color-scheme: dark)` as a fallback). Always set both `color` and `background`.
- **Lead with the answer.** Put the conclusion and the decisions you need first; details after.
- **Plain, specific claims** that a reviewer can agree or disagree with — those are what get comments.

## Keep comments anchored across versions

Comments attach to the *quoted words*. When you publish v2:

- **Leave unchanged passages byte-identical.** Don't re-flow, re-word or re-order text you weren't
  asked to change. A comment on a sentence you rewrote becomes "orphaned" and the reviewer must redo it.
- **Change only what the comments ask for**, plus anything they make necessary. Say what changed in
  the version `--summary`, one change per line.
- Don't regenerate the whole document from scratch to apply a small edit — edit the previous HTML.

## Workflow

```
opendocs review report.html      # local: opens the UI, blocks until the reviewer clicks Submit,
                                 # prints open comment threads as JSON on stdout
opendocs publish report.html     # shared: uploads to a proxy, prints viewer/commenter links
opendocs feedback report.html    # shared: prints the open comment threads as JSON (no blocking)
```

After reading the comments, edit the HTML, then run the same command again — it adds a new version.
Resolved threads are only counted; address every thread in `open`.
