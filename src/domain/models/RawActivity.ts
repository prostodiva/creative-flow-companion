export type RawActivity = {
  ts: number;
  appName: string;
  windowTitle: string;
  domain?: string;
  fullscreen: boolean;
  audible: boolean;
  chromeTabCount?: number | null;
  durationMs: number;
};
