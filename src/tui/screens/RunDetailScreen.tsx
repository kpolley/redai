import { Box, Text } from "ink";
import type React from "react";
import type { Finding, ScanRunState } from "../../domain";
import { ListPreviewLayout } from "../components/ListPreviewLayout";
import { sortFindingsBySeverity } from "../state/sort-findings";
import { validationRows } from "./RunValidationScreen";

export type FindingDetailMode = "details" | "validation";

interface RunDetailScreenProps {
  state: ScanRunState;
  selectedFindingIndex: number;
}

export function RunDetailScreen({ state, selectedFindingIndex }: RunDetailScreenProps) {
  const findings = sortFindingsBySeverity(state.findings);
  return (
    <ListPreviewLayout
      listTitle="Findings"
      items={findings}
      selectedIndex={selectedFindingIndex}
      listWidth={42}
      emptyListText="No findings yet"
      previewEmptyText="Select a finding."
      renderRow={(finding, _index, selected) => (
        <FindingRow key={finding.id} finding={finding} selected={selected} />
      )}
      renderPreview={(finding) => <FindingListPreview finding={finding} state={state} />}
    />
  );
}

function FindingRow({ finding, selected }: { finding: Finding; selected: boolean }) {
  const row = `${selected ? "▸" : " "} [${finding.severity.toUpperCase().padEnd(8)}] ${finding.title}`;
  const text = row.length > 39 ? `${row.slice(0, 36)}...` : row.padEnd(39);
  return selected ? <Text color="cyan">{text}</Text> : <Text>{text}</Text>;
}

function FindingListPreview({ finding, state }: { finding: Finding; state: ScanRunState }) {
  const result = state.validationResults.find((item) => item.findingId === finding.id);
  const relatedUnitCount = relatedUnits(finding, state).length;
  const relatedJobCount = validationRows(state).filter(
    (job) => job.findingId === finding.id,
  ).length;
  return (
    <>
      <Text color="cyan">▣ {finding.title}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Severity: {finding.severity}</Text>
        <Text>Confidence: {finding.confidence}</Text>
        <Text>Status: {finding.validationStatus}</Text>
        <Text>
          Related: {relatedUnitCount} units · {relatedJobCount} validation jobs
        </Text>
      </Box>
      <Section title="Summary">
        <Text>{finding.validationNotes.suspectedVulnerability}</Text>
      </Section>
      <Section title="Validation">
        <Text>{result?.summary ?? "No validation result yet."}</Text>
      </Section>
      <Text color="gray">Press Enter to open finding details.</Text>
    </>
  );
}

function relatedUnits(finding: Finding, state: ScanRunState) {
  const findingPaths = new Set(finding.affectedLocations.map((location) => location.path));
  const relevantPaths = new Set(finding.validationNotes.relevantPaths);
  return state.analysisUnits.filter((unit) => {
    if (
      state.analysisUnitResults.some(
        (result) => result.unitId === unit.id && result.candidateFindingIds.includes(finding.id),
      )
    )
      return true;
    if (findingPaths.has(unit.location.path) || relevantPaths.has(unit.location.path)) return true;
    return unit.relatedFiles.some((path) => findingPaths.has(path) || relevantPaths.has(path));
  });
}

function _statusIcon(status: string): string {
  if (status === "running") return "●";
  if (status === "completed") return "✓";
  if (status === "error") return "✕";
  return "○";
}

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <Box marginTop={2} flexDirection="column">
      <Text color="gray">──────────────── {title} ────────────────</Text>
      {children}
    </Box>
  );
}
