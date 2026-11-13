// Key mapping from keyboard events to uiohook key names
const keyToUiohook = {
    // Function keys
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
    'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
    'F13': 'F13', 'F14': 'F14', 'F15': 'F15', 'F16': 'F16', 'F17': 'F17',
    'F18': 'F18', 'F19': 'F19', 'F20': 'F20', 'F21': 'F21', 'F22': 'F22',
    'F23': 'F23', 'F24': 'F24',

    // Modifier keys
    'ControlLeft': 'Ctrl', 'ControlRight': 'CtrlRight',
    'AltLeft': 'Alt', 'AltRight': 'AltRight',
    'ShiftLeft': 'Shift', 'ShiftRight': 'ShiftRight',
    'MetaLeft': 'Meta', 'MetaRight': 'MetaRight',

    // Letters
    'KeyA': 'A', 'KeyB': 'B', 'KeyC': 'C', 'KeyD': 'D', 'KeyE': 'E',
    'KeyF': 'F', 'KeyG': 'G', 'KeyH': 'H', 'KeyI': 'I', 'KeyJ': 'J',
    'KeyK': 'K', 'KeyL': 'L', 'KeyM': 'M', 'KeyN': 'N', 'KeyO': 'O',
    'KeyP': 'P', 'KeyQ': 'Q', 'KeyR': 'R', 'KeyS': 'S', 'KeyT': 'T',
    'KeyU': 'U', 'KeyV': 'V', 'KeyW': 'W', 'KeyX': 'X', 'KeyY': 'Y',
    'KeyZ': 'Z',

    // Numbers
    'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
    'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9',

    // Symbols and punctuation
    'Space': 'Space', 'Enter': 'Enter', 'Escape': 'Escape',
    'Tab': 'Tab', 'CapsLock': 'CapsLock',
    'Backspace': 'Backspace', 'Delete': 'Delete',
    'Insert': 'Insert', 'Home': 'Home', 'End': 'End',
    'PageUp': 'PageUp', 'PageDown': 'PageDown',
    'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown',
    'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
    'Backquote': 'Backquote', 'Minus': 'Minus', 'Equal': 'Equal',
    'BracketLeft': 'BracketLeft', 'BracketRight': 'BracketRight',
    'Backslash': 'Backslash', 'Semicolon': 'Semicolon',
    'Quote': 'Quote', 'Comma': 'Comma', 'Period': 'Period',
    'Slash': 'Slash', 'PrintScreen': 'PrintScreen',
    'ScrollLock': 'ScrollLock', 'NumLock': 'NumLock',

    // Numpad
    'Numpad0': 'Numpad0', 'Numpad1': 'Numpad1', 'Numpad2': 'Numpad2',
    'Numpad3': 'Numpad3', 'Numpad4': 'Numpad4', 'Numpad5': 'Numpad5',
    'Numpad6': 'Numpad6', 'Numpad7': 'Numpad7', 'Numpad8': 'Numpad8',
    'Numpad9': 'Numpad9', 'NumpadAdd': 'NumpadAdd', 'NumpadSubtract': 'NumpadSubtract',
    'NumpadMultiply': 'NumpadMultiply', 'NumpadDivide': 'NumpadDivide',
    'NumpadDecimal': 'NumpadDecimal', 'NumpadEnter': 'NumpadEnter',
    'NumpadArrowUp': 'NumpadArrowUp', 'NumpadArrowDown': 'NumpadArrowDown',
    'NumpadArrowLeft': 'NumpadArrowLeft', 'NumpadArrowRight': 'NumpadArrowRight',
    'NumpadHome': 'NumpadHome', 'NumpadEnd': 'NumpadEnd',
    'NumpadPageUp': 'NumpadPageUp', 'NumpadPageDown': 'NumpadPageDown',
    'NumpadInsert': 'NumpadInsert', 'NumpadDelete': 'NumpadDelete'
};

// Display friendly names for keys
const keyDisplayNames = {
    'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
    'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
    'Ctrl': 'Ctrl', 'CtrlRight': 'Right Ctrl',
    'Control': 'Ctrl',
    'Alt': 'Alt', 'AltRight': 'Right Alt',
    'Shift': 'Shift', 'ShiftRight': 'Right Shift',
    'Meta': 'Super', 'MetaRight': 'Right Super',
    'Super': 'Super',
    'Space': 'Space', 'Enter': 'Enter', 'Escape': 'Esc'
};

function formatHotkeyDisplay(hotkeyStr) {
    if (!hotkeyStr) return 'Ctrl + Alt + Space';
    return hotkeyStr
        .split('+')
        .map(p => p.trim())
        .map(p => keyDisplayNames[p] || p)
        .join(' + ');
}

function applyHotkeyToUI(hotkey) {
    const formatted = formatHotkeyDisplay(hotkey);
    const hotkeyInput = document.getElementById('hotkey');
    const dashHotkey = document.getElementById('dashboardHotkeyDisplay');
    const currentHotkeyDisplay = document.getElementById('currentHotkeyDisplay');

    if (hotkeyInput) hotkeyInput.value = formatted;
    if (dashHotkey) dashHotkey.textContent = formatted;
    if (currentHotkeyDisplay) currentHotkeyDisplay.textContent = formatted;

    const presetBtns = document.querySelectorAll('.preset-btn[data-hotkey]');
    presetBtns.forEach(b => {
        const rawMatch = b.dataset.hotkey === hotkey;
        const fmtMatch = formatHotkeyDisplay(b.dataset.hotkey) === formatted;
        b.classList.toggle('active', rawMatch || fmtMatch);
    });
}

function applyModeToUI(mode) {
    const radioToggle = document.getElementById('modeRadioToggle');
    const radioHold = document.getElementById('modeRadioHold');
    const badge = document.getElementById('dictationModeBadge');

    if (mode === 'hold') {
        if (radioHold) radioHold.checked = true;
        if (badge) {
            badge.textContent = 'Hold (Push-to-Talk)';
            badge.className = 'status-badge pending';
        }
    } else {
        if (radioToggle) radioToggle.checked = true;
        if (badge) {
            badge.textContent = 'Toggle';
            badge.className = 'status-badge ready';
        }
    }
}

function setupModeSelection() {
    const radios = document.querySelectorAll('input[name="dictationMode"]');
    radios.forEach(r => {
        r.addEventListener('change', async () => {
            const mode = r.value;
            try {
                await window.electronAPI.setMode(mode);
                applyModeToUI(mode);
                showToast(`Dictation mode: ${mode === 'hold' ? 'Hold (Push-to-Talk)' : 'Toggle'}`);
            } catch (err) {
                console.error('Error changing mode:', err);
                showToast('Failed to update mode', 'error');
            }
        });
    });
}

