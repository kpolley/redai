import type { Finding, ScanRun, ValidationPlan, ValidationResult } from "../domain";
import type { RunEventEmitter } from "../pipeline/events";

export interface ValidationExecutorInput {
  run: ScanRun;
  finding: Finding;
  plan: ValidationPlan;
  emit: RunEventEmitter;
}

export interface ValidationExecutor {
  run(input: ValidationExecutorInput): Promise<ValidationResult>;
}
