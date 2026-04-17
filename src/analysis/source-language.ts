import { extname } from "node:path";
import type { SourceLanguage } from "../domain";

export function detectSourceLanguage(path: string): SourceLanguage {
  switch (extname(path).toLowerCase()) {
    case ".ts":
    case ".mts":
    case ".cts":
      return "typescript";
    case ".tsx":
      return "tsx";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".jsx":
      return "jsx";
    case ".swift":
      return "swift";
    case ".go":
      return "go";
    case ".py":
      return "python";
    case ".json":
      return "json";
    default:
      return "unknown";
  }
}

export function isTreeSitterCandidate(language: SourceLanguage): boolean {
  return ["typescript", "tsx", "javascript", "jsx", "swift", "go", "python"].includes(language);
}
