"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const net = __importStar(require("net"));
const SOCKET_PATH = '/tmp/flow-agent-ide.sock';
const RECONNECT_DELAY_MS = 5000;
const MAX_KEYSTROKE_RATE = 20; // events/s — de-bounce
// ---- Socket connection -----------------------------------------------------
let _socket = null;
let _reconnectTimer = null;
let _keystrokeTimestamp = 0;
let _keystrokeCount = 0;
function connect() {
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
function scheduleReconnect() {
    _socket?.destroy();
    _socket = null;
    if (!_reconnectTimer) {
        _reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    }
}
function send(event) {
    if (!_socket || _socket.destroyed)
        return;
    try {
        _socket.write(JSON.stringify(event) + '\n');
    }
    catch {
        scheduleReconnect();
    }
}
// ---- Rate limiter (token bucket, simple) -----------------------------------
function shouldSendKeystroke() {
    const now = Date.now();
    if (now - _keystrokeTimestamp >= 1000) {
        _keystrokeTimestamp = now;
        _keystrokeCount = 0;
    }
    if (_keystrokeCount >= MAX_KEYSTROKE_RATE)
        return false;
    _keystrokeCount++;
    return true;
}
// ---- Activation ------------------------------------------------------------
function activate(context) {
    connect();
    // Keystroke events
    const typeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.contentChanges.length === 0)
            return;
        if (!shouldSendKeystroke())
            return;
        const file = e.document.uri.fsPath;
        send({ event: 'keystroke', file });
    });
    // Copilot accept (triggered by the "editor.action.inlineSuggest.commit" command)
    const copilotDisposable = vscode.commands.registerCommand('flow-agent.copilot-accept', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            send({ event: 'copilot_accept', file: editor.document.uri.fsPath });
        }
        // Execute the real copilot commit command
        void vscode.commands.executeCommand('editor.action.inlineSuggest.commit');
    });
    context.subscriptions.push(typeDisposable, copilotDisposable);
}
exports.activate = activate;
function deactivate() {
    _socket?.destroy();
    if (_reconnectTimer)
        clearTimeout(_reconnectTimer);
}
exports.deactivate = deactivate;
//# sourceMappingURL=extention.js.map