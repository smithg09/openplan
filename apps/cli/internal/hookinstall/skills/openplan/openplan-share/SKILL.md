---
name: openplan-share
description: Generate a shareable browser link for a plan file so collaborators can view and annotate it without installing anything. Use when the user wants to send a plan to someone else.
---

# Openplan Share

Use this skill when the user wants to share a plan file with a collaborator — for example "get me a shareable link for this plan" or "share plan.md with the team."

Determine the plan file path from the user's request, then run:

```bash
openplan share <path>
```

Substitute `<path>` with the file path the user specified.

Behavior:

1. Launch the command with your shell tool and wait for it to finish. It encodes the plan file into a self-contained URL and prints it.
2. Show the user the printed URL. Collaborators can open it in any browser to read the plan and add annotations — no account or installation required.
3. If the command output confirms the link was copied to the clipboard, mention that to the user.
