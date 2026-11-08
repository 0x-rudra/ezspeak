const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, shell, dialog } = require('electron');
if (app) {
  app.name = 'listner';
}
const path = require('path');
const crypto = require('crypto');
const HotkeyManager = require('./src/hotkeyManager');
const AudioRecorder = require('./src/audioRecorder');
const TranscriptionService = require('./src/transcription');
const ClipboardManager = require('./src/clipboardManager');
const Config = require('./src/config');
const Logger = require('./src/logger');
const LocalServer = require('./src/localServer');
const TranslationService = require('./src/translationService');

// Disable GPU to prevent flashing and GPU errors
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

let mainWindow = null;
let settingsWindow = null;
let recordingIndicator = null;
let tray = null;
let hotkeyManager = null;
let audioRecorder = null;
let transcriptionService = null;
let sarvamTranslator = null;
let localServer = null;
let recordingStatus = 'idle'; // 'idle', 'recording', 'processing'
let isRecording = false;
let liveAccumulatedText = '';
let isSliceProcessing = false;
let pendingSliceData = null;

function getIndicatorTargetPosition() {
  const saved = Config.getIndicatorPosition();
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
    return [saved.x, saved.y];
  }
  try {
    const { screen } = require('electron');
    const display = screen.getPrimaryDisplay() || screen.getAllDisplays()[0];
    const { x: displayX, y: displayY, width, height: displayHeight } = display.bounds;
    return [
      Math.floor(displayX + width / 2 - 265),
      displayY + displayHeight - 110
    ];
  } catch (e) {
    return [100, 100];
  }
}

function createRecordingIndicator() {
  const [posX, posY] = getIndicatorTargetPosition();

  recordingIndicator = new BrowserWindow({
    title: 'listner-indicator',
    width: 530,
    height: 76,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    focusable: true,
    acceptFirstMouse: true,
    type: 'toolbar', // Ensures tiling compositors (Niri, Hyprland, Sway) float it as an overlay utility
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  recordingIndicator.setAlwaysOnTop(true, 'screen-saver');
  recordingIndicator.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  recordingIndicator.loadFile('renderer/recording-indicator.html');
  recordingIndicator.setIgnoreMouseEvents(false);
}

function showRecordingIndicator() {
  const hotkey = Config.getHotkey() || 'Ctrl+Alt+Space';
  const sarvam = Config.getSarvamSettings();
  const indicatorData = {
    hotkey,
    sarvamConfigured: Boolean(sarvam.apiKey),
    targetLang: sarvam.targetLang || 'hi-IN',
    autoTranslate: sarvam.autoTranslate
  };

  if (!recordingIndicator || recordingIndicator.isDestroyed()) {
    createRecordingIndicator();
  }

  const [posX, posY] = getIndicatorTargetPosition();
  recordingIndicator.setPosition(posX, posY);
  recordingIndicator.setAlwaysOnTop(true, 'screen-saver');
  recordingIndicator.show();
  recordingIndicator.moveTop();
  recordingIndicator.webContents.executeJavaScript(`if (typeof setRecordingMode === "function") setRecordingMode(${JSON.stringify(indicatorData)});`);
}

function hideRecordingIndicator() {
  if (recordingIndicator && !recordingIndicator.isDestroyed()) {
    recordingIndicator.hide();
    recordingIndicator.webContents.executeJavaScript('if (typeof clearLiveText === "function") clearLiveText();');
  }
}

function setIndicatorTranscribing() {
  if (recordingIndicator && !recordingIndicator.isDestroyed()) {
    recordingIndicator.webContents.executeJavaScript('if (typeof setTranscribingMode === "function") setTranscribingMode();');
  }
}

function updateIndicatorLiveText(text) {
  if (recordingIndicator && !recordingIndicator.isDestroyed()) {
    try {
      recordingIndicator.webContents.executeJavaScript(`if (typeof setLiveText === "function") setLiveText(${JSON.stringify(text)});`);
    } catch (e) {}
  }
}

function createTray() {
  // Use PNG on macOS (Electron doesn't support SVG for tray icons), ICO on Windows
  const iconFile = process.platform === 'darwin' ? 'icon.png' : 'icon.ico';
  const iconPath = path.join(__dirname, 'assets', iconFile);
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  updateTrayMenu();
  tray.on('double-click', () => {
    showMainWindow('app');
  });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Status: ${recordingStatus === 'recording' ? 'Recording...' : recordingStatus === 'processing' ? 'Processing...' : 'Ready'}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open App',
      click: () => {
        showMainWindow('app');
      }
    },
    {
      label: 'Settings',
      click: () => {
        showMainWindow('settings');
      }
    },
    {
      label: 'History',
      click: () => {
        showMainWindow('history');
      }
    },
    {
      label: 'Open DevTools',
      click: () => {
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.openDevTools();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('Listner - Voice to Text');
}

function setRecordingStatus(status) {
  recordingStatus = status;
  updateTrayMenu();
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try {
      settingsWindow.webContents.send('recording-status-changed', status);
    } catch (e) {
      // Ignore if renderer not ready
    }
  }
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 820,
    height: 660,
    minWidth: 720,
    minHeight: 560,
    resizable: true,
    frame: false, // Remove default frame for custom title bar
    show: false, // Show when explicitly instructed
    skipTaskbar: false, // Show in taskbar when visible
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: '#18181b'
  });

  settingsWindow.loadFile('renderer/settings.html');

  // Intercept window close so the background recording capability remains active
  settingsWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      settingsWindow.hide();
    }
  });

  // Enable DevTools - can be opened with F12 or Ctrl+Shift+I
  settingsWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      settingsWindow.webContents.toggleDevTools();
    }
  });

  // Open DevTools in dev mode automatically
  if (process.argv.includes('--dev')) {
    settingsWindow.webContents.openDevTools({ mode: 'detach' });
    Logger.log('DevTools opened (dev mode)');
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function showMainWindow(tab = 'app') {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    if (tab) {
      try {
        settingsWindow.webContents.send('navigate-tab', tab);
      } catch (e) {}
    }
  } else {
    createSettingsWindow();
    settingsWindow.webContents.once('did-finish-load', () => {
      settingsWindow.show();
      settingsWindow.focus();
      if (tab) {
        settingsWindow.webContents.send('navigate-tab', tab);
      }
    });
  }
}

