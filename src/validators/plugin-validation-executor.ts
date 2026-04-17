import { ClaudeAgentRunner } from "../agents/claude/claude-agent-runner";
import { FilesystemArtifactStore } from "../artifacts/filesystem-artifact-store";
import type { ValidationJob } from "../domain";
import type { ValidationExecutor, ValidationExecutorInput } from "./validation-executor";
import type { ValidatorPlugin } from "./validator-plugin";

export class PluginValidationExecutor implements ValidationExecutor {
  constructor(private readonly validators: ValidatorPlugin[]) {}

  async run(input: ValidationExecutorInput) {
    const validator = this.validators.find((candidate) => candidate.id === input.plan.validatorId);
    if (!validator) {
      throw new Error(`Validator plugin not found for ${input.plan.validatorId}.`);
    }

    const job: ValidationJob = {
      id: crypto.randomUUID(),
      runId: input.run.id,
      findingId: input.finding.id,
      validatorId: input.plan.validatorId,
      plan: input.plan,
    };

    const match = await validator.canValidate({
      runState: {
        run: input.run,
        stages: [],
        activity: [],
        analysisUnits: [],
        analysisUnitResults: [],
        artifacts: [],
        findings: [input.finding],
        validationPlans: [input.plan],
        validationJobs: [],
        validationResults: [],
      },
      findingId: input.finding.id,
    });

    if (!match.supported) {
      await emitValidationActivity(
        input,
        "warn",
        `${validator.label} unavailable: ${match.reason}`,
      );
      return unableToTest(input, match.reason);
    }

    const environment = await validator.prepare(job);
    try {
      const appUrl = stringMetadata(input.plan.metadata?.appUrl);
      const profilePath = stringMetadata(
        environment.metadata.profilePath ?? input.plan.metadata?.profilePath,
      );
      const agentBrowserHome = stringMetadata(environment.metadata.agentBrowserHome);
      const simulatorUdid = stringMetadata(environment.metadata.simulatorUdid);
      const simulatorName = stringMetadata(environment.metadata.simulatorName);
      await input.emit({
        type: "validation.started",
        runId: input.run.id,
        findingId: input.finding.id,
        jobId: environment.id,
        validatorId: input.plan.validatorId,
        ...(appUrl ? { appUrl } : {}),
        ...(profilePath ? { profilePath } : {}),
        ...(agentBrowserHome ? { agentBrowserHome } : {}),
        ...(simulatorUdid ? { simulatorUdid } : {}),
        ...(simulatorName ? { simulatorName } : {}),
      });
      return await validator.run({
        job: { ...job, id: environment.id },
        environment,
        agentRunner: new ClaudeAgentRunner(),
        artifactStore: new FilesystemArtifactStore(),
        emit: input.emit,
      });
    } finally {
      await validator.cleanup(environment);
    }
  }
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function emitValidationActivity(
  input: ValidationExecutorInput,
  level: "info" | "warn" | "error",
  message: string,
): Promise<void> {
  await input.emit({
    type: "run.activity",
    runId: input.run.id,
    activity: {
      id: crypto.randomUUID(),
      level,
      message,
      createdAt: new Date().toISOString(),
    },
  });
}

function unableToTest(input: ValidationExecutorInput, reason: string) {
  return {
    findingId: input.finding.id,
    status: "unable-to-test" as const,
    confidence: "high" as const,
    summary: reason,
    reproductionSteps: input.plan.steps,
    payloadsTried: [],
    evidence: [],
  };
}
