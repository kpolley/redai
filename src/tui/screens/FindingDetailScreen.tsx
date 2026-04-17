import { Text } from "ink";
import type { Finding, ScanRunState } from "../../domain";
import { maxScrollOffset, ScrollableDetails } from "../components/ScrollableDetails";
import { sortFindingsBySeverity } from "../state/sort-findings";
import type { FindingDetailMode } from "./RunDetailScreen";
import { validationRows } from "./RunValidationScreen";

interface FindingDetailScreenProps {
  state: ScanRunState;
  selectedFindingIndex: number;
  findingDetailMode: FindingDetailMode;
  scrollOffset: number;
  viewportHeight: number;
}

export function FindingDetailScreen({
  state,
  selectedFindingIndex,
  findingDetailMode,
  scrollOffset,
  viewportHeight,
}: FindingDetailScreenProps) {
  const finding = sortFindingsBySeverity(state.findings)[selectedFindingIndex];
  const lines = finding
    ? findingDetailLines(finding, state, findingDetailMode)
    : [{ kind: "muted" as const, text: "Waiting for findings." }];
  return (
    <ScrollableDetails
      title={finding ? `Finding ${findingDetailMode}` : "Finding Details"}
      lines={lines}
      scrollOffset={scrollOffset}
      viewportHeight={viewportHeight}
      pageSize={findingDetailPageSize}
      renderLine={(line, index) => <FindingLine key={index} line={line} />}
    />
  );
}

export function findingDetailPageSize(viewportHeight: number): number {
  return Math.max(2, viewportHeight - 4);
}

export function maxFindingDetailScrollOffset(
  state: ScanRunState,
  selectedFindingIndex: number,
  mode: FindingDetailMode,
  viewportHeight: number,
): number {
  const finding = sortFindingsBySeverity(state.findings)[selectedFindingIndex];
  const lines = finding ? findingDetailLines(finding, state, mode) : [];
  return maxScrollOffset(lines.length, viewportHeight, findingDetailPageSize);
}

type FindingLine =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "muted"; text: string }
  | { kind: "severity"; severity: string; text: string };

function FindingLine({ line }: { line: FindingLine }) {
  if (line.kind === "heading")
    return <Text color="gray">──────────────── {line.text} ────────────────</Text>;
  if (line.kind === "muted") return <Text color="gray">{line.text}</Text>;
  if (line.kind === "severity")
    return (
      <Text>
        <Text color={severityColor(line.severity)}>{line.severity.toUpperCase().padEnd(8)}</Text>{" "}
        {line.text}
      </Text>
    );
  return <Text>{line.text}</Text>;
}

function findingDetailLines(
  finding: Finding,
  state: ScanRunState,
  mode: FindingDetailMode,
): FindingLine[] {
  if (mode === "validation") return findingValidationLines(finding, state);
  return findingDetailsLines(finding, state);
}

function findingDetailsLines(finding: Finding, state: ScanRunState): FindingLine[] {
  const result = state.validationResults.find((item) => item.findingId === finding.id);
  const lines: FindingLine[] = [
    { kind: "text", text: `▣ ${finding.title}` },
    { kind: "text", text: `Status: ${finding.validationStatus}` },
    {
      kind: "severity",
      severity: finding.severity,
      text: `Severity · confidence ${finding.confidence}`,
    },
    { kind: "heading", text: "Attack Scenario" },
    { kind: "text", text: finding.attackScenario },
    { kind: "heading", text: "Validation Notes" },
    { kind: "text", text: finding.validationNotes.suspectedVulnerability },
    { kind: "muted", text: finding.validationNotes.exploitabilityReasoning },
    { kind: "heading", text: "Evidence" },
  ];
  if (finding.evidence.length === 0)
    lines.push({ kind: "muted", text: "No static evidence listed." });
  for (const evidence of finding.evidence) lines.push({ kind: "text", text: `• ${evidence}` });
  lines.push({ kind: "text", text: result?.summary ?? "No validation result yet." });
  lines.push({ kind: "heading", text: "Remediation" }, { kind: "text", text: finding.remediation });
  return lines.flatMap(wrapLine);
}

function findingValidationLines(finding: Finding, state: ScanRunState): FindingLine[] {
  const jobs = validationRows(state).filter((job) => job.findingId === finding.id);
  const result = state.validationResults.find((item) => item.findingId === finding.id);
  const lines: FindingLine[] = [
    { kind: "text", text: `▣ Validation for ${finding.title}` },
    { kind: "heading", text: "Jobs" },
  ];
  if (jobs.length === 0)
    lines.push({ kind: "muted", text: "No validation jobs for this finding." });
  for (const job of jobs) {
    lines.push({
      kind: "text",
      text: `${statusIcon(job.status)} ${job.status} · ${job.validatorId}`,
    });
    if (job.appUrl) lines.push({ kind: "muted", text: `App URL: ${job.appUrl}` });
    if (job.agentBrowserHome)
      lines.push({ kind: "muted", text: `Dashboard home: ${job.agentBrowserHome}` });
    if (job.simulatorName) lines.push({ kind: "muted", text: `Simulator: ${job.simulatorName}` });
    for (const trace of (job.trace ?? []).slice(-6))
      lines.push({ kind: "muted", text: `• ${trace}` });
  }
  lines.push({ kind: "heading", text: "Result" });
  if (result) {
    lines.push({ kind: "text", text: `${result.status} · ${result.confidence}` });
    lines.push({ kind: "text", text: result.summary });
    result.reproductionSteps.forEach((step, index) => {
      lines.push({ kind: "text", text: `${index + 1}. ${step}` });
    });
    if (result.payloadsTried.length > 0) lines.push({ kind: "heading", text: "Payloads Tried" });
    for (const payload of result.payloadsTried) lines.push({ kind: "text", text: `• ${payload}` });
    if (result.evidence.length > 0) lines.push({ kind: "heading", text: "Evidence Artifacts" });
    for (const artifact of result.evidence)
      lines.push({
        kind: "text",
        text: `• [${artifact.kind}] ${artifact.title}${artifact.path ? ` — ${artifact.path}` : ""}`,
      });
    if (result.agentTranscriptRef)
      lines.push({ kind: "text", text: `Transcript: ${result.agentTranscriptRef}` });
  } else {
    lines.push({ kind: "muted", text: "No validation result yet." });
  }
  return lines.flatMap(wrapLine);
}

function wrapLine(line: FindingLine): FindingLine[] {
  if (line.kind === "heading" || line.text.length <= 140) return [line];
  const chunks: FindingLine[] = [];
  for (let index = 0; index < line.text.length; index += 140)
    chunks.push({ ...line, text: line.text.slice(index, index + 140) });
  return chunks;
}

function statusIcon(status: string): string {
  if (status === "running") return "●";
  if (status === "completed") return "✓";
  if (status === "error") return "✕";
  return "○";
}

function severityColor(severity: string): "gray" | "green" | "yellow" | "red" | "magenta" {
  if (severity === "critical") return "magenta";
  if (severity === "high") return "red";
  if (severity === "medium") return "yellow";
  if (severity === "low") return "green";
  return "gray";
}
