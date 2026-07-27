---
name: openplan-annotate
description: Open a specific markdown or text file (or a folder of them) in the Openplan annotation UI so the user can mark it up in a browser instead of commenting inline.
---

# Openplan Annotate

Use this skill when the user asks you to open a particular file or folder for annotation/review in Openplan — for example "annotate docs/design.md in openplan" or "let me mark up that plan in the browser."

Determine the file or folder path from the user's request, then run:

```bash
openplan annotate <path> --hook
```

Substitute `<path>` with the file or folder path the user specified (resolve it relative to the current working directory if needed).

Behavior:

1. Launch the command with your shell tool and wait for it to finish. It opens the file in a browser UI where the user can add annotations.
2. If `<path>` is a folder, the UI shows a file browser so the user can pick a file inside it.
3. On close, the command prints the annotations as structured JSON on stdout. Read that JSON and incorporate the feedback into your next steps.

Do not ask the user to run this command themselves — run it yourself and act on the result.
