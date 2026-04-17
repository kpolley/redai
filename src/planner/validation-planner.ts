import type { Finding, ValidationPlan } from "../domain";

export function createValidationPlan(
  finding: Finding,
  validatorId = "web-agent-browser",
): ValidationPlan {
  return {
    id: crypto.randomUUID(),
    findingId: finding.id,
    validatorId,
    goal: finding.validationNotes.suspectedVulnerability,
    steps: finding.validationNotes.confirmationActions,
  };
}
