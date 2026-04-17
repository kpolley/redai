import { join } from "node:path";
import { Text } from "ink";
import type { RunStatus, ScanRunState, ValidatorEnvironment } from "../../domain";
import { displayPath, getRedaiRunDir } from "../../paths";
import { maxScrollOffset, ScrollableDetails } from "../components/ScrollableDetails";

interface RunOverviewScreenProps {
  state: ScanRunState;
  validatorEnvironments: ValidatorEnvironment[];
  scrollOffset: number;
  viewportHeight: number;
}

export function RunOverviewScreen({
  state,
  validatorEnvironments,
  scrollOffset,
  viewportHeight,
}: RunOverviewScreenProps) {
  const lines = overviewLines(state, validatorEnvironments);
  return (
    <ScrollableDetails
      title="Overview"
      lines={lines}
      scrollOffset={scrollOffset}
      viewportHeight={viewportHeight}
      pageSize={overviewPageSize}
      renderLine={(line, index) => <OverviewLine key={index} line={line} />}
    />
  );
}

export function overviewPageSize(viewportHeight: number): number {
  return Math.max(2, viewportHeight - 4);
}

export function maxOverviewScrollOffset(
  state: ScanRunState,
  validatorEnvironments: ValidatorEnvironment[],
  viewportHeight: number,
): number {
  return maxScrollOffset(
    overviewLines(state, validatorEnvironments).length,
    viewportHeight,
    overviewPageSize,
  );
}

type OverviewLine =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "muted"; text: string }
  | { kind: "status"; label: string; status: RunStatus }
  | { kind: "severity"; severity: string; text: string };

function OverviewLine({ line }: { line: OverviewLine }) {
  if (line.kind === "heading")
    return <Text color="gray">──────────────── {line.text} ────────────────</Text>;
  if (line.kind === "muted") return <Text color="gray">{line.text}</Text>;
  if (line.kind === "status")
    return (
      <Text>
        {line.label}:{" "}
        <Text color={runStatusColor(line.status)}>
          {runStatusIcon(line.status)} {line.status}
        </Text>
      </Text>
    );
  if (line.kind === "severity")
    return (
      <Text>
        <Text color={severityColor(line.severity)}>{line.severity.toUpperCase().padEnd(8)}</Text>{" "}
        {line.text}
      </Text>
    );
  return <Text>{line.text}</Text>;
}

