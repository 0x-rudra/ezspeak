const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, nativeTheme, shell, dialog, systemPreferences } = require('electron');

if (!app) {
  // If executed via plain Node.js or with ELECTRON_RUN_AS_NODE=1, delegate to scripts/start.js
  require('./scripts/start.js');
} else {
  app.name = 'ezspeak';
  try {
    const defaultUserData = app.getPath('userData');
    try {
      fs.accessSync(path.dirname(defaultUserData), fs.constants.W_OK);
    } catch (e) {
      const fallbackUserData = path.join(os.tmpdir(), 'ezspeak-userdata');
      if (!fs.existsSync(fallbackUserData)) fs.mkdirSync(fallbackUserData, { recursive: true });
      app.setPath('userData', fallbackUserData);
    }
  } catch (e) { }

  const HotkeyManager = require('./src/hotkeyManager');
  const AudioRecorder = require('./src/audioRecorder');
  const TranscriptionService = require('./src/transcription');
  const ClipboardManager = require('./src/clipboardManager');
  const Config = require('./src/config');
  const Logger = require('./src/logger');
  const LocalServer = require('./src/localServer');
  const TranslationService = require('./src/translationService');
  const Autostart = require('./src/autostart');
  const SnippetsManager = require('./src/snippetsManager');
  const SpokenPunctuation = require('./src/spokenPunctuation');

  // GPU acceleration enabled by default; optional flag for environments with buggy GPU drivers
  if (process.argv.includes('--disable-gpu') || process.env.EZSPEAK_DISABLE_GPU === '1' || process.env.LISTNER_DISABLE_GPU === '1') {
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
  }

  const PlatformAdapter = require('./src/platform');
  const { DictationStateMachine, TranscriptionQueue, PreRollAudioBuffer } = require('./src/audioPipeline');

  const stateMachine = new DictationStateMachine();
  const transcriptionQueue = new TranscriptionQueue();
  const preRollBuffer = new PreRollAudioBuffer(3);
  let audioCaptureWindow = null;

  // Enforce single instance lock and route CLI --toggle to running instance
  try {
    const userDataDir = app.getPath('userData');
    const lockFile = path.join(userDataDir, 'SingletonLock');
    if (fs.existsSync(lockFile)) {
      try {
        const target = fs.readlinkSync(lockFile);
        const parts = target.split('-');
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid) {
          try {
            process.kill(pid, 0);
          } catch (e) {
            if (e.code === 'ESRCH') {
              fs.unlinkSync(lockFile);
            }
          }
        }
      } catch (e) { }
    }
  } catch (e) { }

  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    if (process.argv.includes('--toggle')) {
      const http = require('http');
      const socketPath = process.platform === 'win32'
        ? '\\\\.\\pipe\\ezspeak-ipc'
        : path.join(require('os').tmpdir(), 'ezspeak.sock');

      const req = http.request({ socketPath, path: '/toggle', method: 'GET' }, () => {
        app.exit(0);
      });
      req.on('error', () => {
        const reqHttp = http.request({ host: '127.0.0.1', port: 49152, path: '/toggle', method: 'GET' }, () => {
          app.exit(0);
        });
        reqHttp.on('error', () => app.exit(1));
        reqHttp.end();
      });
      req.end();
    } else {
      console.log('[EzSpeak] Another instance of EzSpeak is already running. Focus signaled.');
      app.exit(0);
    }
  }

  app.on('second-instance', (event, commandLine) => {
    if (commandLine.includes('--toggle')) {
      Logger.log('[CLI] Received second-instance --toggle flag');
      handleRecordToggle();
    } else {
      showMainWindow('app');
    }
  });

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
  let liveTypedText = '';
  let isSliceProcessing = false;
  let pendingSliceData = null;

  function createAudioCaptureWindow() {
    if (audioCaptureWindow && !audioCaptureWindow.isDestroyed()) return audioCaptureWindow;

    audioCaptureWindow = new BrowserWindow({
      show: false,
      width: 100,
      height: 100,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    audioCaptureWindow.loadFile('renderer/audio-capture.html');
    return audioCaptureWindow;
  }

  stateMachine.on('state-changed', ({ current }) => {
    setRecordingStatus(current);
  });

  function getIndicatorTargetPosition() {
    let display = null;
    try {
      const { screen } = require('electron');
      display = screen.getPrimaryDisplay() || screen.getAllDisplays()[0];
    } catch (e) { }

    const bounds = display ? display.bounds : { x: 0, y: 0, width: 1920, height: 1080 };
    const defaultX = Math.floor(bounds.x + (bounds.width - 530) / 2);
    const defaultY = Math.floor(bounds.y + bounds.height - 120);

    const saved = Config.getIndicatorPosition();
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      // Ensure saved position is visibly on screen
      const minX = bounds.x - 200;
      const maxX = bounds.x + bounds.width - 100;
      const minY = bounds.y;
      const maxY = bounds.y + bounds.height - 60;

      if (saved.x >= minX && saved.x <= maxX && saved.y >= minY && saved.y <= maxY) {
        return [Math.round(saved.x), Math.round(saved.y)];
      }
      // Saved position is off-screen (e.g. from screen resolution change or stale coords)
      Config.setIndicatorPosition(null);
    }

    return [defaultX, defaultY];
  }

  function createRecordingIndicator() {
    const [posX, posY] = getIndicatorTargetPosition();

    recordingIndicator = new BrowserWindow({
      title: 'ezspeak-indicator',
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
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    recordingIndicator.setAlwaysOnTop(true, 'pop-up-menu');
    recordingIndicator.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    recordingIndicator.on('moved', () => {
      try {
        const [x, y] = recordingIndicator.getPosition();
        let display = null;
        try {
          const { screen } = require('electron');
          display = screen.getDisplayNearestPoint({ x, y });
        } catch (e) { }
        const bounds = display ? display.bounds : { x: 0, y: 0, width: 1920, height: 1080 };
        if (y >= bounds.y && y <= bounds.y + bounds.height - 50) {
          Config.setIndicatorPosition({ x, y });
        }
      } catch (e) { }
    });

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
    PlatformAdapter.showIndicator(recordingIndicator);
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
      } catch (e) { }
    }
  }

  function createTray() {
    try {
      const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
      const iconPath = path.join(__dirname, 'assets', iconFile);
      const icon = nativeImage.createFromPath(iconPath);
      tray = new Tray(icon);
      updateTrayMenu();
      tray.on('double-click', () => {
        showMainWindow('app');
      });
    } catch (err) {
      Logger.warn('Tray creation skipped or failed:', err?.message || err);
    }
  }

  function updateTrayMenu() {
    const isDev = Boolean(process.env.NODE_ENV === 'development' || process.argv.includes('--dev') || (app && !app.isPackaged));
    const menuItems = [
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
        label: 'Snippets',
        click: () => {
          showMainWindow('snippets');
        }
      },
      {
        label: 'History',
        click: () => {
          showMainWindow('history');
        }
      },
      { type: 'separator' },
      {
        label: 'Start at Login',
        type: 'checkbox',
        checked: Config.getAutostart(),
        click: async (item) => {
          Config.setAutostart(item.checked);
          await Autostart.setAutostart(item.checked);
        }
      }
    ];

    if (isDev) {
      menuItems.push({
        label: 'Open DevTools',
        click: () => {
          if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.webContents.openDevTools();
          }
        }
      });
    }

    menuItems.push(
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    );

    const contextMenu = Menu.buildFromTemplate(menuItems);

    tray.setContextMenu(contextMenu);
    tray.setToolTip('EzSpeak - Voice to Text');
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
        contextIsolation: true,
        backgroundThrottling: false // Prevent throttling audio recording when hidden in background
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
        } catch (e) { }
      }
    } else {
      createSettingsWindow();
      settingsWindow.show();
      settingsWindow.focus();
      if (tab) {
        settingsWindow.webContents.once('did-finish-load', () => {
          try {
            if (settingsWindow && !settingsWindow.isDestroyed()) {
              settingsWindow.webContents.send('navigate-tab', tab);
            }
          } catch (e) { }
        });
      }
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

  /**
   * Calculates newly spoken words between live slices for streaming cursor insertion
   */
  function getNewTextDelta(fullText, alreadyTypedText) {
    if (!alreadyTypedText || alreadyTypedText.trim().length === 0) {
      return fullText.trim();
    }
    const cleanFull = fullText.trim();
    const cleanTyped = alreadyTypedText.trim();

    // If fullText directly starts with alreadyTypedText
    if (cleanFull.startsWith(cleanTyped)) {
      const remainder = cleanFull.slice(cleanTyped.length).trim();
      if (!/[a-zA-Z0-9]/.test(remainder)) return '';
      return remainder;
    }

    // Word-based match (handles punctuation refinements between slices)
    const fullWords = cleanFull.split(/\s+/);
    const typedWords = cleanTyped.split(/\s+/);

    const norm = w => w.toLowerCase().replace(/[^a-z0-9]/g, '');
    let matchCount = 0;
    for (let i = 0; i < typedWords.length && i < fullWords.length; i++) {
      if (norm(typedWords[i]) === norm(fullWords[i])) {
        matchCount++;
      } else {
        break;
      }
    }

    if (matchCount > 0 && matchCount < fullWords.length) {
      const remainder = fullWords.slice(matchCount).join(' ').trim();
      if (!/[a-zA-Z0-9]/.test(remainder)) return '';
      return remainder;
    } else if (matchCount >= fullWords.length) {
      return '';
    }

    return cleanFull;
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
          settingsWindow.webContents.send('error', isOffline ? 'Please download or import a Whisper model in Settings first.' : 'Please configure your Sarvam AI API key in Settings first.');
        } catch (e) { }
      }
      return;
    }

    try {
      Logger.recording('Starting recording...');
      isRecording = true;
      if (hotkeyManager) hotkeyManager.setRecording(true);
      liveAccumulatedText = '';
      liveTypedText = '';
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
      let rawTranscription = '';
      try {
        rawTranscription = await transcriptionService.transcribe(audioFilePath);
      } catch (trErr) {
        Logger.warn('Full audio transcription error:', trErr.message);
        if (liveAccumulatedText) {
          rawTranscription = liveAccumulatedText;
        } else {
          throw trErr;
        }
      }

      let { text: cleaned, shouldStop } = detectAndCleanVoiceCommands(rawTranscription);
      if ((!cleaned || cleaned.trim().length === 0) && liveAccumulatedText) {
        cleaned = liveAccumulatedText;
      }
      if (cleaned) {
        cleaned = SpokenPunctuation.format(cleaned);
        cleaned = SnippetsManager.expandSnippets(cleaned);
      }

      if (cleaned && cleaned.trim().length > 0) {
        const fullText = cleaned.trim();
        const sarvam = Config.getSarvamSettings();
        let translatedText = null;

        // Always sync complete text to clipboard so user can press Ctrl+V anywhere even if no pointer was focused
        ClipboardManager.syncClipboard(fullText);

        // Auto-translate via Sarvam AI if enabled and key is present
        if (sarvam.autoTranslate && sarvam.apiKey) {
          try {
            Logger.log(`[AutoTranslate] Translating with Sarvam AI (${sarvam.targetLang})...`);
            if (!sarvamTranslator) sarvamTranslator = new TranslationService();
            const tr = await sarvamTranslator.translate(fullText, {
              targetLang: sarvam.targetLang,
              sourceLang: sarvam.sourceLang
            });
            if (tr && tr.translatedText) {
              translatedText = tr.translatedText;
              Logger.success(`[AutoTranslate] Translated text: "${translatedText}"`);
              await ClipboardManager.typeWordByWord(translatedText);
              ClipboardManager.syncClipboard(translatedText);
            }
          } catch (trErr) {
            Logger.warn('[AutoTranslate] Translation failed, using original speech:', trErr.message);
          }
        } else {
          // Calculate any trailing words that were not yet typed live during streaming
          const remainingDelta = getNewTextDelta(fullText, liveTypedText);
          if (remainingDelta && remainingDelta.trim().length > 0) {
            const textToInsert = (liveTypedText ? ' ' : '') + remainingDelta.trim();
            Logger.log(`Typing remaining transcription at cursor: "${textToInsert}"`);
            await ClipboardManager.typeWordByWord(textToInsert);
          } else if (!liveTypedText) {
            // If dictation was short (< 2s) and no live slice ran, type the complete text
            Logger.log(`Typing complete speech at cursor: "${fullText}"`);
            await ClipboardManager.typeWordByWord(fullText);
          }
        }

        Config.addToHistory(fullText);
        liveTypedText = '';
        liveAccumulatedText = '';

        if (translatedText) {
          updateIndicatorLiveText(`${translatedText} (${fullText})`);
        } else {
          updateIndicatorLiveText(fullText);
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
          } catch (e) { }
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
        } catch (e) { }
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
      const tempDir = path.join(require('os').tmpdir(), 'ezspeak');
      if (!require('fs').existsSync(tempDir)) {
        require('fs').mkdirSync(tempDir, { recursive: true });
      }
      const buf = Buffer.from(bufferArray);
      const isWav = buf.length > 4 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
      const sliceExt = isWav ? 'wav' : 'webm';
      const slicePath = path.join(tempDir, `slice_${crypto.randomUUID()}.${sliceExt}`);
      require('fs').writeFileSync(slicePath, buf);

      // Transcribe speech so far
      const rawText = await transcriptionService.transcribe(slicePath);
      const { text: cleaned, shouldStop } = detectAndCleanVoiceCommands(rawText);

      // Clean up slice file if not already removed by transcription service
      try { if (require('fs').existsSync(slicePath)) require('fs').unlinkSync(slicePath); } catch (e) { }

      // Voice Command: "stop listening" detected live!
      if (shouldStop && isRecording) {
        Logger.log('[VOICE COMMAND] "stop listening" detected! Automatically turning off dictation...');
        handleRecordStop();
        return;
      }

      // Format spoken punctuation and commands, then expand snippets on live stream
      const formatted = cleaned ? SpokenPunctuation.format(cleaned) : '';
      const expandedText = formatted ? SnippetsManager.expandSnippets(formatted) : '';

      if (expandedText && expandedText.length > 0 && isRecording) {
        liveAccumulatedText = expandedText;
        updateIndicatorLiveText(expandedText);

        if (settingsWindow && !settingsWindow.isDestroyed()) {
          try {
            settingsWindow.webContents.send('live-dictation-snippet', expandedText);
          } catch (e) { }
        }

        // Live dictation: type newly spoken words at cursor pointer every 2-3 sec
        const delta = getNewTextDelta(expandedText, liveTypedText);
        if (delta && delta.trim().length > 0 && isRecording) {
          const textToInsert = (liveTypedText ? ' ' : '') + delta.trim();
          liveTypedText = expandedText;
          Logger.log(`[LiveDictation] Typing delta at cursor pointer: "${textToInsert}"`);
          ClipboardManager.typeWordByWord(textToInsert);
        }

        // Always sync full text to clipboard so user can press Ctrl+V anywhere even if no pointer was focused
        ClipboardManager.syncClipboard(expandedText.trim());
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
    // Return masked key so renderer can show "configured" state without exposing plaintext
    const key = Config.getApiKey();
    return key && key.length > 0 ? '••••••••' : '';
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

  ipcMain.handle('get-autostart', async () => {
    return await Autostart.isEnabled();
  });

  ipcMain.handle('set-autostart', async (event, enabled) => {
    Config.setAutostart(enabled);
    const success = await Autostart.setAutostart(enabled);
    updateTrayMenu();
    return success;
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
      } catch (e) { }
    }
    if (recordingIndicator && !recordingIndicator.isDestroyed()) {
      try {
        recordingIndicator.webContents.executeJavaScript(`if (typeof updateHotkeyDisplay === "function") updateHotkeyDisplay(${JSON.stringify(hotkey)});`);
      } catch (e) { }
    }

    return true;
  });

  ipcMain.on('move-indicator', (event, { deltaX, deltaY }) => {
    if (recordingIndicator && !recordingIndicator.isDestroyed()) {
      try {
        const [currX, currY] = recordingIndicator.getPosition();
        const newX = Math.round(currX + deltaX);
        const newY = Math.round(currY + deltaY);
        recordingIndicator.setPosition(newX, newY);
        Config.setIndicatorPosition({ x: newX, y: newY });
      } catch (e) { }
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
    // Return settings with API keys masked: send only whether a key is configured,
    // not the actual decrypted value. The UI uses this to show "configured" vs empty state.
    const all = Config.getAllProviderSettings();
    const redact = (key) => (key && key.length > 0 ? '••••••••' : '');
    return {
      ...all,
      sarvam: {
        ...all.sarvam,
        apiKey: redact(all.sarvam?.apiKey)
      }
    };
  });

  ipcMain.handle('save-provider-settings', (event, s) => {
    if (s.transcriptionMode) Config.setTranscriptionMode(s.transcriptionMode);
    if (s.sarvam) {
      if (s.sarvam.apiKey !== undefined && s.sarvam.apiKey !== '••••••••') {
        Config.setSarvamApiKey(s.sarvam.apiKey);
      }
      if (s.sarvam.model) Config.setSarvamModel(s.sarvam.model);
      if (s.sarvam.sttModel) Config.setSarvamSTTModel(s.sarvam.sttModel);
      if (s.sarvam.targetLang) Config.setSarvamTargetLang(s.sarvam.targetLang);
      if (s.sarvam.sourceLang) Config.setSarvamSourceLang(s.sarvam.sourceLang);
      if (s.sarvam.autoTranslate !== undefined) Config.setAutoTranslate(s.sarvam.autoTranslate);
    }
    if (s.local) {
      if (s.local.modelName) Config.setLocalModelName(s.local.modelName);
      if (s.local.modelPath !== undefined) Config.setLocalModelPath(s.local.modelPath);
    }
    return true;
  });

  ipcMain.handle('get-cloud-provider', () => {
    return 'sarvam';
  });

  ipcMain.handle('set-cloud-provider', (event, provider) => {
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
          } catch (e) { }
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
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      Logger.warn(`[Security] Blocked open-external for non-https URL: ${url}`);
      return;
    }
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

  // ─── Snippets Manager IPC Handlers ─────────────────────────────
  ipcMain.handle('get-snippets', () => {
    return SnippetsManager.getSnippets();
  });

  ipcMain.handle('save-snippet', (event, snippet) => {
    return SnippetsManager.saveSnippet(snippet);
  });

  ipcMain.handle('delete-snippet', (event, id) => {
    return SnippetsManager.deleteSnippet(id);
  });

  ipcMain.handle('toggle-snippet', (event, id, enabled) => {
    return SnippetsManager.toggleSnippet(id, enabled);
  });

  // ─── Spoken Punctuation & Formatting Commands IPC Handlers ──────
  ipcMain.handle('get-spoken-punctuation', () => {
    return Config.getSpokenPunctuation();
  });

  ipcMain.handle('set-spoken-punctuation', (event, enabled) => {
    Config.setSpokenPunctuation(enabled);
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

    const depCheck = PlatformAdapter.checkDependencies();
    if (depCheck && !depCheck.ok && depCheck.missing && depCheck.missing.length > 0) {
      Logger.warn(`[Platform Check] Missing recommended Linux components: ${depCheck.missing.join(', ')}`);
    } else {
      Logger.success('[Platform Check] Platform dependencies verified');
    }

    // Set app icon and check microphone permission on macOS
    if (process.platform === 'darwin') {
      const iconPath = path.join(__dirname, 'assets', 'icon.png');
      const icon = nativeImage.createFromPath(iconPath);
      if (app.dock) app.dock.setIcon(icon);

      if (systemPreferences && systemPreferences.askForMediaAccess) {
        systemPreferences.askForMediaAccess('microphone').then(granted => {
          Logger.log('[macOS] Microphone access granted:', granted);
        }).catch(err => {
          Logger.warn('[macOS] Microphone access prompt error:', err.message);
        });
      }
    }

    // Force dark mode for window chrome
    nativeTheme.themeSource = 'dark';

    createTray();
    Logger.success('System tray created');

    createRecordingIndicator(); // Pre-create indicator
    Logger.success('Recording indicator created');

    createAudioCaptureWindow(); // Dedicated hidden background audio capture worker
    Logger.success('Background audio capture worker initialized');

    await initializeServices();
    Logger.success('Services initialized');

    if (Config.getAutostart()) {
      Autostart.enable().catch(err => Logger.error('[Autostart] Failed to sync on startup:', err.message));
    }

    // Start monitoring for hotkey
    await hotkeyManager.startMonitoring();

    // Show application window immediately on startup
    if (process.argv.includes('--test-launch')) {
      console.log('✓ App launch check passed: Electron app initialized successfully!');
      setTimeout(() => {
        app.isQuitting = true;
        app.exit(0);
      }, 300);
      return;
    }

    showMainWindow('app');
    Logger.success('Application window opened');

    console.log('\n========================================');
    console.log('   EzSpeak is ready!');
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
}

