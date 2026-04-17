import type {
  Artifact,
  Finding,
  RunStageId,
  RunStageState,
  ScanRun,
  ScanRunState,
  ValidationJobState,
} from "../domain";
import type { RunEvent } from "./events";

export function emptyRunState(run: ScanRun): ScanRunState {
  return {
    run,
    stages: defaultStages(),
    activity: [],
    analysisUnits: [],
    analysisUnitResults: [],
    artifacts: [],
    findings: [],
    validationPlans: [],
    validationJobs: [],
    validationResults: [],
  };
}

export function applyRunEvent(state: ScanRunState, event: RunEvent): ScanRunState {
  switch (event.type) {
    case "run.created":
      return emptyRunState(event.run);
    case "run.status.changed":
      return {
        ...state,
        run: { ...state.run, status: event.status, updatedAt: event.updatedAt },
        stages:
          event.status === "canceled"
            ? markCancelableStages(state.stages, "canceled", event.updatedAt)
            : markCancelPendingStages(state.stages, event.status),
      };
    case "run.activity":
      return { ...state, activity: [...state.activity, event.activity].slice(-200) };
    case "scan.started":
      return { ...withStatus(state, "scanning"), stages: defaultStages() };
    case "stage.changed":
      return { ...state, stages: upsertStage(state.stages, event.stage) };
    case "stage.progress":
      return {
        ...state,
        stages: progressStage(
          state.stages,
          event.stageId,
          event.current,
          event.total,
          event.message,
        ),
      };
    case "threatModel.started":
      return withStatus(state, "scanning");
    case "threatModel.completed":
      return { ...state, threatModel: event.threatModel };
    case "filePrioritization.completed":
      return { ...state, filePrioritization: event.prioritization };
    case "analysisUnit.discovered":
      return { ...state, analysisUnits: [...state.analysisUnits, event.unit] };
    case "analysisUnit.discovery.completed":
      return state;
    case "analysisUnit.started":
      return state;
    case "analysisUnit.completed":
      return { ...state, analysisUnitResults: [...state.analysisUnitResults, event.result] };
    case "analysisUnit.failed":
      return { ...state, analysisUnitResults: [...state.analysisUnitResults, event.result] };
    case "finding.created":
      return { ...state, findings: [...state.findings, event.finding] };
    case "validation.plan.created":
      return {
        ...state,
        run: { ...state.run, status: "planning-validation", updatedAt: new Date().toISOString() },
        findings: updateFinding(state.findings, event.findingId, { validationStatus: "planned" }),
        validationPlans: [...state.validationPlans, event.plan],
        validationJobs: upsertValidationJob(state.validationJobs, {
          id: event.plan.id,
          findingId: event.findingId,
          validatorId: event.plan.validatorId,
          status: "queued",
          trace: [],
          appUrl: stringMetadata(event.plan.metadata?.appUrl),
          profilePath: stringMetadata(event.plan.metadata?.profilePath),
        }),
      };
    case "validation.started":
      return {
        ...state,
        run: { ...state.run, status: "validating", updatedAt: new Date().toISOString() },
        findings: updateFinding(state.findings, event.findingId, {
          validationStatus: "validating",
        }),
        validationJobs: upsertValidationJob(state.validationJobs, {
          id: event.jobId,
          findingId: event.findingId,
          validatorId: event.validatorId ?? "validator",
          status: "running",
          trace: [],
          startedAt: new Date().toISOString(),
          appUrl: event.appUrl,
          profilePath: event.profilePath,
          agentBrowserHome: event.agentBrowserHome,
          simulatorUdid: event.simulatorUdid,
          simulatorName: event.simulatorName,
        }),
      };
    case "validation.completed":
      return {
        ...state,
        findings: updateFinding(state.findings, event.findingId, {
          validationStatus: event.result.status,
        }),
        validationResults: [...state.validationResults, event.result],
        artifacts: appendArtifacts(state.artifacts, event.result.evidence),
        validationJobs: completeValidationJob(state.validationJobs, event.findingId, event.jobId),
      };
    case "run.completed":
      return { ...state, run: { ...state.run, status: "completed", updatedAt: event.updatedAt } };
    case "run.failed":
      return {
        ...state,
        run: { ...state.run, status: "failed", updatedAt: event.updatedAt },
        stages: markCancelableStages(state.stages, "failed", event.updatedAt, event.message),
      };
    case "validation.agent.output":
      return {
        ...state,
        validationJobs: appendValidationTrace(state.validationJobs, event.jobId, event.message),
      };
    case "artifact.created":
      return { ...state, artifacts: [...state.artifacts, event.artifact] };
  }
}

