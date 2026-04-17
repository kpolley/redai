import type {
  AffectedLocation,
  FinalReport,
  Finding,
  ScanRunState,
  Threat,
  ValidationResult,
} from "../domain";
import { pluralize } from "../utils/pluralize";
import type { FindingNarrative } from "./finding-narrator";

export interface BuildMarkdownReportOptions {
  /**
   * Per-finding narrator output keyed by finding id. When present, replaces the
   * deterministic Description / Exploit Scenario / Recommendations prose for
   * that finding and adds inline embeds. Falls back to the deterministic
   * scaffolding for any finding without a narrative.
   */
  narratives?: Map<string, FindingNarrative>;
}

export function buildReport(state: ScanRunState): FinalReport {
  return {
    runId: state.run.id,
    generatedAt: new Date().toISOString(),
    state,
  };
}

export function buildMarkdownReport(
  state: ScanRunState,
  options: BuildMarkdownReportOptions = {},
): string {
  const sections: string[] = [
    headerSection(state),
    executiveSummarySection(state),
    threatModelSection(state),
    scanCoverageSection(state),
    summaryOfFindingsSection(state),
    detailedFindingsSection(state, options.narratives),
    artifactsSection(state),
  ];
  return `${sections.filter((section) => section.length > 0).join("\n\n")}\n`;
}

// ---------- Header / executive summary ----------

function headerSection(state: ScanRunState): string {
  const target = formatTarget(state);
  const generated = new Date().toISOString();
  const envLabel = state.run.settings.validatorEnvironmentId
    ? `validator environment \`${state.run.settings.validatorEnvironmentId}\``
    : "no configured validator environment";

  const intro =
    `RedAI ran a security review of ${target} using the **${state.run.settings.scanCoverage}** ` +
    `scan coverage tier and ${envLabel}. This report was generated on ${generated} ` +
    `for run \`${state.run.id}\` (status: ${state.run.status}).`;

  return [`# RedAI Report: ${state.run.name}`, "", intro].join("\n");
}

function executiveSummarySection(state: ScanRunState): string {
  const confirmed = state.validationResults.filter(
    (result) => result.status === "confirmed",
  ).length;
  const notExploitable = state.validationResults.filter(
    (result) => result.status === "not-exploitable",
  ).length;
  const unableToTest = state.validationResults.filter(
    (result) => result.status === "unable-to-test",
  ).length;

  const findingPart =
    state.findings.length === 0
      ? "no findings were produced"
      : `${pluralize(state.findings.length, "finding")} were produced across ${pluralize(
          state.analysisUnits.length,
          "analysis unit",
        )}`;

  const validationParts: string[] = [];
  if (confirmed > 0) validationParts.push(`${confirmed} confirmed`);
  if (notExploitable > 0) validationParts.push(`${notExploitable} not exploitable`);
  if (unableToTest > 0) validationParts.push(`${unableToTest} unable to test`);

  const validationPart =
    state.validationResults.length === 0
      ? "No validation results were recorded."
      : `Of these, ${validationParts.join(", ")} after automated validation.`;

  const artifactPart =
    state.artifacts.length === 0
      ? ""
      : ` ${pluralize(state.artifacts.length, "supporting artifact")} were collected during the run.`;

  return [
    "## Executive Summary",
    "",
    `${capitalize(findingPart)}. ${validationPart}${artifactPart}`,
  ].join("\n");
}

// ---------- Threat model ----------

function threatModelSection(state: ScanRunState): string {
  const threatModel = state.threatModel;
  if (!threatModel) return "";

  const parts: string[] = ["## Threat Model", "", threatModel.summary];

  if (threatModel.architecture) {
    const techs =
      threatModel.architecture.technologies.length > 0
        ? ` Primary technologies: ${threatModel.architecture.technologies.join(", ")}.`
        : "";
    parts.push(
      "",
      "### Architecture",
      "",
      `${threatModel.architecture.summary} (${threatModel.architecture.applicationType}).${techs}`,
    );
  }

  if (threatModel.assets.length > 0) {
    parts.push("", "### Assets", "");
    parts.push(
      "| Asset | Sensitivity | Description |",
      "| --- | --- | --- |",
      ...threatModel.assets.map(
        (asset) =>
          `| ${escapeCell(asset.name)} | ${asset.sensitivity} | ${escapeCell(asset.description)} |`,
      ),
    );
  }

  if (threatModel.recommendedFocusAreas.length > 0) {
    parts.push("", "### Recommended Focus Areas", "");
    for (const area of threatModel.recommendedFocusAreas) {
      parts.push(`**${area.title}.** ${area.rationale}`, "");
    }
  }

  if (threatModel.threats.length > 0) {
    parts.push("", "### Threats", "");
    parts.push(
      "| Severity | Likelihood | Category | Title |",
      "| --- | --- | --- | --- |",
      ...threatModel.threats.map(threatRow),
    );
  }

  return parts.join("\n");
}

