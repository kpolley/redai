# ShopNorth — Example iOS Target

A SwiftUI iOS app used as a known target for RedAI scans. Useful for trying out the iOS simulator validator end-to-end without pointing it at your own code.

> **For local testing only.** This app contains real vulnerabilities (hardcoded credentials and API keys, broken access control, plaintext session tokens on disk, PII leaked via `NSLog`, committed build artifacts). Do not ship it.

## Build for the simulator

```sh
xcodebuild \
  -project ShopNorthE2E.xcodeproj \
  -scheme ShopNorthE2E \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath build \
  build
```

The `.app` lands at:

`build/Build/Products/Debug-iphonesimulator/ShopNorthE2E.app`

Bundle ID: `com.redai.ShopNorthE2E`. Login: `exampleuser` / `examplepassword`.

## Scan it with RedAI

1. Create an iOS Simulator environment in RedAI. Point it at the built `.app` above and the bundle ID `com.redai.ShopNorthE2E`.
2. During environment setup, let RedAI boot the template simulator and install the app. Sign in once so the validators inherit the authenticated state.
3. Mark the environment ready, then create a scan against this directory.

## Example Report

[`example-report.md`](./example-report.md) is the generated report from a real RedAI scan of this app — severity breakdown, per-finding evidence, and the simulator screenshots and artifacts the validator agents produced while driving the live app. GitHub renders it inline.
