

export interface IdeInfo {
  ide: string; // e.g. "vscode" | "jetbrains"
  project: string;
  file: string;
  language: string;
}



export interface IdeParser {
  canParse(processName: string): boolean;
  parse(windowTitle: string): Partial<IdeInfo>;
}