function showSettingsWindow() {
  showMainWindow('settings');
}

async function initializeServices() {
  const { globalShortcut } = require('electron');

  audioRecorder = new AudioRecorder();
  transcriptionService = new TranscriptionService();

  // Initialize hotkey manager
  hotkeyManager = new HotkeyManager(
    handleRecordStart,
    handleRecordStop,
    globalShortcut
  );

  sarvamTranslator = new TranslationService();

  // Initialize local HTTP IPC server for Wayland / global compositor triggers
  localServer = new LocalServer({
    onToggle: () => {
      if (hotkeyManager) hotkeyManager.handleToggle();
      else if (isRecording) handleRecordStop();
      else handleRecordStart();
    },
    onStart: () => handleRecordStart(),
    onStop: () => handleRecordStop(),
    getStatus: () => ({ isRecording, status: recordingStatus })
  });
  localServer.start();
}

function cleanWhisperOutput(text, isAudioSilent = false) {
  if (!text) return '';
  let str = String(text).trim();

  // Strip only known Whisper non-speech tags, leaving user brackets like [index] or (example) intact
  str = str.replace(/\[(MUSIC|APPLAUSE|LAUGHTER|BLANK_AUDIO|NOISE|BELL|COUGH|THUNDER|SNORT)\]/gi, '').trim();

  // Known subtitle hallucination lines
  const hallucinations = [
    'thanks for watching', 'thanks for watching!', 'thanks for watching.',
    'thank you for watching', 'thank you for watching.',
    'subtitles by', 'subscribe to the channel', 'please subscribe'
  ];
  const normalized = str.toLowerCase().replace(/[\.\?!,]/g, '').trim();
  if (hallucinations.includes(normalized)) {
    return '';
  }

  // Only drop "thank you" or "bye" if silence/VAD detected no speech
  if (isAudioSilent && (normalized === 'thank you' || normalized === 'bye' || normalized === 'you')) {
    return '';
  }

  // Drop bare punctuation hallucinations
  if (/^[\.\,\s\-_~]+$/.test(str)) {
    return '';
  }

  return str;
}

/**
 * Detect voice stop commands (e.g. "stop listening", "stop recording", "turn off")
 * and strip them only if spoken as a standalone phrase
 */
