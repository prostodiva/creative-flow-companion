// ---- Shared types ----------------------------------------------------------

export interface IdeInfo {
  ide: string;       // e.g. "vscode" | "jetbrains"
  project: string;
  file: string;
  language: string;
}

// ---- Strategy interface ----------------------------------------------------

export interface IdeParser {
  /** True if this parser can handle the given process name */
  canParse(processName: string): boolean;
  /** Extract IdeInfo from the window title (may return partial) */
  parse(windowTitle: string): Partial<IdeInfo>;
}