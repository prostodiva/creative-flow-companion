export interface AppActivity {
  id?: number;
  ts: number;
  appName: string;
  windowTitle: string;
  domain?: string;
  isFullscreen?: number;  
  hasAudio?: number;     
  category: string;
  durationMs: number;
  chromeTabCount?: number;
}

export interface AppBreakdown {
  appName: string;
  pct: number;
  totalMs: number;
}

export interface ActiveSessionPayload {
  startMs: number;
  endMs: number;
  appName: string;
  filesTouched: string[];
  keystrokes: number;

  filePath?: string;
  windowTitle?: string;
  isCoding?: boolean;
  durationMs?: number;
}