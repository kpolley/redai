import type {
  AnalysisUnit,
  AnalysisUnitResult,
  Artifact,
  FilePrioritization,
  Finding,
  RunActivity,
  RunStageId,
  RunStageState,
  ScanRun,
  ThreatModel,
  ValidationPlan,
  ValidationResult,
} from "../domain";

export type RunEvent =
  | { type: "run.created"; run: ScanRun }
  | { type: "run.status.changed"; runId: string; status: ScanRun["status"]; updatedAt: string }
  | { type: "run.activity"; runId: string; activity: RunActivity }
  | { type: "scan.started"; runId: string }
  | { type: "stage.changed"; runId: string; stage: RunStageState }
  | {
      type: "stage.progress";
      runId: string;
      stageId: RunStageId;
      current: number;
      total?: number;
      message?: string;
    }
  | { type: "threatModel.started"; runId: string }
  | { type: "threatModel.completed"; runId: string; threatModel: ThreatModel }
  | {
      type: "filePrioritization.completed";
      runId: string;
      prioritization: FilePrioritization;
    }
  | { type: "analysisUnit.discovered"; runId: string; unit: AnalysisUnit }
  | { type: "analysisUnit.discovery.completed"; runId: string; count: number }
  | { type: "analysisUnit.started"; runId: string; unitId: string }
  | {
      type: "analysisUnit.completed";
      runId: string;
      result: AnalysisUnitResult;
      candidateFindings: Finding[];
    }
  | { type: "analysisUnit.failed"; runId: string; result: AnalysisUnitResult }
  | { type: "finding.created"; runId: string; finding: Finding }
  | { type: "validation.plan.created"; runId: string; findingId: string; plan: ValidationPlan }
  | {
      type: "validation.started";
      runId: string;
      findingId: string;
      jobId: string;
      validatorId?: string;
      appUrl?: string;
      profilePath?: string;
      agentBrowserHome?: string;
      simulatorUdid?: string;
      simulatorName?: string;
    }
  | { type: "validation.agent.output"; runId: string; jobId: string; message: string }
  | { type: "artifact.created"; runId: string; jobId: string; artifact: Artifact }
  | {
      type: "validation.completed";
      runId: string;
      findingId: string;
      result: ValidationResult;
      jobId?: string;
    }
  | { type: "run.completed"; runId: string; updatedAt: string }
  | { type: "run.failed"; runId: string; message: string; updatedAt: string };

export type RunEventEmitter = (event: RunEvent) => void | Promise<void>;
export type Unsubscribe = () => void;
