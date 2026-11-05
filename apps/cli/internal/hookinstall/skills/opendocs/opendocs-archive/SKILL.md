---
name: opendocs-archive
description: Open the opendocs dashboard showing every locally saved document and its versions. Use when the user wants to browse past documents or version history rather than review one specific file.
---

# opendocs — browse saved documents

When the user asks to see their saved opendocs documents, past reviews, or version history:

```bash
opendocs serve
```

This starts the dashboard server and opens it in the browser, listing the documents for the current project. For one document's history in the terminal use `opendocs versions <doc>`; to restore an older version as the new head use `opendocs restore <doc> <version-id>`.

Run the command yourself and tell the user it is open.
