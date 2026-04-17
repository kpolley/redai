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
import {
  normalizeValidationAgentOutput,
  validationAgentOutputSchema,
} from "../validation-agent-output";
import { buildValidationNormalizationPrompt } from "../validation-normalization-prompt";
import type { ValidatorPlugin } from "../validator-plugin";
import { buildIosValidationPrompt } from "./prompt";
import { bootSimulator, cloneSimulator, deleteSimulator, launchSimulatorApp } from "./simctl";

export function iosSimulatorValidator(): ValidatorPlugin {
  return {
    id: "ios-simulator",
    label: "iOS Simulator",
    capabilities: [{ kind: "ios", label: "iOS simulator validation" }],
    async canValidate({ runState }) {
      const metadata = runState.validationPlans[0]?.metadata;
      const templateDevice =
        stringMetadata(metadata?.templateDeviceUdid) || stringMetadata(metadata?.deviceName);
      const bundleId = stringMetadata(metadata?.bundleId);
      if (!templateDevice || !bundleId) {
        return {
          supported: false,
          reason: "iOS simulator validation requires a template simulator and bundle ID.",
        };
      }
      return { supported: true, reason: "iOS simulator clone validation is available." };
    },
    async prepare(job) {
      const templateDevice =
        stringMetadata(job.plan.metadata?.templateDeviceUdid) ||
        stringMetadata(job.plan.metadata?.deviceName);
      const bundleId = stringMetadata(job.plan.metadata?.bundleId);
      if (!templateDevice || !bundleId)
        throw new Error(
          "iOS simulator validation requires templateDeviceUdid/deviceName and bundleId metadata.",
        );

      const cloneName = `redai-${job.runId.slice(0, 8)}-${job.id.slice(0, 8)}`;
      const clone = await cloneSimulator(templateDevice, cloneName);
      await bootSimulator(clone.udid);
      await launchSimulatorApp(clone.udid, bundleId);

      return {
        id: clone.udid,
        metadata: { kind: "ios", simulatorUdid: clone.udid, simulatorName: clone.name, bundleId },
      };
    },
    async run({ job, environment }) {
      const preparedJob = withSimulatorMetadata(job, environment.metadata);
      if (preparedJob.plan.metadata?.scannerProvider === "codex")
        return runCodexIosValidation(preparedJob);
      return runClaudeIosValidation(preparedJob);
    },
    async cleanup(environment) {
      const simulatorUdid = stringMetadata(environment.metadata.simulatorUdid) || environment.id;
      if (simulatorUdid) await deleteSimulator(simulatorUdid);
    },
  };
}

async function runCodexIosValidation(job: ValidationJob) {
  if (!canUseCodexSdk())
    return unableToTest(job, "Codex SDK is not configured, so iOS validation could not run.");
  const artifactStore = new FilesystemRunArtifactStore();
  const validationRun = await collectCodexStructuredOutput({
    runId: job.runId,
    jobId: job.id,
    prompt: buildIosValidationPrompt(job),
    cwd: process.cwd(),
    transcriptPath: `transcripts/codex-ios-validation-${safePathPart(job.id)}.jsonl`,
    transcriptTitle: `Codex iOS validation transcript: ${job.findingId}`,
    artifactStore,
    additionalDirectories: iosSimulatorAdditionalDirectories(),
  });
  if (!canUseOpenAiApi())
    return unableToTest(
      job,
      "OpenAI API is not configured, so raw iOS validation could not be normalized.",
      validationRun.transcriptArtifact,
    );
  const structuredOutput = await collectOpenAiStructuredOutput({
    instructions:
      "Convert raw RedAI iOS validation summaries into strict structured validation results. Do not invent evidence.",
    input: buildValidationNormalizationPrompt(job, validationRun.finalResponse),
    outputSchema: z.toJSONSchema(validationAgentOutputSchema) as Record<string, unknown>,
    schemaName: "validation_result",
  });
  const parsed = validationAgentOutputSchema.safeParse(structuredOutput);
  if (!parsed.success)
    return unableToTest(
      job,
      "OpenAI API returned invalid structured iOS validation output.",
      validationRun.transcriptArtifact,
    );
  return normalizeValidationAgentOutput(job, parsed.data, validationRun.transcriptArtifact);
}

async function runClaudeIosValidation(job: ValidationJob) {
  if (!canUseClaudeAgentSdk())
    return unableToTest(
      job,
      "Claude Agent SDK is not configured, so iOS validation could not run.",
    );
  const artifactStore = new FilesystemRunArtifactStore();
  const validationRun = await collectClaudeStructuredOutput({
    runId: job.runId,
    jobId: job.id,
    prompt: buildIosValidationPrompt(job),
    options: {
      cwd: process.cwd(),
      tools: ["Read", "Glob", "Grep", "Bash"],
      allowedTools: ["Read", "Glob", "Grep", "Bash", "Write"],
      disallowedTools: ["Edit", "MultiEdit"],
    },
    transcriptPath: `transcripts/ios-validation-${safePathPart(job.id)}.jsonl`,
    transcriptTitle: `Claude iOS validation transcript: ${job.findingId}`,
    artifactStore,
  });
  if (!canUseAnthropicApi())
    return unableToTest(
      job,
      "Anthropic API is not configured, so raw iOS validation could not be normalized.",
      validationRun.transcriptArtifact,
    );
  const structuredOutput = await collectAnthropicStructuredOutput({
    instructions:
      "Convert raw RedAI iOS validation summaries into strict structured validation results. Do not invent evidence.",
    input: buildValidationNormalizationPrompt(job, validationRun.finalResponse),
    outputSchema: z.toJSONSchema(validationAgentOutputSchema) as Record<string, unknown>,
    toolName: "emit_validation_result",
    toolDescription: "Emit the structured RedAI validation result.",
  });
  const parsed = validationAgentOutputSchema.safeParse(structuredOutput);
  if (!parsed.success)
    return unableToTest(
      job,
      "Anthropic API returned invalid structured iOS validation output.",
      validationRun.transcriptArtifact,
    );
  return normalizeValidationAgentOutput(job, parsed.data, validationRun.transcriptArtifact);
}

function withSimulatorMetadata(
  job: ValidationJob,
  metadata: Record<string, unknown>,
): ValidationJob {
  return { ...job, plan: { ...job.plan, metadata: { ...job.plan.metadata, ...metadata } } };
}

function unableToTest(
  job: ValidationJob,
  summary: string,
  transcriptArtifact?: Parameters<typeof normalizeValidationAgentOutput>[2],
) {
  return {
    findingId: job.findingId,
    status: "unable-to-test" as const,
    confidence: "low" as const,
    summary,
    reproductionSteps: job.plan.steps,
    payloadsTried: [],
    evidence: transcriptArtifact ? [transcriptArtifact] : [],
    ...(transcriptArtifact ? { agentTranscriptRef: transcriptArtifact.path } : {}),
  };
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 160);
}

function iosSimulatorAdditionalDirectories(): string[] {
  const home = process.env.HOME;
  return home
    ? [`${home}/Library/Developer/CoreSimulator`, `${home}/Library/Logs/CoreSimulator`]
    : [];
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
