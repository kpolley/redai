import type { RunArtifactStore } from "../artifacts/run-artifact-store";
import type { AnalysisUnit, AnalysisUnitResult, Finding, ScanRun, ThreatModel } from "../domain";
import type { RunEventEmitter } from "../pipeline/events";
import type { UnitSourceContext } from "./unit-source-context";

export interface UnitScannerInput {
  run: ScanRun;
  threatModel: ThreatModel;
  unit: AnalysisUnit;
  sourceContext?: UnitSourceContext;
  artifactStore?: RunArtifactStore;
  emit?: RunEventEmitter;
}

export interface UnitScannerOutput {
  result: AnalysisUnitResult;
  candidateFindings: Finding[];
}

export interface UnitScanner {
  scanUnit(input: UnitScannerInput): Promise<UnitScannerOutput>;
}
