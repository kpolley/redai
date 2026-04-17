# ShopNorth — Example Webapp Target

A small, intentionally-vulnerable web app used as a known target for RedAI scans. Useful for trying out RedAI end-to-end without pointing it at your own code.

> **For local testing only.** This app contains real vulnerabilities (auth bypass, IDOR, path traversal, plaintext credential storage, DOM XSS, missing role checks). Do not deploy it.

## Run

```sh
bun run dev
# or
node src/server.js
```

Open `http://localhost:3000`. Log in with `exampleuser` / `examplepassword`.

## Scan it with RedAI

1. Start a Browser environment in RedAI pointed at `http://localhost:3000`.
2. Sign in once during environment setup so the validators inherit the session.
3. Mark the environment ready, then create a scan against this directory.

## Example Report

[`example-report.md`](./example-report.md) is the generated report from a real RedAI scan of this app — severity breakdown, per-finding evidence, and the artifacts the validator agents produced while actively probing the running app. GitHub renders it inline.
