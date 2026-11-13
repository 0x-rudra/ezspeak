# Listner

> Fast, private, cross-platform voice dictation and transcription desktop application. Powered by resident Whisper.cpp and high-performance cloud providers with zero-leak clipboard injection.

---

## 🌟 Key Features

- **Offline Transcription**: Runs private, on-device Whisper models locally using resident `whisper.cpp` processes.
- **Cloud Transcription (Sarvam AI)**: High-accuracy, low-latency cloud speech-to-text powered by Sarvam AI (`saaras:v2` / `saaras:v1`) supporting Indian English and 10+ Indic languages.
- **Indic & Global Translation**: Real-time translation to Hindi, Tamil, Telugu, Bengali, Kannada, and other languages powered by Sarvam AI (`mayura:v1`).
- **Cross-Platform Global Hotkey**:
  - **Linux Wayland**: First-class support for Wayland compositors (Niri, Hyprland, Sway) via Unix domain socket IPC (`/tmp/listner.sock`) and localhost HTTP (`http://127.0.0.1:49152/toggle`).
  - **Windows & macOS**: Native OS global shortcuts for Toggle mode and low-overhead Push-to-Talk (Hold mode).
- **Safe Keystroke & Clipboard Restoration**: Automatically backs up clipboard state prior to text injection, injects transcriptions asynchronously via native typing / clipboard pasting, and immediately restores the user's prior clipboard.
- **Security-First Architecture**:
  - API keys encrypted with OS-level credentials using Electron `safeStorage`.
  - Local IPC server rejects external web requests via strict `Origin` header blocking.
  - Model deletion path validation prevents directory traversal attacks.
  - Transcript logging redaction protects dictation privacy.
- **Floating Movable Indicator**: Draggable, glassmorphic capsule overlay showing live dictation state, audio waveforms, and translation toggles. Remembers screen coordinates across launches.
- **System Tray & Autostart**: Runs unobtrusively in the background with Linux XDG `.desktop` and Windows `openAtLogin` autostart support.

---

## 🏗️ Architecture Overview

```
                        ┌────────────────────────────────────────┐
                        │              Listner Core              │
                        │           (Electron Main / JS)         │
                        └─┬─────────────────┬──────────────────┬─┘
                          │                 │                  │
        ┌─────────────────▼───┐     ┌───────▼────────┐   ┌─────▼──────────────────┐
        │   Platform Adapter  │     │ Dictation State│   │   Audio & Capture      │
        │  (Linux/Win32/Mac)  │     │    Machine     │   │       Pipeline         │
        └─┬───────────────────┘     └────────────────┘   └─────┬──────────────────┘
          │                                                    │
     ┌────┴────────────────────────┐                     ┌─────┴──────────────────┐
     │ • Wayland (wtype / wl-copy) │                     │ • 16kHz PCM Stream     │
     │ • Windows (nut-js / Send)   │                     │ • 3-Chunk Pre-roll     │
     │ • Local IPC Socket / HTTP   │                     │ • Audio Energy VAD     │
     │ • Clipboard backup/restore  │                     │ • Transcription Queue  │
     └─────────────────────────────┘                     └─────┬──────────────────┘
                                                               │
                                         ┌─────────────────────┴──────────────────┐
                                         │                                        │
                               ┌─────────▼─────────┐                    ┌─────────▼─────────┐
                               │ Resident Whisper  │                    │ Cloud BYOK        │
                               │ (Offline cpp)     │                    │ (Groq/OpenAI/API) │
                               └───────────────────┘                    └───────────────────┘
```

### Modular Components
1. **Platform Adapters (`src/platform/`)**:
   - `LinuxAdapter`: Detects Wayland compositor environment (`niri`, `hyprland`, `sway`), handles simulated typing with `wtype` or `wl-copy` fallback, and provides compositor keybinding hooks.
   - `WindowsAdapter`: Manages Windows virtual keystrokes, clipboard pasting, and process foreground detection.
