import { Box, Text } from "ink";
import React from "react";
import type { RunSettings, ScanCoverage, ValidatorEnvironment } from "../../domain";
import { Pane } from "../components/Pane";

export type NewScanScannerProvider = RunSettings["scannerProvider"];
export type NewScanScanCoverage = ScanCoverage;
export type NewScanField =
  | "name"
  | "sourceDirectory"
  | "validatorEnvironment"
  | "scannerProvider"
  | "scanCoverage"
  | "unitAgentConcurrency"
  | "validatorAgentConcurrency";

export interface NewScanFormState {
  name: string;
  sourceDirectory: string;
  validatorEnvironmentId: string;
  scannerProvider: NewScanScannerProvider;
  scanCoverage: NewScanScanCoverage;
  unitAgentConcurrency: number;
  validatorAgentConcurrency: number;
}

interface NewScanScreenProps {
  form: NewScanFormState;
  activeField: NewScanField;
  environments: ValidatorEnvironment[];
}

export function NewScanScreen({ form, activeField, environments }: NewScanScreenProps) {
  const selectedEnvironment = environments.find(
    (environment) => environment.id === form.validatorEnvironmentId,
  );
  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title="New Scan" flexGrow={1}>
        <Text color="cyan">Create a validation run</Text>
        <Box marginTop={2} flexDirection="column">
          <FieldRow
            active={activeField === "name"}
            label="Name"
            value={form.name}
            cursor={activeField === "name"}
          />
          <FieldRow
            active={activeField === "sourceDirectory"}
            label="Source directory"
            value={form.sourceDirectory}
            cursor={activeField === "sourceDirectory"}
          />
          <FieldRow
            active={activeField === "validatorEnvironment"}
            label="Environment"
            value={environmentLabel(selectedEnvironment)}
          />
          <ChoiceRow
            active={activeField === "scannerProvider"}
            label="Scanner agent"
            choices={[
              { id: "claude", label: "Claude Code" },
              { id: "codex", label: "Codex" },
            ]}
            selectedId={form.scannerProvider}
          />
          <ChoiceRow
            active={activeField === "scanCoverage"}
            label="Scan coverage"
            choices={[
              { id: "focused", label: "Focused" },
              { id: "balanced", label: "Balanced" },
              { id: "thorough", label: "Thorough" },
            ]}
            selectedId={form.scanCoverage}
          />
          <FieldRow
            active={activeField === "unitAgentConcurrency"}
            label="Scan agents"
            value={String(form.unitAgentConcurrency)}
          />
          <FieldRow
            active={activeField === "validatorAgentConcurrency"}
            label="Validator agents"
            value={String(form.validatorAgentConcurrency)}
          />
        </Box>
        <Box marginTop={2} flexDirection="column">
          {environments.length === 0 ? (
            <Text color="red">
              No ready environments exist. Create an environment before starting a scan.
            </Text>
          ) : null}
          <Text color="gray">
            Start by naming the scan. ↑↓ selects a field. Backspace deletes text.
          </Text>
          <Text color="gray">
            ←→ or Tab changes environment, scanner, and agent counts. Enter starts. Esc cancels.
          </Text>
        </Box>
      </Pane>
    </Box>
  );
}

function FieldRow({
  active,
  label,
  value,
  cursor = false,
}: {
  active: boolean;
  label: string;
  value: string;
  cursor?: boolean;
}) {
  const content = (
    <>
      {active ? "▸" : " "} {label}: <Text color="yellow">{value}</Text>
      {cursor ? <Text color="cyan">█</Text> : null}
    </>
  );
  return active ? <Text color="cyan">{content}</Text> : <Text>{content}</Text>;
}

function environmentLabel(environment: ValidatorEnvironment | undefined): string {
  if (!environment) return "none available";
  return `${environment.name} (${environment.kind})`;
}

function ChoiceRow<T extends string>({
  active,
  label,
  choices,
  selectedId,
}: {
  active: boolean;
  label: string;
  choices: { id: T; label: string }[];
  selectedId: T;
}) {
  const content = (
    <>
      {active ? "▸" : " "} {label}:{" "}
      {choices.map((choice, index) => (
        <React.Fragment key={choice.id}>
          {index > 0 ? <Text color="gray"> / </Text> : null}
          <Text
            inverse={choice.id === selectedId}
            color={choice.id === selectedId ? "cyan" : "gray"}
          >
            {" "}
            {choice.label}{" "}
          </Text>
        </React.Fragment>
      ))}
      {active ? <Text color="gray"> ←→</Text> : null}
    </>
  );
  return active ? <Text color="cyan">{content}</Text> : <Text>{content}</Text>;
}
