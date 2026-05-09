import type { IdeParser, IdeInfo } from "./base.parser.js";

/**
 * JetBrains title formats vary by product but share a pattern:
 *   "filename.ext [ProjectName] – IntelliJ IDEA"
 *   "filename.kt [MyApp] – Rider"
 *   "ProjectName – WebStorm"                     (no file)
 *   "filename.py – ProjectName [venv] – PyCharm"  (with venv)
 */

const PROCESS_NAMES = new Set([
  "idea",
  "idea64",
  "webstorm",
  "webstorm64",
  "rider",
  "rider64",
  "pycharm",
  "pycharm64",
  "goland",
  "goland64",
  "clion",
  "clion64",
  "phpstorm",
  "phpstorm64",
  "rubymine",
  "rubymine64",
  "datagrip",
  "datagrip64",
  "fleet",
  // macOS process names (app bundle name)
  "IntelliJ IDEA",
  "WebStorm",
  "Rider",
  "PyCharm",
  "GoLand",
  "CLion",
  "PhpStorm",
  "RubyMine",
  "DataGrip",
  "Fleet",
]);

const PRODUCT_NAMES: Record<string, string> = {
  "IntelliJ IDEA": "intellij",
  WebStorm: "webstorm",
  Rider: "rider",
  PyCharm: "pycharm",
  GoLand: "goland",
  CLion: "clion",
  PhpStorm: "phpstorm",
  RubyMine: "rubymine",
  DataGrip: "datagrip",
  Fleet: "fleet",
};

// "filename.kt [ProjectName] – Rider"
const FULL_RE = /^(.+?)\s+\[(.+?)\]\s+[–—-]+\s+(.+)$/u;
// "ProjectName – Rider"
const PROJECT_RE = /^(.+?)\s+[–—-]+\s+(.+)$/u;

const LANGUAGE_MAP: Record<string, string> = {
  kt: "kotlin",
  java: "java",
  py: "python",
  go: "go",
  rs: "rust",
  cs: "csharp",
  fs: "fsharp",
  ts: "typescript",
  js: "javascript",
  php: "php",
  rb: "ruby",
  cpp: "cpp",
  c: "c",
  h: "c",
  sql: "sql",
};

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_MAP[ext] ?? "plaintext";
}

function productToIde(productName: string): string {
  for (const [key, val] of Object.entries(PRODUCT_NAMES)) {
    if (productName.includes(key)) return val;
  }
  return "jetbrains";
}

export class JetBrainsParser implements IdeParser {
  canParse(processName: string): boolean {
    return PROCESS_NAMES.has(processName);
  }

  parse(windowTitle: string): Partial<IdeInfo> {
    const title = windowTitle.trim();

    const fullMatch = FULL_RE.exec(title);
    if (fullMatch) {
      const [, rawFile, rawProject, rawProduct] = fullMatch;
      const file = (rawFile ?? "").trim();
      const project = (rawProject ?? "").trim();
      return {
        ide: productToIde(rawProduct ?? ""),
        project: project.slice(0, 200),
        file: file.slice(0, 200),
        language: detectLanguage(file),
      };
    }

    const projectMatch = PROJECT_RE.exec(title);
    if (projectMatch) {
      const [, rawProject, rawProduct] = projectMatch;
      return {
        ide: productToIde(rawProduct ?? ""),
        project: (rawProject ?? "").trim().slice(0, 200),
        file: "",
        language: "plaintext",
      };
    }

    return { ide: "jetbrains", project: title.slice(0, 200) };
  }
}
