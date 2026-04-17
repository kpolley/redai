import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import fastGlob from "fast-glob";
import ignore from "ignore";

const defaultIgnorePatterns = [
  ".git/**",
  "node_modules/**",
  "dist/**",
  "build/**",
  ".next/**",
  "coverage/**",
  "tmp/**",
  "temp/**",
];

const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".h",
  ".js",
  ".jsx",
  ".go",
  ".json",
  ".m",
  ".mjs",
  ".mm",
  ".mts",
  ".py",
  ".swift",
  ".ts",
  ".tsx",
]);

const sourceBasenames = new Set([
  ".env.example",
  ".env.sample",
  "Dockerfile",
  "Gemfile",
  "Makefile",
  "Podfile",
  "package.json",
  "tsconfig.json",
]);

export interface SourceFile {
  absolutePath: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
}

export interface WalkSourceFilesOptions {
  maxFileSizeBytes?: number;
}

export async function walkSourceFiles(
  rootDir: string,
  options: WalkSourceFilesOptions = {},
): Promise<SourceFile[]> {
  const absoluteRoot = resolve(rootDir);
  const maxFileSizeBytes = options.maxFileSizeBytes ?? 512 * 1024;
  const gitignore = await loadRootGitignore(absoluteRoot);

  const entries = await fastGlob("**/*", {
    cwd: absoluteRoot,
    absolute: true,
    dot: true,
    followSymbolicLinks: false,
    onlyFiles: true,
    unique: true,
    ignore: defaultIgnorePatterns,
  });

  const files: SourceFile[] = [];
  for (const absolutePath of entries) {
    const relativePath = normalizePath(relative(absoluteRoot, absolutePath));
    if (gitignore.ignores(relativePath)) continue;
    if (!isSourceRelevant(relativePath)) continue;

    const fileStat = await stat(absolutePath);
    if (fileStat.size > maxFileSizeBytes) continue;

    files.push({
      absolutePath,
      relativePath,
      extension: extname(relativePath),
      sizeBytes: fileStat.size,
    });
  }

  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function loadRootGitignore(rootDir: string) {
  const matcher = ignore().add(defaultIgnorePatterns);
  const gitignorePath = resolve(rootDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    matcher.add(await readFile(gitignorePath, "utf8"));
  }
  return matcher;
}

function isSourceRelevant(relativePath: string): boolean {
  const basename = relativePath.split("/").at(-1) ?? relativePath;
  if (sourceBasenames.has(basename)) return true;
  if (looksSecretLike(basename)) return false;
  return sourceExtensions.has(extname(relativePath));
}

function looksSecretLike(basename: string): boolean {
  if (basename === ".env") return true;
  if (basename.startsWith(".env."))
    return !basename.endsWith(".example") && !basename.endsWith(".sample");
  return false;
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}
