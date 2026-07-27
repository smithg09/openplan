---
description: Open a file or folder in the Openplan annotation UI
allowed-tools: shell(openplan:*)
---

Run the following, substituting `$ARGUMENTS` with the file or folder path the
user provided:

## Openplan Annotate

!`openplan annotate $ARGUMENTS --hook`

## Your task

This opens the specified markdown or text file in the Openplan browser UI —
or, if `$ARGUMENTS` is a folder, shows a file browser to pick one inside it.
On close, the annotations are printed as structured JSON above. Read that
JSON and incorporate the feedback into your next steps.