function overviewLines(
  state: ScanRunState,
  validatorEnvironments: ValidatorEnvironment[],
): OverviewLine[] {
  const completedUnits = state.analysisUnitResults.filter(
    (result) => result.status === "completed",
  ).length;
  const failedUnits = state.analysisUnitResults.filter(
    (result) => result.status === "failed",
  ).length;
  const confirmedFindings = state.validationResults.filter(
    (result) => result.status === "confirmed",
  ).length;
  const lines: OverviewLine[] = [
    { kind: "text", text: `▣ ${state.run.name}` },
    { kind: "status", label: "Status", status: state.run.status },
    { kind: "text", text: `Target: ${formatTarget(state.run.target)}` },
    {
      kind: "text",
      text: `Environment: ${formatEnvironmentName(state.run.settings.validatorEnvironmentId, validatorEnvironments)}`,
    },
    {
      kind: "text",
      text: `Scan agents: ${state.run.settings.unitAgentConcurrency} · Validator agents: ${state.run.settings.validatorAgentConcurrency}`,
    },
    {
      kind: "text",
      text: `Findings: ${state.findings.length} candidate · ${confirmedFindings} confirmed`,
    },
    {
      kind: "text",
      text: `Analysis units: ${state.analysisUnits.length} discovered · ${completedUnits} completed · ${failedUnits} failed`,
    },
    ...reportPathLines(state),
    { kind: "muted", text: "" },
    { kind: "heading", text: "Stages" },
  ];

  if (state.stages.length === 0) lines.push({ kind: "muted", text: "No stage activity yet." });
  for (const stage of state.stages) {
    const progress = stage.total
      ? ` ${stage.current ?? 0}/${stage.total}`
      : stage.current
        ? ` ${stage.current}`
        : "";
    const message = stage.message ? ` · ${stage.message}` : "";
    lines.push({
      kind: "text",
      text: `${stageIcon(stage.status)} ${stage.label.padEnd(20)} ${stage.status}${progress}${message}`,
    });
  }

  lines.push({ kind: "muted", text: "" }, { kind: "heading", text: "Recent Activity" });
  if (state.activity.length === 0) lines.push({ kind: "muted", text: "No activity yet." });
  for (const activity of state.activity.slice(-8))
    lines.push({ kind: "text", text: `${formatTime(activity.createdAt)} ${activity.message}` });

  lines.push({ kind: "muted", text: "" }, { kind: "heading", text: "Threat Model" });
  if (state.threatModel) {
    lines.push({ kind: "text", text: state.threatModel.summary });
    lines.push({
      kind: "text",
      text: `Architecture: ${state.threatModel.architecture.applicationType} · ${state.threatModel.architecture.technologies.join(", ")}`,
    });
    lines.push({
      kind: "text",
      text: `Assets: ${state.threatModel.assets.map((asset) => asset.name).join(", ") || "none"}`,
    });
    lines.push({
      kind: "text",
      text: `Focus: ${state.threatModel.recommendedFocusAreas.map((area) => area.title).join(", ") || "none"}`,
    });
    if (state.threatModel.transcriptRef)
      lines.push({ kind: "text", text: `Transcript: ${state.threatModel.transcriptRef}` });
  } else {
    lines.push({ kind: "muted", text: "Threat model pending." });
  }

  lines.push({ kind: "muted", text: "" }, { kind: "heading", text: "Analysis Units" });
  const unitCounts = summarizeUnits(state);
  if (unitCounts.length === 0)
    lines.push({ kind: "muted", text: "Analysis unit discovery pending." });
  for (const line of unitCounts) lines.push({ kind: "text", text: line });

  lines.push({ kind: "muted", text: "" }, { kind: "heading", text: "Recent Findings" });
  if (state.findings.length === 0)
    lines.push({ kind: "muted", text: "No findings discovered yet." });
  for (const finding of [...state.findings].reverse().slice(0, 20))
    lines.push({
      kind: "severity",
      severity: finding.severity,
      text: `${finding.title} · ${finding.validationStatus}`,
    });

  return lines;
}

function reportPathLines(state: ScanRunState): OverviewLine[] {
  const reportArtifact =
    state.artifacts.find((artifact) => artifact.path === "report.md") ??
    (state.run.status === "completed" ? { path: "report.md" } : undefined);
  if (!reportArtifact?.path) return [];
  const absolute = join(getRedaiRunDir(state.run.id), reportArtifact.path);
  return [{ kind: "text", text: `Report: ${displayPath(absolute)}` }];
}

function summarizeUnits(state: ScanRunState): string[] {
  const counts = new Map<string, number>();
  for (const unit of state.analysisUnits) counts.set(unit.kind, (counts.get(unit.kind) ?? 0) + 1);
  return [...counts.entries()].map(([kind, count]) => `${kind}: ${count}`);
}

function formatEnvironmentName(
  environmentId: string,
  environments: ValidatorEnvironment[],
): string {
  return (
    environments.find((environment) => environment.id === environmentId)?.name ?? environmentId
  );
}

function formatTarget(target: ScanRunState["run"]["target"]): string {
  if (target.kind === "website") return target.url;
  return target.path;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function stageIcon(status: string): string {
  if (status === "completed") return "✓";
  if (status === "running") return "●";
  if (status === "failed") return "✕";
  if (status === "canceled") return "◼";
  return "○";
}

function runStatusIcon(status: RunStatus): string {
  if (status === "completed") return "✓";
  if (status === "failed") return "✕";
  if (status === "canceled") return "◼";
  if (status === "cancel-pending") return "◌";
  if (["queued", "scanning", "planning-validation", "validating"].includes(status)) return "●";
  return "○";
}

function runStatusColor(status: RunStatus): "gray" | "green" | "yellow" | "red" | "cyan" {
  if (status === "completed") return "green";
  if (status === "failed") return "red";
  if (status === "canceled") return "gray";
  if (status === "cancel-pending") return "yellow";
  if (["queued", "scanning", "planning-validation", "validating"].includes(status)) return "yellow";
  return "cyan";
}

function severityColor(severity: string): "gray" | "green" | "yellow" | "red" | "magenta" {
  if (severity === "critical") return "magenta";
  if (severity === "high") return "red";
  if (severity === "medium") return "yellow";
  if (severity === "low") return "green";
  return "gray";
}
