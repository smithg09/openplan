---
name: opendocs-publish
description: Write a report, spec, analysis, RCA or other long-form artifact as a single self-contained HTML document and put it in opendocs so the user can highlight and comment on the exact words. Use when the user wants a document they can review, or asks you to publish/share one with opendocs.
---

# opendocs — publish a document for review

Use this when the user wants a long-form artifact (report, spec, RCA, postmortem, plan, analysis) that they — or teammates — will review and comment on, and they have not asked for another format (Markdown, PDF, inline chat).

## 1. Read the authoring rules first

```bash
opendocs guidelines
```

Follow them exactly (single file, inline CSS/JS, images as data URIs, real text, keep unchanged passages byte-identical on later versions).

## 2. Write the HTML

Save it in the working directory, e.g. `report.html`. Keep one file per document and reuse the same path for every later version.

## 3. Ask where it should live

Ask the user once, with these options (skip the question if they already said):

1. **Local only** — opens in the user's browser on this machine; nobody else can see it.
2. **A proxy** — a hosted/self-hosted opendocs-proxy, so others can comment via links. Needs a proxy URL; check `opendocs config proxy` for a saved default.

## 4a. Local

```bash
opendocs review report.html
```

This opens the review UI and **blocks until the user clicks "Submit review"**, then prints the open comment threads as JSON on stdout. Read that JSON and follow the `opendocs-review` skill.

## 4b. Proxy

```bash
opendocs publish report.html --proxy <url>
```

It prints a **commenter link** and a **viewer link** to share, plus an **editor link — keep that one private**; do not paste the editor link anywhere the user didn't ask for. Give the user the commenter/viewer link. Run `opendocs publish report.html` again later to add a new version to the same document. If the proxy is unreachable, say so and offer the local option instead of failing silently.

Do not ask the user to run these commands — run them yourself and report the result.
