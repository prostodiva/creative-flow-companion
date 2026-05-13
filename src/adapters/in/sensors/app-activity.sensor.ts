/**
 * Records macOS foreground activity. Does not decide interventions;
 * orchestrator / session logger consume stored rows.
 */

import { Ollama } from "@langchain/ollama";
import { execFile } from "child_process";
import { promisify } from "util";
import { config } from "../../../infrastructure/config.js";
import { logger } from "../../../infrastructure/logger.js";
import { classifyActivityCategory, type ActivityCategory } from "../../../policy/activityCategoryPolicy.js";
import { inferAudibleFromHost } from "../../../policy/mediaSignals.js";
import { classifyVideoCategory, type VideoCategory } from "../../../policy/videoClassifierPolicy.js";
import { IAppRepo } from "../../../domain/ports/out/IAppRepo.js";
import { IIdeRepo } from "../../../domain/ports/out/IIdeRepo.js";
import { Sensor, type SensorHealth } from "./base/sensor.js";

const execFileAsync = promisify(execFile);

/** DB category strings for video classifier path (orchestrator aggregates these) */
function videoCategoryToDb(c: VideoCategory): string {
  return c === "work" ? "work_video" : "entertainment_video";
}

function mergeCoarseWithVideo(
  coarse: ActivityCategory,
  video: VideoCategory,
): string {
  if (coarse === "unknown") return videoCategoryToDb(video);
  if (coarse === "work") return video === "entertainment" ? "entertainment_video" : "work_video";
  return video === "work" ? "work_video" : "entertainment_video";
}

export class AppActivitySensor extends Sensor {
  readonly name = "app-activity";
  private interval: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private errorCount = 0;
  private lastTickAt: number | null = null;
  private llm = new Ollama({ baseUrl: config.OLLAMA_BASE_URL, model: config.OLLAMA_MODEL, temperature: 0 });

  private lastApp = "";
  private lastTitle = "";
  private lastDomain: string | null = null;
  private lastFullscreen = false;
  private lastAudible = false;
  private lastChromeTabCount: number | null = null;
  private lastTs = Date.now();