function detectAndCleanVoiceCommands(text) {
  if (!text) return { text: '', shouldStop: false };
  let cleaned = cleanWhisperOutput(text);

  // Match stop commands as a standalone phrase/sentence only, NOT in the middle of arbitrary dictation
  const standaloneStopRegex = /^\s*(stop\s+listening|stop\s+dictation|stop\s+recording|turn\s+off\s+listening|turn\s+off|please\s+stop\s+listening)\b[\.\?!]?\s*$/i;

  if (standaloneStopRegex.test(cleaned)) {
    return { text: '', shouldStop: true };
  }

  return { text: cleaned, shouldStop: false };
}

async function handleRecordStart() {
  Logger.log('handleRecordStart called');

  if (isRecording) {
    Logger.warn('Already recording, ignoring start request');
    return;
  }

  const isOffline = Config.getTranscriptionMode() === 'offline';
  const hasLocalModel = isOffline ? transcriptionService.localService.isModelDownloaded() : true;

  if (!Config.isConfigured() || !hasLocalModel) {
    Logger.warn('Not configured or offline model missing, showing settings window');
    showMainWindow('settings');
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      try {
        settingsWindow.webContents.send('error', isOffline ? 'Please download or import a Whisper model in Settings first.' : 'Please configure your API key in Settings first.');
      } catch (e) {}
    }
    return;
  }

  try {
    Logger.recording('Starting recording...');
    isRecording = true;
    if (hotkeyManager) hotkeyManager.setRecording(true);
    liveAccumulatedText = '';
    isSliceProcessing = false;
    pendingSliceData = null;
    setRecordingStatus('recording');
    showRecordingIndicator(); // Show visual indicator

    await audioRecorder.startRecording();
    Logger.success('Recording started successfully');
  } catch (error) {
    Logger.error('Error starting recording:', error);
    isRecording = false;
    if (hotkeyManager) hotkeyManager.setRecording(false);
    setRecordingStatus('idle');
    hideRecordingIndicator();
  }
}

async function handleRecordStop() {
  Logger.log('handleRecordStop called');

  if (!isRecording) {
    Logger.warn('Not recording, ignoring stop request');
    return;
  }

  try {
    Logger.recording('Stopping recording...');
    setIndicatorTranscribing();
    setRecordingStatus('processing');
    isRecording = false;
    if (hotkeyManager) hotkeyManager.setRecording(false);

    const audioFilePath = await audioRecorder.stopRecording();
    Logger.success('Recording stopped, file:', audioFilePath);

    Logger.log('Transcribing complete speech audio...');
    const rawTranscription = await transcriptionService.transcribe(audioFilePath);
    const { text: cleaned, shouldStop } = detectAndCleanVoiceCommands(rawTranscription);

    if (cleaned && cleaned.trim().length > 0) {
      const sarvam = Config.getSarvamSettings();
      let textToPaste = cleaned.trim();
      let translatedText = null;

      // Auto-translate via Sarvam AI if enabled and key is present
      if (sarvam.autoTranslate && sarvam.apiKey) {
        try {
          Logger.log(`[AutoTranslate] Translating with Sarvam AI (${sarvam.targetLang})...`);
          if (!sarvamTranslator) sarvamTranslator = new TranslationService();
          const tr = await sarvamTranslator.translate(cleaned.trim(), {
            targetLang: sarvam.targetLang,
            sourceLang: sarvam.sourceLang
          });
          if (tr && tr.translatedText) {
            translatedText = tr.translatedText;
            textToPaste = tr.translatedText;
            Logger.success(`[AutoTranslate] Translated text: "${translatedText}"`);
          }
        } catch (trErr) {
          Logger.warn('[AutoTranslate] Translation failed, using original speech:', trErr.message);
        }
      }

      Logger.log(`Typing transcription word-by-word at cursor: "${textToPaste}"`);
      await ClipboardManager.typeWordByWord(textToPaste);
      Config.addToHistory(cleaned.trim());

      if (translatedText) {
        updateIndicatorLiveText(`${translatedText} (${cleaned.trim()})`);
      } else {
        updateIndicatorLiveText(cleaned.trim());
      }

      if (settingsWindow && !settingsWindow.isDestroyed()) {
        try {
          settingsWindow.webContents.send('history-updated');
          if (translatedText) {
            settingsWindow.webContents.send('translation-complete', {
              original: cleaned.trim(),
              translated: translatedText,
              targetLang: sarvam.targetLang
            });
          }
        } catch (e) {}
      }
    } else {
      Logger.warn('No text to paste (empty transcription or stop phrase only)');
    }

    if (recordingIndicator && !recordingIndicator.isDestroyed()) {
      recordingIndicator.webContents.executeJavaScript('if (typeof setDoneMode === "function") setDoneMode();');
    }
    setTimeout(() => {
      hideRecordingIndicator();
      setRecordingStatus('idle');
    }, 600);

  } catch (error) {
    const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
    Logger.error('Error in recording/transcription:', errorMessage);
    setRecordingStatus('idle');
    hideRecordingIndicator();

    if (settingsWindow && !settingsWindow.isDestroyed()) {
      try {
        settingsWindow.webContents.send('error', errorMessage);
      } catch (e) {}
    }
  }
}