export function defaultStages(): RunStageState[] {
  return [
    { id: "threat-model", label: "Threat model", status: "queued" },
    { id: "file-prioritization", label: "File prioritization", status: "queued" },
    { id: "analysis-discovery", label: "Analysis discovery", status: "queued" },
    { id: "unit-scanning", label: "Unit scanning", status: "queued" },
    { id: "finding-aggregation", label: "Finding aggregation", status: "queued" },
    { id: "validation", label: "Validation", status: "queued" },
    { id: "reporting", label: "Reporting", status: "queued" },
  ];
}

export function cancelActiveStages(
  stages: RunStageState[] | undefined,
  completedAt = new Date().toISOString(),
): RunStageState[] {
  return markCancelableStages(stages, "canceled", completedAt);
}

function upsertStage(stages: RunStageState[] | undefined, stage: RunStageState): RunStageState[] {
  const currentStages = stages && stages.length > 0 ? stages : defaultStages();
  return currentStages.map((current) =>
    current.id === stage.id ? { ...current, ...stage } : current,
  );
}

function progressStage(
  stages: RunStageState[] | undefined,
  stageId: RunStageId,
  current: number,
  total?: number,
  message?: string,
): RunStageState[] {
  const currentStages = stages && stages.length > 0 ? stages : defaultStages();
  return currentStages.map((stage) =>
    stage.id === stageId
      ? { ...stage, current, total: total ?? stage.total, message: message ?? stage.message }
      : stage,
  );
}

function markCancelableStages(
  stages: RunStageState[] | undefined,
  status: "canceled" | "failed",
  completedAt: string,
  message?: string,
): RunStageState[] {
  const currentStages = stages && stages.length > 0 ? stages : defaultStages();
  return currentStages.map((stage) => {
    if (!["queued", "running"].includes(stage.status)) return stage;
    return { ...stage, status, completedAt, message: message ?? stage.message };
  });
}

function markCancelPendingStages(
  stages: RunStageState[] | undefined,
  runStatus: ScanRun["status"],
): RunStageState[] {
  if (runStatus !== "cancel-pending") return stages ?? defaultStages();
  const currentStages = stages && stages.length > 0 ? stages : defaultStages();
  return currentStages.map((stage) =>
    stage.status === "running"
      ? { ...stage, message: "Cancel pending; waiting for active work." }
      : stage,
  );
}

function withStatus(state: ScanRunState, status: ScanRun["status"]): ScanRunState {
  return { ...state, run: { ...state.run, status, updatedAt: new Date().toISOString() } };
}

function updateFinding(findings: Finding[], findingId: string, patch: Partial<Finding>): Finding[] {
  return findings.map((finding) => (finding.id === findingId ? { ...finding, ...patch } : finding));
}

function appendArtifacts(current: Artifact[], next: Artifact[]): Artifact[] {
  const seen = new Set(current.map((artifact) => artifact.path ?? artifact.id));
  const additions = next.filter((artifact) => {
    const key = artifact.path ?? artifact.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return additions.length === 0 ? current : [...current, ...additions];
}

function upsertValidationJob(
  jobs: ValidationJobState[] | undefined,
  job: ValidationJobState,
): ValidationJobState[] {
  const currentJobs = jobs ?? [];
  const existingIndex = currentJobs.findIndex(
    (current) => current.id === job.id || current.findingId === job.findingId,
  );
  if (existingIndex === -1) return [...currentJobs, job];
  return currentJobs.map((current, index) =>
    index === existingIndex ? { ...current, ...job } : current,
  );
}

function completeValidationJob(
  jobs: ValidationJobState[] | undefined,
  findingId: string,
  jobId?: string,
): ValidationJobState[] {
  const completedAt = new Date().toISOString();
  return (jobs ?? []).map((job) => {
    if (jobId && job.id === jobId) return { ...job, status: "completed", completedAt };
    if (job.findingId === findingId && (job.status === "running" || !jobId))
      return { ...job, status: "completed", completedAt };
    return job;
  });
}

function appendValidationTrace(
  jobs: ValidationJobState[] | undefined,
  jobId: string,
  message: string,
): ValidationJobState[] {
  return (jobs ?? []).map((job) =>
    job.id === jobId ? { ...job, trace: [...(job.trace ?? []), message].slice(-40) } : job,
  );
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