  constructor(
    private appRepo: IAppRepo,
    private ideRepo: IIdeRepo,
  ) {
    super();
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), 2000);
    logger.info("AppActivitySensor started");
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  health(): SensorHealth {
    return {
      name: this.name,
      status: this.errorCount > 10 ? "error" : this.interval ? "ok" : "idle",
      lastTickAt: this.lastTickAt,
      errorCount: this.errorCount,
      tickCount: this.tickCount,
    };
  }

  private async tick(): Promise<void> {
    this.tickCount++;
    this.lastTickAt = Date.now();
    try {
      await this.poll();
    } catch (err) {
      this.errorCount++;
      logger.error({ err }, "Poll failed");
    }
  }

  private extractVSCodeFile(appName: string, windowTitle: string): string {
    if (appName !== "Code" && appName !== "Cursor") return "__no_file__";
    const match = windowTitle.match(/^(.+?)\s—/);
    if (!match?.[1]) return "__no_file__";
    const file = match[1].trim();
    if (
      file === "Welcome" ||
      file === "Getting Started" ||
      file.includes("Extension")
    ) {
      return "__no_file__";
    }
    return file;
  }

  protected async poll(): Promise<void> {
    const now = Date.now();
    const { app, title, domain, fullscreen, audibleFromOs, chromeTabCount } =
      await this.getActiveWindow();
    const audible = audibleFromOs || inferAudibleFromHost(domain);

    const duration_ms = now - this.lastTs;

    if (this.lastApp && duration_ms > 0) {
      let category: string | null =
        (await this.appRepo.getCachedCategory(
          this.lastTitle,
          this.lastDomain ?? undefined,
        )) ?? null;

      if (!category) {
        const coarse = classifyActivityCategory(
          this.lastTitle,
          this.lastDomain,
        );
        category = coarse;

        if (this.lastApp === "Google Chrome" && this.lastAudible) {
          const videoCat = await classifyVideoCategory(
            {
              llm: this.llm,
              getCached: async (t, d) => this.appRepo.getCachedCategory(t, d),
              putCached: async (t, d, c: VideoCategory) => {
                await this.appRepo.cacheCategory(t, d, videoCategoryToDb(c));
              },
            },
            this.lastTitle,
            this.lastDomain ?? undefined,
          );
          category = mergeCoarseWithVideo(coarse, videoCat);
        }

        await this.appRepo.cacheCategory(
          this.lastTitle,
          this.lastDomain ?? undefined,
          category,
        );
      }

      await this.appRepo.insertMany([
      {
        ts: this.lastTs,
        appName: this.lastApp,
        windowTitle: this.lastTitle,
      ...(this.lastDomain && { domain: this.lastDomain }), 
        category: category || 'unknown',
        durationMs: duration_ms,
      },
    ]);

    await this.ideRepo.insertActiveSession({
      startMs: this.lastTs, // was: timestamp
      endMs: now, // add this, it's required
      appName: this.lastApp,
      filesTouched: [], // add this, it's required
      keystrokes: 0, // add this, it's required
      filePath: this.extractVSCodeFile(this.lastApp, this.lastTitle) || '',
      windowTitle: this.lastTitle,
      isCoding: false, 
      durationMs: duration_ms,
    });
  

      logger.debug(
        {
          app: this.lastApp,
          title: this.lastTitle?.slice(0, 30),
          domain: this.lastDomain,
          audible: this.lastAudible,
          category,
          duration_ms,
        },
        "Saved activity",
      );
    }

    this.lastApp = app;
    this.lastTitle = title;
    this.lastDomain = domain;
    this.lastFullscreen = fullscreen;
    this.lastAudible = audible;
    this.lastChromeTabCount = chromeTabCount;
    this.lastTs = now;

    if (this.tickCount % 30 === 0) {
      const pruned = await this.ideRepo.cleanupOldSessions();
      if (pruned > 0) {
        logger.debug(
          { pruned },
          "Pruned stale sessions from active_work_sessions",
        );
      }
    }
  }

  private async getActiveWindow(): Promise<{
    app: string;
    title: string;
    domain: string | null;
    fullscreen: boolean;
    audibleFromOs: boolean;
    chromeTabCount: number | null;
  }> {
    try {
      const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
      end tell
      
      set winTitle to ""
      set tabUrl to ""
      set isFull to false
      set tabCount to 0
      set isAudible to false
      
      if frontApp is "Google Chrome" then
        tell application "Google Chrome"
          if (count of windows) > 0 then
            try
              set winTitle to title of active tab of front window
            end try
            try
              set tabUrl to URL of active tab of front window
            end try
            try
              set isAudible to audible of active tab of front window
            end try
            try
              set isFull to fullscreen of front window
            end try
            try
              set tabCount to 0
              repeat with w in windows
                set tabCount to tabCount + (count of tabs of w)
              end repeat
            end try
          end if
        end tell
      else if frontApp is "Safari" then
        tell application "Safari"
          if (count of windows) > 0 then
            try
              set winTitle to name of current tab of front window
            end try
            try
              set tabUrl to URL of current tab of front window
            end try
            try
              set tabCount to 0
              repeat with w in windows
                set tabCount to tabCount + (count of tabs of w)
              end repeat
            end try
          end if
        end tell
      else if frontApp is "Code" or frontApp is "Visual Studio Code" then
        tell application "System Events"
          tell process frontApp
            try
              set winTitle to name of front window
            end try
          end tell
        end tell
      end if
      
      return frontApp & "|||" & winTitle & "|||" & tabUrl & "|||" & isFull & "|||" & tabCount & "|||" & isAudible
    `;

      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      const parts = stdout.trim().split("|||");
      const [app, title, url, fullStr, tabCountStr, audStr] = parts;

      let domain: string | null = null;
      if (url && url !== "missing value" && url !== "") {
        try {
          domain = new URL(url).hostname.replace("www.", "");
        } catch {
          /* ignore */
        }
      }

      const audibleFromOs = audStr === "true";

      const chromeTabCount =
        app === "Google Chrome"
          ? Number.isFinite(Number(tabCountStr))
            ? parseInt(String(tabCountStr), 10)
            : null
          : null;

      return {
        app: app || "unknown",
        title: title || "",
        domain,
        fullscreen: fullStr === "true",
        audibleFromOs,
        chromeTabCount,
      };
    } catch (err) {
      logger.error({ err }, "getActiveWindow failed");
      return {
        app: "unknown",
        title: "",
        domain: null,
        fullscreen: false,
        audibleFromOs: false,
        chromeTabCount: null,
      };
    }
  }
}