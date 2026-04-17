import type { AgentEvent, AgentRunner, AgentValidationInput } from "../agent-runner";

export class ClaudeAgentRunner implements AgentRunner {
  async *runValidation(input: AgentValidationInput): AsyncIterable<AgentEvent> {
    yield { type: "message", message: `Claude Agent SDK placeholder received goal: ${input.goal}` };
    yield { type: "completed", summary: "Claude Agent SDK integration is not implemented yet." };
  }
}
