import type { CodeSymbol, SourceLanguage } from "../domain";
import type { SourceFile } from "../scanner/source-file-walker";

export interface SymbolExtractorInput {
  file: SourceFile;
  language: SourceLanguage;
  content: string;
}

export interface SymbolExtractor {
  supports(language: SourceLanguage): boolean;
  extract(input: SymbolExtractorInput): Promise<CodeSymbol[]>;
}
