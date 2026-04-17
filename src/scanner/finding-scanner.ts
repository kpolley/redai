import type { RunArtifactStore } from "../artifacts/run-artifact-store";
import type { Finding, ScanRun, ThreatModel } from "../domain";
import type { RunEventEmitter } from "../pipeline/events";

export interface FindingScannerInput {
  run: ScanRun;
  threatModel: ThreatModel;
  artifactStore?: RunArtifactStore;
  emit?: RunEventEmitter;
}

export interface FindingScanner {
  findVulnerabilities(input: FindingScannerInput): Promise<Finding[]>;
}
