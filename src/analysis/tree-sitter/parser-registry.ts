import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser } from "web-tree-sitter";
import type { SourceLanguage } from "../../domain";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const wasmByLanguage: Partial<Record<SourceLanguage, string>> = {
  go: "tree-sitter-go.wasm",
  javascript: "tree-sitter-javascript.wasm",
  jsx: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  swift: "tree-sitter-swift.wasm",
  tsx: "tree-sitter-tsx.wasm",
  typescript: "tree-sitter-typescript.wasm",
};

export class TreeSitterParserRegistry {
  private initialized = false;
  private languages = new Map<SourceLanguage, Language>();

  constructor(private readonly grammarDir = resolve(packageRoot, "vendor/tree-sitter")) {}

  supports(language: SourceLanguage): boolean {
    const wasmName = wasmByLanguage[language];
    return Boolean(wasmName && existsSync(resolve(this.grammarDir, wasmName)));
  }

  async getParser(language: SourceLanguage): Promise<Parser | undefined> {
    const treeSitterLanguage = await this.getLanguage(language);
    if (!treeSitterLanguage) return undefined;
    const parser = new Parser();
    parser.setLanguage(treeSitterLanguage);
    return parser;
  }

  private async getLanguage(language: SourceLanguage): Promise<Language | undefined> {
    await this.init();
    const cached = this.languages.get(language);
    if (cached) return cached;

    const wasmName = wasmByLanguage[language];
    if (!wasmName) return undefined;

    const wasmPath = resolve(this.grammarDir, wasmName);
    if (!existsSync(wasmPath)) return undefined;

    const treeSitterLanguage = await Language.load(wasmPath);
    this.languages.set(language, treeSitterLanguage);
    return treeSitterLanguage;
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    await Parser.init();
    this.initialized = true;
  }
}
