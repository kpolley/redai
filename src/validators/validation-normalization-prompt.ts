import type { ValidationJob } from "../domain";

const MAX_RAW_SUMMARY_CHARS = 64_000;

export function buildValidationNormalizationPrompt(job: ValidationJob, rawSummary: string): string {
  const { summary: summaryBlock, truncated } = truncateRawSummary(rawSummary);
  return `Convert the raw validation summary into RedAI's structured validation result.

Rules:
- Do not perform any additional browser automation, simulator automation, or source inspection.
- Do not invent evidence that is not present in the raw summary.
- Keep findingId exactly: ${job.findingId}
- Use status "confirmed" only if the raw summary includes concrete successful reproduction evidence.
- Use status "unable-to-test" if the raw summary says testing was blocked or not performed.
- Use empty strings for optional evidence fields that do not apply.

Validation context:
- findingId: ${job.findingId}
- validatorId: ${job.validatorId}
- goal: ${job.plan.goal}

Raw validation summary${truncated ? " (truncated — middle omitted to stay within size limits)" : ""}:
${summaryBlock}
`;
}

function truncateRawSummary(rawSummary: string): { summary: string; truncated: boolean } {
  if (rawSummary.length <= MAX_RAW_SUMMARY_CHARS) {
    return { summary: rawSummary, truncated: false };
  }
  const half = Math.floor(MAX_RAW_SUMMARY_CHARS / 2);
  const head = rawSummary.slice(0, half);
  const tail = rawSummary.slice(-half);
  const elided = rawSummary.length - head.length - tail.length;
  return {
    summary: `${head}\n\n... [${elided} characters elided] ...\n\n${tail}`,
    truncated: true,
  };
}
