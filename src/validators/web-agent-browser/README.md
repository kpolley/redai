# Browser Validator

The browser validator validates findings against a prepared browser session using [`agent-browser`](https://github.com/vercel-labs/agent-browser).

## What This Validates

Suitable for web-app findings that can be reproduced by driving a live browser — for example, stored or reflected XSS, IDOR on authenticated pages, CSRF, open redirects, broken access control, mixed-content / CSP weaknesses, and session or auth-flow issues. Anything that requires interacting with the rendered UI, observing network or console behavior, or submitting payloads as a logged-in user is a good fit.

## Requirements

- Google Chrome
- `agent-browser`
- `.agents/skills/agent-browser` in the target workspace, or `~/.claude/skills/agent-browser` globally
- A browser environment marked `ready` in RedAI

## Environment Setup

Browser environments store:

- app URL
- generated browser profile path
- optional auth/setup notes
- status: `draft`, `setup`, `ready`, or `failed`

Creating a browser environment opens Chrome with an isolated profile. Use that browser window to log in, seed app state, or otherwise prepare the target application. Return to RedAI and press `R` to mark the environment ready.

## Validation Behavior

During validation, RedAI copies the ready browser profile into a per-job temporary profile before running the browser agent. This lets validators interact with disposable browser state instead of mutating the prepared environment directly.

The browser validator should attempt to prove or disprove the finding, not only inspect it. It may drive the browser, run helper commands, create proof-of-concept scripts, host temporary local servers, capture screenshots, collect network or console evidence, and write notes when those actions support validation. Generated PoCs, scripts, logs, screenshots, and notes should be saved as run artifacts under `~/.redai/runs/<runId>/`.

> ⚠️ **Avoid using high-privilege production accounts in prepared browser profiles.** The validator agent will act as the signed-in user and may submit payloads, trigger mutations, or exercise destructive flows.

## Adding or Extending Validators

Validator plugins implement the interface in [`../validator-plugin.ts`](../validator-plugin.ts). Use it as a starting point if you want RedAI to validate findings in a different browser environment (e.g. a different browser automation backend, a headless setup, or a remote profile host).