function threatRow(threat: Threat): string {
  return `| ${threat.severity} | ${threat.likelihood} | ${threat.category} | ${escapeCell(
    threat.title,
  )} |`;
}

// ---------- Scan coverage ----------

function scanCoverageSection(state: ScanRunState): string {
  const prioritization = state.filePrioritization;
  const coverage = state.run.settings.scanCoverage;

  const parts = ["## Scan Coverage", ""];
  if (!prioritization) {
    parts.push(
      `Coverage tier: **${coverage}**. No file prioritization was performed for this run.`,
    );
    return parts.join("\n");
  }

  parts.push(
    `Coverage tier: **${coverage}**. RedAI prioritized ${prioritization.prioritized.length} of ` +
      `${pluralize(prioritization.totalFiles, "candidate file")} for deeper review.`,
  );

  const top = prioritization.prioritized.slice(0, 10);
  if (top.length > 0) {
    parts.push(
      "",
      "| Score | Path | Category | Rationale |",
      "| --- | --- | --- | --- |",
      ...top.map(
        (entry) =>
          `| ${entry.score.toFixed(2)} | \`${escapeCell(entry.path)}\` | ${entry.category ?? "—"} | ${escapeCell(
            entry.rationale,
          )} |`,
      ),
    );
  }

  if (prioritization.notes) parts.push("", prioritization.notes);
  return parts.join("\n");
}

// ---------- Summary of findings ----------

function summaryOfFindingsSection(state: ScanRunState): string {
  if (state.findings.length === 0) return "";
  const parts = [
    "## Summary of Findings",
    "",
    "The table below summarizes the findings of the review, including category and severity.",
    "",
    "| # | Title | Category | Severity | Validation |",
    "| --- | --- | --- | --- | --- |",
  ];
  state.findings.forEach((finding, index) => {
    const result = state.validationResults.find((r) => r.findingId === finding.id);
    parts.push(
      `| ${index + 1} | ${escapeCell(finding.title)} | ${escapeCell(finding.category)} | ${
        finding.severity
      } | ${result ? `${result.status} (${result.confidence})` : "not run"} |`,
    );
  });
  return parts.join("\n");
}

// ---------- Detailed findings ----------

function detailedFindingsSection(
  state: ScanRunState,
  narratives: Map<string, FindingNarrative> | undefined,
): string {
  if (state.findings.length === 0) return "## Findings\n\nNo findings were produced by this run.";
  const sections = state.findings.map((finding, index) =>
    findingSection(
      finding,
      index + 1,
      state.validationResults.find((result) => result.findingId === finding.id),
      narratives?.get(finding.id),
    ),
  );
  return ["## Detailed Findings", "", sections.join("\n\n---\n\n")].join("\n");
}

