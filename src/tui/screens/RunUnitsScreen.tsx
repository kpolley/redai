import { Box, Text } from "ink";
import type React from "react";
import type { AnalysisUnit, AnalysisUnitResult, ScanRunState } from "../../domain";
import { ListPreviewLayout } from "../components/ListPreviewLayout";

interface RunUnitsScreenProps {
  state: ScanRunState;
  selectedUnitIndex: number;
}

export function RunUnitsScreen({ state, selectedUnitIndex }: RunUnitsScreenProps) {
  return (
    <ListPreviewLayout
      listTitle="Units"
      previewTitle="Unit Preview"
      items={state.analysisUnits}
      selectedIndex={selectedUnitIndex}
      listWidth={44}
      emptyListText="No analysis units yet"
      previewEmptyText="Waiting for analysis units."
      renderRow={(unit, _index, selected) => (
        <UnitRow key={unit.id} unit={unit} selected={selected} />
      )}
      renderPreview={(unit) => (
        <UnitDetails
          unit={unit}
          result={state.analysisUnitResults.find((item) => item.unitId === unit.id)}
        />
      )}
    />
  );
}

function UnitRow({ unit, selected }: { unit: AnalysisUnit; selected: boolean }) {
  const row = `${selected ? "▸" : " "} [${unit.kind.padEnd(12).slice(0, 12)}] ${unit.title}`;
  const text = row.length > 41 ? `${row.slice(0, 38)}...` : row.padEnd(41);
  return selected ? <Text color="cyan">{text}</Text> : <Text>{text}</Text>;
}

function UnitDetails({
  unit,
  result,
}: {
  unit: AnalysisUnit;
  result: AnalysisUnitResult | undefined;
}) {
  return (
    <>
      <Text color="cyan">▣ {unit.title}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Kind: {unit.kind}</Text>
        <Text>Language: {unit.language}</Text>
        <Text>Location: {formatLocation(unit)}</Text>
        <Text>Status: {result?.status ?? "pending"}</Text>
      </Box>
      <Section title="Context">
        <Text>{unit.contextSummary}</Text>
      </Section>
      <Section title="Result">
        {result ? (
          <>
            <Text>{result.summary}</Text>
            {result.securityObservations.map((observation) => (
              <Text key={observation}>• {observation}</Text>
            ))}
            {result.transcriptRef ? <Text>Transcript: {result.transcriptRef}</Text> : null}
            {result.error ? <Text color="red">{result.error}</Text> : null}
          </>
        ) : (
          <Text color="gray">No unit result yet.</Text>
        )}
      </Section>
      <Section title="Related">
        <Text>Files: {unit.relatedFiles.join(", ") || "none"}</Text>
        <Text>Entrypoints: {unit.relatedEntrypoints.length}</Text>
        <Text>Threats: {unit.relatedThreats.length}</Text>
      </Section>
    </>
  );
}

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <Box marginTop={2} flexDirection="column">
      <Text color="gray">──────────────── {title} ────────────────</Text>
      {children}
    </Box>
  );
}

function formatLocation(unit: AnalysisUnit): string {
  const line = unit.location.line ? `:${unit.location.line}` : "";
  const symbol = unit.location.symbol ? ` ${unit.location.symbol}` : "";
  return `${unit.location.path}${line}${symbol}`;
}