// ─── Toast notification ──────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    if (showToast._timer) {
        clearTimeout(showToast._timer);
    }

    toast.textContent = message;
    toast.classList.remove('toast--success', 'toast--error');
    toast.classList.add(`toast--${type}`, 'show');

    showToast._timer = setTimeout(() => {
        toast.classList.remove('show');
        showToast._timer = null;
    }, type === 'error' ? 4000 : 1800);
}

// ─── Password toggle buttons ────────────────────────────────────────────────
function setupPasswordToggles() {
    const toggles = document.querySelectorAll('.toggle-visibility');
    toggles.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;

            const eyeIcon = btn.querySelector('.eye-icon');
            const eyeOffIcon = btn.querySelector('.eye-off-icon');

            if (input.type === 'password') {
                input.type = 'text';
                if (eyeIcon) eyeIcon.style.display = 'none';
                if (eyeOffIcon) eyeOffIcon.style.display = 'block';
            } else {
                input.type = 'password';
                if (eyeIcon) eyeIcon.style.display = 'block';
                if (eyeOffIcon) eyeOffIcon.style.display = 'none';
            }
        });
    });
}

// ─── Load & Sync Settings ───────────────────────────────────────────────────
let currentSettings = null;

async function loadSettings() {
    try {
        currentSettings = await window.electronAPI.getAllSettings();
        const hotkey = await window.electronAPI.getHotkey();

        // Apply hotkey to all UI locations
        applyHotkeyToUI(hotkey || 'Ctrl+Alt+Space');

        // Apply dictation mode (Toggle vs Hold)
        const mode = (await window.electronAPI.getMode()) || 'toggle';
        applyModeToUI(mode);

        // Transcription is 100% Local Whisper (offline)
        try {
            await window.electronAPI.setTranscriptionMode('offline');
        } catch (e) {}

        // Load local models
        await refreshLocalModels();

        // Update dashboard engine badge
        updateDashboardEngineText();

        // Load Sarvam AI settings (for Voice Translation)
        await loadSarvamSettings();

        // Update dashboard snippet
        await loadLatestDictationSnippet();

        // Update device status display cards
        updateDeviceStatusDisplay();
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// ─── Update UI on Provider Change ────────────────────────────────────────────
async function updateProviderUI(selectedProvider = 'offline', saveToMain = false) {
    const cardOffline = document.getElementById('providerCardOffline');
    const engineBadge = document.getElementById('transcriptionEngineBadge');

    if (cardOffline) cardOffline.style.display = 'flex';
    if (engineBadge) {
        engineBadge.textContent = 'Local Whisper (100% Offline)';
    }

    // Update Dashboard Engine display
    updateDashboardEngineText();

    if (saveToMain) {
        try {
            await window.electronAPI.setTranscriptionMode('offline');
        } catch (e) {
            console.error('Failed to set transcription mode:', e);
        }
    }
}

function getProviderLabel(provider) {
    return 'Local Whisper.cpp';
}

function updateDashboardEngineText(provider = 'offline') {
    const dashEngine = document.getElementById('dashEngineMode');
    if (!dashEngine) return;

    const localSelect = document.getElementById('localModelSelect');
    const modelName = localSelect ? localSelect.value : 'base.en';
    dashEngine.textContent = `Local (${modelName})`;
}

// ─── Local Model Management & Import ─────────────────────────────────────────
let cachedLocalModels = [];

async function refreshLocalModels() {
    const select = document.getElementById('localModelSelect');
    if (!select) return;

    try {
        cachedLocalModels = await window.electronAPI.getLocalModels();
        select.innerHTML = '';

        const standardGroup = document.createElement('optgroup');
        standardGroup.label = 'Standard Models';

        const customGroup = document.createElement('optgroup');
        customGroup.label = 'Imported Custom Models';

        let activeModel = null;

        cachedLocalModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            const statusTag = m.isDownloaded ? `[Ready • ${m.sizeMB}]` : `[Available • ${m.sizeApprox}]`;
            opt.textContent = `${m.name} ${statusTag}`;

            if (m.isCustom) {
                customGroup.appendChild(opt);
            } else {
                standardGroup.appendChild(opt);
            }

            if (m.isActive) {
                activeModel = m;
            }
        });

        select.appendChild(standardGroup);
        if (customGroup.children.length > 0) {
            select.appendChild(customGroup);
        }

        if (activeModel) {
            select.value = activeModel.name;
        } else if (cachedLocalModels.length > 0) {
            select.value = cachedLocalModels[0].name;
            activeModel = cachedLocalModels[0];
        }

        updateLocalModelCard(activeModel || cachedLocalModels[0]);
    } catch (e) {
        console.error('Error refreshing local models:', e);
    }
}

function updateLocalModelCard(model) {
    const badge = document.getElementById('localModelStatusBadge');
    const downloadBtn = document.getElementById('btnDownloadStandardModel');
    const deleteBtn = document.getElementById('btnDeleteCurrentModel');

    if (!model) return;

    if (badge) {
        if (model.isDownloaded) {
            badge.className = 'status-badge ready';
            badge.textContent = `✓ Ready • ${model.sizeMB}`;
        } else {
            badge.className = 'status-badge pending';
            badge.textContent = 'Not downloaded';
        }
    }

    if (downloadBtn) {
        if (!model.isDownloaded && !model.isCustom) {
            downloadBtn.style.display = 'flex';
            const btnText = document.getElementById('downloadBtnText');
            if (btnText) btnText.textContent = `Download (${model.sizeApprox || ''})`;
        } else {
            downloadBtn.style.display = 'none';
        }
    }

    if (deleteBtn) {
        // Allow deleting downloaded or custom models
        deleteBtn.style.display = model.isDownloaded ? 'flex' : 'none';
    }
}

