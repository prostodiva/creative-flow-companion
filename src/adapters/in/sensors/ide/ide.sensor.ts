import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import { logger } from "../../../../infrastructure/logger.js";
import type { IdeRepo } from "../../../out/repos/ide.repo.js";
import { PollingSensor } from "../base/polling.sensor.js";
import { IpcServer } from "./ipc.js";

const execFileAsync = promisify(execFile);


interface IdeEvent {
  ts: number;
  ide: string;
  project: string;
  file: string;
  event_type: string;
  language: string;
  duration_ms: number;
}


export class IdeSensor extends PollingSensor<IdeEvent> {
  readonly name = "ide";

  protected override get intervalMs(): number {
    return 5_000; // 5s - only polling git, not window title
  }

  private readonly _ipc: IpcServer;
  private readonly _repo: IdeRepo;

  private _keystrokeCount = 0;
  private _lastCommitTs = 0;

  constructor(repo: IdeRepo) {
    super();
    this._repo = repo;
    this._ipc = new IpcServer();
  }

  override start(): void {
    super.start();
    void this._ipc.start();
    this._ipc.on("event", (evt) => {
      if (evt.event === "keystroke") this._keystrokeCount++;

      // Extract project from file path - use parent dir name
      const project = path.basename(path.dirname(evt.file)) || "unknown";

      // Persist the raw event
      void this._repo.insertKeystroke({
        ts: evt.ts,
        file: evt.file,
        event_type: evt.event,
        project, // <- Added this
      });
    });
  }

  override stop(): void {
    super.stop();
    void this._ipc.stop();
  }

  protected async poll(): Promise<IdeEvent | null> {
    // Don't poll active window here - AppActivitySensor does that
    // Only poll git for last commit timestamp
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["log", "-1", "--format=%ct"],
        {
          cwd: process.cwd(),
          timeout: 2000,
        },
      ).catch(() => ({ stdout: "0" }));

      const commitTs = parseInt(stdout.trim()) * 1000;
      if (commitTs > this._lastCommitTs) {
        this._lastCommitTs = commitTs;
        this._repo.upsertLastCommit(commitTs); 
      }
    } catch (err) {
      logger.debug({ err }, "Git poll failed");
    }

    return null; 
  }

  protected async flush(batch: IdeEvent[]): Promise<void> {
    if (batch.length === 0) return;
    this._repo.insertMany(batch); 
    logger.debug(
      { sensor: this.name, count: batch.length },
      "Flushed IDE events",
    );
  }
  /** Expose for rule engine */
  get keystrokeCount(): number {
    return this._keystrokeCount;
  }

  resetKeystrokeCount(): void {
    this._keystrokeCount = 0;
  }
}
