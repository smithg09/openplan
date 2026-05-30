---
name: openplan-annotate
description: Open a file or folder in the Openplan annotation UI
usage: /openplan-annotate <file-or-folder>
---

Run the following shell command, substituting `$ARGUMENTS` with the file or
folder path provided by the user:

```bash
openplan annotate $ARGUMENTS --hook
```

This opens the specified markdown or text file in the Openplan browser UI.
The user can add annotations. On close, the annotations are output as
structured JSON and injected back into the conversation.

If `$ARGUMENTS` is a folder path, a file browser is shown in the UI to
pick a file within that folder.
