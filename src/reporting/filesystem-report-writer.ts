import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact, FinalReport, ScanRunState } from "../domain";
import { getRedaiRunsDir } from "../paths";
import type { FindingNarrative } from "./finding-narrator";
import { buildHtmlReport } from "./html-report";
import { buildMarkdownReport, buildReport } from "./report-builder";

export interface WrittenReports {
  jsonReport: FinalReport;
  markdownArtifact: Artifact;
  jsonArtifact: Artifact;
  htmlArtifact: Artifact;
}

export interface WriteReportsOptions {
  narratives?: Map<string, FindingNarrative>;
}

export class FilesystemReportWriter {
  private readonly runsRootDir: string;

  constructor(runsRootDir?: string) {
    this.runsRootDir = runsRootDir ?? getRedaiRunsDir();
  }

  async writeReports(
    state: ScanRunState,
    options: WriteReportsOptions = {},
  ): Promise<WrittenReports> {
    const runDir = join(this.runsRootDir, state.run.id);
    await mkdir(runDir, { recursive: true });

    const jsonReport = buildReport(state);
    const markdown = buildMarkdownReport(state, {
      ...(options.narratives ? { narratives: options.narratives } : {}),
    });
    const html = await buildHtmlReport(markdown, {
      runDir,
      title: `RedAI Report: ${state.run.name}`,
    });

    await writeFile(
      join(runDir, "report.json"),
      `${JSON.stringify(jsonReport, null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(runDir, "report.md"), markdown, "utf8");
    await writeFile(join(runDir, "report.html"), html, "utf8");

    const createdAt = new Date().toISOString();
    return {
      jsonReport,
      markdownArtifact: {
        id: crypto.randomUUID(),
        kind: "file",
        title: "Markdown report",
        path: "report.md",
        contentType: "text/markdown",
        summary: "Human-readable RedAI run report.",
        createdAt,
      },
      jsonArtifact: {
        id: crypto.randomUUID(),
        kind: "file",
        title: "JSON report",
        path: "report.json",
        contentType: "application/json",
        summary: "Machine-readable RedAI run report.",
        createdAt,
      },
      htmlArtifact: {
        id: crypto.randomUUID(),
        kind: "file",
        title: "HTML report",
        path: "report.html",
        contentType: "text/html",
        summary: "Self-contained HTML version of the RedAI run report.",
        createdAt,
      },
    };
  }
}
