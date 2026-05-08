import { createServer, type Server } from 'node:net';
import { unlink, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { logger } from '../../core/logger.js';
import { redact } from '../../utils/redact.js';

export const SOCKET_PATH = '/tmp/flow-agent-ide.sock';

export interface IpcEvent {
  event: 'keystroke' | 'copilot_accept';
  file: string;
  ts: number;
}

/**
 * Unix domain socket server.
 * IDE plugins connect and send newline-delimited JSON:
 *   {"event":"keystroke","file":"/path/to/file.ts"}
 */
export class IpcServer extends EventEmitter {
  private _server: Server | null = null;

  async start(): Promise<void> {
    // Clean up stale socket
    if (existsSync(SOCKET_PATH)) {
      await unlink(SOCKET_PATH).catch(() => {});
    }

    this._server = createServer((socket) => {
      let buf = '';

      socket.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          this._handleLine(line.trim());
        }
      });

      socket.on('error', (err) => {
        logger.warn({ err }, 'IPC socket client error');
      });
    });

    await new Promise<void>((resolve, reject) => {
      this._server!.listen(SOCKET_PATH, () => resolve());
      this._server!.once('error', reject);
    });

    // Restrict access — only owner can read/write
    await chmod(SOCKET_PATH, 0o600);
    logger.info({ path: SOCKET_PATH }, 'IPC socket listening');
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this._server) return resolve();
      this._server.close(() => resolve());
    });
    await unlink(SOCKET_PATH).catch(() => {});
    logger.info('IPC socket stopped');
  }

  private _handleLine(line: string): void {
    if (!line) return;
    try {
      // Basic length guard before parsing
      if (line.length > 512) {
        logger.warn('IPC message too long, dropping');
        return;
      }
      const raw = JSON.parse(line) as Record<string, unknown>;

      if (
        (raw['event'] !== 'keystroke' && raw['event'] !== 'copilot_accept') ||
        typeof raw['file'] !== 'string'
      ) {
        logger.warn({ raw }, 'Malformed IPC message');
        return;
      }

      const evt: IpcEvent = {
        event: raw['event'] as IpcEvent['event'],
        file: redact(raw['file']),
        ts: Date.now(),
      };
      this.emit('event', evt);
    } catch {
      logger.warn({ line }, 'Failed to parse IPC message');
    }
  }
}