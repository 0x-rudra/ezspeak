const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Logger = require('./logger');

class LocalServer {
  constructor(options = {}) {
    this.port = options.port || 49152;
    this.onToggle = options.onToggle || (() => {});
    this.onStart = options.onStart || (() => {});
    this.onStop = options.onStop || (() => {});
    this.getStatus = options.getStatus || (() => ({ isRecording: false, status: 'idle' }));
    this.server = null;
    this.socketServer = null;
    this.socketPath = process.platform === 'win32'
      ? '\\\\.\\pipe\\ezspeak-ipc'
      : path.join(os.tmpdir(), 'ezspeak.sock');
  }

  handleRequest(req, res) {
    const url = req.url ? req.url.split('?')[0] : '/';

    // Security Hardening: Reject any browser/cross-origin requests
    if (req.headers.origin || req.headers.referer) {
      Logger.warn(`[LocalServer] Blocked cross-origin request from: ${req.headers.origin || req.headers.referer}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Browser cross-origin requests are blocked' }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    if (url === '/toggle') {
      Logger.log('[LocalServer] Received /toggle trigger');
      try {
        this.onToggle();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, action: 'toggle' }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    } else if (url === '/start') {
      Logger.log('[LocalServer] Received /start trigger');
      try {
        this.onStart();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, action: 'start' }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    } else if (url === '/stop') {
      Logger.log('[LocalServer] Received /stop trigger');
      try {
        this.onStop();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, action: 'stop' }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    } else if (url === '/status') {
      res.writeHead(200);
      res.end(JSON.stringify(this.getStatus()));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  start() {
    if (this.server) return;

    // 1. Start HTTP Server for local loopback (e.g. curl from compositor binds)
    this.server = http.createServer((req, res) => this.handleRequest(req, res));

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        Logger.warn(`LocalServer port ${this.port} is already in use. Another instance might be running.`);
      } else {
        Logger.error('LocalServer error:', err);
      }
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      Logger.success(`[LocalServer] Listening on http://127.0.0.1:${this.port} for global OS hotkey triggers`);
    });

    // 2. Start Unix domain socket / Windows named pipe for secure local IPC
    try {
      if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
        try { fs.unlinkSync(this.socketPath); } catch (e) {}
      }

      this.socketServer = http.createServer((req, res) => this.handleRequest(req, res));
      this.socketServer.on('error', (err) => {
        Logger.warn(`[LocalServer] Socket server error: ${err.message}`);
      });

      this.socketServer.listen(this.socketPath, () => {
        if (process.platform !== 'win32') {
          try { fs.chmodSync(this.socketPath, 0o600); } catch (e) {}
        }
        Logger.success(`[LocalServer] Listening on IPC socket: ${this.socketPath}`);
      });
    } catch (sockErr) {
      Logger.warn(`[LocalServer] Could not initialize socket: ${sockErr.message}`);
    }
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (this.socketServer) {
      this.socketServer.close();
      this.socketServer = null;
    }
    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      try { fs.unlinkSync(this.socketPath); } catch (e) {}
    }
  }
}

module.exports = LocalServer;
