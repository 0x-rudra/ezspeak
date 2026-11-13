const Config = require('./config');
const Logger = require('./logger');

let uIOhook = null;
let UiohookKey = null;
try {
  // On Linux, uiohook requires an active X11 display.
  // In pure Wayland (no DISPLAY) or headless environments, avoid initializing uiohook to prevent native crashes.
  if (process.platform !== 'linux' || process.env.DISPLAY) {
    const uio = require('uiohook-napi');
    uIOhook = uio.uIOhook;
    UiohookKey = uio.UiohookKey;
  }
} catch (e) {
  Logger.warn('uiohook-napi not available or failed to load:', e.message);
}

class HotkeyManager {
  constructor(onRecordStart, onRecordStop, globalShortcut, onRecordCancel) {
    this.onRecordStart = onRecordStart;
    this.onRecordStop = onRecordStop;
    this.onRecordCancel = onRecordCancel || null; // Optional cancel callback (Escape)
    this.globalShortcut = globalShortcut;

    this.isRecording = false;
    this.isMonitoring = false;
    this.isPaused = false;

    // Active registration tracking
    this.registeredAccelerator = null;
    this.isEscapeRegistered = false;
    this.activeProvider = null; // 'globalShortcut' | 'uiohook' | 'none'
    this.uiohookStarted = false;

    // Current configuration
    this.currentHotkey = null;
    this.currentMode = 'toggle'; // 'toggle' | 'hold'
    this.targetHotkey = null;
    this.pressedKeys = new Set();
    this.lastToggleTime = 0;
    this.keyPressDebounce = 150;

    // Modifier mappings for uiohook
    if (UiohookKey) {
      this.modifiers = {
        'Ctrl': [UiohookKey.Ctrl, UiohookKey.CtrlRight],
        'Control': [UiohookKey.Ctrl, UiohookKey.CtrlRight],
        'Alt': [UiohookKey.Alt, UiohookKey.AltRight],
        'Shift': [UiohookKey.Shift, UiohookKey.ShiftRight],
        'Meta': [UiohookKey.Meta, UiohookKey.MetaRight],
        'Command': [UiohookKey.Meta, UiohookKey.MetaRight],
        'Cmd': [UiohookKey.Meta, UiohookKey.MetaRight],
        'Super': [UiohookKey.Meta, UiohookKey.MetaRight]
      };
    } else {
      this.modifiers = {};
    }
  }

  /**
   * Convert user hotkey string strictly into valid Electron accelerator variants
   * for THAT SPECIFIC shortcut only (NO unasked-for fallbacks).
   */
  getElectronAccelerators(hotkeyString) {
    if (!hotkeyString) return ['Control+Alt+Space', 'CommandOrControl+Alt+Space'];

    const parts = hotkeyString.split('+').map(p => p.trim());
    const accelerators = [];

    const mapPart = (part) => {
      const lower = part.toLowerCase();
      if (['ctrl', 'control', 'ctrlleft', 'controlleft', 'ctrlright', 'controlright'].includes(lower)) return 'Control';
      if (['alt', 'altleft', 'altright'].includes(lower)) return 'Alt';
      if (['shift', 'shiftleft', 'shiftright'].includes(lower)) return 'Shift';
      if (['meta', 'metaleft', 'metaright', 'cmd', 'super'].includes(lower)) return 'Super';
      if (['bracketright', 'closebracket'].includes(lower)) return ']';
      if (['bracketleft', 'openbracket'].includes(lower)) return '[';
      if (['backslash'].includes(lower)) return '\\';
      if (['slash'].includes(lower)) return '/';
      if (['space'].includes(lower)) return 'Space';
      return part.length === 1 ? part.toUpperCase() : part;
    };

    const primary = parts.map(mapPart).join('+');
    accelerators.push(primary);

    // Add cross-platform naming variants for that EXACT shortcut only
    if (primary.includes('Control')) {
      accelerators.push(primary.replace(/Control/g, 'CommandOrControl'));
      accelerators.push(primary.replace(/Control/g, 'Ctrl'));
    }
    if (primary.includes('CommandOrControl')) {
      accelerators.push(primary.replace(/CommandOrControl/g, 'Control'));
      accelerators.push(primary.replace(/CommandOrControl/g, 'Ctrl'));
    }

    return [...new Set(accelerators)];
  }

