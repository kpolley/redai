# What RedAI Does During a Scan

This page explains what happens after you start a RedAI scan.

RedAI does not ask a single agent to inspect the entire project in one pass. It runs a staged workflow: first checking that the scan can run, then asking the selected scanner provider to threat model the project, splitting source into focused analysis units, scanning those units, aggregating findings, validating them in a prepared environment, and writing reports.

## 1. Preflight Checks

Before the scan starts, RedAI checks that the required setup is usable.

It verifies that:

- The target is a readable source directory.
- The directory contains supported source files.
- The selected scanner provider is configured.
- The selected validation environment exists and is marked ready.
- The environment plugin's own preflight passes (e.g. browser environments require an app URL and browser profile; iOS simulator environments require an app path, bundle ID, or both).

If something required is missing, RedAI stops and shows an error.

## 2. Threat Modeling

RedAI asks the selected scanner provider to inspect the project and build a threat model.

The threat model describes:

- What kind of application is being reviewed.
- Which assets, trust boundaries, entry points, and data flows matter.
- What kinds of attacks may be relevant.
- Which areas deserve focused analysis.
- Ideas for how potential issues could later be validated.

The scanner provider explores the source directory directly. There is no separate heuristic attack-surface discovery step and no synthetic threat model fallback.

## 3. File Prioritization

After the threat model is built, RedAI asks the selected scanner provider to rank source files by likelihood of containing security-relevant code, given the threat model.

The prioritizer scores each candidate file on a 0..1 scale and may explicitly exclude files that are clearly out of scope (fixtures, generated code, vendored assets, pure UI). The result is a ranked list with brief rationale per file.

Each scan picks one of three coverage tiers up front:

- **Focused** — only the highest-signal files (score ≥ 0.7, or top ~20%) become analysis units.
- **Balanced** — broader cut (score ≥ 0.4, or top ~50%).
- **Thorough** — every file the prioritizer did not actively reject (score ≥ 0.1).

The chosen tier is recorded with the run and applied automatically by the analysis-unit-discovery stage. There is no interactive pause; the prioritizer's ranking flows straight into the next stage.

## 4. Analysis Unit Discovery

RedAI splits the source tree into focused analysis units.

An analysis unit is a bounded slice of code, such as:

- A function, method, or class extracted from source.
- A source file selected for analysis when symbol extraction is not available.
- A group of related context that can be handed to a unit scanner.

RedAI uses source walking, language detection, tree-sitter parsing, and regex symbol extraction for this structural step. Supported languages are TypeScript, JavaScript, TSX, Swift, Go, and Python. This step organizes code for scanner agents; it does not generate vulnerability findings by itself.

## 5. Unit Scanning

RedAI sends each analysis unit to the selected scanner provider.

For each unit, the scanner receives the threat model, the unit metadata, and relevant source context. It returns observations and any candidate findings grounded in that unit's code.

Candidate findings are not final results yet. They still need to be aggregated, deduplicated, and validated. Depending on your settings, RedAI can scan multiple units at the same time.

## 6. Finding Aggregation

After unit scanning, RedAI asks the selected scanner provider to combine candidate findings into a final finding list.

This step tries to:

- Merge duplicate reports from different units.
- Combine related evidence into one finding.
- Remove weak or redundant candidates.
- Normalize titles, severity, confidence, affected locations, and descriptions.

If unit scanning produces no candidates, RedAI asks the selected scanner provider to perform a broader finding scan from the threat model and project context. RedAI does not invent placeholder findings.

## 7. Validation Planning

For each final finding, RedAI creates a validation plan describing how a validator should try to prove or disprove the issue.

The plan is tailored to the selected validation environment — it references the tools, surfaces, and interactions that environment exposes. Against a browser environment, a plan might describe UI steps and request payloads; against an iOS simulator, taps and URL-scheme probes; against a custom environment plugin, whatever that plugin makes available. The plan draws on the finding, the environment's capabilities, and the context collected earlier in the scan.

## 8. Validation Execution

RedAI sends validation plans to whichever environment plugin the scan is bound to. The environment is a plugin that implements the interface in [`src/validators/validator-plugin.ts`](../validators/validator-plugin.ts), and RedAI ships with two reference implementations:

- **Browser** — a real Chrome profile driven via [`agent-browser`](https://github.com/vercel-labs/agent-browser).
- **iOS Simulator** — a per-scan template simulator driven via `xcrun simctl`.

Additional environments (Linux VMs, Android emulators, remote staging clusters, embedded device shims) can be added by implementing the same interface.

Validators try to gather practical evidence. A validation result may confirm the finding, refute it, or mark it as inconclusive. Validators are expected to do what the plan calls for — drive the UI, run commands, write proof-of-concept scripts, host temporary helper servers, inspect logs, capture screenshots — and to save any generated PoCs, scripts, logs, screenshots, or notes as run artifacts under `~/.redai/runs/<runId>/` rather than writing them into the target source tree.

Depending on the validator-agent concurrency setting, RedAI can validate multiple findings at the same time.

## 9. Reporting

At the end of a successful scan, RedAI writes reports to the run directory.

The reports include:

- The generated threat model.
- The analysis units that were scanned.
- Final findings.
- Validation plans and results.
- Artifacts and evidence created during the run.
- PoC scripts, screenshots, logs, notes, and other validation evidence referenced by validator results.

RedAI writes both a Markdown report and a JSON report so the results are readable by humans and usable by tools.

## Where Results Are Stored

RedAI stores scan data locally under `~/.redai` (override with the `REDAI_HOME` environment variable).

A run usually looks like this:

```text
~/.redai/runs/<runId>/
  run.json
  events.ndjson
  state.json
  artifacts/
  report.md
  report.json
```

These files may contain source-derived prompts, findings, validation evidence, reports, browser profile paths, and other local scan state. They live outside the project tree by design; treat the directory as sensitive.

## What Happens If A Scan Is Canceled

If you cancel a scan, RedAI asks the active work to stop and marks the run as canceled.

Completed work remains saved locally, but in-progress scanner or validator agents are not resumed automatically. If RedAI starts up and finds a run that was still active from a previous process, it marks that run canceled because the original in-process agents are no longer running.

## Why RedAI Uses Multiple Steps

RedAI uses a staged pipeline because each step answers a different question:

- Is the target, scanner provider, and validator environment ready?
- What kind of app is this, and where should security analysis focus?
- Which focused units should be scanned?
- What possible vulnerabilities exist?
- Which findings are worth keeping?
- Can those findings be validated in a real environment?
- What evidence should be included in the final report?

This structure keeps scans more understandable, makes progress visible in the TUI, and separates speculative AI analysis from validation evidence.
