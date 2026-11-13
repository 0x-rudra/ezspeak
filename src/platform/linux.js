const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const Logger = require('../logger');

const WTYPE_PATH = path.join(__dirname, '..', '..', 'bin', 'wtype');

class LinuxPlatformAdapter {
  constructor() {
    this.isWayland = Boolean(process.env.WAYLAND_DISPLAY);
    this.isNiri = Boolean(process.env.NIRI_SOCKET || process.env.XDG_CURRENT_DESKTOP === 'niri');
    this.isHyprland = Boolean(process.env.HYPRLAND_INSTANCE_SIGNATURE || process.env.XDG_CURRENT_DESKTOP === 'Hyprland');
  }

  /**
   * Check for required Linux tools (wtype, wl-copy) and microphone accessibility
   */
  checkDependencies() {
    const results = {
      wtype: false,
      wlCopy: false,
      isWayland: this.isWayland,
      desktop: process.env.XDG_CURRENT_DESKTOP || 'unknown',
      missing: []
    };

    // Check wtype
    if (fs.existsSync(WTYPE_PATH)) {
      results.wtype = true;
    } else {
      try {
        const out = spawnSync('which', ['wtype']);
        results.wtype = out.status === 0;
      } catch (e) {}
    }
    if (!results.wtype && this.isWayland) {
      results.missing.push('wtype (Wayland simulated keystroke injector)');
    }

    // Check wl-copy
    try {
      const out = spawnSync('which', ['wl-copy']);
      results.wlCopy = out.status === 0;
    } catch (e) {}
    if (!results.wlCopy && this.isWayland) {
      results.missing.push('wl-clipboard (wl-copy / wl-paste)');
    }

    results.ok = results.missing.length === 0;
    return results;
  }

  /**
   * Register hotkey on Linux
   */
  async registerHotkey(hotkeyManager) {
    if (hotkeyManager) {
      return await hotkeyManager.startMonitoring();
    }
    return false;
  }

  /**
   * Type text into active window
   */
  async typeText(text) {
    const ClipboardManager = require('../clipboardManager');
    return await ClipboardManager.typeWordByWord(text);
  }

  /**
   * Get active focused application title/name
   */
  getFocusedApp() {
    if (this.isNiri && process.env.NIRI_SOCKET) {
      try {
        const out = spawnSync('niri', ['msg', '-j', 'focused-window'], { encoding: 'utf8', timeout: 500 });
        if (out.status === 0 && out.stdout) {
          const parsed = JSON.parse(out.stdout);
          return parsed.app_id || parsed.title || 'niri';
        }
      } catch (e) {}
    }

    if (this.isHyprland) {
      try {
        const out = spawnSync('hyprctl', ['activewindow', '-j'], { encoding: 'utf8', timeout: 500 });
        if (out.status === 0 && out.stdout) {
          const parsed = JSON.parse(out.stdout);
          return parsed.class || parsed.title || 'hyprland';
        }
      } catch (e) {}
    }

    return 'Desktop Window';
  }

  /**
   * Configure recording indicator window for Linux compositor
   */
  showIndicator(window) {
    if (!window || window.isDestroyed()) return;
    try {
      window.setAlwaysOnTop(true, 'pop-up-menu');
      window.showInactive();
      if (!window.isVisible()) {
        window.show();
      }
    } catch (e) {
      window.show();
    }
  }
}

module.exports = new LinuxPlatformAdapter();

