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


**Try it now:** Explore the live demo at **[openplan.smithgajjar.dev](https://openplan.smithgajjar.dev)**. Drag and drop any local markdown file/folder directly into the demo to annotate right into your browser.

---

## What is Openplan?

Openplan hooks into Claude Code's **plan mode** workflow. When Claude finishes planning and triggers `ExitPlanMode`, Openplan intercepts the event, opens the plan in a rich browser UI, and lets you **review, annotate, and version** the plan before sending your approve or deny decision back to Claude Code — all without leaving your terminal.

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

Restart Claude Code and you're ready to go — no manual hook configuration needed.

## Hook Configuration

> **Note:** If you used the **plugin marketplace** (Option 1), hooks are already registered — skip this section.

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


## Usage

| Command | Description |
|---------|-------------|
| `openplan` | Hook mode — reads ExitPlanMode event from stdin, opens browser UI, returns decision |
| `openplan context` | PreToolUse hook — injects additional planning context |
| `openplan serve` | Start the persistent dashboard server |
| `openplan annotate [file\|dir]` | Open a markdown file or directory in the annotation UI |
| `openplan sessions` | List active openplan sessions |

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

### Project Structure

```
openplan/
├── apps/
│   ├── cli/                  # Go CLI (cobra-based)
│   │   ├── cmd/              # Command definitions
│   │   ├── internal/
│   │   │   ├── config/       # Configuration
│   │   │   ├── server/       # HTTP server + API
│   │   │   │   └── ui/dist/  # Embedded UI (build artifact)
│   │   │   └── storage/      # Plan versioning & persistence
│   │   └── main.go           # Entry point
│   ├── ui/                   # React + Vite frontend
│   └── plugin/               # Claude Code plugin
│       ├── hooks/            # Hook definitions (hooks.json)
│       └── skills/           # Skill markdown files
├── packages/                 # Shared React component packages
│   ├── shared/
│   ├── plan-viewer/
│   ├── toolbar/
│   ├── annotations/
│   └── diff-viewer/
├── scripts/
│   └── install.sh            # curl installer
└── .github/workflows/        # CI + Release automation
```

> **Note:** The UI must be built before the CLI — the Go binary embeds `apps/cli/internal/server/ui/dist/` at compile time.

## License

[MIT](LICENSE) © Gajjar Smith
