#!/usr/bin/env bun
import { render } from "ink";
import packageJson from "../../package.json" with { type: "json" };
import { loadLocalEnv } from "../config/load-local-env";
import { App } from "./app";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(packageJson.version);
  process.exit(0);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`RedAI ${packageJson.version}

Usage:
  redai

Options:
  -h, --help     Show help
  -v, --version  Show version`);
  process.exit(0);
}

loadLocalEnv();

render(<App />, { exitOnCtrlC: false });
