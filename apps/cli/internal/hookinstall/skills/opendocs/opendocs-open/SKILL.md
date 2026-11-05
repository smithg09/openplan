---
name: opendocs-open
description: Open an existing HTML file in the opendocs viewer so the user can read and comment on it, without writing a new document. Use when the user points at an .html file and wants to review, mark up, or look at it in opendocs.
---

# opendocs — open an existing HTML file

When the user names an existing `.html` file (a report, a mock, a generated page) and wants to look at or comment on it:

```bash
opendocs open <path/to/file.html>
```

This snapshots the file as a version (only if it changed), starts the local server, and opens the browser. It returns right away and does not wait for comments.

- To **wait for their comments** and get them back as JSON, use `opendocs review <path/to/file.html>` instead (see the `opendocs-review` skill).
- To share it with other people, use `opendocs publish <path/to/file.html>` (see `opendocs-publish`).

Resolve relative paths against the current working directory. Run the command yourself; don't ask the user to.
