---
name: openplan-archive
description: Open the Openplan dashboard in the browser, showing every saved plan across projects. Use when the user wants to browse plan history rather than review one specific plan.
---

# Openplan Archive

Use this skill when the user asks to see their saved plans, plan history, or the Openplan dashboard — for example "show me my past plans" or "open the openplan dashboard."

Run:

```bash
openplan serve
```

Behavior:

1. Launch the command with your shell tool. It starts a local dashboard server and opens it in the browser, showing all saved plans organized by project.
2. The server runs in the background — the command does not block waiting for user action, and there is no output to read back or act on.
3. This is a browse-only action. Once the command has been run, tell the user the dashboard is open and stop; there is nothing further to do in this conversation.
