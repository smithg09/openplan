# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-11-05

### Added

- **opendocs** — a sibling product for reviewing rich **HTML documents** agents write: comment on the exact words, every version kept, local-first. Ships as two new binaries alongside `openplan`:
  - `opendocs` — `open`, `review`, `demo`, `create`, `versions`, `comments`, `restore`, `search`, `guidelines`, `publish`, `feedback`, `config proxy`, and `install <claude|codex|agy>` (writes a single `opendocs` skill)
  - `opendocs-proxy` — a self-hostable multi-tenant server with capability links (viewer / commenter / editor), signed expiring frame URLs, per-IP rate limits and per-document quotas, SQLite or PostgreSQL storage, live comment/version updates and presence over SSE, and an opt-in CORS allow-list for the hosted web app
- **Hosted web app** at `opendocs.smithgajjar.dev/app` — try the sample document, open a local folder of HTML files, or open a shared `/d/<id>#t=<token>` link, with documents kept in the browser (IndexedDB) and sharing through the hosted proxy
- **Review UI** built on openplan's chrome: floating selection toolbar (comment, delete, suggest, question, reaction), anchored comment rail, outline and files panels (with local-folder import), version history (open / restore), share drawer, exports (Markdown, JSON, HTML, PDF), light/dark documents, and a bundled interactive sample (`opendocs demo`)
- **`@openplan/chrome`** — shared app chrome (top bar, modals and drawers with enter/exit transitions, sliding side panels, dropdowns) now used by both openplan and opendocs
- **opendocs landing page** with a working review demo built on the real review engine, and a product switcher between openplan and opendocs on both marketing sites; the page is annotatable like openplan's
- The **opendocs skill is bundled in the Claude Code plugin** (`/plugin install openplan@openplan` now gives both products), and `install.sh opendocs` installs the skill automatically when Claude Code is detected
- `DEPLOY.md`: step-by-step deployment of the site, web app, backend and database on free tiers (Cloudflare Pages + Render + Neon)
- opendocs landing: three-line hero, an "Open the app" button, new Self-host and App sections, and an opendocs banner on the openplan landing page
- **Documents home** in the web app and the local server: centered layout with an animated background, search every word, card or list view, upload an HTML file, open a folder, delete documents, collapsible examples, and reopen links you opened before
- Publishing now **shares existing comments** along with the document, and links for the hosted proxy open on `opendocs.smithgajjar.dev/app` instead of the backend's host

### Fixed

