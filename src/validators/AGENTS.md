# Validators — Contributor Notes

Validators are how RedAI proves (or disproves) whether a finding is actually exploitable. They are the project's primary extension point — adding a new sandbox environment should feel like writing a small adapter, not modifying the pipeline.

This file is guidance for adding or modifying validator plugins. For validator setup and user-facing behavior, see the per-validator READMEs ([`web-agent-browser/README.md`](./web-agent-browser/README.md), [`ios-simulator/README.md`](./ios-simulator/README.md)).

## What Lives Here

- [`validator-plugin.ts`](./validator-plugin.ts) — the `ValidatorPlugin` interface every validator implements.
- [`plugin-validation-executor.ts`](./plugin-validation-executor.ts) — dispatches validation jobs to the right plugin.
- [`validation-executor.ts`](./validation-executor.ts) — shared validator-facing execution helpers.
- [`validation-agent-output.ts`](./validation-agent-output.ts) — shape of agent output a validator returns.
- [`validation-normalization-prompt.ts`](./validation-normalization-prompt.ts) — prompt for normalizing validator output into a `ValidationResult`.
- `web-agent-browser/`, `ios-simulator/` — concrete validators. Each exports a factory (e.g. `webAgentBrowserValidator()`) from `index.ts` plus a `prompt.ts`.

## Plugin Lifecycle

Every validator implements four async methods on `ValidatorPlugin`:

1. `canValidate({ runState, findingId })` — does this plugin support the finding? Return `{ supported, reason }`. Matching runs before preparation.
2. `prepare(job)` — set up per-job isolated state (clone a simulator, copy a browser profile, spin a sandbox). Return a `PreparedEnvironment` that `run` and `cleanup` will receive. **The prepared *template* environment must never be mutated** — work on a disposable copy.
3. `run({ job, environment, agentRunner, artifactStore, emit })` — drive the validator agent. Use `agentRunner` for the LLM session, `artifactStore` for evidence files, and `emit` for TUI-visible events. Return a `ValidationResult`.
4. `cleanup(environment)` — tear down everything `prepare` created. Always runs, even after failure.

All four are required. None are optional.

## Invariants for Validators

- **Prove or disprove — don't just inspect.** A validator exists to gather evidence of exploitability. Running helper commands, writing PoC scripts, hosting temporary local servers, capturing screenshots, and collecting logs are all in scope when they advance that goal.
- **Isolation per job.** Never let one validation job mutate state another job (or the prepared template) will see. Clone, copy, or scope per-job.
- **Artifacts go to `artifactStore`**, which persists under `~/.redai/runs/<runId>/artifacts/`. Never write evidence into the target source tree.
- **No target-source mutation.** Validators read the target; they don't edit it.
- **No high-privilege prod credentials** in prepared environments. Validator agents act as the signed-in user and may exercise destructive flows.
- **Cleanup must be idempotent** and safe to call after a partial `prepare`.

## Adding a New Validator

1. Create `src/validators/<kind>/` with an `index.ts` exporting a factory (e.g. `myThingValidator()`), a `prompt.ts` for the agent prompt, and a `README.md` covering setup, requirements, and what kinds of findings it validates.
2. Implement `ValidatorPlugin`. Pick a `capabilities[].kind` from the allowed set (`web`, `ios`, `api`, `container`, `desktop`) — extend the union in `validator-plugin.ts` if you need a new one.
3. Register the factory in [`../pipeline/scan-pipeline.ts`](../pipeline/scan-pipeline.ts), where `PluginValidationExecutor` is constructed with the list of active validators.
4. If your validator introduces a new kind of prepared environment (not browser, not iOS), add the environment type to `src/domain/` and wire up setup UI in `src/tui/`.
5. Update the main README's Requirements table and Validators list to mention the new environment.

## Dev Workflow for Validator Changes

- `bun run typecheck` after interface or schema changes.
- Smoke test end-to-end with `bun run redai` using a small source directory and a prepared environment of the relevant kind — validator bugs often only surface during an actual scan.
