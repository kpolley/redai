import type { AgentRunner } from "../agents/agent-runner";
import type { ArtifactStore } from "../artifacts/artifact-store";
import type { ScanRunState, ValidationJob, ValidationResult } from "../domain";
import type { RunEventEmitter } from "../pipeline/events";

export interface ValidatorCapability {
  kind: "web" | "ios" | "api" | "container" | "desktop";
  label: string;
}

export interface ValidatorMatchContext {
  runState: ScanRunState;
  findingId: string;
}

export interface ValidatorMatchResult {
  supported: boolean;
  reason: string;
}

export interface PreparedEnvironment {
  id: string;
  metadata: Record<string, unknown>;
}

export interface ValidatorPlugin {
  id: string;
  label: string;
  capabilities: ValidatorCapability[];
  canValidate(context: ValidatorMatchContext): Promise<ValidatorMatchResult>;
  prepare(job: ValidationJob): Promise<PreparedEnvironment>;
  run(input: {
    job: ValidationJob;
    environment: PreparedEnvironment;
    agentRunner: AgentRunner;
    artifactStore: ArtifactStore;
    emit: RunEventEmitter;
  }): Promise<ValidationResult>;
  cleanup(environment: PreparedEnvironment): Promise<void>;
}
