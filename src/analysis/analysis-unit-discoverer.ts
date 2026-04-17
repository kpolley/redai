import { readFile } from "node:fs/promises";
import type {
  AnalysisUnit,
  CodeSymbol,
  FilePrioritization,
  ScanCoverage,
  ThreatModel,
} from "../domain";
import { walkSourceFiles } from "../scanner/source-file-walker";
import { RegexSymbolExtractor } from "./regex-symbol-extractor";
import { detectSourceLanguage, isTreeSitterCandidate } from "./source-language";
import { TreeSitterSymbolExtractor } from "./tree-sitter/tree-sitter-symbol-extractor";

export interface AnalysisUnitDiscoveryInput {
  rootDir: string;
  threatModel: ThreatModel;
  filePrioritization?: FilePrioritization;
  scanCoverage?: ScanCoverage;
}

export async function discoverAnalysisUnits({
  rootDir,
  threatModel,
  filePrioritization,
  scanCoverage,
}: AnalysisUnitDiscoveryInput): Promise<AnalysisUnit[]> {
  const files = await walkSourceFiles(rootDir);
  const allowedPaths = filePrioritization
    ? selectAllowedPaths(filePrioritization, scanCoverage ?? "balanced")
    : null;
  const filteredFiles = allowedPaths
    ? files.filter((file) => allowedPaths.has(file.relativePath))
    : files;
  const relatedThreats = threatModel.threats.map((threat) => threat.id);
  const treeSitterExtractor = new TreeSitterSymbolExtractor();
  const regexExtractor = new RegexSymbolExtractor();

  const units: AnalysisUnit[] = [];
  for (const file of filteredFiles) {
    const language = detectSourceLanguage(file.relativePath);
    if (!isTreeSitterCandidate(language)) continue;

    const content =
      treeSitterExtractor.supports(language) || regexExtractor.supports(language)
        ? await readFile(file.absolutePath, "utf8")
        : undefined;

    const symbols = content
      ? await extractSymbolsWithFallback({
          file,
          language,
          content,
          treeSitterExtractor,
          regexExtractor,
        })
      : [];

    for (const symbol of symbols) {
      units.push(symbolToUnit(symbol, relatedThreats));
    }
    if (symbols.length > 0) continue;

    const location: AnalysisUnit["location"] = { path: file.relativePath };
    units.push({
      id: unitId(file.relativePath),
      kind: "file",
      title: file.relativePath,
      language,
      location,
      relatedFiles: [file.relativePath],
      relatedEntrypoints: [],
      relatedThreats,
      contextSummary: buildContextSummary(file.relativePath, language),
    });
  }

  return units;
}

export function selectAllowedPaths(
  prioritization: FilePrioritization,
  coverage: ScanCoverage,
): Set<string> {
  const sorted = [...prioritization.prioritized].sort((a, b) => b.score - a.score);
  if (sorted.length === 0) return new Set();

  if (coverage === "thorough") {
    return new Set(sorted.filter((entry) => entry.score >= 0.1).map((entry) => entry.path));
  }

  const minScore = coverage === "focused" ? 0.7 : 0.4;
  const fraction = coverage === "focused" ? 0.2 : 0.5;
  const minByFraction = Math.max(1, Math.ceil(sorted.length * fraction));
  const allowed = new Set<string>();
  for (const entry of sorted) {
    if (entry.score >= minScore || allowed.size < minByFraction) {
      allowed.add(entry.path);
    }
  }
  return allowed;
}

async function extractSymbolsWithFallback(input: {
  file: import("../scanner/source-file-walker").SourceFile;
  language: import("../domain").SourceLanguage;
  content: string;
  treeSitterExtractor: TreeSitterSymbolExtractor;
  regexExtractor: RegexSymbolExtractor;
}): Promise<CodeSymbol[]> {
  if (input.treeSitterExtractor.supports(input.language)) {
    try {
      const symbols = await input.treeSitterExtractor.extract(input);
      if (symbols.length > 0) return symbols;
    } catch {
      // Fall through to regex extraction.
    }
  }
  if (input.regexExtractor.supports(input.language)) {
    return input.regexExtractor.extract(input);
  }
  return [];
}

function symbolToUnit(symbol: CodeSymbol, relatedThreats: string[]): AnalysisUnit {
  return {
    id: `unit-${symbol.id}`,
    kind: symbol.kind === "method" ? "method" : symbol.kind === "class" ? "class" : "function",
    title: `${symbol.name} (${symbol.location.path})`,
    language: symbol.language,
    location: symbol.location,
    relatedFiles: [symbol.location.path],
    relatedEntrypoints: [],
    relatedThreats,
    contextSummary: `${symbol.kind} ${symbol.name} extracted from ${symbol.location.path}.`,
  };
}

function unitId(path: string): string {
  return `unit-${path.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function buildContextSummary(path: string, language: string): string {
  return `${path} is a ${language} source file selected for analysis unit scanning.`;
}
