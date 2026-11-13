const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const electronBin = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = [];

if (process.platform === 'linux') {
  // Disable Chromium sandbox on Linux to prevent unprivileged user namespace crashes
  args.push('--no-sandbox');

  // If running on Wayland (e.g. Niri, Hyprland, Sway), enable Ozone platform with auto-detection
  if (process.env.WAYLAND_DISPLAY) {
    args.push('--enable-features=UseOzonePlatform', '--ozone-platform-hint=auto');
  }
}

const rootDir = path.resolve(__dirname, '..');
args.push(rootDir, ...process.argv.slice(2));

const child = spawn(electronBin, args, { stdio: 'inherit', env });

child.on('close', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('[Listner] Failed to launch Electron:', err.message);
  process.exit(1);
});
