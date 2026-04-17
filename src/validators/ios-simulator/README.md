# iOS Simulator Validator

The iOS simulator validator validates findings against a prepared Simulator app.

## What This Validates

Suitable for iOS findings that can be reproduced inside a running Simulator — URL-scheme and universal-link handling, deep-link abuse, insecure local storage (UserDefaults, Keychain, Documents), pasteboard leaks, WebView / JavaScript bridge injection, insecure IPC, auth and session handling, and inspection of traffic from the app. Anything that requires tapping UI, launching the app with crafted inputs, or observing simulator logs and filesystem state is a good fit.

## Requirements

- macOS
- Xcode command line tools
- `xcrun simctl`
- A Simulator-compatible `.app` bundle, an installed bundle ID, or both — see [Building a simulator-compatible app](#building-a-simulator-compatible-app) if you don't have one yet
- `.agents/skills/ios-simulator-skill` in the target workspace for agent-driven simulator automation
- An iOS simulator environment marked `ready` in RedAI

## Environment Setup

iOS simulator environments store:

- app path, if provided
- bundle ID, if provided
- template simulator UDID / device name after setup runs
- optional auth/setup notes
- status: `draft`, `setup`, `ready`, or `failed`

Creating an iOS simulator environment can create a template simulator, install a built `.app`, launch the bundle ID, and open Simulator. Use Simulator to log in, seed app state, or otherwise prepare the app. Return to RedAI and press `R` to mark the environment ready.

## Validation Behavior

During validation, RedAI clones the template simulator for each validation job, boots the clone, launches the app, runs the validator agent, and then deletes the clone and any per-job profile data during cleanup so the prepared template is never mutated by a validation run.

The iOS validator should attempt to prove or disprove the finding, not only inspect it. It may drive Simulator, run helper commands, create proof-of-concept scripts, host temporary local servers, collect simulator logs, capture screenshots, inspect app behavior, and write notes when those actions support validation. Generated PoCs, scripts, logs, screenshots, and notes should be saved as run artifacts under `~/.redai/runs/<runId>/`.

## Building a simulator-compatible app

RedAI needs an app that runs in Simulator:

- **App path** — a built `.app` bundle for the `iphonesimulator` SDK.
- **Bundle ID** — the identifier used by `simctl launch`.

> **`.app`, not `.ipa`.** Simulator builds produce a `.app` directory built for the `iphonesimulator` SDK. Distribution `.ipa` archives are built for device (`iphoneos`) and will not run under `simctl`, even after unpacking. If `xcrun simctl install` silently fails or the app refuses to launch, double-check the bundle came from a `Debug-iphonesimulator` build directory.

### From Xcode

1. Open the project in Xcode.
2. Select a simulator destination.
3. Build with `Cmd+B`.
4. Open the Report Navigator (`Cmd+9`) and select the latest build log.
5. Search for `.app` or `Debug-iphonesimulator` to find a path like:

   ```text
   /Users/you/Library/Developer/Xcode/DerivedData/YourApp-abc123/Build/Products/Debug-iphonesimulator/YourApp.app
   ```

Read the bundle ID from the built app:

```sh
/usr/libexec/PlistBuddy -c "Print CFBundleIdentifier" /path/to/YourApp.app/Info.plist
```

### From the command line

```sh
xcodebuild -workspace YourApp.xcworkspace -scheme YourApp \
  -sdk iphonesimulator -configuration Debug build
```

The built `.app` lands under `build/Debug-iphonesimulator/` (or Xcode's DerivedData if you pass `-derivedDataPath`). Read the bundle ID from its `Info.plist` with the `PlistBuddy` command above.

## Adding or Extending Validators

Validator plugins implement the interface in [`../validator-plugin.ts`](../validator-plugin.ts). Use it as a starting point if you want RedAI to validate findings in a different mobile environment (e.g. physical-device validation, an Android emulator, or a remote simulator farm).