function findingSection(
  finding: Finding,
  index: number,
  result: ValidationResult | undefined,
  narrative: FindingNarrative | undefined,
): string {
  const metadataTable = findingMetadataTable(finding, result);
  const description =
    narrative?.description.trim() && narrative.description.trim().length > 0
      ? narrative.description.trim()
      : findingDescription(finding);
  const affectedBlock = affectedLocationsBlock(finding.affectedLocations);
  const exploit =
    narrative?.exploitScenario.trim() && narrative.exploitScenario.trim().length > 0
      ? narrative.exploitScenario.trim()
      : finding.attackScenario.trim();
  const remediation =
    narrative?.recommendations.trim() && narrative.recommendations.trim().length > 0
      ? narrative.recommendations.trim()
      : finding.remediation.trim();

  const parts = [
    `### ${index}. ${finding.title}`,
    "",
    metadataTable,
    "",
    "**Description**",
    "",
    description,
  ];

  if (affectedBlock.length > 0) {
    parts.push("", "**Affected Locations**", "", affectedBlock);
  }

  if (exploit.length > 0) {
    parts.push("", "**Exploit Scenario**", "", exploit);
  }

  if (remediation.length > 0) {
    parts.push("", "**Recommendations**", "", remediation);
  }

  const inlineEmbeds = inlineEmbedsBlock(narrative, result);
  if (inlineEmbeds.length > 0) {
    parts.push("", "**Inline Evidence**", "", inlineEmbeds);
  }

  const evidence = validationEvidenceBlock(result);
  if (evidence.length > 0) {
    parts.push("", "**Validation Evidence**", "", evidence);
  } else if (!result) {
    const confirmations = finding.validationNotes.confirmationActions;
    if (confirmations.length > 0) {
      parts.push(
        "",
        "**Suggested Confirmation**",
        "",
        "This finding was not validated automatically. To confirm manually:",
        "",
        ...confirmations.map((action, i) => `${i + 1}. ${action}`),
      );
    }
  }

  return parts.join("\n");
}

function inlineEmbedsBlock(
  narrative: FindingNarrative | undefined,
  result: ValidationResult | undefined,
): string {
  if (!narrative || narrative.inlineEmbeds.length === 0) return "";
  const evidenceByPath = new Map(
    (result?.evidence ?? []).filter((a) => a.path).map((a) => [a.path as string, a]),
  );

  const blocks: string[] = [];
  for (const embed of narrative.inlineEmbeds) {
    const artifact = evidenceByPath.get(embed.artifactPath);
    if (!artifact) continue;
    const caption = embed.caption.trim() || artifact.title;
    if (artifact.kind === "screenshot") {
      blocks.push(
        `*${escapeInline(caption)}*`,
        "",
        `![${escapeInline(caption)}](${embed.artifactPath})`,
      );
    } else {
      const rawSnippet = embed.snippet.trim();
      if (rawSnippet.length === 0) {
        // No usable snippet — fall back to a labelled link rather than embedding nothing.
        blocks.push(`*${escapeInline(caption)}* — see \`${embed.artifactPath}\`.`);
      } else {
        // Narrators sometimes wrap the snippet in their own ``` fence; strip it so we
        // don't render a fence inside our fence (which closes the outer one early).
        const unwrapped = unwrapCodeFence(rawSnippet);
        const lang = unwrapped.lang ?? inferCodeLang(artifact.contentType, embed.artifactPath);
        // Use a fence longer than any run of backticks in the content, so embedded
        // ``` inside the snippet doesn't break out.
        const fence = pickFence(unwrapped.content);
        blocks.push(
          `*${escapeInline(caption)}* — from \`${embed.artifactPath}\`:`,
          "",
          `${fence}${lang}`,
          unwrapped.content,
          fence,
        );
      }
    }
    blocks.push("");
  }
  // Drop trailing blank line.
  while (blocks.length > 0 && blocks[blocks.length - 1] === "") blocks.pop();
  return blocks.join("\n");
}

function inferCodeLang(contentType: string | undefined, path: string): string {
  if (contentType === "application/json") return "json";
  if (contentType === "text/markdown") return "markdown";
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["js", "ts", "tsx", "jsx"].includes(ext)) return ext;
  if (ext === "py") return "python";
  if (ext === "sh" || ext === "bash") return "bash";
  if (ext === "json") return "json";
  if (ext === "html") return "html";
  if (ext === "http") return "http";
  return "";
}

function escapeInline(value: string): string {
  return value.replace(/\n+/g, " ").trim();
}

function unwrapCodeFence(snippet: string): { content: string; lang: string | undefined } {
  const match = snippet.match(/^```([\w+-]*)\n([\s\S]*?)\n```\s*$/);
  if (match) return { content: match[2] ?? "", lang: match[1] || undefined };
  return { content: snippet, lang: undefined };
}

