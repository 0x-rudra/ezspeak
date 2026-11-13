const EventEmitter = require('events');
const Logger = require('./logger');

/**
 * Audio Dictation State Machine
 * Transitions: idle -> listening -> transcribing -> inserting -> idle
 */
class DictationStateMachine extends EventEmitter {
  constructor() {
    super();
    this.states = ['idle', 'listening', 'transcribing', 'inserting'];
    this.currentState = 'idle';
  }

  getState() {
    return this.currentState;
  }

  transition(nextState) {
    if (!this.states.includes(nextState)) {
      throw new Error(`Invalid state transition to: ${nextState}`);
    }
    const prevState = this.currentState;
    this.currentState = nextState;
    Logger.log(`[StateMachine] ${prevState.toUpperCase()} -> ${nextState.toUpperCase()}`);
    this.emit('state-changed', { prev: prevState, current: nextState });
  }

  setIdle() { this.transition('idle'); }
  setListening() { this.transition('listening'); }
  setTranscribing() { this.transition('transcribing'); }
  setInserting() { this.transition('inserting'); }
}

/**
 * Sequential Transcription Queue
 * Guarantees that audio chunks and typing operations never interleave or clash.
 */
class TranscriptionQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const { task, resolve, reject } = this.queue.shift();

    try {
      const result = await task();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }

  clear() {
    this.queue = [];
    this.isProcessing = false;
  }

  size() {
    return this.queue.length;
  }
}

/**
 * Circular Pre-Roll Audio Buffer (~500ms)
 * Prevents clipping the first syllable when user starts speaking immediately.
 */
class PreRollAudioBuffer {
  constructor(maxChunks = 3) {
    this.maxChunks = maxChunks;
    this.buffer = [];
  }

  push(chunk) {
    this.buffer.push(chunk);
    if (this.buffer.length > this.maxChunks) {
      this.buffer.shift();
    }
  }

  flush() {
    const data = [...this.buffer];
    this.buffer = [];
    return data;
  }

  clear() {
    this.buffer = [];
  }
}

/**
 * Simple Energy-based Voice Activity Detector (VAD)
 */
class SimpleAudioVAD {
  static isSilent(audioBuffer, thresholdRms = 0.015) {
    if (!audioBuffer || audioBuffer.length === 0) return true;
    let sum = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
      const sample = (audioBuffer[i] - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / audioBuffer.length);
    return rms < thresholdRms;
  }
}

module.exports = {
  DictationStateMachine,
  TranscriptionQueue,
  PreRollAudioBuffer,
  SimpleAudioVAD
};

