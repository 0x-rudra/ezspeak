const Logger = require('../logger');

class WindowsPlatformAdapter {
  checkDependencies() {
    return { ok: true, missing: [] };
  }

  async registerHotkey(hotkeyManager) {
    if (hotkeyManager) {
      return await hotkeyManager.startMonitoring();
    }
    return false;
  }

  async typeText(text) {
    const ClipboardManager = require('../clipboardManager');
    return await ClipboardManager.autoPaste(text);
  }

  getFocusedApp() {
    return 'Active Application';
  }

  showIndicator(window) {
    if (!window || window.isDestroyed()) return;
    try {
      window.setAlwaysOnTop(true, 'screen-saver');
      window.showInactive();
    } catch (e) {
      window.show();
    }
  }
}

module.exports = new WindowsPlatformAdapter();

