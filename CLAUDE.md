# Openplan — Project Guide for AI Assistants

## Architecture

Openplan is a **Go + React monorepo** CLI tool for interactive plan review inside Claude Code.

```
openplan (root)
├── apps/cli/         → Go CLI (cobra-based, entry: main.go)
├── apps/ui/          → React + Vite frontend (Tailwind CSS)
├── apps/plugin/      → Claude Code plugin (hooks + commands)
└── packages/         → Shared React component packages
    ├── shared/
    ├── plan-viewer/
    ├── toolbar/
    ├── annotations/
    └── diff-viewer/
```

**How it works:**
1. The Vite UI is built to `apps/cli/internal/server/ui/dist/`
2. The Go CLI embeds that `dist/` directory at compile time
3. When invoked via Claude Code hooks, the CLI starts a local HTTP server, serves the embedded UI, and opens the browser
4. The user reviews/annotates the plan in the browser, then approves or denies
5. The decision is returned to Claude Code via stdout JSON

## Build Commands

```bash
bun install                # Install all workspace dependencies
bun run build:ui           # Build Vite UI → apps/cli/internal/server/ui/dist/
bun run build:cli          # Build Go binary → bin/openplan
bun run build              # Build both (UI first, then CLI)
bun run dev:ui             # Start Vite dev server (proxies /api to :7432)
bun run typecheck          # Run TypeScript type checking
```

> **Important:** UI must be built before CLI — Go embeds `apps/cli/internal/server/ui/dist/`.

## Hook Flow

Openplan integrates with Claude Code via two hooks:

- **PreToolUse** (`EnterPlanMode`) → runs `openplan context` → injects additional context
- **PermissionRequest** (`ExitPlanMode`) → runs `openplan` → opens browser UI, blocks until approve/deny

The hook reads a JSON event from stdin, processes the plan content, and returns a decision via stdout.

## CLI Commands

| Command | Description |
|---------|-------------|
| `openplan` | Hook mode — reads stdin event, opens browser, returns decision |
| `openplan context` | PreToolUse hook — outputs additionalContext JSON |
| `openplan serve` | Start persistent dashboard server |
| `openplan annotate [file\|dir]` | Open file/directory in annotation UI |
| `openplan sessions` | List active openplan sessions |
| `openplan config` | Open settings UI in browser |
| `openplan share <file>` | Share a plan via URL |

## Important Paths

- `apps/cli/cmd/` — Cobra command definitions
- `apps/cli/internal/server/` — HTTP server + API handlers
- `apps/cli/internal/storage/` — Plan versioning & persistence
- `apps/cli/internal/config/` — Configuration management
- `apps/cli/internal/server/ui/dist/` — Embedded UI build output (gitignored)
- `apps/plugin/hooks/hooks.json` — Claude Code hook definitions
- `apps/plugin/commands/` — Slash command markdown files
- `~/.openplan/` — User data directory (plans, config, sessions)

## Key Conventions

- The root `package.json` is a private workspace root — never published to npm
- The distributable is the Go binary, not an npm package
- Version is injected at build time via `-ldflags "-X main.version=..."`
- Lock file is `bun.lock` (not `bun.lockb`)