- Sharing a document whose proxy copy was lost (e.g. after the proxy's storage was reset) failed with a 401; publishing now recreates it, and copying a link says what to do
- Clicking a comment card could crash the page ("Maximum update depth exceeded")
- Reaction comments showed no emoji in the panel
- Highlights no longer pick up a document's own `span` styles (they were rendered as a custom element), and deletion highlights keep their underline
- `/app/d/<id>` links now route to the web app on Cloudflare Pages
- Floating **reaction picker** in comment cards, and an **All / Open / Resolved** filter in the comments panel (also in openplan)

### Changed

- openplan's top bar, share dialog (now a drawer), side panels and comments header now use the shared chrome, so openplan and opendocs look and behave alike
- One icon library (Hugeicons) everywhere: inline SVG and glyph icons were removed from both apps, both landing pages and the shared packages
- Release and CI now build and publish `opendocs` and `opendocs-proxy` tarballs, and CI runs the PostgreSQL store contract against a Postgres service and builds the proxy Docker image
- `scripts/install.sh` accepts `opendocs` and `opendocs-proxy`
- `render.yaml` no longer creates a Render database (its free Postgres expires after ~30 days); `DATABASE_URL` is supplied by you (Neon's free tier is the documented path)

### Fixed

- Selecting a whole paragraph (triple-click) in an opendocs document now works: ranges whose end boundary is an element are intersected with the text nodes instead of being rejected

### Security

- opendocs validates document ids before they reach the filesystem store (no `..`, separators or escaped slashes)
- The proxy stores only SHA-256 hashes of link tokens, never returns a comment owner's hash, keeps tokens out of URLs (fragment + `Authorization`), serves documents only into a sandboxed iframe, and sends no CORS headers unless an exact-origin allow-list is configured

## [0.5.0] - 2026-11-04

### Added

- **Hugeicons icon system** — replaced the hand-rolled SVG icons across the review UI, app chrome, and marketing site with the [Hugeicons](https://hugeicons.com) library, driven by a single shared registry in `@openplan/annotations`
- **Threaded comments** — annotation cards now support replies, emoji reactions, and resolve/reopen
- **Anchored comment rail** — comment cards are positioned at their highlight's scroll offset with two-way scroll sync, and the rail scrolls independently so overflowed comments stay reachable

### Changed

- **Redesigned comment cards** — slashdocs-style cards with author, relative time, quoted selection, status pill, and a cleaner action row; tightened border radii to match the rest of the UI
- **Smoother card hover** — expanded cards reveal with a quick transition and neighbouring cards glide into place instead of snapping
- **Shared review engine** — extended the annotation data model (anchors, replies, reactions, doc-scoped comments) so it can be reused beyond plan review

## [0.4.0] - 2026-07-27

### Added

- **GitHub Copilot CLI integration** — `openplan copilot-plan` hooks Copilot's `preToolUse` event, filters for `exit_plan_mode` calls, and opens the same visual review UI used for Claude Code
- **Codex CLI integration** — `openplan codex-plan` hooks Codex's `Stop` event, re-parses the turn's rollout transcript to find the latest plan, and reviews it in the browser UI (only when the turn actually produced a plan)
- **Antigravity CLI (`agy`) integration** — `openplan agy-plan` hooks `PreToolUse` on `write_to_file` calls with `RequestFeedback: true` to catch Antigravity's plan-mode submissions
- **`openplan install <codex|agy>`** — automated hook installation for Codex and Antigravity, merging the required config directly into `~/.codex/config.toml` / `hooks.json` and `agy`'s `hooks.json` (`--local` for repo-scoped install), since neither CLI has a reliable plugin-install flow of its own

## [0.3.0] - 2026-06-13

### Added

- **Plan sharing** — `openplan share <file>` generates a self-contained shareable URL; plan data is encoded in the link itself — no server or account required
- **`/openplan-share` skill** — new Claude Code slash command that runs `openplan share` and surfaces the generated URL
- **Identity modal** — reviewers opening a shared plan are prompted for a display name that appears on their annotations, stored locally in the browser

## [0.2.0] - 2026-06-13

### Added

- **Highlight package** — new shared `highlight` package built on the `web-highlighter` library, powering text selection and highlighting in the annotation UI

### Fixed

- **Highlight whitespace handling** — corrected whitespace boundaries so highlights align precisely with the selected text

## [0.1.0] - 2026-05-30

### Added

- **Plan review workflow** — intercept Claude Code's `ExitPlanMode` hook, open the plan in a browser UI, and return approve/deny decisions
- **Context injection** — `PreToolUse` hook for `EnterPlanMode` that injects additional planning context via `openplan context`
- **Plan versioning** — automatic version snapshots on every review (`v1.md`, `v2.md`, …) stored under `~/.openplan/plans/`
- **Annotation UI** — open any markdown file or directory in the browser-based annotation interface with `openplan annotate`
- **Persistent dashboard** — `openplan serve` starts a long-running dashboard to browse all saved plans and versions
- **Session management** — `openplan sessions` lists all active openplan sessions (PID, port, mode)
- **Claude Code plugin** — plugin manifest with hooks (`PreToolUse`, `PermissionRequest`) and skills (`openplan`, `openplan-annotate`, `openplan-archive`, `openplan-last`)

[Unreleased]: https://github.com/smithg09/openplan/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/smithg09/openplan/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/smithg09/openplan/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/smithg09/openplan/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/smithg09/openplan/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/smithg09/openplan/releases/tag/v0.1.0
