import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { canUseClaudeAgentSdk } from "../../agents/claude/claude-agent-session";
import { canUseCodexSdk } from "../../agents/codex/codex-agent-session";
import type { ScanRun } from "../../domain";
import { walkSourceFiles } from "../../scanner/source-file-walker";
import { browserSkillReadiness } from "../../validators/web-agent-browser";
import { FilesystemValidatorEnvironmentStore } from "../validator-environments/filesystem-validator-environment-store";

export interface PreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export async function runPreflight(run: ScanRun): Promise<PreflightResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (run.target.kind !== "source-directory") {
    errors.push("Target must be a source directory.");
  } else {
    await checkSourceDirectory(run.target.path, errors, warnings);
  }

  if (run.settings.scannerProvider === "claude" && !canUseClaudeAgentSdk()) {
    errors.push("Claude scanner provider selected but Claude Agent SDK is not configured.");
  }

  if (run.settings.scannerProvider === "codex" && !canUseCodexSdk()) {
    errors.push("Codex scanner provider selected but Codex SDK is not configured.");
  }

  const environment = await new FilesystemValidatorEnvironmentStore().getEnvironment(
    run.settings.validatorEnvironmentId,
  );
  if (!environment) {
    errors.push("Select a ready validator environment before starting a scan.");
    return { ok: false, errors, warnings };
  }

  if (environment.status !== "ready") {
    errors.push(`Validator environment is not ready: ${environment.name}.`);
  }

  if (environment.kind === "browser") {
    const appUrl = environment.browser?.appUrl?.trim();
    if (!appUrl) errors.push("Browser validation requires an app URL.");
    if (!environment.browser?.profilePath?.trim())
      errors.push("Browser validator environment requires a profile path.");
    const readiness = await browserSkillReadiness();
    if (!readiness.ready) warnings.push(readiness.reason);
  }

  if (environment.kind === "ios-simulator") {
    const hasAppPath = Boolean(environment.ios?.appPath?.trim());
    const hasBundleId = Boolean(environment.ios?.bundleId?.trim());
    if (!hasAppPath && !hasBundleId)
      errors.push("iOS simulator validation requires an app path or bundle ID.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

async function checkSourceDirectory(
  path: string,
  errors: string[],
  warnings: string[],
): Promise<void> {
  try {
    const targetStat = await stat(path);
    if (!targetStat.isDirectory()) {
      errors.push(`Source target is not a directory: ${path}`);
      return;
    }
    await access(path, constants.R_OK);
  } catch (error) {
    errors.push(
      `Source directory is not readable: ${path} (${error instanceof Error ? error.message : String(error)})`,
    );
    return;
  }

  const sourceFiles = await walkSourceFiles(path, { maxFileSizeBytes: 512 * 1024 });
  if (sourceFiles.length === 0) {
    errors.push(
      "Source directory has no supported source files after .gitignore/default ignore filtering.",
    );
  } else if (sourceFiles.length < 3) {
    warnings.push(
      `Only ${sourceFiles.length} supported source file(s) found after ignore filtering.`,
    );
  }
}
