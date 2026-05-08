import { PollingSensor } from '../base/polling.sensor.js';
import type { IdeParser, IdeInfo } from './parsers/base.parser.js';
import { VSCodeParser } from './parsers/vscose.parser.js';
import { JetBrainsParser } from './parsers/jetbrains.parser.js';
import { IpcServer } from '../ide/ipc.js';
import type { IdeRepo } from '../../repos/ide.repo.ts';
import { redact } from '../../utils/redact.js';
import { logger } from '../../core/logger.js';

// ---- Types -----------------------------------------------------------------

interface IdeEvent {
  ts: number;
  ide: string;
  project: string;
  file: string;
  language: string;
  duration_ms: number;
}

// ---- Sensor ----------------------------------------------------------------

export class IdeSensor extends PollingSensor<IdeEvent> {
  readonly name = 'ide';

  protected override get intervalMs(): number {
    return 1_000; // 1 s — finer grained than global default
  }

  private readonly _parsers: IdeParser[] = [
    new VSCodeParser(),
    new JetBrainsParser(),
  ];
  private readonly _ipc: IpcServer;
  private readonly _repo: IdeRepo;

  // Keystroke tracking for "stuck" detection
  private _keystrokeCount = 0;
  private _lastWindowKey = '';
  private _windowStartMs = 0;

  constructor(repo: IdeRepo) {
    super();
    this._repo = repo;
    this._ipc = new IpcServer();
  }

  override start(): void {
    super.start();
    void this._ipc.start();
    this._ipc.on('event', (evt) => {
      if (evt.event === 'keystroke') this._keystrokeCount++;
      // Persist the raw event
      void this._repo.insertKeystroke({
        ts: evt.ts,
        file: evt.file,
        event_type: evt.event,
      });
    });
  }

  override stop(): void {
    super.stop();
    void this._ipc.stop();
  }

  protected async poll(): Promise<IdeEvent | null> {
    const activeWin = (await import('active-win')).default;
    const win = await activeWin();
    if (!win) return null;

    const processName = win.owner.name;
    const parser = this._parsers.find((p) => p.canParse(processName));
    if (!parser) return null;

    const info: Partial<IdeInfo> = parser.parse(win.title ?? '');
    if (!info.project) return null;

    const windowKey = `${info.ide ?? 'ide'}:${info.project}`;
    const now = Date.now();

    if (windowKey !== this._lastWindowKey) {
      this._lastWindowKey = windowKey;
      this._windowStartMs = now;
    }

    const duration_ms = now - this._windowStartMs;

    return {
      ts: now,
      ide: info.ide ?? 'ide',
      project: redact(info.project),
      file: redact(info.file ?? ''),
      language: info.language ?? 'plaintext',
      duration_ms,
    };
  }

  protected async flush(batch: IdeEvent[]): Promise<void> {
    await this._repo.insertMany(batch);
    logger.debug({ sensor: this.name, count: batch.length }, 'Flushed IDE events');
  }

  /** Expose for rule engine */
  get keystrokeCount(): number {
    return this._keystrokeCount;
  }

  resetKeystrokeCount(): void {
    this._keystrokeCount = 0;
  }
}