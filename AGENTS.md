# Repository Guidelines

## Project Overview

RedAI is a Bun/TypeScript TUI for AI-assisted vulnerability scanning and validation. It scans source directories, uses Claude Code or Codex SDK agents for threat modeling and finding generation, and runs validator plugins against prepared browser or iOS simulator environments.

## Code Map

- `src/tui/` — Ink UI, screens, keyboard handling, and runtime state hooks.
- `src/domain/` — Zod schemas and shared domain types.
- `src/pipeline/` — run lifecycle, persistence, preflight, and the staged scan pipeline.
- `src/analysis/` — source language detection, tree-sitter wiring, and symbol/regex extraction (the "analysis units" step).
- `src/scanner/` — source context loading, scanner provider implementations, and scanner prompts.
- `src/planner/` — validation planning and matching findings to validator environments.
- `src/validators/` — validator plugins (browser, iOS simulator) and the `validator-plugin.ts` interface.
- `src/agents/` — provider adapters. `claude/` and `codex/` hold agent-session wrappers; `anthropic/` and `openai/` hold structured-output helpers; `agent-runner.ts` is the shared runner entry.
- `src/artifacts/` and `src/reporting/` — persisted run artifacts and Markdown/JSON report generation.
- `src/config/` — local environment loading (`.env`).
- `src/utils/` — shared helpers.

## Commands

- `bun install` — install dependencies.
- `bun run redai` (or `bun run dev`) — launch the TUI.
- `bun run typecheck` — `tsc --noEmit`.

## Invariants

Hard rules. Don't relax these without discussion.

- **Bun only.** Do not add an alternate package manager lockfile.
- **Don't mutate target source.** Scanner and validator agents must not edit files in the directory being analyzed.
- **Artifacts go to `~/.redai/`.** Generated PoCs, helper scripts, logs, screenshots, and notes must be saved under `~/.redai/runs/<runId>/` — never written into the target source tree.
- **Persisted and cross-module shapes go through Zod** in `src/domain/`.

## Conventions

- ESM TypeScript; match the existing style.
- Prefer small, focused changes. Don't fix unrelated issues while updating docs or shipping a focused feature.
- Commit messages: short, imperative, capitalized first word, no prefix (e.g. `Surface validation evidence in reports`).
- Browser validation depends on the local `agent-browser` skill layout.
- iOS validation depends on `xcrun simctl` and the local `ios-simulator-skill` for agent-driven runtime validation.

## Dev Workflow

- Run `bun run typecheck` after code changes when practical.
- For TUI behavior, manually smoke test with `bun run redai`.
- There is no automated test suite. Don't scaffold one without discussing scope first.

## Local State and Secrets

- Runtime state is written under `~/.redai/` (override with `REDAI_HOME`); it lives outside the project tree.
- Local secrets belong in `.env`; keep it untracked.
- `loadLocalEnv()` reads `.env` only when needed and does not override existing environment variables.
- Do not commit agent transcripts, generated reports, browser profiles, simulator state, or local validation artifacts.

## Further Reading

- [`README.md`](./README.md) — install, quick start, feature overview.
- [`src/pipeline/README.md`](./src/pipeline/README.md) — staged scan pipeline, step by step.
- [`src/tui/README.md`](./src/tui/README.md) — TUI structure and keyboard shortcuts.
- [`src/validators/web-agent-browser/README.md`](./src/validators/web-agent-browser/README.md) and [`src/validators/ios-simulator/README.md`](./src/validators/ios-simulator/README.md) — per-validator setup and behavior.
- [`src/validators/validator-plugin.ts`](./src/validators/validator-plugin.ts) — interface for adding a new validator environment.
