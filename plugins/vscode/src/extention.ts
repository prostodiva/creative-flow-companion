import * as vscode from 'vscode';
import * as net from 'net';

const SOCKET_PATH = '/tmp/flow-agent-ide.sock';
const RECONNECT_DELAY_MS = 5_000;
const MAX_KEYSTROKE_RATE = 20; // events/s — de-bounce

// ---- Socket connection -----------------------------------------------------

let _socket: net.Socket | null = null;
let _reconnectTimer: NodeJS.Timeout | null = null;
let _keystrokeTimestamp = 0;
let _keystrokeCount = 0;

function connect(): void {
  _socket = new net.Socket();

  _socket.connect(SOCKET_PATH, () => {
    console.log('[FlowAgent] Connected to daemon socket');
    if (_reconnectTimer) {
      clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
  });

  _socket.on('error', (err) => {
    console.warn('[FlowAgent] Socket error:', err.message);
    scheduleReconnect();
  });

  _socket.on('close', () => {
    console.warn('[FlowAgent] Socket closed');
    scheduleReconnect();
  });
}

function scheduleReconnect(): void {
  _socket?.destroy();
  _socket = null;
  if (!_reconnectTimer) {
    _reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  }
}

function send(event: object): void {
  if (!_socket || _socket.destroyed) return;
  try {
    _socket.write(JSON.stringify(event) + '\n');
  } catch {
    scheduleReconnect();
  }
}

// ---- Rate limiter (token bucket, simple) -----------------------------------

function shouldSendKeystroke(): boolean {
  const now = Date.now();
  if (now - _keystrokeTimestamp >= 1000) {
    _keystrokeTimestamp = now;
    _keystrokeCount = 0;
  }
  if (_keystrokeCount >= MAX_KEYSTROKE_RATE) return false;
  _keystrokeCount++;
  return true;
}

// ---- Activation ------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  connect();

  // Keystroke events
  const typeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.contentChanges.length === 0) return;
    if (!shouldSendKeystroke()) return;
    const file = e.document.uri.fsPath;
    send({ event: 'keystroke', file });
  });

  // Copilot accept (triggered by the "editor.action.inlineSuggest.commit" command)
  const copilotDisposable = vscode.commands.registerCommand(
    'flow-agent.copilot-accept',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        send({ event: 'copilot_accept', file: editor.document.uri.fsPath });
      }
      // Execute the real copilot commit command
      void vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    }
  );

  context.subscriptions.push(typeDisposable, copilotDisposable);
}

export function deactivate(): void {
  _socket?.destroy();
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
}