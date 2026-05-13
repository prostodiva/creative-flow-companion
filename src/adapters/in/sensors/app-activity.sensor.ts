/**
 * Records macOS foreground activity as raw events.
 * This sensor only reads the active window and writes a duration row.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { logger } from "../../../infrastructure/logger.js";
import { IAppRepo } from "../../../domain/ports/out/IAppRepo.js";
import { Sensor, type SensorHealth } from "./base/sensor.js";
import { AppActivity } from "../../../domain/models/activity.js";

const execFileAsync = promisify(execFile);

type Snapshot = {
  ts: number;
  app: string;
  title: string;
  domain: string | null;
  fullscreen: boolean;
  audible: boolean;
  chromeTabCount: number | null;
};

export class AppActivitySensor extends Sensor {
  readonly name = "app-activity";
  private interval: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private errorCount = 0;
  private lastTickAt: number | null = null;
  private last: Snapshot | null = null;

  constructor(private appRepo: IAppRepo) {
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

  protected async poll(): Promise<void> {
    const now = Date.now();
    const win = await this.getActiveWindow();

    if (!this.last) {
      this.last = { ...win, ts: now };
      return;
    }

    const durationMs = now - this.last.ts;
    if (durationMs <= 0) {
      this.last = { ...win, ts: now };
      return;
    }

    const activity: AppActivity = {
      ts: this.last.ts,
      appName: this.last.app,
      windowTitle: this.last.title,
      domain: this.last.domain ?? "", 
      category: "raw", 
      durationMs,
    } as AppActivity;

    this.appRepo.insertMany([activity]);
    this.last = { ...win, ts: now };
  }

  private async getActiveWindow(): Promise<Omit<Snapshot, "ts">> {
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

    try {
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      const parts = stdout.trim().split("|||");

      const app = parts[0]?? "unknown";
      const title = parts[1]?? "";
      const url = parts[2]?? "";
      const fullStr = parts[3]?? "false";
      const tabCountStr = parts[4]?? "0";
      const audStr = parts[5]?? "false";

      let domain: string | null = null;
      if (url && url!== "missing value") {
        try { domain = new URL(url).hostname.replace("www.", ""); } catch {}
      }

      return {
        app,
        title,
        domain,
        fullscreen: fullStr === "true",
        audible: audStr === "true",
        chromeTabCount:
          app === "Google Chrome" && /^\d+$/.test(tabCountStr)
          ? parseInt(tabCountStr, 10)
            : null,
      };
    } catch (err) {
      logger.error({ err }, "getActiveWindow failed");
      return {
        app: "unknown",
        title: "",
        domain: null,
        fullscreen: false,
        audible: false,
        chromeTabCount: null,
      };
    }
  }
}