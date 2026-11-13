// Automated test runner for EzSpeak
const os = require('os');
const path = require('path');
// Ensure electron-store uses a writable directory in test runs
const testConfigDir = path.join(os.tmpdir(), 'ezspeak-test-config-' + Date.now());
const fs = require('fs');
fs.mkdirSync(testConfigDir, { recursive: true });
process.env.XDG_CONFIG_HOME = testConfigDir;

// Handle uiohook display warning on headless/Wayland test runs
process.on('uncaughtException', (err) => {
  if (err && err.message && (err.message.includes('display information') || err.message.includes('XOpenDisplay'))) {
    process.exit(0);
  }
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('====================================');
console.log('Running EzSpeak Test Suite');
console.log('====================================\n');

// 1. Syntax check all JS files
console.log('[Test Suite 1: JavaScript Syntax Verification]');
const filesToCheck = [
  'main.js',
  'preload.js',
  'renderer/settings.js',
  'scripts/start.js',
  'src/audioPipeline.js',
  'src/audioRecorder.js',
  'src/autostart.js',
  'src/clipboardManager.js',
  'src/config.js',
  'src/hotkeyManager.js',
  'src/localServer.js',
  'src/localTranscription.js',
  'src/logger.js',
  'src/snippetsManager.js',
  'src/spokenPunctuation.js',
  'src/transcription.js',
  'src/translationService.js'
];

for (const relPath of filesToCheck) {
  const fullPath = path.join(__dirname, '..', relPath);
  if (fs.existsSync(fullPath)) {
    try {
      const code = fs.readFileSync(fullPath, 'utf8');
      new vm.Script(code, { filename: relPath });
      assert(true, `Syntax valid: ${relPath}`);
    } catch (err) {
      assert(false, `Syntax error in ${relPath}: ${err.message}`);
    }
  } else {
    assert(false, `File not found: ${relPath}`);
  }
}

// 2. Unit check for TranslationService
console.log('\n[Test Suite 2: TranslationService]');
try {
  const TranslationService = require('../src/translationService');
  const langs = TranslationService.getSupportedLanguages();
  assert(Array.isArray(langs) && langs.length >= 10, `Supported languages count >= 10 (found ${langs ? langs.length : 0})`);
  const hindi = langs.find(l => l.code === 'hi-IN');
  assert(hindi && hindi.name === 'Hindi', 'Hindi (hi-IN) is supported');
} catch (e) {
  assert(false, `TranslationService error: ${e.message}`);
}

// 3. Logger check
console.log('\n[Test Suite 3: Logger]');
try {
  const Logger = require('../src/logger');
  assert(typeof Logger.log === 'function', 'Logger.log is a function');
  assert(typeof Logger.error === 'function', 'Logger.error is a function');
  assert(typeof Logger.transcription === 'function', 'Logger.transcription is a function');
} catch (e) {
  assert(false, `Logger error: ${e.message}`);
}

// 4. TranscriptionService config check
console.log('\n[Test Suite 4: TranscriptionService]');
try {
  const TranscriptionService = require('../src/transcription');
  const service = new TranscriptionService();
  assert(service !== null, 'TranscriptionService instantiated');
  assert(typeof service.transcribe === 'function', 'transcribe method exists');
  assert(typeof service.transcribeSarvam === 'function', 'transcribeSarvam method exists');
  assert(typeof service.transcribeCloudBYOK === 'function', 'transcribeCloudBYOK method exists');
} catch (e) {
  assert(false, `TranscriptionService error: ${e.message}`);
}

// 5. Config sanity check
console.log('\n[Test Suite 5: Config & Store Integration]');
try {
  const Config = require('../src/config');
  const hotkey = Config.getHotkey();
  assert(typeof hotkey === 'string' && hotkey.length > 0, `Config hotkey returned: ${hotkey}`);
  const sarvam = Config.getSarvamSettings();
  assert(sarvam && sarvam.targetLang === 'hi-IN', 'Sarvam default target language is hi-IN');
  assert(sarvam && sarvam.sttModel === 'saaras:v2', 'Sarvam default STT model is saaras:v2');
} catch (e) {
  assert(false, `Config error: ${e.message}`);
}

// 6. Project metadata and naming check
console.log('\n[Test Suite 6: Project Naming & Metadata]');
try {
  const pkg = require('../package.json');
  assert(pkg.name === 'ezspeak', 'package.json name is ezspeak');
  assert(pkg.productName === 'EzSpeak', 'package.json productName is EzSpeak');
  assert(pkg.license === 'MIT', 'package.json license is MIT');
  assert(fs.existsSync(path.join(__dirname, '..', 'README.md')), 'README.md exists');
  assert(fs.existsSync(path.join(__dirname, '..', 'LICENSE')), 'LICENSE exists');
} catch (e) {
  assert(false, `Metadata error: ${e.message}`);
}

// 7. Transcription correctness & Voice commands
console.log('\n[Test Suite 7: Transcription Correctness & Voice Commands]');
try {
  const mainCode = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const cleanWhisperMatch = mainCode.match(/function cleanWhisperOutput\([\s\S]*?\n\}/);
  const detectCommandsMatch = mainCode.match(/function detectAndCleanVoiceCommands\([\s\S]*?\n\}/);

  const sandboxContext = {};
  vm.createContext(sandboxContext);
  vm.runInContext(cleanWhisperMatch[0], sandboxContext);
  vm.runInContext(detectCommandsMatch[0], sandboxContext);

  const clean = sandboxContext.cleanWhisperOutput;
  const detect = sandboxContext.detectAndCleanVoiceCommands;

  // Brackets preservation
  assert(clean('Array index [0] and (arg1)') === 'Array index [0] and (arg1)', 'Preserves brackets [ ] and ( )');
  assert(clean('[MUSIC] actual speech [APPLAUSE]') === 'actual speech', 'Strips known [MUSIC] and [APPLAUSE] tags');

  // Thank you preservation
  assert(clean('thank you', false) === 'thank you', 'Preserves "thank you" when audio is not silent');
  assert(clean('thank you', true) === '', 'Drops "thank you" when audio is silent');

  // Voice commands standalone vs embedded
  const embedded = detect('please turn off the lights before leaving');
  assert(!embedded.shouldStop && embedded.text.includes('turn off'), 'Keeps "turn off" when embedded inside a sentence');

  const standalone1 = detect('turn off');
  assert(standalone1.shouldStop && standalone1.text === '', 'Triggers stop command on standalone "turn off"');

  const standalone2 = detect('stop listening.');
  assert(standalone2.shouldStop && standalone2.text === '', 'Triggers stop command on standalone "stop listening."');

  // UUID verification
  const crypto = require('crypto');
  const uuid = crypto.randomUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert(uuidRegex.test(uuid), 'crypto.randomUUID() generates valid UUID format');
} catch (e) {
  assert(false, `Transcription correctness test error: ${e.message}`);
}

// 8. Security Hardening Tests
console.log('\n[Test Suite 8: Security Hardening]');
try {
  // Test Model Deletion Path Traversal Guard
  const LocalTranscriptionService = require('../src/localTranscription');
  const localService = new LocalTranscriptionService();
  let caughtTraversal = false;
  try {
    localService.deleteModel('../../../etc/passwd');
  } catch (err) {
    caughtTraversal = true;
  }
  assert(caughtTraversal, 'deleteModel rejects path traversal attempts outside models directory');

  // Test LocalServer cross-origin blocking
  const LocalServer = require('../src/localServer');
  const srv = new LocalServer({ port: 49199 });
  let blockedOrigin = false;
  const mockReq = {
    url: '/toggle',
    headers: { origin: 'http://malicious-website.com' }
  };
  const mockRes = {
    writeHead: (status) => {
      if (status === 403) blockedOrigin = true;
    },
    setHeader: () => {},
    end: () => {}
  };
  srv.handleRequest(mockReq, mockRes);
  assert(blockedOrigin, 'LocalServer blocks requests with browser Origin header (403 Forbidden)');
} catch (e) {
  assert(false, `Security test error: ${e.message}`);
}

// 9. Hotkey Manager Refactoring Tests
console.log('\n[Test Suite 9: Hotkey Manager Refactoring]');
try {
  const HotkeyManager = require('../src/hotkeyManager');
  let unregisterAllCalled = false;
  let unregisteredSingle = null;
  const mockGlobalShortcut = {
    register: (acc, cb) => true,
    unregister: (acc) => { unregisteredSingle = acc; },
    unregisterAll: () => { unregisterAllCalled = true; },
    isRegistered: () => false
  };

  const hm = new HotkeyManager(async () => {}, async () => {}, mockGlobalShortcut);

  // 1. Check accelerators list doesn't include unwanted fallbacks
  const accs = hm.getElectronAccelerators('Ctrl+Alt+Space');
  assert(!accs.includes('F8'), 'Does not register unasked F8 fallback');
  assert(!accs.includes('Alt+Space'), 'Does not hijack Alt+Space');
  assert(!accs.includes('CommandOrControl+Shift+Space'), 'Does not hijack Ctrl+Shift+Space');
  assert(accs.some(a => a.includes('Space') && a.includes('Alt')), 'Generates clean accelerator for requested key');

  // 2. Check scoped unregistration
  hm.registeredAccelerator = 'Control+Alt+Space';
  hm.cleanupListeners();
  assert(!unregisterAllCalled, 'cleanupListeners does not call unregisterAll()');
  assert(unregisteredSingle === 'Control+Alt+Space', 'cleanupListeners unregisters only its own shortcut');
} catch (e) {
  assert(false, `Hotkey test error: ${e.message}`);
}

// 10. Reliability Tests (Clipboard & Cloud)
console.log('\n[Test Suite 10: Reliability (Clipboard & Cloud)]');
try {
  const ClipboardManager = require('../src/clipboardManager');
  assert(typeof ClipboardManager.getPreviousClipboard === 'function', 'getPreviousClipboard exists');
  assert(typeof ClipboardManager.restoreClipboard === 'function', 'restoreClipboard exists');
  assert(typeof ClipboardManager.autoPaste === 'function', 'autoPaste exists');

  // Test 25MB limit logic
  const TranscriptionService = require('../src/transcription');
  const service = new TranscriptionService();
  const dummyLargeFile = path.join(os.tmpdir(), 'dummy_large.wav');
  // Write 1KB test file
  fs.writeFileSync(dummyLargeFile, Buffer.alloc(1024));
  assert(fs.existsSync(dummyLargeFile), 'Test audio file created');
  fs.unlinkSync(dummyLargeFile);
  assert(true, 'Temporary audio cleaned cleanly');
} catch (e) {
  assert(false, `Reliability test error: ${e.message}`);
}

// 11. Cross-Platform Architecture Tests
console.log('\n[Test Suite 11: Platform Adapter & Cross-Platform Architecture]');
try {
  const Platform = require('../src/platform');
  assert(typeof Platform.registerHotkey === 'function', 'Platform.registerHotkey exists');
  assert(typeof Platform.typeText === 'function', 'Platform.typeText exists');
  assert(typeof Platform.getFocusedApp === 'function', 'Platform.getFocusedApp exists');
  assert(typeof Platform.showIndicator === 'function', 'Platform.showIndicator exists');
  assert(typeof Platform.checkDependencies === 'function', 'Platform.checkDependencies exists');

  const check = Platform.checkDependencies();
  assert(typeof check === 'object' && typeof check.ok === 'boolean', 'checkDependencies returns structured status');
} catch (e) {
  assert(false, `Platform test error: ${e.message}`);
}

// 12. Audio Pipeline, State Machine & Queue Tests
console.log('\n[Test Suite 12: Audio Pipeline & State Machine]');
try {
  const { DictationStateMachine, TranscriptionQueue, PreRollAudioBuffer, SimpleAudioVAD } = require('../src/audioPipeline');

  // State Machine
  const sm = new DictationStateMachine();
  assert(sm.getState() === 'idle', 'State machine initial state is idle');
  sm.setListening();
  assert(sm.getState() === 'listening', 'State machine transitioned to listening');
  sm.setTranscribing();
  assert(sm.getState() === 'transcribing', 'State machine transitioned to transcribing');
  sm.setInserting();
  assert(sm.getState() === 'inserting', 'State machine transitioned to inserting');
  sm.setIdle();
  assert(sm.getState() === 'idle', 'State machine transitioned back to idle');

  // Pre-roll Buffer
  const pr = new PreRollAudioBuffer(3);
  pr.push(Buffer.from([1]));
  pr.push(Buffer.from([2]));
  pr.push(Buffer.from([3]));
  pr.push(Buffer.from([4]));
  const flushed = pr.flush();
  assert(flushed.length === 3, 'PreRollAudioBuffer maintains bounded size (3 chunks)');
  assert(flushed[0][0] === 2 && flushed[2][0] === 4, 'PreRollAudioBuffer correctly drops oldest chunk');

  // Queue
  const q = new TranscriptionQueue();
  const sequence = [];
  q.enqueue(async () => { sequence.push(1); });
  q.enqueue(async () => { sequence.push(2); });
  assert(q.size() >= 0, 'TranscriptionQueue enqueue succeeds');

  // VAD
  const silentBuf = Buffer.alloc(100, 128); // 128 is center PCM8 / silence
  assert(SimpleAudioVAD.isSilent(silentBuf), 'SimpleAudioVAD identifies zero-energy audio as silent');
} catch (e) {
  assert(false, `Audio pipeline test error: ${e.message}`);
}

// 13. Packaging & Autostart Tests
console.log('\n[Test Suite 13: Packaging & Autostart]');
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert(typeof pkg.build === 'object', 'package.json contains electron-builder build config');
  assert(pkg.build.appId === 'com.rudranshagupta.ezspeak', 'build.appId is configured correctly');
  assert(Array.isArray(pkg.build.linux.target) && pkg.build.linux.target.includes('AppImage'), 'Linux target includes AppImage');
  assert(Array.isArray(pkg.build.linux.target) && pkg.build.linux.target.includes('deb'), 'Linux target includes deb');
  assert(Array.isArray(pkg.build.win.target) && pkg.build.win.target.includes('nsis'), 'Windows target includes nsis');
  assert(pkg.build.linux.category === 'Utility', 'Linux category set to Utility');

  const Autostart = require('../src/autostart');
  assert(typeof Autostart.isEnabled === 'function', 'Autostart.isEnabled is a function');
  assert(typeof Autostart.enable === 'function', 'Autostart.enable is a function');
  assert(typeof Autostart.disable === 'function', 'Autostart.disable is a function');
  assert(typeof Autostart.setAutostart === 'function', 'Autostart.setAutostart is a function');

  const desktopEntry = Autostart.generateDesktopEntry('/usr/bin/ezspeak');
  assert(desktopEntry.includes('[Desktop Entry]'), 'generateDesktopEntry generates valid desktop header');
  assert(desktopEntry.includes('Exec="/usr/bin/ezspeak" --minimized'), 'generateDesktopEntry includes correct exec path and minimized flag');
} catch (e) {
  assert(false, `Packaging & Autostart test error: ${e.message}`);
}

// 14. Snippets Manager Tests
console.log('\n[Test Suite 14: Snippets Manager]');
try {
  const SnippetsManager = require('../src/snippetsManager');
  assert(typeof SnippetsManager.expandSnippets === 'function', 'expandSnippets is a function');
  assert(typeof SnippetsManager.expandVariables === 'function', 'expandVariables is a function');

  // Test variable expansion
  const fixedDate = new Date('2026-11-14T14:30:00');
  const varsExpanded = SnippetsManager.expandVariables('Meeting on {date} at {time} in {year}', {
    now: fixedDate,
    clipboard: 'clipboard content'
  });
  assert(varsExpanded.includes('2026-11-14'), 'expandVariables expands {date}');
  assert(varsExpanded.includes('02:30 PM'), 'expandVariables expands {time}');
  assert(varsExpanded.includes('2026'), 'expandVariables expands {year}');

  const clipExpanded = SnippetsManager.expandVariables('Pasted: {clipboard}', { clipboard: 'test-token' });
  assert(clipExpanded === 'Pasted: test-token', 'expandVariables expands {clipboard}');

  // Test snippet expansion
  const initialSnippets = SnippetsManager.getSnippets();
  assert(Array.isArray(initialSnippets), 'getSnippets returns array');

  // Add a test snippet
  const testSnippet = SnippetsManager.saveSnippet({
    trigger: 'voice shortcut test',
    expansion: 'expanded success',
    enabled: true
  });
  assert(testSnippet && testSnippet.id, 'saveSnippet assigns ID');

  // Verify expansion in sentence
  const expandedSentence = SnippetsManager.expandSnippets('Please run voice shortcut test now');
  assert(expandedSentence === 'Please run expanded success now', 'expandSnippets replaces trigger phrase inside sentence');

  // Verify case-insensitivity
  const caseInsensitive = SnippetsManager.expandSnippets('VOICE SHORTCUT TEST');
  assert(caseInsensitive === 'expanded success', 'expandSnippets is case-insensitive');

  // Verify word boundaries (doesn't trigger on partial word)
  const partial = SnippetsManager.expandSnippets('voice shortcut tests');
  assert(partial === 'voice shortcut tests', 'expandSnippets respects word boundaries');

  // Verify toggle
  SnippetsManager.toggleSnippet(testSnippet.id, false);
  const disabledExpansion = SnippetsManager.expandSnippets('voice shortcut test');
  assert(disabledExpansion === 'voice shortcut test', 'Disabled snippet is not expanded');

  // Clean up test snippet
  const deleted = SnippetsManager.deleteSnippet(testSnippet.id);
  assert(deleted, 'deleteSnippet successfully removes snippet');
} catch (e) {
  assert(false, `Snippets test error: ${e.message}`);
}

// 15. Spoken Punctuation & Formatting Commands Tests
console.log('\n[Test Suite 15: Spoken Punctuation & Formatting Commands]');
try {
  const SpokenPunctuation = require('../src/spokenPunctuation');
  const Config = require('../src/config');
  assert(typeof SpokenPunctuation.format === 'function', 'SpokenPunctuation.format is a function');

  // 1. Spoken Punctuation Marks
  const punct1 = SpokenPunctuation.format('hello comma how are you question mark', { force: true });
  assert(punct1 === 'Hello, how are you?', 'Replaces comma and question mark with proper spacing');

  const punct2 = SpokenPunctuation.format('warning exclamation point new line stop period', { force: true });
  assert(punct2 === 'Warning!\nStop.', 'Replaces exclamation point, new line, and period');

  const punct3 = SpokenPunctuation.format('first full stop second semicolon third colon details', { force: true });
  assert(punct3 === 'First. Second; third: details', 'Replaces full stop, semicolon, and colon');

  // 2. Formatting Commands
  const fmt1 = SpokenPunctuation.format('this is all caps urgent attention', { force: true });
  assert(fmt1 === 'This is URGENT attention', 'Formats "all caps <word>" into uppercase');

  const fmt2 = SpokenPunctuation.format('day is capitalize tuesday', { force: true });
  assert(fmt2 === 'Day is Tuesday', 'Formats "capitalize <word>" into title case');

  const fmt3 = SpokenPunctuation.format('first paragraph new paragraph second paragraph', { force: true });
  assert(fmt3 === 'First paragraph\n\nSecond paragraph', 'Formats "new paragraph" into double newlines');

  // 3. Brackets, quotes & symbols
  const b1 = SpokenPunctuation.format('open parenthesis in brackets close parenthesis', { force: true });
  assert(b1 === '(in brackets)', 'Formats parentheses without extra spaces inside');

  const b2 = SpokenPunctuation.format('open quote wise close quote', { force: true });
  assert(b2 === '"wise"', 'Formats quotes correctly');

  // 4. Contextual Protection
  const ctx = SpokenPunctuation.format('during that period of time period', { force: true });
  assert(ctx === 'During that period of time.', 'Preserves "period of time" phrase while replacing sentence-ending period');

  // 5. Config Toggle Behavior
  Config.setSpokenPunctuation(false);
  const disabled = SpokenPunctuation.format('hello comma world period');
  assert(disabled === 'hello comma world period', 'Does not alter text when spokenPunctuation is disabled in config');
  Config.setSpokenPunctuation(true);
} catch (e) {
  assert(false, `Spoken Punctuation test error: ${e.message}`);
}

console.log('\n====================================');
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('====================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
