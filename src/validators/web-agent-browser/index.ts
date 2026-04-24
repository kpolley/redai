import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  canUseAnthropicApi,
  collectAnthropicStructuredOutput,
} from "../../agents/anthropic/anthropic-structured-output";
import {
  canUseClaudeAgentSdk,
  collectClaudeStructuredOutput,
} from "../../agents/claude/claude-agent-session";
import {
  canUseCodexSdk,
  collectCodexStructuredOutput,
} from "../../agents/codex/codex-agent-session";
import {
  canUseOpenAiApi,
  collectOpenAiStructuredOutput,
} from "../../agents/openai/openai-structured-output";
import { FilesystemRunArtifactStore } from "../../artifacts/filesystem-run-artifact-store";
import type { ValidationJob } from "../../domain";
import { getRedaiRunDir } from "../../paths";
import {
  normalizeValidationAgentOutput,
  validationAgentOutputSchema,
} from "../validation-agent-output";
import { buildValidationNormalizationPrompt } from "../validation-normalization-prompt";
import type { ValidatorPlugin } from "../validator-plugin";
import { buildWebValidationPrompt } from "./prompt";

const execFileAsync = promisify(execFile);

export function webAgentBrowserValidator(): ValidatorPlugin {
  return {
    id: "web-agent-browser",
    label: "Web Agent Browser",
    capabilities: [{ kind: "web", label: "Browser-driven web validation" }],
    async canValidate({ runState }) {
      const appUrl = runState.validationPlans[0]?.metadata?.appUrl;
      if (typeof appUrl !== "string" || appUrl.trim().length === 0) {
        return { supported: false, reason: "Browser validation requires an app URL." };
      }
      const readiness = await browserSkillReadiness();
      if (!readiness.ready) return { supported: false, reason: readiness.reason };
      return {
        supported: true,
        reason: "Web validation is available through agent-browser skill.",
      };
    },
    async prepare(job) {
      const id = crypto.randomUUID();
      const templateProfilePath =
        typeof job.plan.metadata?.profilePath === "string"
          ? job.plan.metadata.profilePath
          : undefined;
      const profilePath = templateProfilePath
        ? await cloneBrowserProfile(job.runId, templateProfilePath)
        : undefined;
      return {
        id,
        metadata: {
          kind: "web",
          agentBrowserHome: agentBrowserHomePath(job.runId),
          ...(profilePath ? { profilePath } : {}),
        },
      };
    },
    async run({ job, environment, emit }) {
      const preparedJob = withEnvironmentProfile(job, environment.metadata);
      const appUrl =
        typeof preparedJob.plan.metadata?.appUrl === "string"
          ? preparedJob.plan.metadata.appUrl
          : undefined;
      if (!appUrl) {
        return {
          findingId: preparedJob.findingId,
          status: "unable-to-test",
          confidence: "high",
          summary: "Browser validation could not run because no app URL was configured.",
          reproductionSteps: preparedJob.plan.steps,
          payloadsTried: [],
          evidence: [],
        };
      }

      if (preparedJob.plan.metadata?.scannerProvider === "codex") {
        return runCodexWebValidation(preparedJob, emit);
      }

      if (!canUseClaudeAgentSdk()) {
        return {
          findingId: preparedJob.findingId,
          status: "unable-to-test",
          confidence: "low",
          summary: "Claude Agent SDK is not configured, so browser validation could not run.",
          reproductionSteps: preparedJob.plan.steps,
          payloadsTried: [],
          evidence: [],
        };
      }

      const artifactStore = new FilesystemRunArtifactStore();
      const validationRun = await collectClaudeStructuredOutput({
        runId: preparedJob.runId,
        prompt: buildWebValidationPrompt(preparedJob),
        options: {
          env: { ...process.env, ...agentBrowserEnvironment(preparedJob) },
          tools: ["Read", "Glob", "Grep", "Bash"],
          allowedTools: ["Read", "Glob", "Grep", "Bash", "Write"],
          disallowedTools: ["Edit", "MultiEdit"],
        },
        transcriptPath: `transcripts/web-validation-${safePathPart(preparedJob.id)}.jsonl`,
        transcriptTitle: `Web validation transcript: ${preparedJob.findingId}`,
        artifactStore,
        emit,
        jobId: preparedJob.id,
      });

      if (!canUseAnthropicApi()) {
        return {
          findingId: preparedJob.findingId,
          status: "unable-to-test",
          confidence: "low",
          summary:
            "Anthropic API is not configured, so the raw Claude validation summary could not be normalized.",
          reproductionSteps: preparedJob.plan.steps,
          payloadsTried: [],
          evidence: validationRun.transcriptArtifact ? [validationRun.transcriptArtifact] : [],
          ...(validationRun.transcriptArtifact
            ? { agentTranscriptRef: validationRun.transcriptArtifact.path }
            : {}),
        };
      }

      const structuredOutput = await collectAnthropicStructuredOutput({
        instructions:
          "Convert raw RedAI validation summaries into strict structured validation results. Do not invent evidence.",
        input: buildValidationNormalizationPrompt(preparedJob, validationRun.finalResponse),
        outputSchema: z.toJSONSchema(validationAgentOutputSchema) as Record<string, unknown>,
        toolName: "emit_validation_result",
        toolDescription: "Emit the structured RedAI validation result.",
      });

      const parsed = validationAgentOutputSchema.safeParse(structuredOutput);
      if (!parsed.success) {
        return {
          findingId: preparedJob.findingId,
          status: "unable-to-test",
          confidence: "low",
          summary: formatSchemaError("web validation", parsed.error),
          reproductionSteps: preparedJob.plan.steps,
          payloadsTried: [],
          evidence: validationRun.transcriptArtifact ? [validationRun.transcriptArtifact] : [],
          ...(validationRun.transcriptArtifact
            ? { agentTranscriptRef: validationRun.transcriptArtifact.path }
            : {}),
        };
      }
      return normalizeValidationAgentOutput(
        preparedJob,
        parsed.data,
        validationRun.transcriptArtifact,
      );
    },
    async cleanup() {},
  };
}

