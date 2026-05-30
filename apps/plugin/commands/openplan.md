---
name: openplan
description: Open the last plan-mode output in the Openplan review UI
---

Run the following shell command and inject the output into the conversation:

```bash
openplan annotate-last --hook
```

This opens the most recent plan in the Openplan browser UI. The user can annotate, approve, or request changes. The result is injected back as structured feedback.
