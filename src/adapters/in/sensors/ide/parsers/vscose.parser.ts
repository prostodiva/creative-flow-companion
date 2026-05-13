import type { IdeParser, IdeInfo } from "./base.parser.js";

const PROCESS_NAMES = new Set([
  "Code",
  "Code - Insiders",
  "code",
  "code-insiders",
]);

const FILE_PROJECT_RE = /^●?\s*(.+?)\s+[—–-]{1,2}\s+(.+?)(?:\s+\([^)]+\))?$/u;

const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescriptreact",
  js: "javascript",
  jsx: "javascriptreact",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  cs: "csharp",
  cpp: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  vue: "vue",
  svelte: "svelte",
  html: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sh: "shellscript",
  sql: "sql",
};

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_MAP[ext] ?? "plaintext";
}

export class VSCodeParser implements IdeParser {
  canParse(processName: string): boolean {
    return PROCESS_NAMES.has(processName);
  }

  parse(windowTitle: string): Partial<IdeInfo> {
    const match = FILE_PROJECT_RE.exec(windowTitle.trim());
    if (!match) {
      return { ide: "vscode", project: windowTitle.trim().slice(0, 200) };
    }

    const [, rawFile, rawProject] = match;
    const file = (rawFile ?? "").trim();
    const project = (rawProject ?? "").trim();

    return {
      ide: "vscode",
      project: project.slice(0, 200),
      file: file.slice(0, 200),
      language: detectLanguage(file),
    };
  }
}