// ─── Setup Model Actions ─────────────────────────────────────────────────────
function setupModelActions() {
    const select = document.getElementById('localModelSelect');
    const importBtn = document.getElementById('btnImportLocalModel');
    const downloadBtn = document.getElementById('btnDownloadStandardModel');
    const deleteBtn = document.getElementById('btnDeleteCurrentModel');

    // On Model Dropdown change
    if (select) {
        select.addEventListener('change', async () => {
            const selectedName = select.value;
            const model = cachedLocalModels.find(m => m.name === selectedName);
            if (model) {
                await window.electronAPI.setLocalModel(model.path || model.name);
                updateLocalModelCard(model);
                updateDashboardEngineText('offline');
                showToast(`Local model set to ${model.name}`);
            }
        });
    }

    // Import Model Button (Native File Dialog)
    if (importBtn) {
        importBtn.addEventListener('click', async () => {
            try {
                showToast('Select a .bin Whisper model file...');
                const result = await window.electronAPI.importLocalModel();

                if (result.canceled) {
                    return;
                }

                if (result.success && result.model) {
                    showToast(`Imported model: ${result.model.name} (${result.model.sizeMB})`);
                    await refreshLocalModels();
                    updateDashboardEngineText('offline');
                } else {
                    showToast(`Import failed: ${result.error || 'Unknown error'}`, 'error');
                }
            } catch (err) {
                console.error('Import error:', err);
                showToast(`Import failed: ${err.message}`, 'error');
            }
        });
    }

    // Download Standard Model Button
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const selectedName = select.value;
            const progressContainer = document.getElementById('downloadProgressContainer');
            const progressFill = document.getElementById('downloadProgressFill');
            const progressPercent = document.getElementById('downloadProgressPercent');
            const progressLabel = document.getElementById('downloadProgressLabel');

            try {
                downloadBtn.disabled = true;
                if (progressContainer) progressContainer.style.display = 'block';
                if (progressFill) progressFill.style.width = '0%';
                if (progressPercent) progressPercent.textContent = '0%';
                if (progressLabel) progressLabel.textContent = `Downloading ${selectedName}...`;

                showToast(`Starting download for ${selectedName}...`);

                const res = await window.electronAPI.downloadModel(selectedName);

                if (res.success) {
                    showToast(`${selectedName} downloaded successfully!`);
                    if (progressContainer) progressContainer.style.display = 'none';
                    await refreshLocalModels();
                    updateDashboardEngineText('offline');
                } else {
                    throw new Error(res.error || 'Download failed');
                }
            } catch (err) {
                console.error('Download error:', err);
                showToast(`Download failed: ${err.message}`, 'error');
                if (progressContainer) progressContainer.style.display = 'none';
            } finally {
                downloadBtn.disabled = false;
            }
        });
    }

    // Listen for progress events from main
    if (window.electronAPI.onDownloadProgress) {
        window.electronAPI.onDownloadProgress(p => {
            const progressFill = document.getElementById('downloadProgressFill');
            const progressPercent = document.getElementById('downloadProgressPercent');
            const progressLabel = document.getElementById('downloadProgressLabel');

            if (progressFill) progressFill.style.width = p.percent + '%';
            if (progressPercent) progressPercent.textContent = p.percent + '%';
            if (progressLabel) progressLabel.textContent = `Downloading (${p.downloadedMB} / ${p.totalMB} MB)...`;
        });
    }

    // Delete Model Button
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const selectedName = select.value;
            const model = cachedLocalModels.find(m => m.name === selectedName);
            if (!model || !model.path) return;

            if (confirm(`Are you sure you want to delete ${model.name} to free disk space?`)) {
                try {
                    await window.electronAPI.deleteLocalModel(model.path);
                    showToast(`Deleted ${model.name}`);
                    await refreshLocalModels();
                    updateDashboardEngineText('offline');
                } catch (e) {
                    showToast(`Failed to delete: ${e.message}`, 'error');
                }
            }
        });
    }
}

// ─── Provider Change Listener ────────────────────────────────────────────────
function setupProviderChangeListener() {
    const providerSelect = document.getElementById('transcriptionProvider');
    if (providerSelect) {
        providerSelect.addEventListener('change', () => {
            updateProviderUI(providerSelect.value, true);
        });
    }
}

// ─── Window Controls ─────────────────────────────────────────────────────────
function setupWindowControls() {
    const minimizeBtn = document.getElementById('minimize-btn');
    const closeBtn = document.getElementById('close-btn');

    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            window.electronAPI.minimizeWindow();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.electronAPI.closeSettings();
        });
    }
}

// ─── Dashboard & Tab navigation ──────────────────────────────────────────────
async function loadLatestDictationSnippet() {
    const textEl = document.getElementById('dashLatestText');
    if (!textEl) return;
    try {
        const history = await window.electronAPI.getHistory();
        if (history && history.length > 0) {
            textEl.textContent = `"${history[0].text}"`;
            textEl.style.color = '#e4e4e7';
        } else {
            textEl.textContent = 'No transcriptions yet. Press your hotkey or click the microphone button above to speak!';
            textEl.style.color = '#71717a';
        }
    } catch (e) {
        console.error('Failed to load latest dictation:', e);
    }
}

function updateRecordingState(status) {
    const micBtn = document.getElementById('heroMicBtn');
    const prompt = document.getElementById('heroPromptText');
    const pill = document.getElementById('appStatusPill');
    const statusText = document.getElementById('appStatusText');

    if (status === 'recording') {
        if (micBtn) micBtn.className = 'hero-mic-btn recording';
        if (prompt) prompt.textContent = 'Listening... Click or release hotkey to finish';
        if (pill) pill.className = 'sidebar-status-pill recording';
        if (statusText) statusText.textContent = 'Recording...';
    } else if (status === 'processing') {
        if (micBtn) micBtn.className = 'hero-mic-btn processing';
        if (prompt) prompt.textContent = 'Transcribing audio...';
        if (pill) pill.className = 'sidebar-status-pill processing';
        if (statusText) statusText.textContent = 'Transcribing...';
    } else {
        if (micBtn) micBtn.className = 'hero-mic-btn';
        if (prompt) prompt.textContent = 'Click to start dictation';
        if (pill) pill.className = 'sidebar-status-pill';
        if (statusText) statusText.textContent = 'Ready';
        loadLatestDictationSnippet();
    }
}

// ─── Device Status Display ───────────────────────────────────────────────────
function updateDeviceStatusDisplay() {
    // Update hotkey display card
    const hotkeyInput = document.getElementById('hotkey');
    const currentHotkeyDisplay = document.getElementById('currentHotkeyDisplay');
    if (currentHotkeyDisplay && hotkeyInput && hotkeyInput.value) {
        currentHotkeyDisplay.textContent = hotkeyInput.value;
    }

    // Update mic display card from dropdown
    const micSelect = document.getElementById('microphone');
    const currentMicDisplay = document.getElementById('currentMicDisplay');
    if (currentMicDisplay && micSelect && micSelect.selectedIndex >= 0) {
        currentMicDisplay.textContent = micSelect.options[micSelect.selectedIndex]?.text || 'Default Microphone';
    }
}

