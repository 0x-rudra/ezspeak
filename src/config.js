const Store = require('electron-store');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
    // Mode: 'cloud' (formerly 'online') or 'offline'
    transcriptionMode: 'cloud',
    
    // Cloud BYOK provider: 'openai', 'groq', or 'custom'
    cloudProvider: 'openai',

    // OpenAI settings
    openaiApiKey: '',
    openaiModel: 'whisper-1',

    // Groq settings (ultra-fast transcription)
    groqApiKey: '',
    groqModel: 'whisper-large-v3-turbo',

    // Custom OpenAI-compatible endpoint
    customEndpoint: 'http://localhost:8000/v1/audio/transcriptions',
    customApiKey: '',
    customModel: 'whisper-1',

    // Legacy fallback apiKey
    apiKey: '',

    // Local Whisper settings
    localModelName: 'base.en',
    localModelPath: '',
    importedModels: [], // array of { id, name, filename, path, sizeMB, importedAt }

    // Sarvam AI Translation settings
    sarvamApiKey: '',
    sarvamSourceLang: 'en-IN',
    sarvamTargetLang: 'hi-IN',
    sarvamModel: 'mayura:v1',
    autoTranslate: false,

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
    } catch (e) {}
  }
  return storedValue;
}

class Config {
  // ─── Mode & Provider ───────────────────────────────────────────
  static getTranscriptionMode() {
    const mode = store.get('transcriptionMode', 'cloud');
    return mode === 'online' ? 'cloud' : mode;
  }

  static setTranscriptionMode(mode) {
    if (mode === 'cloud' || mode === 'offline' || mode === 'online') {
      store.set('transcriptionMode', mode === 'online' ? 'cloud' : mode);
    }
  }

  static getCloudProvider() {
    return store.get('cloudProvider', 'openai');
  }

  static setCloudProvider(provider) {
    if (['openai', 'groq', 'custom'].includes(provider)) {
      store.set('cloudProvider', provider);
    }
  }

  // ─── Cloud BYOK Provider Settings ──────────────────────────────
  static getOpenAIApiKey() {
    return decryptSecret(store.get('openaiApiKey', '') || store.get('apiKey', ''));
  }

  static setOpenAIApiKey(key) {
    const enc = encryptSecret(key);
    store.set('openaiApiKey', enc);
    store.set('apiKey', enc); // Sync legacy key
  }

  static getOpenAIModel() {
    return store.get('openaiModel', 'whisper-1');
  }

  static setOpenAIModel(model) {
    store.set('openaiModel', model);
  }

  static getGroqApiKey() {
    return decryptSecret(store.get('groqApiKey', ''));
  }

  static setGroqApiKey(key) {
    store.set('groqApiKey', encryptSecret(key));
  }

  static getGroqModel() {
    return store.get('groqModel', 'whisper-large-v3-turbo');
  }

  static setGroqModel(model) {
    store.set('groqModel', model);
  }

  static getCustomEndpoint() {
    return store.get('customEndpoint', 'http://localhost:8000/v1/audio/transcriptions');
  }

  static setCustomEndpoint(endpoint) {
    store.set('customEndpoint', endpoint);
  }

  static getCustomApiKey() {
    return decryptSecret(store.get('customApiKey', ''));
  }

  static setCustomApiKey(key) {
    store.set('customApiKey', encryptSecret(key));
  }

  static getCustomModel() {
    return store.get('customModel', 'whisper-1');
  }

  static setCustomModel(model) {
    store.set('customModel', model);
  }

  // Legacy API key helper
  static getApiKey() {
    const provider = this.getCloudProvider();
    if (provider === 'groq') return this.getGroqApiKey();
    if (provider === 'custom') return this.getCustomApiKey();
    return this.getOpenAIApiKey();
  }

  static setApiKey(apiKey) {
    const provider = this.getCloudProvider();
    if (provider === 'groq') this.setGroqApiKey(apiKey);
    else if (provider === 'custom') this.setCustomApiKey(apiKey);
    else this.setOpenAIApiKey(apiKey);
  }

  static getAllProviderSettings() {
    return {
      transcriptionMode: this.getTranscriptionMode(),
      cloudProvider: this.getCloudProvider(),
      openai: {
        apiKey: this.getOpenAIApiKey(),
        model: this.getOpenAIModel()
      },
      groq: {
        apiKey: this.getGroqApiKey(),
        model: this.getGroqModel()
      },
      custom: {
        endpoint: this.getCustomEndpoint(),
        apiKey: this.getCustomApiKey(),
        model: this.getCustomModel()
      },
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
    const provider = this.getCloudProvider();
    if (provider === 'openai') {
      return this.getOpenAIApiKey().length > 0;
    }
    if (provider === 'groq') {
      return this.getGroqApiKey().length > 0;
    }
    if (provider === 'custom') {
      return this.getCustomEndpoint().length > 0;
    }
    return false;
  }

  // ─── Sarvam AI Translation ─────────────────────────────────────
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
      autoTranslate: this.getAutoTranslate()
    };
  }

  static setSarvamSettings(settings) {
    if (!settings) return;
    if (settings.apiKey !== undefined) this.setSarvamApiKey(settings.apiKey);
    if (settings.sourceLang !== undefined) this.setSarvamSourceLang(settings.sourceLang);
    if (settings.targetLang !== undefined) this.setSarvamTargetLang(settings.targetLang);
    if (settings.model !== undefined) this.setSarvamModel(settings.model);
    if (settings.autoTranslate !== undefined) this.setAutoTranslate(settings.autoTranslate);
  }

  // ─── Transcription history ───────────────────────────────────────
  static getHistory() {
    return store.get('transcriptionHistory', []);
  }

  static addToHistory(text) {
    const history = this.getHistory();
    const entry = {
      id: Date.now().toString(),
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
