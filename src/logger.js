// Simple logger with timestamps and file logging
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per log file — rotate beyond this

class Logger {
  static logFile = null;
  
  static init() {
    try {
      const { app } = require('electron');
      const logDir = path.join(app.getPath('userData'), 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = path.join(logDir, `ezspeak-${new Date().toISOString().split('T')[0]}.log`);
      this.logFile = logFile;
      // Rotate old log if it exceeds the size limit
      this._rotateIfNeeded();
      this.writeToFile('=== Logging started ===');
    } catch (e) {
      // If electron app not available, skip file logging
    }
  }

  static _rotateIfNeeded() {
    if (!this.logFile) return;
    try {
      const stats = fs.statSync(this.logFile);
      if (stats.size > LOG_MAX_BYTES) {
        const rotated = this.logFile.replace(/\.log$/, '.old.log');
        fs.renameSync(this.logFile, rotated);
      }
    } catch (e) {
      // File doesn't exist yet or stat failed — no rotation needed
    }
  }
  
  static writeToFile(message) {
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, message + '\n', 'utf8');
      } catch (e) {
        // Ignore file write errors
      }
    }
  }
  
  static log(message, ...args) {
    const logMsg = `[${new Date().toLocaleTimeString()}] [INFO] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
    console.log(logMsg);
    this.writeToFile(logMsg);
  }

  static success(message, ...args) {
    const logMsg = `[${new Date().toLocaleTimeString()}] [SUCCESS] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
    console.log(logMsg);
    this.writeToFile(logMsg);
  }

  static error(message, ...args) {
    const logMsg = `[${new Date().toLocaleTimeString()}] [ERROR] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
    console.error(logMsg);
    this.writeToFile(logMsg);
  }

  static warn(message, ...args) {
    const logMsg = `[${new Date().toLocaleTimeString()}] [WARN] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
    console.warn(logMsg);
    this.writeToFile(logMsg);
  }

  static debug(message, ...args) {
    if (process.env.DEBUG || process.argv.includes('--debug')) {
      const logMsg = `[${new Date().toLocaleTimeString()}] [DEBUG] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
      console.log(logMsg);
      this.writeToFile(logMsg);
    }
  }

  static recording(message, ...args) {
    const logMsg = `[${new Date().toLocaleTimeString()}] [REC] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
    console.log(logMsg);
    this.writeToFile(logMsg);
  }

  static transcription(message, ...args) {
    // Redact raw transcript text from disk logs to protect user privacy
    const textLen = (typeof message === 'string' ? message.length : 0) + (args[0] ? String(args[0]).length : 0);
    const diskMsg = `[${new Date().toLocaleTimeString()}] [TRANSCRIPT] [REDACTED: ${textLen} chars transcribed]`;
    this.writeToFile(diskMsg);

    // Only log text to stdout in dev/debug mode
    if (process.env.DEBUG || process.argv.includes('--debug') || process.argv.includes('--dev')) {
      const devMsg = `[${new Date().toLocaleTimeString()}] [TRANSCRIPT] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
      console.log(devMsg);
    }
  }
}

module.exports = Logger;