function withEnvironmentProfile(
  job: ValidationJob,
  envMetadata: Record<string, unknown>,
): ValidationJob {
  const templatePath =
    typeof job.plan.metadata?.profilePath === "string" ? job.plan.metadata.profilePath : undefined;
  const runPath =
    typeof envMetadata?.profilePath === "string" ? envMetadata.profilePath : undefined;
  if (!runPath || runPath === templatePath) return job;
  return {
    ...job,
    plan: {
      ...job.plan,
      metadata: {
        ...job.plan.metadata,
        ...(templatePath ? { templateProfilePath: templatePath } : {}),
        profilePath: runPath,
      },
    },
  };
}

const profileCloneLocks = new Map<string, Promise<string>>();

async function cloneBrowserProfile(runId: string, sourceProfilePath: string): Promise<string> {
  const runProfilePath = join(getRedaiRunDir(runId), "validation", "browser-profile");
  const inflight = profileCloneLocks.get(runProfilePath);
  if (inflight) return inflight;
  const work = (async () => {
    await mkdir(runProfilePath, { recursive: true });
    if (
      existsSync(join(runProfilePath, "Default")) ||
      existsSync(join(runProfilePath, "Local State"))
    ) {
      return runProfilePath;
    }
    if (existsSync(sourceProfilePath)) {
      await cp(sourceProfilePath, runProfilePath, {
        recursive: true,
        force: true,
        // Chrome's per-process runtime symlinks must never enter a clone:
        // SingletonLock points at the live Chrome's hostname-PID and the
        // cloned Chrome would exit with "Failed to create a ProcessSingleton
        // for your profile directory"; RunningChromeVersion is a transient
        // symlink to a non-existent sibling that makes fs.cp fail with
        // "cannot copy X to a subdirectory of self X".
        filter: (src) => !/\/(Singleton(Lock|Cookie|Socket)|RunningChromeVersion)$/.test(src),
      });
    }
    return runProfilePath;
  })();
  profileCloneLocks.set(runProfilePath, work);
  try {
    return await work;
  } finally {
    profileCloneLocks.delete(runProfilePath);
  }
}