function setupTabs() {
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    const panels = {
        app: document.getElementById('panel-app'),
        translate: document.getElementById('panel-translate'),
        snippets: document.getElementById('panel-snippets'),
        devices: document.getElementById('panel-devices'),
        settings: document.getElementById('panel-settings'),
        history: document.getElementById('panel-history')
    };

    function switchTab(target) {
        navItems.forEach(b => {
            if (b.dataset.tab === target) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        Object.entries(panels).forEach(([key, panel]) => {
            if (panel) {
                panel.style.display = key === target ? 'flex' : 'none';
            }
        });

        if (target === 'history') {
            loadAndRenderHistory();
        } else if (target === 'snippets') {
            loadAndRenderSnippets();
        } else if (target === 'app') {
            loadLatestDictationSnippet();
        } else if (target === 'devices') {
            updateDeviceStatusDisplay();
        }
    }

    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    const btnHeaderTestPopup = document.getElementById('btnHeaderTestPopup');
    if (btnHeaderTestPopup) {
        btnHeaderTestPopup.addEventListener('click', async () => {
            try {
                if (window.electronAPI && window.electronAPI.testShowIndicator) {
                    await window.electronAPI.testShowIndicator();
                    showToast('Popup overlay displayed for 5s');
                }
            } catch (e) {
                console.error(e);
            }
        });
    }

    // Device panel test popup button
    const btnDevicesTestPopup = document.getElementById('btnDevicesTestPopup');
    if (btnDevicesTestPopup) {
        btnDevicesTestPopup.addEventListener('click', async () => {
            try {
                if (window.electronAPI && window.electronAPI.testShowIndicator) {
                    await window.electronAPI.testShowIndicator();
                    showToast('Popup overlay displayed for 5s');
                }
            } catch (e) {
                console.error(e);
            }
        });
    }

    const btnResetPopupPos = document.getElementById('btnResetPopupPos');
    if (btnResetPopupPos) {
        btnResetPopupPos.addEventListener('click', () => {
            try {
                if (window.electronAPI && window.electronAPI.resetIndicatorPosition) {
                    window.electronAPI.resetIndicatorPosition();
                    showToast('Popup reset to bottom-center');
                }
            } catch (e) {
                console.error(e);
            }
        });
    }

    const btnCopyWaylandCmd = document.getElementById('btnCopyWaylandCmd');
    if (btnCopyWaylandCmd) {
        btnCopyWaylandCmd.addEventListener('click', () => {
            navigator.clipboard.writeText('curl -s http://127.0.0.1:49152/toggle');
            showToast('Copied Wayland IPC command!');
        });
    }

    // Quick navigation buttons
    const btnQuickTranslate = document.getElementById('btnQuickGoTranslate');
    if (btnQuickTranslate) {
        btnQuickTranslate.addEventListener('click', () => switchTab('translate'));
    }

    const btnQuickKeys = document.getElementById('btnQuickGoKeys');
    if (btnQuickKeys) {
        btnQuickKeys.addEventListener('click', () => switchTab('settings'));
    }

    const btnDashTranslateLatest = document.getElementById('dashTranslateLatestBtn');
    if (btnDashTranslateLatest) {
        btnDashTranslateLatest.addEventListener('click', async () => {
            const dashText = document.getElementById('dashLatestText')?.textContent?.trim();
            if (dashText && !dashText.startsWith('No transcriptions')) {
                const cleaned = dashText.replace(/^"|"$/g, '');
                const orig = document.getElementById('originalTextInput');
                if (orig) orig.value = cleaned;
            }
            switchTab('translate');
        });
    }

    // Wire shortcuts to settings
    const btnOpenSettings = document.getElementById('btnOpenSettingsPage');
    if (btnOpenSettings) {
        btnOpenSettings.addEventListener('click', () => switchTab('settings'));
    }

    const btnGoToEngine = document.getElementById('btnGoToSettingsEngine');
    if (btnGoToEngine) {
        btnGoToEngine.addEventListener('click', () => switchTab('settings'));
    }

    const btnGoToMic = document.getElementById('btnGoToSettingsMic');
    if (btnGoToMic) {
        btnGoToMic.addEventListener('click', () => switchTab('devices'));
    }

    const linkHistory = document.getElementById('dashViewHistoryLink');
    if (linkHistory) {
        linkHistory.addEventListener('click', () => switchTab('history'));
    }

    // Hero mic button click to toggle recording
    const heroMicBtn = document.getElementById('heroMicBtn');
    if (heroMicBtn) {
        heroMicBtn.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.toggleRecording) {
                window.electronAPI.toggleRecording();
            }
        });
    }

    // Copy latest snippet button
    const copyLatestBtn = document.getElementById('dashCopyLatestBtn');
    if (copyLatestBtn) {
        copyLatestBtn.addEventListener('click', () => {
            const textEl = document.getElementById('dashLatestText');
            if (!textEl) return;
            const textToCopy = textEl.textContent.replace(/^"|"$/g, '').trim();
            if (textToCopy && !textToCopy.startsWith('No transcriptions yet')) {
                navigator.clipboard.writeText(textToCopy);
                const label = document.getElementById('copyLatestLabel');
                if (label) label.textContent = 'Copied!';
                showToast('Copied to clipboard');
                setTimeout(() => {
                    if (label) label.textContent = 'Copy';
                }, 1500);
            }
        });
    }

    // Listen for tab navigation from main process
    if (window.electronAPI && window.electronAPI.onNavigateTab) {
        window.electronAPI.onNavigateTab(tab => {
            switchTab(tab);
        });
    }

    // Listen for live recording status changes
    if (window.electronAPI && window.electronAPI.onRecordingStatusChanged) {
        window.electronAPI.onRecordingStatusChanged(status => {
            updateRecordingState(status);
        });
    }
}

// ─── History feature ──────────────────────────────────────────────────────────
function formatHistoryDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `Today at ${timeStr}`;
    if (isYesterday) return `Yesterday at ${timeStr}`;

    return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric'
    }) + ` at ${timeStr}`;
}

async function loadAndRenderHistory() {
    const list = document.getElementById('historyList');
    const countEl = document.getElementById('historyCount');
    if (!list) return;

    let history = [];
    try {
        history = await window.electronAPI.getHistory();
    } catch (e) {
        console.error('Failed to load history:', e);
    }

    if (countEl) {
        const n = history.length;
        countEl.textContent = n === 1 ? '1 transcription' : `${n} transcriptions`;
    }

    Array.from(list.querySelectorAll('.history-entry, .history-empty-card')).forEach(el => el.remove());

    if (history.length === 0) {
        const card = document.createElement('div');
        card.className = 'history-entry history-empty-card';
        card.innerHTML = `<span class="history-entry-date">No transcriptions yet</span>`;
        list.appendChild(card);
        return;
    }

    history.forEach(entry => {
        const el = document.createElement('div');
        el.className = 'history-entry';
        el.dataset.id = entry.id;
        el.innerHTML = `
            <div class="history-entry-meta">
                <span class="history-entry-date">${formatHistoryDate(entry.timestamp)}</span>
                <span class="history-copy-hint">Copy</span>
            </div>
            <div class="history-entry-text">${escapeHtml(entry.text)}</div>
        `;

        el.addEventListener('click', () => copyHistoryEntry(el, entry.text));
        list.appendChild(el);
    });
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function copyHistoryEntry(el, text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard');
    }).catch(err => {
        showToast('Failed to copy', 'error');
    });
}

function setupClearHistory() {
    const btn = document.getElementById('clearHistoryBtn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        try {
            await window.electronAPI.clearHistory();
            await loadAndRenderHistory();
            showToast('History cleared');
        } catch (e) {
            showToast('Failed to clear history', 'error');
        }
    });
}