  /**
   * Start monitoring with single authoritative provider:
   * - In 'toggle' mode: Registers OS globalShortcut (uiohook is NOT started unless globalShortcut fails)
   * - In 'hold' mode (push-to-talk): Starts uiohook to track keydown/keyup (globalShortcut is NOT registered)
   */
  async startMonitoring() {
    this.currentHotkey = Config.getHotkey() || 'Ctrl+Alt+Space';
    this.currentMode = Config.getMode() || 'toggle';
    Logger.log(`Starting hotkey monitoring for: "${this.currentHotkey}" (mode: ${this.currentMode})...`);

    this.isMonitoring = true;
    this.pressedKeys.clear();

    // Clean up any existing listeners/shortcuts first
    this.cleanupListeners();

    if (this.currentMode === 'hold') {
      // In hold (push-to-talk) mode:
      // We need to know when the user presses AND releases the hotkey.
      // Electron's globalShortcut cannot detect key release events.
      // Therefore, uiohook handles hold mode exclusively — globalShortcut is NOT registered to prevent double triggers.
      const ok = this.startUiohook(this.currentHotkey, 'hold');
      if (ok) {
        this.activeProvider = 'uiohook';
        Logger.success(`Hold-to-talk active via uiohook for "${this.currentHotkey}"`);
      } else {
        this.activeProvider = 'none';
        Logger.warn(`Hold-to-talk could not start (uiohook unavailable on this display). On Wayland compositors, use IPC /toggle.`);
      }
    } else {
      // In toggle mode:
      // Try official OS globalShortcut first (standard, clean, zero keyhooking).
      const registered = this.registerGlobalShortcut(this.currentHotkey);

      if (registered) {
        this.activeProvider = 'globalShortcut';
        // Ensure uiohook is stopped so it doesn't double-fire or act as a keylogger
        this.stopUiohook();
        Logger.success(`Global OS shortcut registered: "${this.registeredAccelerator}" (provider: globalShortcut, toggle mode)`);
      } else {
        // Fallback to uiohook ONLY if globalShortcut failed (e.g. pure Wayland without XWayland, or shortcut collision)
        Logger.warn(`OS globalShortcut registration failed for "${this.currentHotkey}". Trying uiohook as fallback...`);
        const ok = this.startUiohook(this.currentHotkey, 'toggle');
        if (ok) {
          this.activeProvider = 'uiohook';
          Logger.success(`Fallback hotkey active via uiohook for "${this.currentHotkey}" (provider: uiohook, toggle mode)`);
        } else {
          this.activeProvider = 'none';
          Logger.warn(`Neither globalShortcut nor uiohook could register. If you are on Linux Wayland (Niri/Hyprland), use compositor keybind to http://127.0.0.1:49152/toggle.`);
        }
      }
    }
  }

  registerGlobalShortcut(hotkeyString) {
    if (!this.globalShortcut) {
      Logger.warn('globalShortcut API not available');
      return false;
    }

    // Unregister ONLY our previously registered hotkey accelerator (never call unregisterAll!)
    if (this.registeredAccelerator) {
      try {
        this.globalShortcut.unregister(this.registeredAccelerator);
      } catch (e) {}
      this.registeredAccelerator = null;
    }

    const candidates = this.getElectronAccelerators(hotkeyString);
    let registered = false;

    for (const acc of candidates) {
      try {
        const ok = this.globalShortcut.register(acc, () => {
          if (this.isPaused) return;
          Logger.log(`OS globalShortcut triggered (${acc})`);
          this.handleToggle();
        });

        if (ok) {
          registered = true;
          this.registeredAccelerator = acc;
          break;
        }
      } catch (err) {
        Logger.warn(`Accelerator "${acc}" could not be registered: ${err.message}`);
      }
    }

    return registered;
  }

  startUiohook(hotkeyString, mode) {
    if (!uIOhook || !UiohookKey) {
      return false;
    }

    try {
      this.targetHotkey = this.parseHotkey(hotkeyString);
      if (!this.targetHotkey) {
        Logger.warn(`Cannot parse hotkey for uiohook: ${hotkeyString}`);
        return false;
      }

      this.stopUiohook();

      uIOhook.on('keydown', (e) => {
        if (this.isPaused) return;
        this.pressedKeys.add(e.keycode);

        if (this.checkHotkey()) {
          if (mode === 'hold') {
            // Push-to-talk: starting recording when pressed down
            if (!this.isRecording) {
              Logger.log('uiohook: Hotkey held down -> Starting recording (push-to-talk)');
              this.handleStart();
            }
          } else {
            // Toggle mode: toggle recording on press (with debounce)
            const now = Date.now();
            if (now - this.lastToggleTime >= this.keyPressDebounce) {
              this.lastToggleTime = now;
              this.handleToggle();
            }
          }
        }
      });

      uIOhook.on('keyup', (e) => {
        if (this.isPaused) {
          this.pressedKeys.delete(e.keycode);
          return;
        }

        const wasPressed = this.pressedKeys.has(e.keycode);
        this.pressedKeys.delete(e.keycode);

        // In hold mode: releasing any key of the hotkey immediately stops recording
        if (mode === 'hold' && wasPressed && this.isRelevantKey(e.keycode)) {
          if (this.isRecording) {
            Logger.log('uiohook: Hotkey released -> Stopping recording (push-to-talk)');
            this.handleStop();
          }
        }
      });

      uIOhook.start();
      this.uiohookStarted = true;
      return true;
    } catch (error) {
      Logger.warn(`uiohook could not be started: ${error.message}`);
      this.uiohookStarted = false;
      return false;
    }
  }

  stopUiohook() {
    if (this.uiohookStarted && uIOhook) {
      try {
        uIOhook.removeAllListeners('keydown');
        uIOhook.removeAllListeners('keyup');
        uIOhook.stop();
      } catch (e) {}
      this.uiohookStarted = false;
    }
  }

