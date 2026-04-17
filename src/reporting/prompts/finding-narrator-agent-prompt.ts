import type { Finding, ValidationResult } from "../../domain";

export interface FindingNarratorPromptInput {
  finding: Finding;
  validationResult: ValidationResult | undefined;
  /**
   * Absolute paths to evidence artifacts the agent may read from disk to inform
   * embedding decisions. Same order as `validationResult.evidence`.
   */
  artifactAbsolutePaths: { artifactPath: string; absolutePath: string }[];
  scratchDir: string;
}

export function buildFindingNarratorAgentPrompt(input: FindingNarratorPromptInput): string {
  const { finding, validationResult, artifactAbsolutePaths } = input;

  const findingBlock = JSON.stringify(
    {
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      confidence: finding.confidence,
      category: finding.category,
      affectedLocations: finding.affectedLocations,
      attackScenario: finding.attackScenario,
      remediation: finding.remediation,
      validationNotes: finding.validationNotes,
    },
    null,
    2,
  );

  const validationBlock = validationResult
    ? JSON.stringify(
        {
          status: validationResult.status,
          confidence: validationResult.confidence,
          summary: validationResult.summary,
          reproductionSteps: validationResult.reproductionSteps,
          payloadsTried: validationResult.payloadsTried,
          evidence: validationResult.evidence.map((artifact) => ({
            kind: artifact.kind,
            title: artifact.title,
            path: artifact.path,
            summary: artifact.summary,
          })),
        },
        null,
        2,
      )
    : "(no validation result was recorded)";

  const artifactList =
    artifactAbsolutePaths.length === 0
      ? "(no evidence artifacts available)"
      : artifactAbsolutePaths
          .map(
            ({ artifactPath, absolutePath }) =>
              `- relative path \`${artifactPath}\` — read from disk at \`${absolutePath}\``,
          )
          .join("\n");

  return `You are RedAI's report narrator. You write the human-facing prose for a single finding in the final security report and pick which evidence artifacts (if any) are worth embedding inline so the reader doesn't have to chase a link.

You are NOT a re-analyst. Do not invent new claims, payloads, file paths, line numbers, IDs, or evidence not present in the inputs below. Rephrase, condense, sequence, and clarify — that's it. If the inputs don't say something, neither do you.

## Finding

\`\`\`json
${findingBlock}
\`\`\`

## Validation Result

\`\`\`json
${validationBlock}
\`\`\`

## Evidence artifacts available on disk

You may read these files to decide which (if any) are worth showing inline:

${artifactList}

Use your file-read tools to inspect them. Don't re-read agent transcripts (they're long and not useful to a report reader).

## Your job

Write the prose for three blocks of this finding's report section, then pick a few artifacts to embed inline.

1. **Description** — 1-3 sentences. What is the vulnerability, in plain language? Lead with the impact in human terms ("an attacker can read any user's password and API key by knowing their user id"), then mention the mechanism ("because /api/profile/:id requires only authentication, not ownership"). Skip the metadata that's already in the section header (severity, category, IDs).
2. **Exploit Scenario** — 2-4 sentences of narrative. A short story of how an attacker actually pulls this off end-to-end. Reference concrete identifiers/payloads from the inputs when they make the story crisper. If the validation result has a clean repro, lean on it.
3. **Recommendations** — 2-4 sentences. Lead with the most important fix; mention secondary hardening only if it's already in the inputs. Avoid bulleted laundry lists; prose flows better in this report style.

## Inline embeds

For each finding you may pick **0–2** artifacts to embed inline. Skip embeds entirely if nothing is genuinely worth showing — most findings won't need any.

Embed when:
- A small text snippet (HTTP response body, log line, PoC source) makes the exploit concrete in a way prose can't.
- A screenshot is the cleanest proof (e.g., the app showing leaked admin data).

Don't embed when:
- The artifact is an agent transcript (long, internal).
- The artifact is large or noisy and a paragraph of prose explains it just as well.
- The validation result is "unable-to-test" or "not-exploitable" (there's nothing to prove).

For each embed:
- \`artifactPath\` must exactly match a path from the list above.
- \`caption\` is one short reader-facing line ("HTTP 200 from /api/admin/users with a forged customer token").
- \`snippet\` is required for text artifacts: extract the most damning ≤30 lines from the file (you read the file to do this). Provide the **raw file content lines only** — do NOT wrap them in a Markdown code fence (\`\`\`). The renderer adds the fence and infers the language from the file extension. For screenshots, leave \`snippet\` empty — the renderer will inline the image.

Scratch directory if you need it: \`${input.scratchDir}\`. Source files are read-only.

## Output

Write your response as prose: a Description paragraph, an Exploit Scenario paragraph, a Recommendations paragraph, then for each chosen embed a clearly labeled section with the artifact path, caption, and (for text artifacts) the snippet you extracted. A separate structuring step turns your write-up into the typed shape — don't worry about JSON yourself.
`;
}