// ─── Hotkey Capture ──────────────────────────────────────────────────────────
function setupHotkeyCapture() {
    const hotkeyInput = document.getElementById('hotkey');
    if (!hotkeyInput) return;

    let isCapturing = false;
    let pressedKeys = new Set();
    let maxCombo = new Set();

    hotkeyInput.addEventListener('click', () => {
        if (!isCapturing) {
            isCapturing = true;
            pressedKeys.clear();
            maxCombo.clear();
            window.electronAPI.pauseHotkey();
            hotkeyInput.classList.add('capturing');
            hotkeyInput.value = 'Press key combination...';
        }
    });

    hotkeyInput.addEventListener('keydown', (e) => {
        if (!isCapturing) return;
        e.preventDefault();
        e.stopPropagation();

        if (e.code === 'Escape') {
            isCapturing = false;
            hotkeyInput.classList.remove('capturing');
            window.electronAPI.resumeHotkey();
            loadSettings();
            return;
        }

        const uiohookName = keyToUiohook[e.code];
        if (uiohookName) {
            pressedKeys.add(uiohookName);
            if (pressedKeys.size > maxCombo.size) {
                maxCombo = new Set(pressedKeys);
            }

            const displayName = Array.from(maxCombo)
                .map(part => keyDisplayNames[part] || part)
                .join(' + ');

            hotkeyInput.value = displayName;
        }
    });

    hotkeyInput.addEventListener('keyup', async (e) => {
        if (!isCapturing) return;
        e.preventDefault();
        e.stopPropagation();

        const uiohookName = keyToUiohook[e.code];
        if (uiohookName) pressedKeys.delete(uiohookName);

        if (pressedKeys.size === 0 && maxCombo.size > 0) {
            const finalKeys = Array.from(maxCombo);
            isCapturing = false;
            hotkeyInput.classList.remove('capturing');

            const combo = finalKeys.join('+');
            try {
                await window.electronAPI.setHotkey(combo);
                window.electronAPI.resumeHotkey();
                applyHotkeyToUI(combo);
                showToast(`Hotkey saved: ${formatHotkeyDisplay(combo)}`);
            } catch (err) {
                console.error('Error saving hotkey:', err);
                window.electronAPI.resumeHotkey();
            }
        }
    });

    hotkeyInput.addEventListener('blur', () => {
        if (isCapturing) {
            isCapturing = false;
            hotkeyInput.classList.remove('capturing');
            window.electronAPI.resumeHotkey();
            loadSettings();
        }
    });

    // Preset buttons click
    const presetBtns = document.querySelectorAll('.preset-btn[data-hotkey]');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const hotkey = btn.dataset.hotkey;
            try {
                await window.electronAPI.setHotkey(hotkey);
                applyHotkeyToUI(hotkey);
                showToast(`Hotkey set to ${formatHotkeyDisplay(hotkey)}`);
            } catch (e) {
                showToast(`Failed to set hotkey: ${e.message}`, 'error');
            }
        });
    });
}

// ─── Sarvam AI & Translation Studio ─────────────────────────────────────────

async function loadSarvamSettings() {
    try {
        const sarvam = await window.electronAPI.getSarvamSettings();
        if (!sarvam) return;

        const sarvamKeyInput = document.getElementById('sarvamApiKey');
        const sarvamSTTModel = document.getElementById('sarvamSTTModel');
        const sarvamSourceLang = document.getElementById('sarvamSourceLang');
        const sarvamDefaultLang = document.getElementById('sarvamDefaultTargetLang');
        const sarvamModelSelect = document.getElementById('sarvamModelSelect');
        const sarvamAutoToggle = document.getElementById('sarvamAutoTranslateToggle');
        const appTargetLangSelect = document.getElementById('appTargetLangSelect');

        if (sarvamKeyInput) sarvamKeyInput.value = sarvam.apiKey || '';
        if (sarvamSTTModel && sarvam.sttModel) sarvamSTTModel.value = sarvam.sttModel;
        if (sarvamSourceLang && sarvam.sourceLang) sarvamSourceLang.value = sarvam.sourceLang;
        if (sarvamDefaultLang && sarvam.targetLang) sarvamDefaultLang.value = sarvam.targetLang;
        if (sarvamModelSelect && sarvam.model) sarvamModelSelect.value = sarvam.model;
        if (sarvamAutoToggle) sarvamAutoToggle.checked = Boolean(sarvam.autoTranslate);
        if (appTargetLangSelect && sarvam.targetLang) appTargetLangSelect.value = sarvam.targetLang;

        updateSarvamKeyBadge(sarvam.apiKey);
    } catch (err) {
        console.error('Error loading Sarvam settings:', err);
    }
}

function updateSarvamKeyBadge(apiKey) {
    const badge = document.getElementById('sarvamKeyStatusBadge');
    if (!badge) return;
    if (apiKey && apiKey.trim().length > 0) {
        badge.textContent = '✓ Configured';
        badge.className = 'status-badge configured';
    } else {
        badge.textContent = 'Key Required';
        badge.className = 'status-badge';
    }
}

