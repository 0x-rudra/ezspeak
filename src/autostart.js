const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const Logger = require('./logger');

class AutostartManager {
  constructor() {
    this.isLinux = process.platform === 'linux';
    this.isWin = process.platform === 'win32';
    this.isMac = process.platform === 'darwin';
  }

  getLinuxAutostartPath() {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(configHome, 'autostart', 'ezspeak.desktop');
  }

  generateDesktopEntry(execPath) {
    const targetExec = execPath || (app ? app.getPath('exe') : process.execPath);
    return `[Desktop Entry]
Type=Application
Version=1.0
Name=EzSpeak
GenericName=Voice Dictation
Comment=Cross-platform voice dictation and transcription desktop app
Exec="${targetExec}" --minimized
Icon=ezspeak
Terminal=false
Categories=Utility;AudioVideo;
StartupNotify=false
X-GNOME-Autostart-enabled=true
`;
  }

  async isEnabled() {
    try {
      if (this.isLinux) {
        const desktopFile = this.getLinuxAutostartPath();
        return fs.existsSync(desktopFile);
      } else if (app && app.getLoginItemSettings) {
        const settings = app.getLoginItemSettings();
        return !!settings.openAtLogin;
      }
      return false;
    } catch (err) {
      Logger.error('[Autostart] Failed to check status:', err.message);
      return false;
    }
  }

  async enable(execPath) {
    try {
      if (this.isLinux) {
        const desktopFile = this.getLinuxAutostartPath();
        const dir = path.dirname(desktopFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const content = this.generateDesktopEntry(execPath);
        fs.writeFileSync(desktopFile, content, 'utf8');
        Logger.log('[Autostart] Enabled on Linux via ' + desktopFile);
        return true;
      } else if (app && app.setLoginItemSettings) {
        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: true,
          path: execPath || app.getPath('exe')
        });
        Logger.log('[Autostart] Enabled on Windows/macOS');
        return true;
      }
      return false;
    } catch (err) {
      Logger.error('[Autostart] Failed to enable:', err.message);
      return false;
    }
  }

  async disable() {
    try {
      if (this.isLinux) {
        const desktopFile = this.getLinuxAutostartPath();
        if (fs.existsSync(desktopFile)) {
          fs.unlinkSync(desktopFile);
          Logger.log('[Autostart] Disabled on Linux by removing ' + desktopFile);
        }
        return true;
      } else if (app && app.setLoginItemSettings) {
        app.setLoginItemSettings({
          openAtLogin: false
        });
        Logger.log('[Autostart] Disabled on Windows/macOS');
        return true;
      }
      return false;
    } catch (err) {
      Logger.error('[Autostart] Failed to disable:', err.message);
      return false;
    }
  }

  async setAutostart(enabled, execPath) {
    return enabled ? this.enable(execPath) : this.disable();
  }
}

module.exports = new AutostartManager();

