import type { Node } from "web-tree-sitter";
import type { CodeSymbol, SourceLanguage } from "../../domain";
import type { SymbolExtractor, SymbolExtractorInput } from "../symbol-extractor";
import { TreeSitterParserRegistry } from "./parser-registry";

export class TreeSitterSymbolExtractor implements SymbolExtractor {
  constructor(private readonly registry = new TreeSitterParserRegistry()) {}

  supports(language: SourceLanguage): boolean {
    return this.registry.supports(language);
  }

  async extract({ file, language, content }: SymbolExtractorInput): Promise<CodeSymbol[]> {
    const parser = await this.registry.getParser(language);
    if (!parser) return [];

    const tree = parser.parse(content);
    if (!tree) return [];

    const symbols: CodeSymbol[] = [];
    visit(tree.rootNode, (node) => {
      const symbol = nodeToSymbol(file.relativePath, language, content, node);
      if (symbol) symbols.push(symbol);
    });
    return dedupeSymbols(symbols);
  }
}

type TreeSitterNode = Node;

function visit(node: TreeSitterNode, visitor: (node: TreeSitterNode) => void): void {
  visitor(node);
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (child) visit(child, visitor);
  }
}

function nodeToSymbol(
  path: string,
  language: SourceLanguage,
  content: string,
  node: TreeSitterNode,
): CodeSymbol | undefined {
  const nameNode = nameNodeFor(node, language);
  if (!nameNode) return undefined;

  const kind = symbolKindFor(node.type);
  if (!kind) return undefined;

  const name = nameNode.text;
  const line = node.startPosition.row + 1;
  return {
    id: `symbol-${path}-${name}-${line}`.replace(/[^a-zA-Z0-9]+/g, "-"),
    kind,
    name,
    language,
    location: { path, line, symbol: name },
    signature: firstLine(
      content.slice(node.startIndex, Math.min(node.endIndex, node.startIndex + 240)),
    ),
  };
}

function nameNodeFor(node: TreeSitterNode, language: SourceLanguage): TreeSitterNode | undefined {
  if (isFunctionNode(node.type, language) || isClassNode(node.type)) {
    return node.childForFieldName("name") ?? undefined;
  }
  return undefined;
}

function symbolKindFor(nodeType: string): CodeSymbol["kind"] | undefined {
  if (isClassNode(nodeType)) return nodeType === "struct_declaration" ? "struct" : "class";
  if (nodeType === "method_definition" || nodeType === "method_declaration") return "method";
  if (nodeType.includes("function") || nodeType === "func_literal") return "function";
  return undefined;
}

function isFunctionNode(nodeType: string, language: SourceLanguage): boolean {
  if (
    [
      "function_declaration",
      "function_definition",
      "method_definition",
      "method_declaration",
    ].includes(nodeType)
  )
    return true;
  if (language === "swift" && nodeType === "function_declaration") return true;
  return false;
}

function isClassNode(nodeType: string): boolean {
  return [
    "class_declaration",
    "class_definition",
    "struct_declaration",
    "interface_declaration",
  ].includes(nodeType);
}

function firstLine(content: string): string {
  return content.split("\n", 1)[0]?.trim() ?? "";
}

function dedupeSymbols(symbols: CodeSymbol[]): CodeSymbol[] {
  const seen = new Set<string>();
  const deduped: CodeSymbol[] = [];
  for (const symbol of symbols) {
    const key = `${symbol.location.path}:${symbol.location.line}:${symbol.name}:${symbol.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(symbol);
  }
  return deduped;
}