function pickFence(content: string): string {
  let max = 0;
  const runs = content.matchAll(/`+/g);
  for (const run of runs) {
    if (run[0].length > max) max = run[0].length;
  }
  return "`".repeat(Math.max(3, max + 1));
}

function findingMetadataTable(finding: Finding, result: ValidationResult | undefined): string {
  const targets = finding.affectedLocations
    .slice(0, 3)
    .map((loc) => `\`${loc.path}${loc.line ? `:${loc.line}` : ""}\``)
    .join(", ");
  const moreTargets =
    finding.affectedLocations.length > 3 ? ` (+${finding.affectedLocations.length - 3} more)` : "";
  const validationCell = result ? `${result.status} (${result.confidence})` : "not run";
  return [
    "| | |",
    "| --- | --- |",
    `| **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence} |`,
    `| **Category:** ${escapeCell(finding.category)} | **Finding ID:** \`${finding.id}\` |`,
    `| **Target:** ${targets || "—"}${moreTargets} | **Validation:** ${validationCell} |`,
  ].join("\n");
}

function findingDescription(finding: Finding): string {
  const suspected = finding.validationNotes.suspectedVulnerability.trim();
  const reasoning = finding.validationNotes.exploitabilityReasoning.trim();
  if (suspected && reasoning && suspected !== reasoning) return `${suspected}\n\n${reasoning}`;
  return suspected || reasoning || "No description was recorded for this finding.";
}

function affectedLocationsBlock(locations: AffectedLocation[]): string {
  if (locations.length === 0) return "";
  return locations
    .map((loc) => {
      const line = loc.line ? `:${loc.line}` : "";
      const symbol = loc.symbol ? ` — ${loc.symbol}` : "";
      const description = loc.description ? ` (${loc.description})` : "";
      return `- \`${loc.path}${line}\`${symbol}${description}`;
    })
    .join("\n");
}

function validationEvidenceBlock(result: ValidationResult | undefined): string {
  if (!result) return "";
  const parts: string[] = [result.summary.trim() || `Validation status: ${result.status}.`];

  if (result.reproductionSteps.length > 0) {
    parts.push(
      "",
      "Reproduction steps:",
      "",
      ...result.reproductionSteps.map((step, i) => `${i + 1}. ${step}`),
    );
  }

  if (result.payloadsTried.length > 0) {
    const payloads = result.payloadsTried.map((p) => `\`${p}\``).join(", ");
    parts.push("", `Payloads tried: ${payloads}.`);
  }

  if (result.evidence.length > 0) {
    parts.push(
      "",
      "Evidence artifacts:",
      "",
      ...result.evidence.map((artifact) => {
        const path = artifact.path ? ` — \`${artifact.path}\`` : "";
        const summary = artifact.summary ? `: ${artifact.summary}` : "";
        return `- [${artifact.kind}] ${artifact.title}${path}${summary}`;
      }),
    );
  }

  if (result.agentTranscriptRef) {
    const ref = result.agentTranscriptRef;
    const alreadyListed = result.evidence.some(
      (artifact) =>
        artifact.kind === "agent-transcript" &&
        (artifact.path === ref || (artifact.path?.includes(ref) ?? false)),
    );
    if (!alreadyListed) {
      parts.push("", `Agent transcript: \`${ref}\`.`);
    }
  }

  return parts.join("\n");
}

// ---------- Artifacts ----------

function artifactsSection(state: ScanRunState): string {
  if (state.artifacts.length === 0) return "";

  const counts = new Map<string, number>();
  for (const artifact of state.artifacts) {
    counts.set(artifact.kind, (counts.get(artifact.kind) ?? 0) + 1);
  }
  const breakdown = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${count} ${kind}`)
    .join(", ");

  return [
    "## Artifacts",
    "",
    `The run produced ${pluralize(state.artifacts.length, "artifact")} stored under the run directory (${breakdown}). ` +
      `Evidence artifacts cited in individual findings are listed inline with each finding above; the remaining ` +
      `artifacts are agent transcripts and intermediate analysis inputs available on disk.`,
  ].join("\n");
}

// ---------- Helpers ----------

function formatTarget(state: ScanRunState): string {
  if (state.run.target.kind === "website") return state.run.target.url;
  return state.run.target.path;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}
