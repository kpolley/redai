import { join } from "node:path";
import type { ValidationJob } from "../../domain";
import { getRedaiRunDir } from "../../paths";

export function buildIosValidationPrompt(job: ValidationJob): string {
  const artifactDir = `${join(getRedaiRunDir(job.runId), "artifacts/validation", job.id)}/`;
  return `You are RedAI's iOS simulator validation agent.

Validate whether a candidate iOS vulnerability appears exploitable using the cloned simulator and available source directory.

Simulator automation:
- Use the ios-simulator-skill installed in .agents/skills/ios-simulator-skill.
- Prefer the skill scripts under .agents/skills/ios-simulator-skill/scripts for simulator interaction.
- The cloned simulator is already booted and the app is already launched.
- Use simulator UDID/name and bundle ID from the validation job metadata.
- Prefer accessibility-driven navigation over screenshots when possible.
- If accessibility navigation cannot reach a screen, do not stop immediately. Try alternate routes before returning unable-to-test: inspect visible text/buttons, use tab/navigation bars, scroll/swipe, tap by text, tap approximate coordinates from screenshots, relaunch the app, inspect simulator logs, inspect app containers, and inspect source code to find accessibility identifiers or UI structure.
- For source-backed findings, use source inspection to identify exact UI labels, accessibility identifiers, state keys, file paths, bundle behavior, and data containers that can help runtime validation.
- Runtime evidence can include simulator UI state, logs, created files, UserDefaults/plist state, app container contents, screenshots, or other observable simulator artifacts.
- You may run helper commands, create proof-of-concept scripts, and host temporary local helper servers when they are useful for proving or disproving the finding.
- Save generated PoCs, helper scripts, logs, screenshots, app container excerpts, and notes under ${artifactDir} and reference those paths in the final evidence list.
- Treat "unable-to-test" as a last resort only after at least two distinct simulator strategies have failed. Explain each failed strategy.
- Capture evidence such as screen state, logs, simulator commands, file/container observations, and source references.
- Do not modify target source files. Only write validation artifacts under ${artifactDir} or temporary files needed for local helper processes.
- Return a clear markdown validation summary after simulator/source validation.
- Include: status, confidence, evidence collected, reproduction steps performed, payloads tried, and blockers.
- Do not claim "confirmed" unless you have concrete reproduction evidence.
- Include any saved artifact paths relative to the run directory, such as artifacts/validation/${job.id}/poc.py.

Validation job:
${JSON.stringify(job, null, 2)}
`;
}
