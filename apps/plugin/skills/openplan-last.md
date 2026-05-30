---
name: openplan-last
description: Annotate the most recent assistant message in the Openplan UI
---

Find the most recent assistant message in the current session log at
`~/.claude/projects/<project-slug>/<session-id>.jsonl` (where project-slug is
derived by replacing non-alphanumeric characters in the current working
directory with `-`). Extract the last text content block from the last
`assistant` message.

Then run:

```bash
openplan annotate "$LAST_ASSISTANT_MESSAGE_FILE" --gate --hook
```

Where `$LAST_ASSISTANT_MESSAGE_FILE` is a temporary file containing the
extracted message content. The `--gate` flag adds Approve/Deny buttons to the
UI. The `--hook` flag formats the output as Claude Code hook-compatible JSON.

The output of the command is injected back into the conversation as structured
feedback for Claude to act on.
