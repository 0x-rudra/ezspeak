const Store = require('electron-store');

const HISTORY_MAX = 50;

const store = new Store({
  name: 'listner-config',
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
    return store.get('openaiApiKey', '') || store.get('apiKey', '');
  }

  static setOpenAIApiKey(key) {
    store.set('openaiApiKey', key);
    store.set('apiKey', key); // Sync legacy key
  }

  static getOpenAIModel() {
    return store.get('openaiModel', 'whisper-1');
  }

  static setOpenAIModel(model) {
    store.set('openaiModel', model);
  }

  static getGroqApiKey() {
    return store.get('groqApiKey', '');
  }

  static setGroqApiKey(key) {
    store.set('groqApiKey', key);
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
    return store.get('customApiKey', '');
  }

  static setCustomApiKey(key) {
    store.set('customApiKey', key);
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
    return store.get('sarvamApiKey', '');
  }

  static setSarvamApiKey(key) {
    store.set('sarvamApiKey', key ? key.trim() : '');
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
