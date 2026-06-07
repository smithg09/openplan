# Openplan — Project Guide for AI Assistants

## Architecture

Openplan is a **Go + React monorepo** for interactive plan review inside Claude Code.

```
openplan (root)
├── apps/
│   ├── cli/              → Go CLI (cobra-based, entry: main.go)
│   ├── ui/               → React + Vite main app (Tailwind CSS v4, Zustand)
│   ├── landing-page/     → React + Vite marketing site (vanilla CSS)
│   └── plugin/           → Claude Code plugin (hooks + slash commands)
├── packages/             → Shared React component packages
│   ├── shared/
│   ├── plan-viewer/
│   ├── toolbar/
│   ├── annotations/
│   └── diff-viewer/
├── scripts/              → install.sh (curl installer)
└── .github/workflows/    → CI, release, GitHub Pages deploy
```

### How It Works

1. The Vite UI (`apps/ui`) is built to `apps/cli/internal/server/ui/dist/`
2. The Go CLI embeds that `dist/` directory at compile time
3. When invoked via Claude Code hooks, the CLI starts a local HTTP server, serves the embedded UI, and opens the browser
4. The user reviews/annotates the plan in the browser, then approves or denies
5. The decision is returned to Claude Code via stdout JSON

### App Modes

- **Hook mode** (`apps/ui`) — the main review app, served by the Go CLI via embedded `dist/`
- **Demo mode** (`apps/ui`) — same app, built with `VITE_GITHUB_PAGES=true`, deployed to `/app/` on GitHub Pages. Supports drag-and-drop of local markdown files
- **Landing page** (`apps/landing-page`) — marketing site deployed to root of GitHub Pages (vanilla CSS, no Tailwind)

## Build Commands

```bash
bun install                  # Install all workspace dependencies
bun run build:ui             # Build main UI → apps/cli/internal/server/ui/dist/
bun run build:landing        # Build landing page → apps/landing-page/dist/
bun run build:cli            # Build Go binary → bin/openplan
bun run build                # Build UI + CLI (UI first, then CLI)
bun run dev:ui               # Vite dev server for main UI (port 5173, proxies /api → :7432)
bun run dev:landing          # Vite dev server for landing page (port 5174)
bun run typecheck            # TypeScript type checking (via Turbo)
bun run lint                 # Lint (via Turbo)
bun run test:cli             # Go tests
bun run test:coverage:cli    # Go tests with coverage
```

> **Important:** UI must be built before CLI — Go embeds `apps/cli/internal/server/ui/dist/`.

## Hook Flow

Openplan integrates with Claude Code via two hooks:

- **PreToolUse** (`EnterPlanMode`) → runs `openplan context` → injects additional planning context
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

## Plugin Slash Commands

Defined in `apps/plugin/commands/`:

| Command | File |
|---------|------|
| `/openplan` | `openplan.md` |
| `/openplan-annotate` | `openplan-annotate.md` |
| `/openplan-archive` | `openplan-archive.md` |
| `/openplan-last` | `openplan-last.md` |

## Important Paths

### Go CLI (`apps/cli/`)

| Path | Purpose |
|------|---------|
| `cmd/` | Cobra command definitions (`root.go`, `serve.go`, `annotate.go`, `context.go`, `config_cmd.go`, `sessions.go`, `share.go`) |
| `internal/server/` | HTTP server, API handlers (`server.go`, `serve_server.go`, `share.go`, `hook_event.go`) |
| `internal/storage/` | Plan versioning & persistence |
| `internal/config/` | Configuration management |
| `internal/server/ui/dist/` | Embedded UI build output (gitignored) |

### Main UI (`apps/ui/`)

| Path | Purpose |
|------|---------|
| `src/App.tsx` | Main application component |
| `src/store.ts` | Zustand state management |
| `src/components/` | TopBar, OutlineFilesPanel, SettingsPanel, ShareDialog, etc. |
| `src/hooks/` | Custom React hooks (e.g. `useAutoClose`) |
| `src/lib/` | Utilities (`mode.ts`, `theme.ts`) |
| `src/styles/tokens.css` | Design tokens |

### Landing Page (`apps/landing-page/`)

| Path | Purpose |
|------|---------|
| `src/components/` | Hero, Nav, FeaturesSection, DemoSection, PageAnnotator, etc. |
| `src/tokens.css` | Design tokens (separate from main UI) |
| `src/icons.tsx` | SVG icon components |

### Plugin (`apps/plugin/`)

| Path | Purpose |
|------|---------|
| `hooks/hooks.json` | Claude Code hook definitions |
| `commands/` | Slash command markdown files |

### Other

| Path | Purpose |
|------|---------|
| `.claude-plugin/marketplace.json` | Claude Code plugin marketplace manifest |
| `scripts/install.sh` | Curl-based binary installer |
| `~/.openplan/` | User data directory (plans, config, sessions, hooks) |

## CI/CD & Deployment

### GitHub Actions (`.github/workflows/`)

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | CI checks |
| `release.yml` | Binary releases |
| `pages.yml` | GitHub Pages deploy (landing + demo app) |

### GitHub Pages Deploy (`pages.yml`)

Deploys to `openplan.smithgajjar.dev`:

```
_site/
├── *              → Landing page (apps/landing-page/dist/)
├── app/           → Demo app (apps/cli/internal/server/ui/dist/, built with VITE_GITHUB_PAGES=true)
└── install.sh     → Binary installer script
```

## Key Conventions

- The root `package.json` is a private workspace root — never published to npm
- The distributable is the Go binary, not an npm package
- Version is injected at build time via `-ldflags "-X main.version=..."`
- Lock file is `bun.lock` (not `bun.lockb`)
- Workspaces: `apps/*` and `packages/*`, managed via Bun + Turbo
- Main UI uses **Tailwind CSS v4** (`@tailwindcss/vite`); landing page uses **vanilla CSS**
- Both UI apps resolve shared packages via Vite `resolve.alias` pointing to source (`src/index.ts`)
