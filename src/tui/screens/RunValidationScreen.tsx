import { Box, Text } from "ink";
import type React from "react";
import type { ScanRunState, ValidationJobState } from "../../domain";
import { Pane } from "../components/Pane";

interface RunValidationScreenProps {
  state: ScanRunState;
  selectedValidationIndex: number;
}

export function RunValidationScreen({ state, selectedValidationIndex }: RunValidationScreenProps) {
  const jobs = validationRows(state);
  const selected = jobs[selectedValidationIndex];
  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title="Validation" width={46}>
        {jobs.length === 0 ? <Text color="gray">No validation jobs yet</Text> : null}
        {jobs.map((job, index) => (
          <ValidationRow
            key={job.id}
            job={job}
            title={findingTitle(state, job.findingId)}
            selected={index === selectedValidationIndex}
          />
        ))}
      </Pane>
      <Pane title="Validation Details" flexGrow={1}>
        {selected ? (
          <ValidationDetails state={state} job={selected} />
        ) : (
          <Text color="gray">Waiting for validation jobs.</Text>
        )}
      </Pane>
    </Box>
  );
}

function ValidationRow({
  job,
  title,
  selected,
}: {
  job: ValidationJobState;
  title: string;
  selected: boolean;
}) {
  const row = `${selected ? "▸" : " "} ${statusIcon(job.status)} ${title}`;
  const text = row.length > 43 ? `${row.slice(0, 40)}...` : row.padEnd(43);
  return selected ? <Text color="cyan">{text}</Text> : <Text>{text}</Text>;
}

function ValidationDetails({ state, job }: { state: ScanRunState; job: ValidationJobState }) {
  const finding = state.findings.find((item) => item.id === job.findingId);
  const result = state.validationResults.find((item) => item.findingId === job.findingId);
  return (
    <Box flexDirection="column">
      <Text color="cyan">▣ {finding?.title ?? job.findingId}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Status: {statusIcon(job.status)} {job.status}
        </Text>
        <Text>Validator: {job.validatorId}</Text>
        {job.appUrl ? <Text>App URL: {job.appUrl}</Text> : null}
        {job.profilePath ? <Text>Browser profile: {job.profilePath}</Text> : null}
        {job.agentBrowserHome ? <Text>Dashboard home: {job.agentBrowserHome}</Text> : null}
        {job.simulatorName ? <Text>Simulator: {job.simulatorName}</Text> : null}
        {job.simulatorUdid ? <Text>Simulator UDID: {job.simulatorUdid}</Text> : null}
        {job.status === "running" && job.agentBrowserHome ? (
          <Text color="yellow">Press B to open the live agent-browser dashboard.</Text>
        ) : null}
      </Box>
      <Section title="Plan">
        {state.validationPlans
          .find((plan) => plan.findingId === job.findingId)
          ?.steps.map((step, index) => (
            <Text key={step}>
              {index + 1}. {step}
            </Text>
          )) ?? <Text color="gray">No plan steps.</Text>}
      </Section>
      <Section title="Result">
        {result ? (
          <>
            <Text>
              {result.status} · {result.confidence}
            </Text>
            <Text>{result.summary}</Text>
            {result.evidence.length > 0 ? <Text color="gray">Evidence:</Text> : null}
            {result.evidence.map((artifact) => (
              <Text key={artifact.id}>
                • [{artifact.kind}] {artifact.title}
                {artifact.path ? ` — ${artifact.path}` : ""}
              </Text>
            ))}
            {result.agentTranscriptRef ? (
              <Text>Transcript: {result.agentTranscriptRef}</Text>
            ) : null}
          </>
        ) : (
          <Text color="gray">No result yet.</Text>
        )}
      </Section>
      <Section title="Agent Trace">
        {agentTraceLines(state, job).length === 0 ? (
          <Text color="gray">No transcript activity yet.</Text>
        ) : (
          agentTraceLines(state, job).map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stateless trace lines without stable IDs
            <Text key={`${index}-${line}`}>{line}</Text>
          ))
        )}
      </Section>
    </Box>
  );
}

export function validationRows(state: ScanRunState): ValidationJobState[] {
  if (state.validationJobs.length > 0) return state.validationJobs;
  return state.validationPlans.map((plan) => ({
    id: plan.id,
    findingId: plan.findingId,
    validatorId: plan.validatorId,
    status: "queued",
    trace: [],
    appUrl: stringMetadata(plan.metadata?.appUrl),
    profilePath: stringMetadata(plan.metadata?.profilePath),
  }));
}

function findingTitle(state: ScanRunState, findingId: string): string {
  return state.findings.find((finding) => finding.id === findingId)?.title ?? findingId;
}

function statusIcon(status: ValidationJobState["status"]): string {
  if (status === "running") return "●";
  if (status === "completed") return "✓";
  if (status === "error") return "✕";
  return "○";
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function agentTraceLines(state: ScanRunState, job: ValidationJobState): string[] {
  if ((job.trace ?? []).length > 0) return job.trace.slice(-10).map((line) => `• ${line}`);
  const result = state.validationResults.find((item) => item.findingId === job.findingId);
  const transcriptPaths = new Set<string>();
  for (const artifact of state.artifacts) {
    if (
      artifact.kind === "agent-transcript" &&
      artifact.path?.includes("web-validation") &&
      artifact.path.includes(job.id)
    )
      transcriptPaths.add(artifact.path);
  }
  if (result?.agentTranscriptRef) transcriptPaths.add(result.agentTranscriptRef);
  const lines = state.artifacts
    .filter(
      (artifact) =>
        artifact.kind === "agent-transcript" && artifact.path && transcriptPaths.has(artifact.path),
    )
    .flatMap((artifact) => transcriptSummary(artifact.summary));
  return lines.slice(-8);
}

function transcriptSummary(summary: string | undefined): string[] {
  if (!summary) return [];
  return [`• ${summary}`];
}

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <Box marginTop={2} flexDirection="column">
      <Text color="gray">──────────────── {title} ────────────────</Text>
      {children}
    </Box>
  );
}