// Live Streaming Audio Slice Handler (Real-time dictation & voice command detection)
ipcMain.on('live-audio-slice', async (event, bufferArray) => {
  if (!isRecording) return;

  if (isSliceProcessing) {
    pendingSliceData = bufferArray;
    return;
  }

  isSliceProcessing = true;
  try {
    const tempDir = path.join(require('os').tmpdir(), 'listner');
    if (!require('fs').existsSync(tempDir)) {
      require('fs').mkdirSync(tempDir, { recursive: true });
    }
    const slicePath = path.join(tempDir, `slice_${crypto.randomUUID()}.webm`);
    require('fs').writeFileSync(slicePath, Buffer.from(bufferArray));

    // Transcribe speech so far
    const rawText = await transcriptionService.transcribe(slicePath);
    const { text: cleaned, shouldStop } = detectAndCleanVoiceCommands(rawText);

    // Voice Command: "stop listening" detected live!
    if (shouldStop && isRecording) {
      Logger.log('[VOICE COMMAND] "stop listening" detected! Automatically turning off dictation...');
      handleRecordStop();
      return;
    }

    if (cleaned && cleaned.length > 0 && isRecording) {
      updateIndicatorLiveText(cleaned);

      if (settingsWindow && !settingsWindow.isDestroyed()) {
        try {
          settingsWindow.webContents.send('live-dictation-snippet', cleaned);
        } catch (e) {}
      }
    }
  } catch (err) {
    Logger.warn('Live slice speech check warning:', err.message);
  } finally {
    isSliceProcessing = false;
    if (pendingSliceData && isRecording) {
      const next = pendingSliceData;
      pendingSliceData = null;
      setImmediate(() => {
        if (isRecording) {
          ipcMain.emit('live-audio-slice', event, next);
        }
      });
    }
  }
});

// IPC Handlers
ipcMain.handle('get-api-key', () => {
  return Config.getApiKey();
});

ipcMain.handle('set-api-key', (event, key) => {
  Config.setApiKey(key);
  return true;
});

ipcMain.handle('is-configured', () => {
  return Config.isConfigured();
});

ipcMain.handle('get-microphone', () => {
  return Config.getMicrophoneDeviceId();
});

ipcMain.handle('set-microphone', (event, deviceId) => {
  Config.setMicrophoneDeviceId(deviceId);
  return true;
});

ipcMain.handle('get-hotkey', () => {
  return Config.getHotkey();
});

ipcMain.handle('get-mode', () => {
  return Config.getMode();
});

ipcMain.handle('set-mode', async (event, mode) => {
  Config.setMode(mode);
  if (hotkeyManager) {
    Logger.log(`Changing dictation mode to "${mode}", restarting monitoring...`);
    await hotkeyManager.startMonitoring();
  }
  return true;
});

ipcMain.handle('set-hotkey', async (event, hotkey) => {
  Config.setHotkey(hotkey);

  // Restart hotkey monitoring with new key
  if (hotkeyManager) {
    Logger.log(`Changing hotkey to ${hotkey}, restarting monitoring...`);
    hotkeyManager.stopMonitoring();
    await hotkeyManager.startMonitoring();
  }

  // Broadcast to windows
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    try {
      settingsWindow.webContents.send('hotkey-changed', hotkey);
    } catch (e) {}
  }
  if (recordingIndicator && !recordingIndicator.isDestroyed()) {
    try {
      recordingIndicator.webContents.executeJavaScript(`if (typeof updateHotkeyDisplay === "function") updateHotkeyDisplay(${JSON.stringify(hotkey)});`);
    } catch (e) {}
  }

  return true;
});

