const { clipboard } = require('electron');
const { keyboard, Key } = require('@nut-tree-fork/nut-js');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const Logger = require('./logger');

const WTYPE_PATH = path.join(__dirname, '..', 'bin', 'wtype');

function execAsync(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 2000, ...options }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr, status: error ? (error.code || 1) : 0 });
    });
  });
}

class ClipboardManager {
  /**
   * Save the user's current clipboard content before paste operations
   */
  static getPreviousClipboard() {
    try {
      return clipboard.readText();
    } catch (e) {
      return '';
    }
  }

  /**
   * Restore previous clipboard content after a brief delay
   */
  static async restoreClipboard(previousText, delayMs = 150) {
    if (typeof previousText !== 'string') return;
    await new Promise(r => setTimeout(r, delayMs));
    try {
      clipboard.writeText(previousText);
    } catch (e) {
      Logger.warn('Error restoring previous clipboard:', e.message);
    }
  }

  /**
   * Sync text with OS clipboards (Electron clipboard + Wayland wl-copy)
   */
  static syncClipboard(text) {
    if (!text) return;
    try {
      clipboard.writeText(text);
    } catch (e) {
      Logger.warn('Electron clipboard write error:', e.message);
    }

    if (process.platform === 'linux') {
      // Pass text via stdin (not argv) so it's not visible in `ps` / process list.
      // Use async spawn to avoid blocking the main thread.
      const writeToWlCopy = (args) => {
        return new Promise((resolve) => {
          try {
            const proc = spawn('wl-copy', args, { timeout: 1000 });
            proc.stdin.on('error', () => {});
            proc.on('error', () => resolve());
            proc.on('close', resolve);
            proc.stdin.end(text, 'utf8');
          } catch (e) {
            resolve();
          }
        });
      };
      // Fire-and-forget; do not await so callers aren't blocked
      Promise.all([writeToWlCopy([]), writeToWlCopy(['--primary'])]).catch(() => {});
    }
  }

  /**
   * Types text word-by-word at the current cursor position asynchronously
   * Uses non-blocking execFile to ensure UI and audio pipelines never freeze.
   */
  static async typeWordByWord(text, delayMs = 0) {
    if (!text || text.trim().length === 0) return false;

    const trimmed = text.trim();
    Logger.log(`[ClipboardManager] Typing transcription (${trimmed.length} chars): "${trimmed}"`);

    // Give a brief 30ms pause to ensure target text box has focus
    await new Promise(r => setTimeout(r, 30));

    // 1. Try native Wayland direct typing using wtype in one fast asynchronous call
    if (process.platform === 'linux' && fs.existsSync(WTYPE_PATH)) {
      try {
        const res = await execAsync(WTYPE_PATH, ['-d', '2', '-s', '1', '--', trimmed]);
        if (res.status === 0 && !res.error) {
          Logger.success('[ClipboardManager] wtype direct typing completed successfully');
          return true;
        }
      } catch (err) {
        Logger.warn('[ClipboardManager] wtype direct typing encountered error, falling back to paste:', err.message);
      }
    }

    // 2. Fallback: Auto-paste complete text via simulated Ctrl+V / Command+V
    return await this.autoPaste(trimmed);
  }

  /**
   * Automatically paste text at the current cursor position, preserving and restoring
   * the user's previous clipboard content, and avoiding double-paste.
   */
  static async autoPaste(text) {
    if (!text || text.trim().length === 0) return false;
    const trimmed = text.trim();

    // 1. Backup user's clipboard
    const previousClipboard = this.getPreviousClipboard();

    try {
      this.syncClipboard(trimmed);
      await new Promise(r => setTimeout(r, 60));

      let pasted = false;

      // 2. Wayland compositor paste via wtype with key-down/key-up spacing
      if (process.platform === 'linux' && fs.existsSync(WTYPE_PATH)) {
        try {
          const res = await execAsync(WTYPE_PATH, ['-s', '30', '-M', 'ctrl', '-s', '30', '-k', 'v', '-s', '30', '-m', 'ctrl']);
          if (res.status === 0) {
            pasted = true;
            Logger.success('[ClipboardManager] Pasted successfully using wtype Ctrl+V');
          }
        } catch (e) {
          Logger.warn('[ClipboardManager] wtype paste failed:', e.message);
        }
      }

      // 3. Fallback: Nut-js paste ONLY if wtype did not paste (prevents double-paste bug)
      if (!pasted) {
        try {
          const isMac = os.platform() === 'darwin';
          const modifierKey = isMac ? Key.LeftSuper : Key.LeftControl;
          await keyboard.pressKey(modifierKey, Key.V);
          await keyboard.releaseKey(modifierKey, Key.V);
          pasted = true;
          Logger.success('[ClipboardManager] Pasted via nut-js');
        } catch (e) {
          Logger.warn('[ClipboardManager] nut-js paste failed:', e.message);
        }
      }

      // 4. Windows PowerShell fallback if nut-js was unavailable or failed
      if (!pasted && process.platform === 'win32') {
        try {
          await new Promise((resolve) => {
            execFile('powershell.exe', [
              '-NoProfile',
              '-Command',
              `$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^v')`
            ], { timeout: 1500 }, (err) => {
              if (!err) {
                pasted = true;
                Logger.success('[ClipboardManager] Pasted via Windows PowerShell SendKeys');
              }
              resolve();
            });
          });
        } catch (e) {
          Logger.warn('[ClipboardManager] Windows PowerShell paste fallback failed:', e.message);
        }
      }

      // 5. Restore user's previous clipboard content after paste completes
      this.restoreClipboard(previousClipboard, 200);

      return pasted;
    } catch (error) {
      Logger.error('Error in autoPaste:', error);
      // Ensure clipboard is restored even on error
      this.restoreClipboard(previousClipboard, 50);
      return false;
    }
  }
}

module.exports = ClipboardManager;