function setupSarvamAndStudio() {
    const sarvamKeyInput = document.getElementById('sarvamApiKey');
    const sarvamSTTModel = document.getElementById('sarvamSTTModel');
    const sarvamSourceLang = document.getElementById('sarvamSourceLang');
    const sarvamDefaultLang = document.getElementById('sarvamDefaultTargetLang');
    const sarvamModelSelect = document.getElementById('sarvamModelSelect');
    const sarvamAutoToggle = document.getElementById('sarvamAutoTranslateToggle');
    const appTargetLangSelect = document.getElementById('appTargetLangSelect');
    const btnTestSarvamApi = document.getElementById('btnTestSarvamApi');
    const sarvamTestResult = document.getElementById('sarvamTestResult');

    // Studio controls
    const originalInput = document.getElementById('originalTextInput');
    const translatedOutput = document.getElementById('translatedTextOutput');
    const btnStudioTranslate = document.getElementById('btnStudioTranslate');
    const translateSpinner = document.getElementById('translateSpinner');
    const translateBtnLabel = document.getElementById('translateBtnLabel');
    const translatedBoxLabel = document.getElementById('translatedBoxLabel');
    const btnUseLatestSpeech = document.getElementById('btnUseLatestSpeech');
    const btnClearOriginal = document.getElementById('btnClearOriginal');
    const btnCopyOriginal = document.getElementById('btnCopyOriginal');
    const btnCopyTranslated = document.getElementById('btnCopyTranslated');
    const btnTypeTranslated = document.getElementById('btnTypeTranslated');

    // 1. Auto-save Sarvam API Key
    const saveSarvamKey = async () => {
        const key = sarvamKeyInput?.value.trim() || '';
        try {
            await window.electronAPI.setSarvamSettings({ apiKey: key });
            updateSarvamKeyBadge(key);
            showToast(key ? 'Sarvam API key saved' : 'Sarvam API key cleared');
        } catch (e) {
            console.error('Failed to save Sarvam key:', e);
            showToast('Failed to save Sarvam key', 'error');
        }
    };

    if (sarvamKeyInput) {
        sarvamKeyInput.addEventListener('change', saveSarvamKey);
        sarvamKeyInput.addEventListener('blur', saveSarvamKey);
    }

    // 1b. STT Model change
    if (sarvamSTTModel) {
        sarvamSTTModel.addEventListener('change', async () => {
            const sttModel = sarvamSTTModel.value;
            try {
                await window.electronAPI.setSarvamSettings({ sttModel });
                updateDashboardEngineText(document.getElementById('transcriptionProvider')?.value);
                showToast(`STT model set to ${sttModel}`);
            } catch (e) {
                console.error('Failed to update STT model:', e);
            }
        });
    }

    // 1c. Spoken Language change
    if (sarvamSourceLang) {
        sarvamSourceLang.addEventListener('change', async () => {
            const sourceLang = sarvamSourceLang.value;
            try {
                await window.electronAPI.setSarvamSettings({ sourceLang });
                const langName = sarvamSourceLang.options[sarvamSourceLang.selectedIndex]?.text || sourceLang;
                showToast(`Spoken language: ${langName}`);
            } catch (e) {
                console.error('Failed to update spoken language:', e);
            }
        });
    }

    // 2. Default Target Language change in Settings
    if (sarvamDefaultLang) {
        sarvamDefaultLang.addEventListener('change', async () => {
            const lang = sarvamDefaultLang.value;
            try {
                await window.electronAPI.setSarvamSettings({ targetLang: lang });
                if (appTargetLangSelect) appTargetLangSelect.value = lang;
                const langName = sarvamDefaultLang.options[sarvamDefaultLang.selectedIndex]?.text || lang;
                showToast(`Default target language set to ${langName}`);
            } catch (e) {
                console.error('Failed to save target language:', e);
            }
        });
    }

    // 3. Target Language change in App Studio
    if (appTargetLangSelect) {
        appTargetLangSelect.addEventListener('change', async () => {
            const lang = appTargetLangSelect.value;
            try {
                await window.electronAPI.setSarvamSettings({ targetLang: lang });
                if (sarvamDefaultLang) sarvamDefaultLang.value = lang;
                const langName = appTargetLangSelect.options[appTargetLangSelect.selectedIndex]?.text || lang;
                showToast(`Translation language: ${langName}`);
            } catch (e) {
                console.error('Failed to update language:', e);
            }
        });
    }

    // 4. Model change
    if (sarvamModelSelect) {
        sarvamModelSelect.addEventListener('change', async () => {
            const model = sarvamModelSelect.value;
            try {
                await window.electronAPI.setSarvamSettings({ model });
                showToast(`Sarvam model set to ${model}`);
            } catch (e) {
                console.error('Failed to update model:', e);
            }
        });
    }

    // 5. Auto-translate checkbox toggle
    if (sarvamAutoToggle) {
        sarvamAutoToggle.addEventListener('change', async () => {
            const autoTranslate = sarvamAutoToggle.checked;
            try {
                await window.electronAPI.setSarvamSettings({ autoTranslate });
                showToast(autoTranslate ? 'Auto-translation enabled during speech' : 'Auto-translation disabled');
            } catch (e) {
                console.error('Failed to update auto-translate:', e);
            }
        });
    }

    // 6. Test Sarvam AI API button
    if (btnTestSarvamApi) {
        btnTestSarvamApi.addEventListener('click', async () => {
            const apiKey = sarvamKeyInput?.value.trim();
            if (!apiKey) {
                if (sarvamTestResult) {
                    sarvamTestResult.textContent = '❌ Please enter an API key first';
                    sarvamTestResult.style.color = '#ef4444';
                }
                showToast('Please enter an API key first', 'error');
                return;
            }

            if (sarvamTestResult) {
                sarvamTestResult.textContent = '⏳ Testing connection to Sarvam AI...';
                sarvamTestResult.style.color = '#fb923c';
            }

            try {
                const targetLang = sarvamDefaultLang?.value || 'hi-IN';
                const res = await window.electronAPI.translateText({
                    text: 'Hello! Antigravity Voice Assistant is connected to Sarvam AI.',
                    targetLang
                });

                if (res && res.translatedText) {
                    if (sarvamTestResult) {
                        sarvamTestResult.textContent = `✓ Success: "${res.translatedText}"`;
                        sarvamTestResult.style.color = '#22c55e';
                    }
                    updateSarvamKeyBadge(apiKey);
                    showToast('Sarvam AI connected successfully!');
                } else {
                    const errMsg = res?.error || 'Translation returned empty response';
                    if (sarvamTestResult) {
                        sarvamTestResult.textContent = `❌ ${errMsg}`;
                        sarvamTestResult.style.color = '#ef4444';
                    }
                    showToast(errMsg, 'error');
                }
            } catch (err) {
                if (sarvamTestResult) {
                    sarvamTestResult.textContent = `❌ ${err.message || 'API request failed'}`;
                    sarvamTestResult.style.color = '#ef4444';
                }
                showToast(`Test failed: ${err.message}`, 'error');
            }
        });
    }

    // 7. Translation Studio: "Translate" button
    if (btnStudioTranslate) {
        btnStudioTranslate.addEventListener('click', async () => {
            const text = originalInput?.value.trim();
            if (!text) {
                showToast('Please enter or dictate text to translate', 'error');
                originalInput?.focus();
                return;
            }

            const targetLang = appTargetLangSelect?.value || 'hi-IN';

            // Loading state
            btnStudioTranslate.disabled = true;
            if (translateSpinner) translateSpinner.style.display = 'inline-block';
            if (translateBtnLabel) translateBtnLabel.textContent = 'Translating...';

            try {
                const result = await window.electronAPI.translateText({
                    text,
                    targetLang
                });

                if (result && result.translatedText) {
                    if (translatedOutput) {
                        translatedOutput.value = result.translatedText;
                    }
                    if (translatedBoxLabel) {
                        const langOpt = appTargetLangSelect?.options[appTargetLangSelect.selectedIndex]?.text || targetLang;
                        translatedBoxLabel.textContent = `Translated: ${langOpt}`;
                    }
                    showToast('Translation completed!');
                } else {
                    const errMsg = result?.error || 'Translation returned empty result';
                    showToast(`Translation failed: ${errMsg}`, 'error');
                    if (translatedOutput) {
                        translatedOutput.value = `[Error: ${errMsg}]`;
                    }
                }
            } catch (err) {
                console.error('Translation error:', err);
                showToast(`Translation failed: ${err.message || 'Unknown error'}`, 'error');
                if (translatedOutput) {
                    translatedOutput.value = `[Error: ${err.message || 'Translation failed'}]`;
                }
            } finally {
                btnStudioTranslate.disabled = false;
                if (translateSpinner) translateSpinner.style.display = 'none';
                if (translateBtnLabel) translateBtnLabel.textContent = '✨ Translate';
            }
        });
    }

    // 8. Translation Studio: "Use Latest Speech" button
    if (btnUseLatestSpeech) {
        btnUseLatestSpeech.addEventListener('click', async () => {
            try {
                const history = await window.electronAPI.getHistory();
                if (history && history.length > 0 && history[0].text) {
                    if (originalInput) originalInput.value = history[0].text;
                    showToast('Inserted latest recorded speech');
                } else {
                    showToast('No speech history found yet', 'error');
                }
            } catch (err) {
                console.error('Failed to get history:', err);
            }
        });
    }

    // 9. Clear Original Input
    if (btnClearOriginal) {
        btnClearOriginal.addEventListener('click', () => {
            if (originalInput) originalInput.value = '';
            showToast('Original text cleared');
        });
    }

    // 10. Copy Original text
    if (btnCopyOriginal) {
        btnCopyOriginal.addEventListener('click', async () => {
            const text = originalInput?.value;
            if (!text) {
                showToast('Nothing to copy', 'error');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                showToast('Original text copied to clipboard!');
            } catch (e) {
                showToast('Failed to copy', 'error');
            }
        });
    }

    // 11. Copy Translated text
    if (btnCopyTranslated) {
        btnCopyTranslated.addEventListener('click', async () => {
            const text = translatedOutput?.value;
            if (!text) {
                showToast('No translated text to copy', 'error');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                showToast('Translated text copied to clipboard!');
            } catch (e) {
                showToast('Failed to copy', 'error');
            }
        });
    }

    // 12. Type at Cursor
    if (btnTypeTranslated) {
        btnTypeTranslated.addEventListener('click', async () => {
            const text = translatedOutput?.value?.trim();
            if (!text || text.startsWith('[Error:')) {
                showToast('Please translate text first before typing at cursor', 'error');
                return;
            }
            try {
                showToast('Typing translated text at cursor...');
                await window.electronAPI.typeAtCursor(text);
            } catch (err) {
                console.error('Error typing at cursor:', err);
                showToast('Failed to type at cursor', 'error');
            }
        });
    }

    // 13. Auto-update Translation Studio when live dictation finishes with translation
    if (window.electronAPI.onTranslationComplete) {
        window.electronAPI.onTranslationComplete((data) => {
            if (data && data.original) {
                if (originalInput) originalInput.value = data.original;
            }
            if (data && data.translated) {
                if (translatedOutput) translatedOutput.value = data.translated;
                if (translatedBoxLabel) {
                    translatedBoxLabel.textContent = `Translated: ${data.targetLang || 'Sarvam AI'}`;
                }
            }
        });
    }
}

