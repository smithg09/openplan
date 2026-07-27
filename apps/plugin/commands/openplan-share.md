---
name: openplan-share
description: Generate a shareable browser link for a plan file so collaborators can view and annotate it without installing anything
usage: /openplan-share <file>
---

Run the following shell command, substituting `$ARGUMENTS` with the file path provided by the user:

```bash
openplan share $ARGUMENTS
```

This encodes the plan file into a self-contained URL. Share the printed link
with collaborators — they can open it in any browser to read the plan and add
annotations. No account or installation required.

After running, show the user the generated URL and let them know it has been
copied to their clipboard (if the command confirms so).
