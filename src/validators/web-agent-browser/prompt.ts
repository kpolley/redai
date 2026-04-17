import { join } from "node:path";
import type { ValidationJob } from "../../domain";
import { getRedaiRunDir } from "../../paths";

export function buildWebValidationPrompt(job: ValidationJob): string {
  const artifactDir = `${join(getRedaiRunDir(job.runId), "artifacts/validation", job.id)}/`;
  return `You are RedAI's web validation agent.

Validate whether a candidate web vulnerability appears exploitable based on the available source directory and validation plan.

Browser automation:
- Use the agent-browser skill and CLI to interact with the configured App URL.
- Before browser commands, load command guidance with \`agent-browser skills get agent-browser\` when available.
- The process environment already sets \`AGENT_BROWSER_HOME\`, \`AGENT_BROWSER_SESSION_NAME\`, \`AGENT_BROWSER_SESSION\`, and \`AGENT_BROWSER_PROFILE\` for this job. The shared daemon reads the profile from env — do not pass \`--profile\` yourself.
- Every agent-browser command must include \`--session-name ${job.id}\` to stay isolated from other validation jobs sharing the dashboard.
- Do not use the default agent-browser session.
- Close only this session when finished with \`agent-browser --session-name ${job.id} close\`. Do not run \`close --all\` — other validation jobs may be sharing the daemon.
- Capture evidence such as screenshots, observations, URLs, and response details when available.
- You may run helper commands, create proof-of-concept scripts, and host temporary local helper servers when they are useful for proving or disproving the finding.
- Save generated PoCs, helper scripts, logs, screenshots, HTTP responses, and notes under ${artifactDir} and reference those paths in the final evidence list.
- Do not modify target source files. Only write validation artifacts under ${artifactDir} or temporary files needed for local helper processes.
- Do not attempt live exploitation outside the configured target app and local validation helpers.
- Return status "unable-to-test" only if browser tooling cannot run or reproduction is not possible after trying.

Validation job:
${JSON.stringify(job, null, 2)}

Browser runtime:
- App URL: ${job.plan.metadata?.appUrl ?? "not provided"}
- Browser profile path: ${job.plan.metadata?.profilePath ?? "not provided"} (already wired via \`AGENT_BROWSER_PROFILE\`; shared across validation jobs in this run with per-session isolation).

Instructions:
- Read/search relevant source files if useful.
- Assess whether the validation plan is concrete enough for later browser automation.
- Return a clear markdown validation summary after tool/browser validation.
- Include: status, confidence, evidence collected, reproduction steps performed, payloads tried, and any blockers.
- Do not claim "confirmed" unless you have concrete reproduction evidence.
- Include useful reproduction steps and payload ideas when unable to test.
- Include any saved artifact paths relative to the run directory, such as artifacts/validation/${job.id}/poc.js.
`;
}
