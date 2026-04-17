export interface AgentValidationInput {
  goal: string;
  instructions: string;
  context: Record<string, unknown>;
}

export type AgentEvent =
  | { type: "message"; message: string }
  | { type: "artifact"; artifactId: string }
  | { type: "completed"; summary: string };

export interface AgentRunner {
  runValidation(input: AgentValidationInput): AsyncIterable<AgentEvent>;
}
