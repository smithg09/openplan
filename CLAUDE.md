# Openplan — Project Guide for AI Assistants

## Architecture

Openplan is a **Go + React monorepo** for interactive plan review inside Claude Code.

```
openplan (root)
├── apps/
│   ├── cli/              → Go CLI (cobra-based, entry: main.go)
│   ├── ui/               → React + Vite main app (Tailwind CSS v4, Zustand)
│   ├── opendocs-ui/      → React + Vite host UI for the `opendocs` binary (plain CSS + tokens, no Tailwind)
│   ├── landing-page/     → React + Vite marketing site (vanilla CSS)
│   ├── plugin/           → Claude Code plugin (hooks + slash commands)
│   ├── plugin-copilot/   → GitHub Copilot CLI plugin (hooks.json + plugin.json + commands/)
│   ├── plugin-codex/     → Codex CLI hook config (hooks.json only — skills ship via `openplan install codex`, not this folder)
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
bun run build:opendocs-ui    # Build opendocs host UI → apps/cli/internal/opendocs/server/ui/dist/
bun run build:opendocs       # Build Go binary → bin/opendocs
bun run build:docs           # opendocs UI + binary (UI first)
bun run dev:opendocs-ui      # Vite dev server for opendocs UI (proxies /api → :7433; run `opendocs serve --port 7433`)
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

**Automated install for Codex and Antigravity**: unlike Claude Code and Copilot CLI (which
register hooks via their own `/plugin marketplace add` + `/plugin install` flow), Codex and `agy`
don't have an install path openplan can drive through the target CLI's own installer with
confidence — Codex hooks require toggling `[features] hooks = true` in `config.toml`, a step
outside any plugin package's scope, and `agy plugin install <dir>` was never verified to actually
wire up `hooks.json` (see `apps/plugin-agy/`'s README note). `openplan install codex` and
`openplan install agy` (`internal/hookinstall/`) close that gap by writing the config directly:
narrow, purpose-built patchers (not general TOML/JSON parsers) that merge into existing
`config.toml`/`hooks.json` — preserving unrelated hooks, plugins, and settings — rather than
requiring users to hand-edit those files. Idempotent; safe to re-run. Verified against copies of
this machine's real `~/.codex/config.toml` and `~/.codex/hooks.json` (which already had an
unrelated `plannotator` `Stop` hook installed) and a synthetic multi-hook-group `agy` config.

`openplan install codex` and `openplan install agy` also write the equivalent of
`apps/plugin/commands/` (minus `/openplan` and `/openplan-last`, see below) as `SKILL.md` files, via
`hookinstall.WriteSkills` (`internal/hookinstall/skills.go`), which writes out the content
embedded from `internal/hookinstall/skills/openplan/` — one shared, agent-agnostic source since
both targets just need "run this openplan subcommand and act on its output." Codex: writes to
`~/.codex/skills/<name>/SKILL.md` (`.codex/skills/` with `--local`) — Codex scans that directory
at session startup. Antigravity: writes to `~/.gemini/skills/<name>/SKILL.md`, **always the
global path regardless of `--local`** — empirically, `agy` does not discover skills from a
project-local `.agents/skills/` or `.gemini/skills/` without `--add-dir`, so there's no repo-scoped
option here (confirmed by placing a probe `SKILL.md` in both locations and asking a live `agy`
session to list its skills; only the `~/.gemini/skills/` copy showed up). Idempotent: re-running
only rewrites a skill file if its content actually changed.

One more `agy`-specific finding worth preserving: `agy plugin install <dir>` on a plugin
containing a `commands/` directory does copy those files and reports them as "converted to
skills" — but a live `agy` session does **not** actually list them among its available skills
(verified with a throwaway probe plugin containing both a `skills/test-skill/SKILL.md`, which
*was* listed, and a `commands/probe-cmd.md`, which was not). Don't ship `agy` support via a
`commands/` directory for this reason — use `skills/`, which is what `WriteSkills` does.

## CLI Commands

| Command | Description |
|---------|-------------|
| `openplan` | Hook mode — reads stdin event, opens browser, returns decision |
| `openplan install <codex\|agy>` | Merge required hooks into that agent's config and write its skills (`--local` for repo-scoped hooks; skills are always global for `agy`) |
| `openplan context` | PreToolUse hook — outputs additionalContext JSON |
| `openplan serve` | Start persistent dashboard server |
| `openplan annotate [file\|dir]` | Open file/directory in annotation UI |
| `openplan copilot-plan` | Copilot CLI `preToolUse` hook — filters `exit_plan_mode`, opens browser, returns decision |
| `openplan codex-plan` | Codex CLI `Stop` hook — reviews a plan if the turn produced one |
| `openplan agy-plan` | Antigravity CLI `PreToolUse` hook — filters plan-mode `write_to_file` calls |
| `openplan sessions` | List active openplan sessions |
| `openplan config` | Open settings UI in browser |
| `openplan share <file>` | Share a plan via URL |

## Plugin Slash Commands / Skills

Three workflows — annotate a file, browse the plan archive, share a plan — are shipped to every
supported agent, each in that agent's own native format. Two commands are Claude-only and were
*not* ported:

- `/openplan-last` reads Claude's session transcript at
  `~/.claude/projects/<slug>/<session>.jsonl`, a Claude-specific path with no equivalent verified
  for the other agents (see the Hook Flow section above for how each agent's *plan discovery*
  differs — Codex/`agy` already solve "find the current plan" their own way, just not "find and
  annotate an arbitrary past assistant message").
- `/openplan` invokes `openplan annotate-last --hook`, but `annotate-last` **is not a real CLI
  subcommand** — it has never existed in this repo's history (`cmd/` has no `annotate_last.go`,
  and running it errors with "unknown command"). This is a pre-existing bug in
  `apps/plugin/commands/openplan.md`, discovered while porting these commands to the other agents;
  left as-is and not fixed here since the correct fix requires designing what "annotate the last
  plan" should actually resolve to (there's no "latest plan" lookup anywhere in
  `internal/storage/` today). Do not port `/openplan` to a new agent without fixing this first.

**Claude Code** — defined in `apps/plugin/commands/`, Claude's own slash-command format:

| Command | File | Ported to other agents? |
|---------|------|--------------------------|
| `/openplan` | `openplan.md` | No — broken, see above |
| `/openplan-annotate` | `openplan-annotate.md` | Yes |
| `/openplan-archive` | `openplan-archive.md` | Yes |
| `/openplan-last` | `openplan-last.md` | No — Claude-specific transcript path |
| `/openplan-share` | `openplan-share.md` | Yes |

**Copilot CLI** — defined in `apps/plugin-copilot/commands/`, registered via `plugin.json`'s
`"commands": "commands/"` field. Copilot's command format: frontmatter `description` +
`allowed-tools: shell(openplan:*)`, body uses `` !`cmd` `` inline-exec and `$ARGUMENTS` — mirrors
the real, installed `plannotator-copilot` plugin found on this machine at
`~/.copilot/installed-plugins/plannotator/plannotator-copilot/commands/`, which was used as the
empirically-verified reference for this format. Verified end-to-end against the real `copilot`
binary via `copilot --plugin-dir apps/plugin-copilot -p "/openplan-archive"` (with
`--allow-all-tools`; without it, tool calls are denied outright in non-interactive `-p` mode — the
real `plannotator-review` reference plugin was confirmed to behave identically, so this isn't
specific to openplan's `allowed-tools` matcher).

**Codex CLI and Antigravity (`agy`)** — not shipped as static files in `apps/plugin-codex/` or
`apps/plugin-agy/` (no marketplace exists for either, and `apps/plugin-agy/`'s own `commands/`
support was empirically found unreliable — see above). Instead written directly by
`openplan install codex` / `openplan install agy` as `SKILL.md` files — see "Automated install"
above for the exact paths and the source of truth in `internal/hookinstall/skills/`.

## opendocs (sibling binary)

`opendocs` reviews rich **HTML documents** (agents publish self-contained HTML, people comment on
the exact words, every version is kept), local-first. It is a **second `main` in the same Go module**
(`apps/cli/cmd/opendocs/`) — not a separate module, because Go's `internal/` rule forbids a
separate module from importing `apps/cli/internal/*`. It ships as its own release artifact
(`opendocs_<os>_<arch>.tar.gz`); `scripts/install.sh` takes `opendocs` as its first arg.

| Command | Description |
|---------|-------------|
| `opendocs open <file.html>` | Snapshot the file if changed, start the local server, open the browser |
| `opendocs review <file.html>` | Like `open`, but blocks until the reviewer clicks **Submit review**, then prints open threads as JSON on stdout (status goes to stderr) |
| `opendocs serve` | Project dashboard server |
| `opendocs create <file.html>` / `versions <doc>` / `comments <doc>` / `restore <doc> <version-id>` | Store-backed CLI |

Package layout (`apps/cli/internal/opendocs/`):

- `store/` — content-addressed immutable versions under `~/.opendocs/docs/<project>/<doc>/`
  (`versions/<sha256>.html`, `versions.json` manifest with parent chain, doc-scoped `comments.json`).
  Atomic temp+rename writes; `expectedHead` gives If-Match optimistic concurrency (`ErrConflict`).
- `render/` — embeds `bridge.js` and injects it at the top of `<head>`. Hand-written vanilla JS on
  purpose (no bundler in the Go build). Anchoring is a port of slashdocs' TextQuoteSelector idea
  (MIT — `LICENSE.slashdocs` kept alongside).
- `server/` — same-origin `net/http` (Go 1.22 method patterns); `GET .../versions/{id}/frame` returns
  bridge-injected HTML; embeds `ui/dist` with `//go:embed all:ui/dist` and a **force-tracked
  `.gitkeep`** so `go build`/`go test` work before the UI is built (assets stay gitignored).

**Sandbox model (important):** the doc renders in `<iframe sandbox="allow-scripts">` with **no
`allow-same-origin`** (opaque origin, can't reach the API/cookies). The bridge runs *inside* the
iframe and talks to the host only via `postMessage`; the host filters by
`event.source === iframe.contentWindow` (origin is `"null"`).

Hardening around that (all in `internal/opendocs/server`, each with tests):

- `/frame` refuses top-level navigation (`Sec-Fetch-Dest` other than `iframe` → 403) and sends
  `X-Frame-Options: SAMEORIGIN`. Otherwise opening the frame URL directly would run the agent's HTML
  same-origin with the API.
- **All mutating `/api/` requests must be `Content-Type: application/json`** (else 415) and are capped
  at 5 MB. Untrusted doc scripts or other sites could otherwise send a `text/plain` "simple" CORS
  request (no preflight) that the handlers would decode as JSON. The UI client sends it on every
  non-GET, including body-less ones.
- An explicit `--port` that is taken is an error (no silent fallback to a random port).
- `Store.Doc()` handles share a per-doc lock held in the `Store`; handles are created per request,
  so a lock inside the handle would protect nothing. In-process only — a separate CLI process writing
  the same dir is not coordinated.

**`opendocs-proxy` (third binary, `apps/cli/cmd/opendocs-proxy/`)** is the self-hostable multi-tenant
server — same module, own release tarball (`opendocs-proxy_<os>_<arch>.tar.gz`), serves the same embedded
opendocs-ui. Built with `server.NewProxy(...)`; the local server (`server.New`) is unchanged and acts as an editor.

- **Capability links, no accounts.** `POST /api/docs` mints an opaque doc id + editor token (the only
  unauthenticated write). Editors mint viewer/commenter/editor tokens via `POST .../shares`. Tokens are
  256-bit, sent as `Authorization: Bearer`, **only their sha256 is stored** (`auth/`). The proxy has no
  "list all docs" endpoint; an unknown doc and a bad token both return 401 so ids can't be probed.
- **Role matrix** (`auth.Role.Can`, pinned in `auth_test.go`): viewer reads; commenter also comments,
  replies, reacts, resolves; editor also publishes/restores versions, shares, deletes any comment.
  Edit is author-only for everyone (even editors). Each comment records `Owner` (token hash), which is
  stripped from API responses and replaced by a per-caller `mine` flag.
- **Frame URLs are signed, never tokened.** The iframe can't send headers and the doc's script can read its
  own URL, so `GET .../versions/{id}/frame-url` (viewer+) returns an HMAC-signed, 5-minute, doc+version-scoped
  `?sig=`. `/frame` in proxy mode accepts only that. Share links carry the token in the URL **fragment**
  (`/d/<id>#t=<token>`); the UI moves it to `sessionStorage` and strips it from the address bar.
- **Storage:** `--store sqlite` (default), `postgres` (`--database-url` / `$DATABASE_URL`) or `fs`.
  `internal/opendocs/sqlstore` is one dialect-aware implementation for SQLite (pure-Go `modernc.org/sqlite`,
  pinned v1.44.0 because newer releases force `go 1.26`) and Postgres (`pgx` stdlib); all backends pass
  `store/storetest` (Postgres gated on `OPENDOCS_TEST_PG_DSN`; CI runs it against a postgres:16 service).
  **Drivers are imported only by the proxy** (check: `go list -deps ./cmd/opendocs . | grep -cE 'modernc|pgx'`
  must be 0). For sqlite/postgres, **capability grants live in the DB too** (`sqlstore.Grants()`), so an
  ephemeral-disk host keeps share links across deploys; `fs` uses `grants.json`. Signing key: `$OPENDOCS_SIGNING_KEY`
  or `--data/signing.key`.
- **Abuse limits** (`server/limits.go`, `server.WithLimits`): per-IP token buckets (new docs/hour, other
  writes/min), per-doc version/comment/comment-length quotas (413), `--trust-proxy` reads the *last*
  X-Forwarded-For hop. `GET /healthz`. `PORT` and `OPENDOCS_DATA` env are honoured.
- **Hosted deploy:** `Dockerfile.opendocs-proxy` + `render.yaml` (Render web service + Postgres; not yet
  deployed — needs the user's Render account). `apps/opendocs-site/` is a static site for Cloudflare Pages
  (`.github/workflows/opendocs-site.yml`, needs `CLOUDFLARE_*` secrets and repo var `OPENDOCS_SITE_ENABLED=true`)
  including `/open/#proxy=<https url>&doc=<id>&t=<token>`, a deep-link interstitial that shows the
  destination host and never auto-redirects (fragment keeps the token off servers; https or localhost only).
  Render's free Postgres expires after ~30 days — use a paid/Neon/Supabase DB for anything lasting.
- Not done yet: TLS termination in the binary (use a reverse proxy / the host's), folders/labels/search,
  the proxy-URL settings + local→hosted resolution chain in the CLI.

**Rendering finding (verified):** Claude's preview pane blocks the *network request* of a sandboxed
(opaque-origin) iframe with `net::ERR_BLOCKED_BY_CLIENT`; same URL in a non-sandboxed or
`allow-same-origin` iframe loads, and `srcdoc` works. So opendocs-ui `fetch()`es the frame HTML and sets it
as the iframe's `srcdoc` (sandbox `allow-scripts` only). `/frame` therefore accepts `Sec-Fetch-Dest`
`empty`/`iframe`/absent and refuses everything else (e.g. `document`). Still no
`Content-Security-Policy: sandbox` header (untested in stock Chromium).

**Gotchas:** the API/store anchor uses `start`/`end`; the shared `CommentAnchor` uses
`startOffset`/`endOffset` — conversion lives only in `apps/opendocs-ui/src/adapt.ts`. opendocs-ui
reuses `AnnoCard` via that adapter but **not** `CommentRail` (it is coupled to same-document
`[data-bind-id]` marks and can't see inside the iframe). opendocs-ui builds into
`apps/cli/internal/opendocs/server/ui/dist` with `emptyOutDir: false` — never point it near
openplan's `internal/server/ui/dist` (that would wipe openplan's UI). UI must be built before the Go
binary, same as openplan.

## Important Paths

### Go CLI (`apps/cli/`)

| Path | Purpose |
|------|---------|
| `cmd/` | Cobra command definitions (`root.go`, `serve.go`, `annotate.go`, `context.go`, `config_cmd.go`, `sessions.go`, `share.go`, `copilot_plan.go`, `codex_plan.go`, `agy_plan.go`, `install.go`) |
| `internal/server/` | HTTP server, API handlers (`server.go`, `serve_server.go`, `share.go`, `hook_event.go`, `copilot_event.go`, `codex_event.go`, `codex_session.go`, `antigravity_event.go`) |
| `internal/hookinstall/` | Patchers for `openplan install` — merge hooks into each agent's config file (`codex.go`, `agy.go`) and write skills (`skills.go`, embedding `skills/openplan/`) |
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
| `plugin.json` | Copilot CLI plugin manifest (name, version, `hooks` and `commands` pointers) |
| `hooks.json` | Copilot CLI hook definition (`preToolUse` → `openplan copilot-plan`) |
| `commands/` | Copilot CLI command markdown files (`/openplan`, `/openplan-annotate`, `/openplan-archive`, `/openplan-share`) |

### Codex Hook Config (`apps/plugin-codex/`)

| Path | Purpose |
|------|---------|
| `hooks.json` | Codex CLI hook definition (`Stop` → `openplan codex-plan`). Codex does have its own `.codex-plugin/plugin.json` bundle format now, but openplan doesn't use it — there's no marketplace.json for Codex in this repo, so this file is a reference users copy manually, matching Codex's own convention. Skills are handled separately — see `internal/hookinstall/skills/` and `openplan install codex`, not this folder. |

### Antigravity Plugin (`apps/plugin-agy/`)

| Path | Purpose |
|------|---------|
| `plugin.json` | Antigravity CLI plugin manifest (only documented field is optional `name`) |
| `hooks.json` | Antigravity CLI hook definition (`PreToolUse` matched to `write_to_file` → `openplan agy-plan`) |

Skills are handled separately — see `internal/hookinstall/skills/` and `openplan install agy`, not
this folder (a `commands/` directory here was tried and found not to register as usable skills;
see "Automated install" above).

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
