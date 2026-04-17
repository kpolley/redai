import { Box, Text } from "ink";
import React from "react";
import type { ValidatorEnvironmentKind } from "../../domain";
import { Pane } from "../components/Pane";

export type NewEnvironmentField = "name" | "kind" | "appUrl" | "iosAppPath" | "iosBundleId";

export interface NewEnvironmentFormState {
  name: string;
  kind: ValidatorEnvironmentKind;
  appUrl: string;
  iosAppPath: string;
  iosBundleId: string;
}

interface NewEnvironmentScreenProps {
  form: NewEnvironmentFormState;
  activeField: NewEnvironmentField;
}

export function NewEnvironmentScreen({ form, activeField }: NewEnvironmentScreenProps) {
  return (
    <Box flexGrow={1} minHeight={0}>
      <Pane title="New Environment" flexGrow={1}>
        <Text color="cyan">Create a reusable validation environment</Text>
        <Box marginTop={2} flexDirection="column">
          <FieldRow
            active={activeField === "name"}
            label="Name"
            value={form.name}
            cursor={activeField === "name"}
          />
          <ChoiceRow
            active={activeField === "kind"}
            label="Kind"
            choices={[
              { id: "browser", label: "Browser" },
              { id: "ios-simulator", label: "iOS Simulator" },
            ]}
            selectedId={form.kind}
          />
          {form.kind === "browser" ? (
            <FieldRow
              active={activeField === "appUrl"}
              label="App URL"
              value={form.appUrl}
              cursor={activeField === "appUrl"}
            />
          ) : null}
          {form.kind === "ios-simulator" ? (
            <FieldRow
              active={activeField === "iosAppPath"}
              label="iOS app path"
              value={form.iosAppPath}
              cursor={activeField === "iosAppPath"}
            />
          ) : null}
          {form.kind === "ios-simulator" ? (
            <FieldRow
              active={activeField === "iosBundleId"}
              label="Bundle ID"
              value={form.iosBundleId}
              cursor={activeField === "iosBundleId"}
            />
          ) : null}
        </Box>
        <Box marginTop={2} flexDirection="column">
          <Text color="gray">
            ↑↓ selects a field. ←→ or Tab changes kind. Enter creates. Esc cancels.
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
