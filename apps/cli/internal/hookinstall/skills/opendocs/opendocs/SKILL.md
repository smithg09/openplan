---
name: opendocs
description: Use whenever the user mentions opendocs, an opendocs document/comment/share/version, or asks to publish, review, open, search, or update a long-form artifact (report, spec, RCA, plan, analysis) as an interactive HTML document that people can comment on.
---

<!-- Structure adapted from the slashdocs skill (Razorpay, MIT), rewritten for the opendocs CLI. -->

# opendocs

Use this skill for **any opendocs-related task**. If the user mentions opendocs or points at an opendocs asset, use the `opendocs` CLI to inspect or act on it. Don't try to curl or web-fetch an opendocs link — use the CLI.

## First rule: read the guidelines before authoring

Before writing or publishing an opendocs document in a session, run:

```bash
opendocs guidelines
```

Treat that output as the source of truth for authoring constraints (single-file HTML, inline assets, light/dark theme integration, keeping unchanged passages byte-identical so comments stay anchored). Read it and follow it.

## Common workflows

### New long-form artifact

When the user wants a report, RCA, postmortem, spec, review, analysis, launch plan, findings doc, or other long-form artifact and has not asked for another format:

1. Run `opendocs guidelines` if you have not already done so in this session.
2. Write the artifact as a single HTML file that follows those guidelines. Save it locally (for example `report.html`).
3. Ask the user once where it should live, unless they already said:
   - **Local only** — review on this machine.
   - **A proxy** — an opendocs-proxy so other people can comment through links (check `opendocs config proxy` for a saved default).
4. Publish:
   - Local: `opendocs review report.html` opens the review UI and **blocks until the reviewer closes the browser tab**, then prints the open comment threads as JSON on stdout.
   - Proxy: `opendocs publish report.html [--proxy <url>]` prints a **commenter link** and a **viewer link** to share, plus an **editor link — keep that one private**. Give the user the commenter/viewer link.
5. If a proxy is unreachable, say so and offer the local option instead of failing silently.

Return the printed link (or tell the user the review UI is open). Don't ask the user to run the commands — run them yourself.

### Acting on review comments

1. Get the feedback:
   - Local: the `opendocs review` output, or run it again and wait for them to close the tab.
   - Proxy: `opendocs feedback report.html` (prints immediately; does not wait).
2. The JSON lists `open` threads — each has the exact `quote`, the `comment`, an optional `type` (`question`, `suggestion`, `deletion`; comment when absent), an optional `suggestion` (proposed replacement text), and `replies`. `resolved` is only a count.
3. Edit the **existing HTML file** — do not regenerate the document. Change only what each thread needs and leave every other passage byte-identical (a rewritten sentence orphans its comment). Answer questions in your reply to the user, and in the document where it belongs. If you disagree with a comment, say so rather than ignoring it.
4. Publish the next version: `opendocs review report.html` (local) or `opendocs publish report.html --summary "<one change per line>"` (proxy; same links keep working).

Tell the user which threads you addressed and which you did not, and why.

### Updating an existing document

If the user is iterating on an existing document, push a new version instead of creating a duplicate — re-run the same publish/review command on the same file. Include a short `--summary` of what changed, one change per line; version history shows a multi-line summary as a list.

### Opening, browsing and searching

```bash
opendocs open path/to/file.html          # snapshot + open in the browser, returns immediately
opendocs serve                           # dashboard of saved documents
opendocs versions <doc>                  # version history
opendocs restore <doc> <version-id>      # make an old version the new head
opendocs search "launch -draft"          # words must all appear; "quoted phrase"; -word excludes
```

Put flags before a search query (`opendocs search --all-projects beta -outage`) so `-word` isn't read as a flag.

## Setup

Assume the user installed the binary with the installer. If the skills are missing in an agent, run `opendocs install <claude|codex|agy>`. To share beyond this machine, a proxy URL is needed (`opendocs config proxy <url>`); the user runs `opendocs-proxy` themselves.

## When not to publish

Do not publish to opendocs if the user explicitly asks for Markdown, plain text, a PDF, inline chat only, or another destination. If they mention opendocs while asking for one of those formats, still use the CLI when relevant to inspect or reference the opendocs asset, but respect the requested output format.