2. **Audio Pipeline (`src/audioPipeline.js`)**:
   - Dedicated hidden capture worker streaming 16kHz mono audio.
   - Bounded pre-roll circular buffer to eliminate truncated dictation beginnings.
   - Asynchronous sequential `TranscriptionQueue` to prevent concurrent typing collisions.
3. **Transcription Pipeline (`src/transcription.js`, `src/localTranscription.js`)**:
   - Dynamic retry with exponential backoff on 429 and 5xx network responses.
   - Automatic voice command detection (`turn off`, `stop listening`) that preserves brackets, punctuation, and contextual phrases.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- pnpm (v9+) or npm

### Installation
```bash
# Clone the repository
git clone https://github.com/0x-rudra/listner.git
cd listner

# Install dependencies
pnpm install

# Start development application
pnpm start
```

---

## ⌨️ Global Hotkey & Compositor Setup

Listner supports both **Toggle** (tap to start, tap to stop) and **Hold** (push-to-talk) modes.

### Linux Wayland (Niri / Hyprland / Sway)
On Wayland compositors, global hotkeys are managed by your compositor configuration:

#### Niri Configuration (`~/.config/niri/config.kdl`)
```kdl
binds {
    // Single hotkey to toggle voice dictation
    Mod+Space { spawn "listner" "--toggle"; }
}
```
*Alternatively, you can trigger via the local socket directly:*
```kdl
binds {
    Mod+Space { spawn "curl" "-s" "--unix-socket" "/tmp/listner.sock" "http://localhost/toggle"; }
}
```

#### Hyprland Configuration (`~/.config/hypr/hyprland.conf`)
```ini
bind = $mainMod, Space, exec, listner --toggle
```

#### Sway Configuration (`~/.config/sway/config`)
```ini
bindsym $mod+space exec listner --toggle
```

### Windows & macOS
- Use the built-in hotkey configurator in the **Settings** panel (`Ctrl+Alt+Space` by default).
- Switch between **Toggle** and **Hold** modes directly from the UI or tray menu.

---

## 🔑 Sarvam AI Cloud & Translation Setup

Open **Settings → API Keys & Preferences** to configure your unified Sarvam AI subscription key:

| Capability | Model | Description |
| :--- | :--- | :--- |
| **Speech-to-Text** | `saaras:v2` / `saaras:v1` | High-accuracy speech recognition supporting English and 10+ Indic languages. |
| **Translation** | `mayura:v1` | Real-time text translation into Hindi, Tamil, Telugu, Bengali, Kannada, Marathi, Gujarati, etc. |

---

## 📦 Building & Distribution

Pack and build production executables using `electron-builder`:

```bash
# Test and syntax check all components
pnpm test

# Build production artifacts (Linux AppImage & deb; Windows NSIS installer)
pnpm run build

# Package unpacked directory for testing
pnpm run pack
```

Build outputs will be generated in the `dist/` directory:
- **Linux**: `dist/Listner-0.2.0.AppImage`, `dist/listner_0.2.0_amd64.deb`
- **Windows**: `dist/Listner Setup 0.2.0.exe`

---

## 🧪 Testing & Verification

Listner features a comprehensive 13-suite automated test suite covering:
1. JavaScript syntax integrity across all modules and renderers.
2. Translation services & language catalogue.
3. Structured logging with transcript redaction.
4. BYOK cloud transcription services & endpoints.
5. Configuration persistence, secure storage, and store resolution.
6. Project naming, branding, and package metadata.
7. Transcription correctness, voice commands, and audio UUIDs.
8. Security hardening, origin validation, and model path traversal prevention.
9. Hotkey manager single-provider architecture.
10. Reliability, clipboard backup/restore, and cloud retry backoff.
11. Platform adapter cross-platform APIs and dependency checks.
12. Audio capture pipeline, state machine, pre-roll buffer, and VAD.
13. Packaging configuration and autostart desktop entry generation.

Run all tests:
```bash
pnpm test
```

---

## 📄 License

MIT © [Rudransha Gupta](https://github.com/0x-rudra)
