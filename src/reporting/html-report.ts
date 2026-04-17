import { readFile } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";
import { Marked } from "marked";

export interface BuildHtmlReportOptions {
  /** Absolute path to the run directory; used to resolve relative image sources. */
  runDir: string;
  /** Title used for the <title> tag. */
  title: string;
}

/**
 * Render a markdown report to a self-contained HTML string. Image references
 * relative to `runDir` are inlined as base64 `data:` URIs so the resulting file
 * can be opened, emailed, or uploaded without the surrounding directory.
 */
export async function buildHtmlReport(
  markdown: string,
  options: BuildHtmlReportOptions,
): Promise<string> {
  const marked = new Marked({ gfm: true, breaks: false });
  const rawHtml = await marked.parse(markdown, { async: true });
  const inlinedBody = await inlineImages(rawHtml, options.runDir);
  return wrapHtmlDocument(inlinedBody, options.title);
}

const IMG_TAG_RE = /<img\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>/g;

async function inlineImages(html: string, runDir: string): Promise<string> {
  // Collect unique srcs first so we read each file at most once.
  const srcs = new Set<string>();
  for (const match of html.matchAll(IMG_TAG_RE)) {
    const src = match[3];
    if (src && !isInlineableSrc(src)) continue;
    if (src) srcs.add(src);
  }

  const replacements = new Map<string, string>();
  await Promise.all(
    [...srcs].map(async (src) => {
      const dataUri = await tryReadAsDataUri(src, runDir);
      if (dataUri) replacements.set(src, dataUri);
    }),
  );

  return html.replace(IMG_TAG_RE, (match, before, quote, src, after) => {
    const replacement = replacements.get(src);
    if (!replacement) return match;
    return `<img${before}src=${quote}${replacement}${quote}${after}>`;
  });
}

function isInlineableSrc(src: string): boolean {
  // Skip already-inlined data URIs and remote sources; we only inline local files.
  if (src.startsWith("data:")) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src)) return false;
  return true;
}

async function tryReadAsDataUri(src: string, runDir: string): Promise<string | undefined> {
  const absolute = isAbsolute(src) ? src : resolve(runDir, src);
  try {
    const buffer = await readFile(absolute);
    const mime = mimeForExtension(extname(absolute));
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function mimeForExtension(ext: string): string {
  const lower = ext.toLowerCase();
  if (lower === ".png") return "image/png";
  if (lower === ".jpg" || lower === ".jpeg") return "image/jpeg";
  if (lower === ".gif") return "image/gif";
  if (lower === ".webp") return "image/webp";
  if (lower === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function wrapHtmlDocument(bodyHtml: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<main class="report">
${bodyHtml}
</main>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const REPORT_STYLES = `
:root {
  color-scheme: light;
  --fg: #1a1a1a;
  --muted: #5a5a5a;
  --bg: #ffffff;
  --rule: #e2e2e2;
  --code-bg: #f5f5f4;
  --code-fg: #1a1a1a;
  --link: #8b1d1d;
  --sev-critical: #6a0c2c;
  --sev-high: #b91c1c;
  --sev-medium: #b45309;
  --sev-low: #15803d;
  --sev-info: #4b5563;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 16px;
  line-height: 1.55;
}
.report {
  max-width: 780px;
  margin: 0 auto;
  padding: 56px 32px 96px;
}
h1, h2, h3, h4, h5, h6 {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  line-height: 1.25;
  margin: 1.8em 0 0.6em;
}
h1 {
  font-size: 2.2em;
  margin-top: 0;
  border-bottom: 2px solid var(--fg);
  padding-bottom: 0.3em;
}
h2 {
  font-size: 1.55em;
  border-bottom: 1px solid var(--rule);
  padding-bottom: 0.25em;
}
h3 { font-size: 1.2em; }
h4 { font-size: 1.05em; color: var(--muted); }
p { margin: 0.7em 0; }
a { color: var(--link); }
strong { color: var(--fg); }
hr {
  border: none;
  border-top: 1px solid var(--rule);
  margin: 2em 0;
}
ul, ol { padding-left: 1.6em; }
li { margin: 0.25em 0; }
code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: var(--code-bg);
  padding: 0.1em 0.35em;
  border-radius: 3px;
}
pre {
  background: var(--code-bg);
  color: var(--code-fg);
  padding: 14px 16px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.85em;
  line-height: 1.45;
}
pre code {
  background: transparent;
  padding: 0;
  font-size: inherit;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.92em;
}
th, td {
  border: 1px solid var(--rule);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
}
th { background: var(--code-bg); font-family: -apple-system, sans-serif; }
img {
  max-width: 100%;
  height: auto;
  border: 1px solid var(--rule);
  border-radius: 4px;
  margin: 0.5em 0;
}
blockquote {
  border-left: 3px solid var(--rule);
  margin: 1em 0;
  padding: 0.2em 1em;
  color: var(--muted);
}
em { color: var(--muted); }
`;