// ─── Snippets Manager ────────────────────────────────────────────────────────
let cachedSnippets = [];

async function loadAndRenderSnippets() {
    try {
        if (window.electronAPI && window.electronAPI.getSnippets) {
            cachedSnippets = await window.electronAPI.getSnippets() || [];
        }
    } catch (e) {
        console.error('Error loading snippets:', e);
        cachedSnippets = [];
    }
    const searchInput = document.getElementById('snippetSearchInput');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    renderSnippetsList(query);
}

function escapeSnippetHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function highlightSnippetVariables(text) {
    const escaped = escapeSnippetHtml(text);
    return escaped.replace(/(\{(date|time|datetime|year|clipboard)\})/gi, '<span class="var-tag-highlight">$1</span>');
}

function renderSnippetsList(query = '') {
    const container = document.getElementById('snippetsListContainer');
    const countBadge = document.getElementById('snippetsCountBadge');
    if (!container) return;

    let list = cachedSnippets;
    if (query) {
        list = list.filter(s => 
            (s.trigger && s.trigger.toLowerCase().includes(query)) ||
            (s.expansion && s.expansion.toLowerCase().includes(query))
        );
    }

    if (countBadge) {
        countBadge.textContent = `${list.length} snippet${list.length === 1 ? '' : 's'}`;
    }

    if (list.length === 0) {
        container.innerHTML = `
            <div class="snippets-empty-state">
                ${query ? 'No snippets match your search.' : 'No snippets yet. Click "+ Add Snippet" above to create your first voice shortcut!'}
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(item => {
        const isEnabled = item.enabled !== false;
        return `
            <div class="snippet-card-item ${isEnabled ? '' : 'disabled'}" data-id="${escapeSnippetHtml(item.id)}">
                <div class="snippet-card-top">
                    <div class="snippet-trigger-badge">
                        <span>🗣️</span>
                        <span>"${escapeSnippetHtml(item.trigger)}"</span>
                    </div>
                    <div class="snippet-actions-row">
                        <button type="button" class="snippet-action-btn btn-toggle-snippet" title="${isEnabled ? 'Disable snippet' : 'Enable snippet'}">
                            <span>${isEnabled ? '✓ Enabled' : '○ Disabled'}</span>
                        </button>
                        <button type="button" class="snippet-action-btn btn-edit-snippet" title="Edit snippet">
                            <span>✏️ Edit</span>
                        </button>
                        <button type="button" class="snippet-action-btn danger btn-delete-snippet" title="Delete snippet">
                            <span>🗑️</span>
                        </button>
                    </div>
                </div>
                <div class="snippet-expansion-preview">${highlightSnippetVariables(item.expansion || '')}</div>
            </div>
        `;
    }).join('');

    // Attach actions
    container.querySelectorAll('.snippet-card-item').forEach(card => {
        const id = card.dataset.id;
        const snippet = cachedSnippets.find(s => s.id === id);
        if (!snippet) return;

        const toggleBtn = card.querySelector('.btn-toggle-snippet');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const newStatus = snippet.enabled === false ? true : false;
                    await window.electronAPI.toggleSnippet(id, newStatus);
                    snippet.enabled = newStatus;
                    renderSnippetsList(query);
                    showToast(newStatus ? 'Snippet enabled' : 'Snippet disabled');
                } catch (err) {
                    showToast('Failed to toggle snippet', 'error');
                }
            });
        }

        const editBtn = card.querySelector('.btn-edit-snippet');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openSnippetEditor(snippet);
            });
        }

        const deleteBtn = card.querySelector('.btn-delete-snippet');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Delete snippet "${snippet.trigger}"?`)) {
                    try {
                        await window.electronAPI.deleteSnippet(id);
                        cachedSnippets = cachedSnippets.filter(s => s.id !== id);
                        renderSnippetsList(query);
                        showToast('Snippet deleted');
                    } catch (err) {
                        showToast('Failed to delete snippet', 'error');
                    }
                }
            });
        }
    });
}

