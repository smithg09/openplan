---
name: opendocs-review
description: Read the user's comments on an opendocs document and publish the next version addressing them. Use when the user says they've commented/reviewed a document, asks you to "address the comments", or after `opendocs review` returns feedback.
---

# opendocs — act on review comments

## Get the comments

- **Local review** (the document was opened with `opendocs review`): the command already printed the feedback as JSON when the user clicked Submit. If you need it again, run `opendocs review <file.html>` and wait for them to submit.
- **Published to a proxy**: run `opendocs feedback <file.html>` — it prints the current feedback immediately as JSON (it does not wait).

The JSON looks like:

```json
{ "doc": "…", "versionId": "…", "resolved": 2,
  "open": [ { "id": "…", "author": "Priya", "quote": "the exact words commented on",
              "comment": "what they said", "replies": [ { "author": "…", "comment": "…" } ] } ] }
```

`open` is what you must act on. `resolved` is only a count.

## Address every open thread

1. Go through `open` one by one. `quote` is the exact text the comment is attached to.
2. Edit the **existing HTML file** — do not regenerate the document. Change only what each comment needs; **leave every other passage byte-identical** so the remaining comments stay anchored (a rewritten sentence orphans its comment).
3. If a comment is a question rather than a change request, answer it in your reply to the user and, where it belongs, in the document.
4. If you disagree with a comment, say so to the user rather than silently ignoring it.

## Publish the next version

- Local: run `opendocs review <file.html>` again (it snapshots the new version and reopens review).
- Proxy: `opendocs publish <file.html> --summary "<one change per line>"` — this adds a version to the same document; the same links keep working.

Tell the user briefly which threads you addressed and which you did not (and why).
