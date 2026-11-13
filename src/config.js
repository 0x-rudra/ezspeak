const Store = require('electron-store');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function resolveConfigDir() {
  try {
    const { app } = require('electron');
    let targetDir = null;
    if (app && typeof app.getPath === 'function') {
      try {
        targetDir = app.getPath('userData');
      } catch (e) {}
    }
    if (!targetDir) {
      const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
      targetDir = path.join(configHome, 'listner');
    }
    fs.mkdirSync(targetDir, { recursive: true });
    const testFile = path.join(targetDir, `.write-test-${Date.now()}`);
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return targetDir;
  } catch (err) {
    const fallbackDir = path.join(os.tmpdir(), 'listner-config');
    fs.mkdirSync(fallbackDir, { recursive: true });
    return fallbackDir;
  }
}

const HISTORY_MAX = 50;

const store = new Store({
  name: 'listner-config',
  cwd: resolveConfigDir(),
  defaults: {
    // Mode: 'sarvam' (cloud STT) or 'offline' (whisper.cpp)
    transcriptionMode: 'sarvam',

    // Sarvam AI Settings (Single unified API provider for STT & Translation)
    sarvamApiKey: '',
    sarvamSourceLang: 'en-IN',
    sarvamTargetLang: 'hi-IN',
    sarvamModel: 'mayura:v1',       // translation model
    sarvamSTTModel: 'saaras:v2',    // speech-to-text model
    autoTranslate: false,

    // Local Whisper settings
    localModelName: 'base.en',
    localModelPath: '',
    importedModels: [], // array of { id, name, filename, path, sizeMB, importedAt }

    // App & Audio Settings
    autostart: false,
    mode: 'toggle', // 'toggle' or 'hold'
    microphoneDeviceId: 'default',
    hotkey: 'Ctrl+Alt+Space',
    indicatorPosition: null,
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
    transcriptionHistory: []
  }
});

function encryptSecret(plaintext) {
  if (!plaintext || typeof plaintext !== 'string') return '';
  const trimmed = plaintext.trim();
  if (!trimmed) return '';
  try {
    const { safeStorage } = require('electron');
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(trimmed).toString('base64');
    }
  } catch (e) {}
  // safeStorage not available — storing as plaintext. Log once so the user is aware.
  const Logger = require('./logger');
  Logger.warn('[Config] safeStorage unavailable — API key stored as plaintext in config file. Upgrade your OS keyring for encryption.');
  return trimmed;
}

function decryptSecret(storedValue) {
  if (!storedValue || typeof storedValue !== 'string') return '';
  if (storedValue.startsWith('enc:')) {
    try {
      const { safeStorage } = require('electron');
      if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
        const buf = Buffer.from(storedValue.slice(4), 'base64');
        return safeStorage.decryptString(buf);
      }
    } catch (e) {
      const Logger = require('./logger');
      Logger.error('[Config] Failed to decrypt stored secret (safeStorage error). The key is inaccessible; please re-enter it in Settings.');
      return '';
    }
    // safeStorage unavailable but value looks encrypted — cannot decrypt; return empty
    const Logger = require('./logger');
    Logger.error('[Config] Cannot decrypt stored secret: safeStorage not available on this system. Please re-enter the API key in Settings.');
    return '';
  }
  return storedValue;
}

class Config {
  // ─── Mode & Provider (Sarvam AI Cloud vs Local Offline) ────────
  static getTranscriptionMode() {
    const mode = store.get('transcriptionMode', 'sarvam');
    if (mode === 'cloud' || mode === 'online') return 'sarvam';
    return mode === 'offline' ? 'offline' : 'sarvam';
  }

  static setTranscriptionMode(mode) {
    if (mode === 'offline' || mode === 'sarvam' || mode === 'cloud' || mode === 'online') {
      store.set('transcriptionMode', mode === 'offline' ? 'offline' : 'sarvam');
    }
  }

  static getCloudProvider() {
    return 'sarvam';
  }

  static setCloudProvider(provider) {
    // Single cloud provider is Sarvam AI
  }

  // Primary API key helpers (backed by Sarvam AI)
  static getApiKey() {
    return this.getSarvamApiKey();
  }

  static setApiKey(apiKey) {
    this.setSarvamApiKey(apiKey);
  }

  static getAllProviderSettings() {
    return {
      transcriptionMode: this.getTranscriptionMode(),
      cloudProvider: 'sarvam',
      sarvam: this.getSarvamSettings(),
      local: {
        modelName: this.getLocalModelName(),
        modelPath: this.getLocalModelPath(),
        importedModels: this.getImportedModels()
      }
    };
  }

  // ─── Local Model Settings ──────────────────────────────────────
  static getLocalModelName() {
    return store.get('localModelName', 'base.en');
  }

  static setLocalModelName(name) {
    store.set('localModelName', name);
  }

  static getLocalModelPath() {
    return store.get('localModelPath', '');
  }

  static setLocalModelPath(path) {
    store.set('localModelPath', path);
  }

  static getImportedModels() {
    return store.get('importedModels', []);
  }

