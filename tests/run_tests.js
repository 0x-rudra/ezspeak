// Automated test runner for Listner
const os = require('os');
const path = require('path');
// Ensure electron-store uses a writable directory in test runs
const testConfigDir = path.join(os.tmpdir(), 'listner-test-config-' + Date.now());
const fs = require('fs');
fs.mkdirSync(testConfigDir, { recursive: true });
process.env.XDG_CONFIG_HOME = testConfigDir;

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
console.log('Running Listner Test Suite');
console.log('====================================\n');

// 1. Syntax check all JS files
console.log('[Test Suite 1: JavaScript Syntax Verification]');
const filesToCheck = [
  'main.js',
  'preload.js',
  'renderer/settings.js',
  'src/audioRecorder.js',
  'src/clipboardManager.js',
  'src/config.js',
  'src/hotkeyManager.js',
  'src/localServer.js',
  'src/localTranscription.js',
  'src/logger.js',
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
} catch (e) {
  assert(false, `Config error: ${e.message}`);
}

// 6. Project metadata and naming check
console.log('\n[Test Suite 6: Project Naming & Metadata]');
try {
  const pkg = require('../package.json');
  assert(pkg.name === 'listner', 'package.json name is listner');
  assert(pkg.productName === 'Listner', 'package.json productName is Listner');
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

console.log('\n====================================');
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('====================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
