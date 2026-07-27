# Openplan — Project Guide for AI Assistants

## Architecture

Openplan is a **Go + React monorepo** for interactive plan review inside Claude Code.

```
openplan (root)
├── apps/
│   ├── cli/              → Go CLI (cobra-based, entry: main.go)
│   ├── ui/               → React + Vite main app (Tailwind CSS v4, Zustand)
│   ├── landing-page/     → React + Vite marketing site (vanilla CSS)
│   ├── plugin/           → Claude Code plugin (hooks + slash commands)
│   ├── plugin-copilot/   → GitHub Copilot CLI plugin (hooks.json + plugin.json)
│   ├── plugin-codex/     → Codex CLI hook config (hooks.json only, no plugin manifest format exists)
│   └── plugin-agy/       → Antigravity CLI (agy) plugin (hooks.json + minimal plugin.json)
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

Openplan also integrates with **GitHub Copilot CLI** via its `preToolUse` hook, which fires on
every tool call (there's no dedicated plan-exit event in Copilot CLI): `openplan copilot-plan`
filters for `toolName == "exit_plan_mode"`, reads the plan from Copilot's session-state
`plan.md` (Copilot doesn't pass plan content inline in the hook payload), and returns Copilot's
flat `{permissionDecision, permissionDecisionReason}` shape rather than Claude's
`hookSpecificOutput` wrapper. Each agent's decision format is pluggable via the
`server.DecisionBuilder` interface (`internal/server/server.go`), set per `Server` instance with
`WithDecisionBuilder(...)`.

**Codex CLI** has no plan-exit event at all — `openplan codex-plan` hooks `Stop` (end of every
turn) and re-parses the turn's rollout transcript (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`,
JSONL) to find the latest plan, via `internal/server/codex_session.go`. Silently allows (no
stdout) when the turn didn't produce a plan, so it doesn't pop a browser on every turn. When
Codex re-fires `Stop` after a deny (`stop_hook_active: true`), the plan-diffing logic in
`GetLatestCodexPlan` only surfaces a new decision if the plan actually changed since the last
review — without this the Stop→deny→Stop cycle would loop.

**Antigravity CLI (`agy`)** also has no plan-exit event — plan mode calls the generic
`write_to_file` tool with `ArtifactMetadata.RequestFeedback: true` (verified against a real `agy`
v1.1.7 session; see `internal/server/antigravity_event_test.go` for the captured payload).
`openplan agy-plan` hooks `PreToolUse` matched to `write_to_file` and checks that flag — the
tool name alone isn't enough, since the same tool writes ordinary code files after plan approval.

Known limitation (also verified empirically): after `openplan agy-plan` denies a plan with
feedback, `agy`'s retry doesn't reliably set `RequestFeedback: true` again on the resubmitted
write — observed once with `RequestFeedback: false` on a retry to the same artifact path. When
that happens, `openplan agy-plan` correctly doesn't re-intercept it (per its filter), and review
falls through to `agy`'s own native "artifact to review" prompt instead of reopening openplan's
UI. Deny itself is confirmed correct — the original write is blocked (no file created) and the
model sees the reason — this is only about whether the *second* round is guaranteed to route
through openplan again. Not fixed with a secondary heuristic (e.g. matching the artifact
filename) because the plan filename itself varies between sessions (`hello_world_plan.md` vs.
`implementation_plan.md` observed across two runs).

## CLI Commands

| Command | Description |
|---------|-------------|
| `openplan` | Hook mode — reads stdin event, opens browser, returns decision |
| `openplan context` | PreToolUse hook — outputs additionalContext JSON |
| `openplan serve` | Start persistent dashboard server |
| `openplan annotate [file\|dir]` | Open file/directory in annotation UI |
| `openplan copilot-plan` | Copilot CLI `preToolUse` hook — filters `exit_plan_mode`, opens browser, returns decision |
| `openplan codex-plan` | Codex CLI `Stop` hook — reviews a plan if the turn produced one |
| `openplan agy-plan` | Antigravity CLI `PreToolUse` hook — filters plan-mode `write_to_file` calls |
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
| `cmd/` | Cobra command definitions (`root.go`, `serve.go`, `annotate.go`, `context.go`, `config_cmd.go`, `sessions.go`, `share.go`, `copilot_plan.go`, `codex_plan.go`, `agy_plan.go`) |
| `internal/server/` | HTTP server, API handlers (`server.go`, `serve_server.go`, `share.go`, `hook_event.go`, `copilot_event.go`, `codex_event.go`, `codex_session.go`, `antigravity_event.go`) |
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

### Copilot Plugin (`apps/plugin-copilot/`)

| Path | Purpose |
|------|---------|
| `plugin.json` | Copilot CLI plugin manifest (name, version, `hooks` pointer) |
| `hooks.json` | Copilot CLI hook definition (`preToolUse` → `openplan copilot-plan`) |

### Codex Hook Config (`apps/plugin-codex/`)

| Path | Purpose |
|------|---------|
| `hooks.json` | Codex CLI hook definition (`Stop` → `openplan codex-plan`). No plugin manifest format exists for Codex — this is a reference file users copy manually, matching Codex's own convention. |

### Antigravity Plugin (`apps/plugin-agy/`)

| Path | Purpose |
|------|---------|
| `plugin.json` | Antigravity CLI plugin manifest (only documented field is optional `name`) |
| `hooks.json` | Antigravity CLI hook definition (`PreToolUse` matched to `write_to_file` → `openplan agy-plan`) |

### Other

| Path | Purpose |
|------|---------|
| `.claude-plugin/marketplace.json` | Claude Code plugin marketplace manifest |
| `.github/plugin/marketplace.json` | Copilot CLI plugin marketplace manifest |
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