  static addImportedModel(model) {
    const models = this.getImportedModels();
    // Prevent duplicates by path or filename
    const filtered = models.filter(m => m.path !== model.path && m.filename !== model.filename);
    filtered.push(model);
    store.set('importedModels', filtered);
    store.set('localModelName', model.name);
    store.set('localModelPath', model.path);
    return filtered;
  }

  static removeImportedModel(modelPath) {
    const models = this.getImportedModels().filter(m => m.path !== modelPath);
    store.set('importedModels', models);
    if (store.get('localModelPath') === modelPath) {
      store.set('localModelPath', '');
      store.set('localModelName', 'base.en');
    }
    return models;
  }

  // ─── System / General ──────────────────────────────────────────
  static getAutostart() {
    return store.get('autostart', false);
  }

  static setAutostart(enabled) {
    store.set('autostart', Boolean(enabled));
  }

  static getMode() {
    return store.get('mode', 'toggle');
  }

  static setMode(mode) {
    if (mode === 'toggle' || mode === 'hold') {
      store.set('mode', mode);
    }
  }

  static getMicrophoneDeviceId() {
    return store.get('microphoneDeviceId', 'default');
  }

  static setMicrophoneDeviceId(deviceId) {
    store.set('microphoneDeviceId', deviceId);
  }

  static getHotkey() {
    const hk = store.get('hotkey');
    if (!hk || hk === 'CtrlRight' || hk === 'MetaRight' || hk === 'Ctrl+Space') {
      return 'Ctrl+Alt+Space';
    }
    return hk;
  }

  static setHotkey(hotkey) {
    if (hotkey) {
      store.set('hotkey', hotkey);
    } else {
      store.delete('hotkey');
    }
  }

  static getIndicatorPosition() {
    return store.get('indicatorPosition', null);
  }

  static setIndicatorPosition(pos) {
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      store.set('indicatorPosition', { x: Math.round(pos.x), y: Math.round(pos.y) });
    } else {
      store.delete('indicatorPosition');
    }
  }

  static getAudioSettings() {
    return {
      sampleRate: store.get('sampleRate', 16000),
      channels: store.get('channels', 1),
      bitDepth: store.get('bitDepth', 16)
    };
  }

  static isConfigured() {
    const mode = this.getTranscriptionMode();
    if (mode === 'offline') {
      return true; // Local model is checked separately
    }
    return this.getSarvamApiKey().length > 0;
  }

  // ─── Sarvam AI (Single Provider for STT & Translation) ──────────
  static getSarvamApiKey() {
    return decryptSecret(store.get('sarvamApiKey', ''));
  }

  static setSarvamApiKey(key) {
    store.set('sarvamApiKey', encryptSecret(key));
  }

  static getSarvamSourceLang() {
    return store.get('sarvamSourceLang', 'en-IN');
  }

  static setSarvamSourceLang(lang) {
    store.set('sarvamSourceLang', lang || 'en-IN');
  }

  static getSarvamTargetLang() {
    return store.get('sarvamTargetLang', 'hi-IN');
  }

  static setSarvamTargetLang(lang) {
    store.set('sarvamTargetLang', lang || 'hi-IN');
  }

  static getSarvamModel() {
    return store.get('sarvamModel', 'mayura:v1');
  }

  static setSarvamModel(model) {
    store.set('sarvamModel', model || 'mayura:v1');
  }

  static getSarvamSTTModel() {
    return store.get('sarvamSTTModel', 'saaras:v2');
  }

  static setSarvamSTTModel(model) {
    store.set('sarvamSTTModel', model || 'saaras:v2');
  }

  static getAutoTranslate() {
    return store.get('autoTranslate', false);
  }

  static setAutoTranslate(enabled) {
    store.set('autoTranslate', Boolean(enabled));
  }

  static getSarvamSettings() {
    return {
      apiKey: this.getSarvamApiKey(),
      sourceLang: this.getSarvamSourceLang(),
      targetLang: this.getSarvamTargetLang(),
      model: this.getSarvamModel(),
      sttModel: this.getSarvamSTTModel(),
      autoTranslate: this.getAutoTranslate()
    };
  }

  static setSarvamSettings(settings) {
    if (!settings) return;
    if (settings.apiKey !== undefined && settings.apiKey !== '••••••••') this.setSarvamApiKey(settings.apiKey);
    if (settings.sourceLang !== undefined) this.setSarvamSourceLang(settings.sourceLang);
    if (settings.targetLang !== undefined) this.setSarvamTargetLang(settings.targetLang);
    if (settings.model !== undefined) this.setSarvamModel(settings.model);
    if (settings.sttModel !== undefined) this.setSarvamSTTModel(settings.sttModel);
    if (settings.autoTranslate !== undefined) this.setAutoTranslate(settings.autoTranslate);
  }

  // ─── Transcription history ───────────────────────────────────────
  static getHistory() {
    return store.get('transcriptionHistory', []);
  }

  static addToHistory(text) {
    const history = this.getHistory();
    const entry = {
      id: crypto.randomUUID(),
      text: text.trim(),
      timestamp: new Date().toISOString()
    };
    const updated = [entry, ...history].slice(0, HISTORY_MAX);
    store.set('transcriptionHistory', updated);
    return entry;
  }

  static clearHistory() {
    store.set('transcriptionHistory', []);
  }
}

module.exports = Config;