function openSnippetEditor(snippet = null) {
    const editorCard = document.getElementById('snippetEditorCard');
    const editorTitle = document.getElementById('snippetEditorTitle');
    const editId = document.getElementById('snippetEditId');
    const triggerInput = document.getElementById('snippetTriggerInput');
    const expansionInput = document.getElementById('snippetExpansionInput');

    if (!editorCard) return;

    if (snippet) {
        if (editorTitle) editorTitle.textContent = 'Edit Voice Snippet';
        if (editId) editId.value = snippet.id;
        if (triggerInput) triggerInput.value = snippet.trigger || '';
        if (expansionInput) expansionInput.value = snippet.expansion || '';
    } else {
        if (editorTitle) editorTitle.textContent = 'Add Voice Snippet';
        if (editId) editId.value = '';
        if (triggerInput) triggerInput.value = '';
        if (expansionInput) expansionInput.value = '';
    }

    editorCard.style.display = 'block';
    if (triggerInput) triggerInput.focus();
}

function closeSnippetEditor() {
    const editorCard = document.getElementById('snippetEditorCard');
    if (editorCard) editorCard.style.display = 'none';
}

function setupSnippetsManager() {
    const btnOpenAdd = document.getElementById('btnOpenAddSnippet');
    if (btnOpenAdd) {
        btnOpenAdd.addEventListener('click', () => openSnippetEditor(null));
    }

    const btnCancel = document.getElementById('btnCancelSnippet');
    if (btnCancel) {
        btnCancel.addEventListener('click', closeSnippetEditor);
    }

    const btnCancelForm = document.getElementById('btnCancelSnippetForm');
    if (btnCancelForm) {
        btnCancelForm.addEventListener('click', closeSnippetEditor);
    }

    // Save Snippet
    const btnSave = document.getElementById('btnSaveSnippet');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const editId = document.getElementById('snippetEditId')?.value || '';
            const trigger = document.getElementById('snippetTriggerInput')?.value.trim();
            const expansion = document.getElementById('snippetExpansionInput')?.value || '';

            if (!trigger) {
                showToast('Please enter a voice trigger phrase', 'error');
                document.getElementById('snippetTriggerInput')?.focus();
                return;
            }

            try {
                const snippetPayload = {
                    id: editId || undefined,
                    trigger,
                    expansion,
                    enabled: true
                };
                await window.electronAPI.saveSnippet(snippetPayload);
                closeSnippetEditor();
                await loadAndRenderSnippets();
                showToast('Snippet saved successfully');
            } catch (err) {
                showToast(err.message || 'Error saving snippet', 'error');
            }
        });
    }

    // Dynamic variable pills insertion
    const varPills = document.querySelectorAll('.var-pill-btn');
    varPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const token = pill.dataset.var;
            const textarea = document.getElementById('snippetExpansionInput');
            if (!textarea || !token) return;

            const start = textarea.selectionStart || 0;
            const end = textarea.selectionEnd || 0;
            const val = textarea.value;
            textarea.value = val.substring(0, start) + token + val.substring(end);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + token.length;
        });
    });

    // Real-time search filter
    const searchInput = document.getElementById('snippetSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderSnippetsList(searchInput.value.trim().toLowerCase());
        });
    }
}

// ─── Spoken Punctuation & Formatting ─────────────────────────────────────────
async function setupSpokenPunctuation() {
    const toggle = document.getElementById('spokenPunctuationToggle');
    const label = document.getElementById('spokenPunctuationLabel');
    if (!toggle) return;

    try {
        if (window.electronAPI && window.electronAPI.getSpokenPunctuation) {
            const enabled = await window.electronAPI.getSpokenPunctuation();
            toggle.checked = enabled !== false;
            if (label) label.textContent = toggle.checked ? 'Enabled' : 'Disabled';
        }
    } catch (e) {
        toggle.checked = true;
    }

    toggle.addEventListener('change', async () => {
        const isChecked = toggle.checked;
        if (label) label.textContent = isChecked ? 'Enabled' : 'Disabled';
        try {
            if (window.electronAPI && window.electronAPI.setSpokenPunctuation) {
                await window.electronAPI.setSpokenPunctuation(isChecked);
                showToast(isChecked ? 'Spoken punctuation enabled' : 'Spoken punctuation disabled');
            }
        } catch (e) {
            showToast('Failed to update spoken punctuation setting', 'error');
        }
    });
}

// ─── Initialize ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupWindowControls();
    setupTabs();
    setupSnippetsManager();
    setupSpokenPunctuation();
    setupPasswordToggles();
    setupProviderChangeListener();
    setupModelActions();
    setupClearHistory();
    setupHotkeyCapture();
    setupModeSelection();
    setupSarvamAndStudio();

    // Live hotkey sync from main process
    if (window.electronAPI.onHotkeyChanged) {
        window.electronAPI.onHotkeyChanged((newHotkey) => {
            applyHotkeyToUI(newHotkey);
        });
    }

    // Live history update
    if (window.electronAPI.onHistoryUpdated) {
        window.electronAPI.onHistoryUpdated(() => {
            loadLatestDictationSnippet();
            const historyPanel = document.getElementById('panel-history');
            if (historyPanel && historyPanel.style.display !== 'none') {
                loadAndRenderHistory();
            }
        });
    }

    // Live dictation streaming text on dashboard
    if (window.electronAPI.onLiveTranscriptionUpdate) {
        window.electronAPI.onLiveTranscriptionUpdate(text => {
            const textEl = document.getElementById('dashLatestText');
            if (textEl) {
                textEl.textContent = `"${text}"`;
                textEl.style.color = '#e4e4e7';
            }
        });
    }

    // Surface errors as toasts
    if (window.electronAPI.onError) {
        window.electronAPI.onError(msg => {
            showToast(msg, 'error');
        });
    }

    // Microphone change listener
    const micSelect = document.getElementById('microphone');
    if (micSelect) {
        micSelect.addEventListener('change', async () => {
            try {
                await window.electronAPI.setMicrophone(micSelect.value);
                const selectedText = micSelect.selectedIndex >= 0 ? micSelect.options[micSelect.selectedIndex].text : 'Default Microphone';
                const dashMic = document.getElementById('dashMicName');
                if (dashMic) dashMic.textContent = selectedText;
                const currentMicDisplay = document.getElementById('currentMicDisplay');
                if (currentMicDisplay) currentMicDisplay.textContent = selectedText;
                showToast('Changes saved');
            } catch (e) {
                console.error('Error saving microphone:', e);
            }
        });
    }

    // ESC to hide window
    document.addEventListener('keydown', e => {
        const hotkeyInput = document.getElementById('hotkey');
        if (e.key === 'Escape' && document.activeElement !== hotkeyInput) {
            window.electronAPI.closeSettings();
        }
    });

    // External links
    document.addEventListener('click', e => {
        if (e.target.tagName === 'A' && e.target.href) {
            e.preventDefault();
            window.electronAPI.openExternal(e.target.href);
        }
    });
});
