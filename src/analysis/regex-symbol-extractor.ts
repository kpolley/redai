import type { CodeSymbol, SourceLanguage } from "../domain";
import type { SymbolExtractor, SymbolExtractorInput } from "./symbol-extractor";

export class RegexSymbolExtractor implements SymbolExtractor {
  supports(language: SourceLanguage): boolean {
    return ["typescript", "tsx", "javascript", "jsx", "python", "go", "swift"].includes(language);
  }

  async extract({ file, language, content }: SymbolExtractorInput): Promise<CodeSymbol[]> {
    switch (language) {
      case "python":
        return extractMatches(
          file.relativePath,
          language,
          content,
          /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
          "function",
        );
      case "go":
        return extractMatches(
          file.relativePath,
          language,
          content,
          /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
          "function",
        );
      case "swift":
        return extractMatches(
          file.relativePath,
          language,
          content,
          /^\s*func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm,
          "function",
        );
      case "typescript":
      case "tsx":
      case "javascript":
      case "jsx":
        return [
          ...extractMatches(
            file.relativePath,
            language,
            content,
            /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gm,
            "function",
          ),
          ...extractMatches(
            file.relativePath,
            language,
            content,
            /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm,
            "function",
          ),
          ...extractMatches(
            file.relativePath,
            language,
            content,
            /^\s*(?:async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/gm,
            "method",
          ),
        ];
      default:
        return [];
    }
  }
}

function extractMatches(
  path: string,
  language: SourceLanguage,
  content: string,
  pattern: RegExp,
  kind: CodeSymbol["kind"],
): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  for (const match of content.matchAll(pattern)) {
    const name = match[1];
    if (!name) continue;
    const line = lineNumberForIndex(content, match.index ?? 0);
    symbols.push({
      id: `symbol-${path}-${name}-${line}`.replace(/[^a-zA-Z0-9]+/g, "-"),
      kind,
      name,
      language,
      location: { path, line, symbol: name },
      signature: firstLine(content.slice(match.index ?? 0)),
    });
  }
  return symbols;
}

function lineNumberForIndex(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function firstLine(content: string): string {
  return content.split("\n", 1)[0]?.trim() ?? "";
}
