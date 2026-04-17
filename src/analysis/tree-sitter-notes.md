# Tree-Sitter Integration Notes

RedAI uses tree-sitter for multi-language symbol extraction across TypeScript, JavaScript, Swift, Go, and Python.

## Current Status

The analysis pipeline has parser abstractions in place:

- `SymbolExtractor`
- `SourceLanguage`
- `CodeSymbol`
- `AnalysisUnit`
- `TreeSitterParserRegistry`
- `TreeSitterSymbolExtractor`

Compatible WASM grammars are vendored under `vendor/tree-sitter/`:

- `tree-sitter-go.wasm`
- `tree-sitter-javascript.wasm`
- `tree-sitter-python.wasm`
- `tree-sitter-swift.wasm`
- `tree-sitter-tsx.wasm`
- `tree-sitter-typescript.wasm`

The scanner prefers tree-sitter extraction and falls back to regex extraction if parser loading or extraction fails.

## Package Findings

- `web-tree-sitter@0.26.8` works under Bun when grammar WASM files are built with a compatible tree-sitter CLI.
- `tree-sitter-wasms@0.1.13` includes useful prebuilt grammars, but those files failed to load with `web-tree-sitter@0.26.8`, likely due to ABI/version mismatch.
- `tree-sitter-cli@0.26.8` can build compatible WASM grammars, but its install script writes the downloaded executable to the current working directory. Moving that binary into `node_modules/tree-sitter-cli/tree-sitter` allowed the package bin to work locally.

## Follow-Up

We should add a reproducible grammar build script before relying on fresh installs. Options:

1. Keep vendored WASM grammars checked in.
2. Add a `build:grammars` script that handles the tree-sitter CLI install quirk.
3. Publish or pin compatible grammar artifacts separately.
