<p align="center">
  <h1 align="center">Openplan</h1>
  <p align="center">
    Interactive plan review for Claude Code - review and annotate plans in a browser.
  </p>
</p>

<p align="center">
  <a href="https://github.com/smithg09/openplan/actions/workflows/ci.yml"><img src="https://github.com/smithg09/openplan/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/smithg09/openplan/releases/latest"><img src="https://img.shields.io/github/v/release/smithg09/openplan?label=release" alt="Latest Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/smithg09/openplan" alt="License"></a>
</p>


![Openplan Demo](assets/openplan_demo.gif)


**Try it now:** Explore the live demo at **[openplan.smithgajjar.dev/app](https://openplan.smithgajjar.dev/app/)**. Drag and drop any local markdown file/folder directly into the demo to annotate right into your browser.

---

## What is Openplan?

Openplan hooks into Claude Code's **plan mode** workflow. When Claude finishes planning and triggers `ExitPlanMode`, Openplan intercepts the event, opens the plan in a browser UI, and lets you **review, annotate, and version** the plan before sending your approve or deny decision back to Claude Code.

## Installation

Install the binary:

```bash
curl -fsSL https://openplan.smithgajjar.dev/install.sh | bash
```

Then register the hooks automatically via the Claude Code plugin marketplace:

```bash
/plugin marketplace add smithg09/openplan
/plugin install openplan@openplan
```

Restart Claude Code and you're ready to go. No manual hook configuration needed.

## Hook Configuration

> **Note:** If you used the **plugin marketplace** (Option 1), hooks are already registered. Skip this section.

For Option 2 or 3, add the following to your `~/.claude/settings.json` (or your project's `.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "EnterPlanMode",
        "hooks": [{ "type": "command", "command": "openplan context", "timeout": 5 }]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [{ "type": "command", "command": "openplan", "timeout": 345600 }]
      }
    ]
  }
}
```

Restart Claude Code. The next time you use plan mode, Openplan will intercept the `ExitPlanMode` event, open the plan in a browser, and return your approve/deny decision to Claude Code.

## GitHub Copilot CLI

Install the binary (same command as above), then register the hooks via Copilot CLI's plugin marketplace:

```
/plugin marketplace add smithg09/openplan
/plugin install openplan-copilot@openplan
```

Restart Copilot CLI. Plan review activates automatically whenever you use plan mode (`Shift+Tab`).

To configure manually instead, create `~/.copilot/hooks/openplan.json` (or `.github/hooks/openplan.json` in your repo):

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      { "type": "command", "bash": "openplan copilot-plan", "timeoutSec": 345600 }
    ]
  }
}
```

Copilot CLI's `preToolUse` hook fires on every tool call; `openplan copilot-plan` filters for `exit_plan_mode` and reads the plan from Copilot's session state, so no matcher config is needed.

## Codex CLI

Install the binary (same command as above), then enable Codex hooks. Codex has no dedicated
plan-exit event, so this uses the `Stop` hook (end of turn) and re-reads the turn's rollout
transcript to find a plan, if one was produced.

Add to `~/.codex/config.toml` (or `<repo>/.codex/config.toml`):

```toml
[features]
hooks = true
```

Then create `~/.codex/hooks.json` (or `<repo>/.codex/hooks.json`):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "openplan codex-plan", "timeout": 345600 }
        ]
      }
    ]
  }
}
```

Notes:
- Codex hooks are experimental and currently disabled on Windows.
- Restart Codex after installing or changing hooks.
- Because this is a `Stop` hook, review opens after Codex finishes rendering the plan for the
  turn, not at a dedicated plan-exit point — `openplan codex-plan` silently allows the turn
  through on any turn that didn't produce a plan, so it won't open a browser on ordinary turns.
- If Codex runs as a desktop app (e.g. embedded in ChatGPT.app) rather than from your shell, the
  spawned hook process may not inherit your shell `PATH` — use an absolute path to `openplan` in
  `hooks.json` if `openplan codex-plan` isn't found.

## Antigravity CLI (`agy`)

Install the binary (same command as above). Antigravity has no dedicated plan-approval tool
either — plan mode calls the generic `write_to_file` tool with `ArtifactMetadata.RequestFeedback`
set, so `openplan agy-plan` filters on that flag rather than a tool name alone.

Create `.agents/hooks.json` in your workspace (or `~/.gemini/config/hooks.json` globally):

```json
{
  "openplan": {
    "PreToolUse": [
      {
        "matcher": "write_to_file",
        "hooks": [
          { "type": "command", "command": "openplan agy-plan", "timeout": 345600 }
        ]
      }
    ]
  }
}
```

`apps/plugin-agy/` ships the same config as a plugin directory (`plugin.json` + `hooks.json`) for
`agy plugin install`, but that install path hasn't been verified yet — use the manual
`.agents/hooks.json` config above until it has.


## Usage

| Command | Description |
|---------|-------------|
| `openplan` | Hook mode: reads ExitPlanMode event from stdin, opens browser UI, returns decision |
| `openplan context` | PreToolUse hook: injects additional planning context |
| `openplan annotate [file\|dir]` | Open a markdown file or directory in the annotation UI |
| `openplan copilot-plan` | Copilot CLI preToolUse hook: intercepts `exit_plan_mode`, opens browser UI, returns decision |
| `openplan codex-plan` | Codex CLI Stop hook: reviews a plan if the turn produced one |
| `openplan agy-plan` | Antigravity CLI preToolUse hook: intercepts plan-mode `write_to_file` calls |
| `openplan share <file>` | Generate a shareable browser link for any plan |
| `openplan serve` | Start the persistent dashboard server |
| `openplan sessions` | List active openplan sessions |

## Sharing Plans

`openplan share` generates a self-contained URL that encodes the full plan content. Recipients can open the link in any browser to read the plan and add annotations — no account or installation required.

```bash
openplan share my-plan.md
```

```
  ✓ Share link generated

  https://openplan.smithgajjar.dev/app#share?hash=...

  Send this link to collaborators — they can view the plan and
  add annotations directly in the browser. No account required.
```

The link is also copied to your clipboard automatically.

You can also share from agent chat using the `/openplan-share` skill:

```
/openplan-share path/to/plan.md
```

The URL is entirely self-contained — all plan data is encoded directly in the link using gzip compression. No server stores your content.

## Storage

All data lives under `~/.openplan/`:

| Path | Contents |
|------|----------|
| `~/.openplan/plans/<project>/<plan>/` | Plan versions (`v1.md`, `v2.md`, …) and metadata |
| `~/.openplan/config.json` | Settings (created on first run with defaults) |
| `~/.openplan/sessions/` | Active session tracking |
| `~/.openplan/hooks/` | Custom hook scripts (e.g. `improve-context.md`) |

## Contributing

### Prerequisites

- [Go](https://go.dev/) 1.23+
- [Bun](https://bun.sh/)
- Git

### Local Development

```bash
# Clone and install
git clone https://github.com/smithg09/openplan.git
cd openplan
bun install

# Build everything
bun run build:ui     # Vite UI → apps/cli/internal/server/ui/dist/
bun run build:cli    # Go binary → bin/openplan

# Or build both at once
bun run build

# Run the CLI
./bin/openplan --version
```

### Development Workflow

```bash
# Start UI dev server (with Vite HMR + proxy to :7432)
bun run dev:ui

# In another terminal, run the CLI server on :7432
./bin/openplan serve

# Run type checking
bun run typecheck
```

> **Note:** The UI must be built before the CLI. The Go binary embeds `apps/cli/internal/server/ui/dist/` at compile time.

## License

[MIT](LICENSE) © Gajjar Smith