async function runCodexWebValidation(
  job: Parameters<NonNullable<ReturnType<typeof webAgentBrowserValidator>["run"]>>[0]["job"],
  emit: Parameters<NonNullable<ReturnType<typeof webAgentBrowserValidator>["run"]>>[0]["emit"],
) {
  if (!canUseCodexSdk()) {
    return {
      findingId: job.findingId,
      status: "unable-to-test" as const,
      confidence: "low" as const,
      summary: "Codex SDK is not configured, so browser validation could not run.",
      reproductionSteps: job.plan.steps,
      payloadsTried: [],
      evidence: [],
    };
  }

  const artifactStore = new FilesystemRunArtifactStore();
  const validationRun = await collectCodexStructuredOutput({
    runId: job.runId,
    prompt: buildWebValidationPrompt(job),
    cwd: process.cwd(),
    transcriptPath: `transcripts/codex-web-validation-${safePathPart(job.id)}.jsonl`,
    transcriptTitle: `Codex web validation transcript: ${job.findingId}`,
    artifactStore,
    emit,
    env: agentBrowserEnvironment(job),
    jobId: job.id,
  });

  if (!canUseOpenAiApi()) {
    return {
      findingId: job.findingId,
      status: "unable-to-test" as const,
      confidence: "low" as const,
      summary:
        "OpenAI API is not configured, so the raw validation summary could not be normalized.",
      reproductionSteps: job.plan.steps,
      payloadsTried: [],
      evidence: validationRun.transcriptArtifact ? [validationRun.transcriptArtifact] : [],
      ...(validationRun.transcriptArtifact
        ? { agentTranscriptRef: validationRun.transcriptArtifact.path }
        : {}),
    };
  }

  const structuredOutput = await collectOpenAiStructuredOutput({
    instructions:
      "Convert raw RedAI validation summaries into strict structured validation results. Do not invent evidence.",
    input: buildValidationNormalizationPrompt(job, validationRun.finalResponse),
    outputSchema: z.toJSONSchema(validationAgentOutputSchema) as Record<string, unknown>,
    schemaName: "validation_result",
  });

  if (!structuredOutput) {
    throw new Error("Codex SDK did not return structured web validation output.");
  }

  const parsed = validationAgentOutputSchema.safeParse(structuredOutput);
  if (!parsed.success) {
    return {
      findingId: job.findingId,
      status: "unable-to-test" as const,
      confidence: "low" as const,
      summary: formatSchemaError("Codex web validation", parsed.error),
      reproductionSteps: job.plan.steps,
      payloadsTried: [],
      evidence: validationRun.transcriptArtifact ? [validationRun.transcriptArtifact] : [],
      ...(validationRun.transcriptArtifact
        ? { agentTranscriptRef: validationRun.transcriptArtifact.path }
        : {}),
    };
  }
  const result = normalizeValidationAgentOutput(job, parsed.data, validationRun.transcriptArtifact);
  return result;
}

function agentBrowserEnvironment(job: ValidationJob): Record<string, string> {
  const profilePath =
    typeof job.plan.metadata?.profilePath === "string" ? job.plan.metadata.profilePath : "";
  return {
    AGENT_BROWSER_HOME: agentBrowserHomePath(job.runId),
    AGENT_BROWSER_SESSION_NAME: job.id,
    AGENT_BROWSER_SESSION: job.id,
    ...(profilePath ? { AGENT_BROWSER_PROFILE: profilePath } : {}),
  };
}

function agentBrowserHomePath(runId: string): string {
  // Shared across the run so every job's session shows up in one dashboard.
  // Per-job isolation is handled by --session-name, not by separate daemons.
  return join(getRedaiRunDir(runId), "validation", "agent-browser-home");
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 160);
}

function formatSchemaError(stage: string, error: z.ZodError): string {
  const issues = error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
  return `Agent SDK returned invalid structured ${stage} output: ${issues.join("; ")}`;
}

export async function browserSkillReadiness(): Promise<{ ready: boolean; reason: string }> {
  const globalSkill = join(homedir(), ".claude/skills/agent-browser/SKILL.md");
  if (!existsSync(".agents/skills/agent-browser/SKILL.md") && !existsSync(globalSkill)) {
    return {
      ready: false,
      reason:
        "agent-browser skill is not installed under .agents/skills or ~/.claude/skills.",
    };
  }

  try {
    await execFileAsync("agent-browser", ["--version"]);
  } catch {
    return { ready: false, reason: "agent-browser CLI is not installed or not on PATH." };
  }

  try {
    await execFileAsync("agent-browser", ["skills", "get", "agent-browser"], { timeout: 5000 });
  } catch {
    return {
      ready: false,
      reason:
        "agent-browser CLI is installed, but it does not support `agent-browser skills get agent-browser`; upgrade agent-browser.",
    };
  }

  return { ready: true, reason: "agent-browser skill and CLI are ready." };
}
