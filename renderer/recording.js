// Audio recording functionality with real-time streaming speech recognition
let audioCtx = null;
let scriptProcessor = null;
let audioStream = null;
let analyser = null;
let recordedPCMChunks = [];
let waveformInterval = null;
let liveSliceInterval = null;
let isSpeakingDetected = false;
let isRecordingActive = false;

// Helper: Encode Int16 PCM samples to valid 16kHz Mono WAV buffer
function encodeWAV(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM subchunk size
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono (1 channel)
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, sampleRate * 2, true); // Byte rate (16000 * 1 * 2)
  view.setUint16(32, 2, true); // Block align (1 * 2)
  view.setUint16(34, 16, true); // 16 bits per sample
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  const pcmBytes = new Int16Array(buffer, 44);
  pcmBytes.set(samples);
  return buffer;
}

// Flatten array of Int16Array chunks into a single Int16Array
function flattenChunks(chunks) {
  let totalLength = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalLength += chunks[i].length;
  }
  const result = new Int16Array(totalLength);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    result.set(chunks[i], offset);
    offset += chunks[i].length;
  }
  return result;
}

async function startRecording() {
  try {
    if (isRecordingActive) return;
    isRecordingActive = true;
    recordedPCMChunks = [];
    isSpeakingDetected = false;

    // Get selected microphone from settings
    const micSelect = document.getElementById('microphone');
    const selectedDeviceId = micSelect ? micSelect.value : 'default';

    const constraints = {
      audio: selectedDeviceId === 'default' ? {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true
      } : {
        deviceId: { exact: selectedDeviceId },
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true
      }
    };

    audioStream = await navigator.mediaDevices.getUserMedia(constraints);

    // AudioContext at native 16kHz
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass({ sampleRate: 16000 });
    const source = audioCtx.createMediaStreamSource(audioStream);

    // Analyser node for live waveform visualization
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);

    // ScriptProcessor to capture raw 16kHz PCM samples directly
    // Buffer size 4096 = ~256ms per buffer at 16kHz
    scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
    scriptProcessor.onaudioprocess = (e) => {
      if (!isRecordingActive) return;
      const input = e.inputBuffer.getChannelData(0);
      const len = input.length;
      const pcm16 = new Int16Array(len);
      let sumSquares = 0;

      for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        sumSquares += s * s;
      }
      recordedPCMChunks.push(pcm16);

      // Lightweight VAD check
      const rms = Math.sqrt(sumSquares / len);
      if (rms > 0.012) {
        isSpeakingDetected = true;
      }

      // Mute audio output to prevent audio feedback
      const output = e.outputBuffer.getChannelData(0);
      output.fill(0);
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(audioCtx.destination);

    // Live Waveform visualizer at 30fps
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    waveformInterval = setInterval(() => {
      if (!analyser || !isRecordingActive) return;
      analyser.getByteTimeDomainData(dataArray);
      window.electronAPI.sendWaveformData(Array.from(dataArray));
    }, 33);

    // Live Streaming Speech Slice Emitter (every ~2.2s for live cursor typing)
    // Packages speech recorded so far as a valid 16kHz WAV for instant recognition
    let lastSliceSampleCount = 0;
    liveSliceInterval = setInterval(() => {
      if (!isRecordingActive || !isSpeakingDetected) return;

      const totalSamples = recordedPCMChunks.reduce((acc, c) => acc + c.length, 0);
      // Need at least ~1.5s of audio (24,000 samples) and new data since last slice
      if (totalSamples < 24000 || totalSamples <= lastSliceSampleCount) return;

      try {
        lastSliceSampleCount = totalSamples;
        const fullPCM = flattenChunks(recordedPCMChunks);
        const wavBuffer = encodeWAV(fullPCM, 16000);
        window.electronAPI.sendLiveAudioSlice(Array.from(new Uint8Array(wavBuffer)));
      } catch (err) {
        console.warn('Live slice emission error:', err);
      }
    }, 2200);

  } catch (error) {
    isRecordingActive = false;
    console.error('Recording initialization error:', error);
    window.electronAPI.sendAudioError(error.message);
  }
}

function stopRecording() {
  if (!isRecordingActive) return;
  isRecordingActive = false;

  if (liveSliceInterval) {
    clearInterval(liveSliceInterval);
    liveSliceInterval = null;
  }
  if (waveformInterval) {
    clearInterval(waveformInterval);
    waveformInterval = null;
  }

  try {
    // Encode complete recording as 16kHz Mono WAV
    const fullPCM = flattenChunks(recordedPCMChunks);
    const wavBuffer = encodeWAV(fullPCM, 16000);
    const uint8Array = new Uint8Array(wavBuffer);

    // Send final WAV audio data to main process
    window.electronAPI.sendAudioData(Array.from(uint8Array));
  } catch (err) {
    console.error('Error finalising audio recording:', err);
    window.electronAPI.sendAudioError(err.message);
  } finally {
    if (scriptProcessor) {
      try { scriptProcessor.disconnect(); } catch (e) {}
      scriptProcessor = null;
    }
    if (audioCtx) {
      try { audioCtx.close(); } catch (e) {}
      audioCtx = null;
    }
    if (audioStream) {
      try {
        audioStream.getTracks().forEach(track => track.stop());
      } catch (e) {}
      audioStream = null;
    }
    analyser = null;
    recordedPCMChunks = [];
  }
}

// Listen for IPC messages
if (window.electronAPI) {
  window.electronAPI.onStartRecording(startRecording);
  window.electronAPI.onStopRecording(stopRecording);
}