ipcMain.on('move-indicator', (event, { deltaX, deltaY }) => {
  if (recordingIndicator && !recordingIndicator.isDestroyed()) {
    const [currX, currY] = recordingIndicator.getPosition();
    const newX = Math.round(currX + deltaX);
    const newY = Math.round(currY + deltaY);
    recordingIndicator.setPosition(newX, newY);
    Config.setIndicatorPosition({ x: newX, y: newY });
  }
});

ipcMain.on('reset-indicator-position', () => {
  Config.setIndicatorPosition(null);
  if (recordingIndicator && !recordingIndicator.isDestroyed()) {
    const { screen } = require('electron');
    const cursorPos = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(cursorPos);
    const { x: displayX, y: displayY, width, height: displayHeight } = activeDisplay.bounds;
    const defaultX = Math.floor(displayX + width / 2 - 265);
    const defaultY = displayY + displayHeight - 110;
    recordingIndicator.setPosition(defaultX, defaultY);
  }
});

ipcMain.handle('get-indicator-position', () => {
  return Config.getIndicatorPosition();
});

ipcMain.on('pause-hotkey', () => {
  if (hotkeyManager) hotkeyManager.pauseMonitoring();
});

ipcMain.on('resume-hotkey', () => {
  if (hotkeyManager) hotkeyManager.resumeMonitoring();
});

ipcMain.handle('get-all-settings', () => {
  return Config.getAllProviderSettings();
});

ipcMain.handle('save-provider-settings', (event, s) => {
  if (s.transcriptionMode) Config.setTranscriptionMode(s.transcriptionMode);
  if (s.cloudProvider) Config.setCloudProvider(s.cloudProvider);
  if (s.openai) {
    if (s.openai.apiKey !== undefined) Config.setOpenAIApiKey(s.openai.apiKey);
    if (s.openai.model) Config.setOpenAIModel(s.openai.model);
  }
  if (s.groq) {
    if (s.groq.apiKey !== undefined) Config.setGroqApiKey(s.groq.apiKey);
    if (s.groq.model) Config.setGroqModel(s.groq.model);
  }
  if (s.custom) {
    if (s.custom.endpoint !== undefined) Config.setCustomEndpoint(s.custom.endpoint);
    if (s.custom.apiKey !== undefined) Config.setCustomApiKey(s.custom.apiKey);
    if (s.custom.model) Config.setCustomModel(s.custom.model);
  }
  if (s.local) {
    if (s.local.modelName) Config.setLocalModelName(s.local.modelName);
    if (s.local.modelPath !== undefined) Config.setLocalModelPath(s.local.modelPath);
  }
  return true;
});

ipcMain.handle('get-cloud-provider', () => {
  return Config.getCloudProvider();
});

ipcMain.handle('set-cloud-provider', (event, provider) => {
  Config.setCloudProvider(provider);
  return true;
});

ipcMain.handle('get-transcription-mode', () => {
  return Config.getTranscriptionMode();
});

ipcMain.handle('set-transcription-mode', (event, mode) => {
  Config.setTranscriptionMode(mode);
  Logger.log(`Transcription mode set to: ${mode}`);
  return true;
});

ipcMain.handle('get-local-models', () => {
  return transcriptionService.localService.getLocalModelsList();
});

ipcMain.handle('set-local-model', (event, modelId) => {
  return transcriptionService.localService.setActiveModel(modelId);
});

