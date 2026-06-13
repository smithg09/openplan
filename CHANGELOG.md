# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/smithg09/openplan/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/smithg09/openplan/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/smithg09/openplan/releases/tag/v0.1.0