  parseHotkey(hotkeyString) {
    if (!hotkeyString || !UiohookKey) return null;
    const parts = hotkeyString.split('+').map(p => p.trim());
    const conditions = [];

    for (const part of parts) {
      if (this.modifiers[part]) {
        conditions.push(this.modifiers[part]);
      } else {
        const code = UiohookKey[part];
        if (code) {
          conditions.push([code]);
        } else {
          const found = Object.keys(UiohookKey).find(k => k.toLowerCase() === part.toLowerCase());
          if (found && UiohookKey[found]) {
            conditions.push([UiohookKey[found]]);
          } else {
            // Unknown key name — log a warning and reject the whole hotkey to prevent
            // a typo'd combo (e.g. Ctrl+Foo) from silently firing on a single modifier.
            Logger.warn(`[HotkeyManager] Unknown key in hotkey string: "${part}" (from "${hotkeyString}"). Hotkey will not be registered via uiohook.`);
            return null;
          }
        }
      }
    }

    return conditions.length > 0 ? conditions : null;
  }

  isRelevantKey(keycode) {
    if (!this.targetHotkey) return false;
    return this.targetHotkey.some(group => group.includes(keycode));
  }

  checkHotkey() {
    if (!this.targetHotkey) return false;
    for (const validOptions of this.targetHotkey) {
      const isSatisfied = validOptions.some(code => this.pressedKeys.has(code));
      if (!isSatisfied) return false;
    }
    return true;
  }

  /**
   * Immediate toggle called by globalShortcut, compositor trigger, or UI button
   */
  async handleToggle() {
    const now = Date.now();
    if (now - this.lastToggleTime < this.keyPressDebounce) {
      return;
    }
    this.lastToggleTime = now;

    if (this.isRecording) {
      Logger.log('HotkeyManager: Stopping recording via toggle');
      await this.handleStop();
    } else {
      Logger.log('HotkeyManager: Starting recording via toggle');
      await this.handleStart();
    }
  }

  async handleStart() {
    if (this.isRecording) return;

    // Set state AFTER a successful start to avoid desync if onRecordStart returns early
    if (this.onRecordStart) {
      try {
        await this.onRecordStart();
      } catch (err) {
        Logger.error('Error in onRecordStart:', err);
        // onRecordStart failed — do NOT flip to recording state
        return;
      }
    }

    this.isRecording = true;
    // Register Escape key to cancel (discard) dictation while recording
    this.registerEscape();
  }

  async handleStop() {
    if (!this.isRecording) return;
    this.isRecording = false;

    // Unregister Escape key
    this.unregisterEscape();

    if (this.onRecordStop) {
      try {
        await this.onRecordStop();
      } catch (err) {
        Logger.error('Error in onRecordStop:', err);
      }
    }
  }

  /**
   * Cancel recording: discards audio without transcribing or pasting.
   * Called by Escape key or explicit cancel requests.
   */
  async handleCancel() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.unregisterEscape();
    Logger.log('HotkeyManager: Recording cancelled (audio discarded)');

    if (this.onRecordCancel) {
      try {
        await this.onRecordCancel();
      } catch (err) {
        Logger.error('Error in onRecordCancel:', err);
      }
    }
  }

  registerEscape() {
    if (this.globalShortcut && !this.isEscapeRegistered) {
      try {
        const ok = this.globalShortcut.register('Escape', () => {
          if (this.isRecording) {
            Logger.log('Escape key pressed -> Canceling dictation (audio discarded)');
            this.handleCancel();
          }
        });
        if (ok) this.isEscapeRegistered = true;
      } catch (e) {}
    }
  }

  unregisterEscape() {
    if (this.globalShortcut && this.isEscapeRegistered) {
      try {
        this.globalShortcut.unregister('Escape');
      } catch (e) {}
      this.isEscapeRegistered = false;
    }
  }

  setRecording(isRec) {
    this.isRecording = isRec;
    if (isRec) {
      this.registerEscape();
    } else {
      this.unregisterEscape();
    }
  }

  pauseMonitoring() {
    this.isPaused = true;
    this.pressedKeys.clear();
    Logger.log('Hotkey monitoring paused');
  }

  resumeMonitoring() {
    this.pressedKeys.clear();
    this.isPaused = false;
    Logger.log('Hotkey monitoring resumed');
  }

  cleanupListeners() {
    // Unregister ONLY our accelerator specifically without wiping other app shortcuts
    if (this.globalShortcut && this.registeredAccelerator) {
      try {
        this.globalShortcut.unregister(this.registeredAccelerator);
      } catch (e) {}
      this.registeredAccelerator = null;
    }
    this.unregisterEscape();
    this.stopUiohook();
    this.activeProvider = null;
  }

  stopMonitoring() {
    this.isMonitoring = false;
    this.cleanupListeners();
    Logger.log('Hotkey monitoring stopped');
  }

  getRecordingStatus() {
    return this.isRecording;
  }

  getActiveProvider() {
    return this.activeProvider;
  }
}

module.exports = HotkeyManager;