ipcMain.handle('import-local-model', async () => {
  try {
    const result = await dialog.showOpenDialog(settingsWindow || undefined, {
      title: 'Import Whisper GGML Model (.bin)',
      filters: [
        { name: 'Whisper GGML Model (*.bin)', extensions: ['bin'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const selectedFile = result.filePaths[0];
    const importedModel = await transcriptionService.localService.importModel(selectedFile);
    return { success: true, model: importedModel };
  } catch (error) {
    Logger.error('Error importing local model:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-model', async (event, modelName = 'base.en') => {
  try {
    const result = await transcriptionService.localService.downloadModel(modelName, (progress) => {
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        try {
          settingsWindow.webContents.send('download-progress', progress);
        } catch (e) {}
      }
    });
    return { success: true, model: result };
  } catch (error) {
    Logger.error('Error downloading model:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-local-model', (event, modelPath) => {
  try {
    transcriptionService.localService.deleteModel(modelPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-model-downloaded', () => {
  return transcriptionService.localService.isModelDownloaded();
});

ipcMain.on('close-settings', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.hide();
  }
});

ipcMain.on('toggle-recording', async () => {
  if (isRecording) {
    await handleRecordStop();
  } else {
    await handleRecordStart();
  }
});

ipcMain.on('minimize-window', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.minimize();
  }
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

// Forward live waveform data from the settings window to the recording indicator
ipcMain.on('waveform-data', (event, data) => {
  if (recordingIndicator && !recordingIndicator.isDestroyed()) {
    recordingIndicator.webContents.executeJavaScript(
      `if (typeof updateWaveform === 'function') updateWaveform(${JSON.stringify(data)})`
    );
  }
});

ipcMain.handle('get-history', () => {
  return Config.getHistory();
});

ipcMain.handle('clear-history', () => {
  Config.clearHistory();
  return true;
});

// ─── Translation (Sarvam AI) IPC Handlers ───────────────────────
ipcMain.handle('translate-text', async (event, data) => {
  try {
    const { text, sourceLang, targetLang, apiKey, model } = data || {};
    if (!sarvamTranslator) {
      sarvamTranslator = new TranslationService();
    }
    const result = await sarvamTranslator.translate(text, { sourceLang, targetLang, apiKey, model });
    return result;
  } catch (error) {
    Logger.error('translate-text IPC error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-sarvam-settings', () => {
  return Config.getSarvamSettings();
});

ipcMain.handle('set-sarvam-settings', (event, settings) => {
  Config.setSarvamSettings(settings);
  return true;
});

ipcMain.handle('get-supported-languages', () => {
  return TranslationService.getSupportedLanguages();
});

ipcMain.handle('type-at-cursor', async (event, text) => {
  if (!text || text.trim().length === 0) return false;
  Logger.log(`Typing text at cursor on demand: "${text.substring(0, 40)}..."`);
  return await ClipboardManager.typeWordByWord(text.trim());
});

ipcMain.on('toggle-indicator-translate', (event, enabled) => {
  Config.setAutoTranslate(enabled);
  Logger.log(`Translate mode toggled from indicator: ${enabled}`);
});

ipcMain.handle('test-show-indicator', () => {
  showRecordingIndicator();
  updateIndicatorLiveText('Testing floating popup indicator overlay...');
  setTimeout(() => {
    hideRecordingIndicator();
  }, 5000);
  return true;
});

// App lifecycle
// Global error handlers
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception:', error);
  Logger.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection at:', promise);
  Logger.error('Reason:', reason);
  if (reason instanceof Error) {
    Logger.error('Error message:', reason.message);
    Logger.error('Stack:', reason.stack);
  }
});

app.whenReady().then(async () => {
  Logger.init(); // Initialize file logging
  Logger.log('App ready, initializing...');

  // Set app icon on macOS
  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    app.dock.setIcon(icon);
  }

  // Force dark mode for window chrome
  nativeTheme.themeSource = 'dark';

  createTray();
  Logger.success('System tray created');

  createRecordingIndicator(); // Pre-create indicator
  Logger.success('Recording indicator created');

  await initializeServices();
  Logger.success('Services initialized');

  // Start monitoring for hotkey
  await hotkeyManager.startMonitoring();

  // Show application window immediately on startup
  if (process.argv.includes('--test-launch')) {
    console.log('✓ App launch check passed: Electron app initialized successfully!');
    setTimeout(() => {
      app.isQuitting = true;
      app.quit();
    }, 300);
    return;
  }

  showMainWindow('app');
  Logger.success('Application window opened');

  console.log('\n========================================');
  console.log('   Listner is ready!');
  console.log('========================================\n');
});

app.on('window-all-closed', (event) => {
  // Don't quit the app when all windows are closed - keep running in system tray
  // This works on both Windows and macOS
});

app.on('activate', () => {
  // On macOS, clicking the dock icon should show the application window
  showMainWindow('app');
});

app.on('before-quit', () => {
  app.isQuitting = true;
  // Cleanup
  if (hotkeyManager) {
    hotkeyManager.stopMonitoring();
  }
  if (audioRecorder && audioRecorder.getRecordingStatus()) {
    audioRecorder.stopRecording().catch(console.error);
  }
  if (recordingIndicator && !recordingIndicator.isDestroyed()) {
    recordingIndicator.close();
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.destroy();
  }
});

