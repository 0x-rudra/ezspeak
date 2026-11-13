const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Config = require('./config');
const Logger = require('./logger');
const LocalTranscriptionService = require('./localTranscription');

/**
 * Post with retry, rebuilding the FormData on each attempt.
 * formDataFactory is a function () => { form, headers } so the stream is fresh per attempt.
 */
async function postWithRetry(url, formDataFactory, axiosConfig, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    const { form, headers } = formDataFactory();
    try {
      return await axios.post(url, form, { ...axiosConfig, headers: { ...headers, ...axiosConfig.headers } });
    } catch (err) {
      attempt++;
      const status = err.response ? err.response.status : null;
      const isRetryable = status === 429 || (status >= 500 && status <= 599) || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
      if (!isRetryable || attempt >= maxRetries) {
        throw err;
      }
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      Logger.warn(`[Transcription] Call returned ${status || err.code}. Retrying attempt ${attempt}/${maxRetries} after ${backoffMs}ms...`);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
}

class TranscriptionService {
  constructor() {
    this.localService = new LocalTranscriptionService();
    Logger.log('TranscriptionService initialized with Sarvam AI STT & Local Whisper');
  }

  /**
   * Main transcribe entrypoint - routes to local offline whisper or Sarvam AI
   * @param {string} audioFilePath - Path to the audio file
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribe(audioFilePath) {
    const transcriptionMode = Config.getTranscriptionMode();
    Logger.log(`Transcription mode: ${transcriptionMode}`);

    if (transcriptionMode === 'offline') {
      return await this.transcribeOffline(audioFilePath);
    } else {
      return await this.transcribeSarvam(audioFilePath);
    }
  }

  /**
   * Transcribe audio file using local Whisper model (offline mode)
   * @param {string} audioFilePath - Path to the audio file
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribeOffline(audioFilePath) {
    Logger.log('Using local offline transcription...');
    return await this.localService.transcribe(audioFilePath);
  }

  /**
   * Transcribe audio file using Sarvam AI Speech-to-Text API
   * @param {string} audioFilePath - Path to the audio file
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribeSarvam(audioFilePath) {
    const apiUrl = 'https://api.sarvam.ai/speech-to-text';
    const apiKey = (Config.getSarvamApiKey() || '').trim();
    const modelName = Config.getSarvamSTTModel() || 'saaras:v2';
    const sourceLang = Config.getSarvamSourceLang() || 'en-IN';

    if (!apiKey) {
      Logger.error('Sarvam AI API key missing');
      throw new Error('Sarvam AI API key not configured. Please enter your Sarvam AI API key in Settings.');
    }

    if (!fs.existsSync(audioFilePath)) {
      Logger.error('Audio file not found:', audioFilePath);
      throw new Error('Audio file not found');
    }

    const stats = fs.statSync(audioFilePath);
    const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB limit
    if (stats.size > MAX_AUDIO_BYTES) {
      Logger.error(`Audio file too large: ${(stats.size / (1024 * 1024)).toFixed(1)}MB exceeds 25MB limit`);
      throw new Error(`Audio file exceeds 25MB limit (${(stats.size / (1024 * 1024)).toFixed(1)}MB). Please dictate in shorter segments.`);
    }

    Logger.log(`Audio file: ${path.basename(audioFilePath)}, Size: ${(stats.size / 1024).toFixed(2)} KB`);
    Logger.log(`Target: Sarvam AI STT (${modelName}) at ${apiUrl}`);

    try {
      const fileExtension = path.extname(audioFilePath).toLowerCase();
      const mimeType = fileExtension === '.wav' ? 'audio/wav' :
                       fileExtension === '.webm' ? 'audio/webm' :
                       fileExtension === '.mp3' ? 'audio/mpeg' :
                       fileExtension === '.m4a' ? 'audio/m4a' :
                       fileExtension === '.ogg' ? 'audio/ogg' :
                       'audio/webm';

      // Factory: build a fresh FormData+stream for each attempt (consumed streams cannot be reused)
      const makeForm = () => {
        const form = new FormData();
        form.append('file', fs.createReadStream(audioFilePath), {
          filename: path.basename(audioFilePath),
          contentType: mimeType
        });
        form.append('model', modelName);
        if (sourceLang && sourceLang !== 'auto') {
          form.append('language_code', sourceLang);
        }
        form.append('mode', 'transcribe');
        const headers = {
          ...form.getHeaders(),
          'api-subscription-key': apiKey
        };
        return { form, headers };
      };

      Logger.log('Sending request to Sarvam AI STT...');
      const response = await postWithRetry(apiUrl, makeForm, {
        timeout: 60000 // 60 second timeout with exponential backoff retry
      });

      Logger.success('Received response from Sarvam AI');

      let transcribedText = '';
      if (typeof response.data === 'string') {
        try {
          const parsed = JSON.parse(response.data);
          transcribedText = parsed.transcript || parsed.text || response.data;
        } catch (e) {
          transcribedText = response.data;
        }
      } else if (response.data && typeof response.data === 'object') {
        transcribedText = response.data.transcript || response.data.text || response.data.transcription || JSON.stringify(response.data);
      }

      transcribedText = String(transcribedText || '').trim();
      Logger.transcription('ACTUAL TRANSCRIPTION TEXT:', `"${transcribedText}"`);

      // Clean up temp audio file
      try {
        fs.unlinkSync(audioFilePath);
        Logger.log('Temp audio file deleted');
      } catch (e) {
        Logger.warn('Error deleting temp audio file:', e.message);
      }

      return transcribedText;
    } catch (error) {
      // Retain audio file on cloud error so user audio is not permanently lost
      Logger.warn(`Sarvam transcription error. Retaining audio file at: ${audioFilePath}`);

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        const msg = data?.error?.message || data?.error || data?.message || data?.detail || (typeof data === 'string' ? data : error.message);

        if (status === 401 || status === 403) {
          throw new Error(`[Sarvam AI] Invalid or expired API key. Please check your Sarvam AI key in Settings.`);
        } else if (status === 429) {
          throw new Error(`[Sarvam AI] Rate limit or quota exceeded. Please try again later or check billing.`);
        } else if (status === 400) {
          throw new Error(`[Sarvam AI] Audio could not be processed: ${msg}`);
        } else if (status === 404) {
          throw new Error(`[Sarvam AI] Model '${modelName}' or endpoint not found (${apiUrl}).`);
        } else if (status >= 500) {
          throw new Error(`[Sarvam AI] Server error (${status}). Please try again shortly.`);
        } else {
          throw new Error(`[Sarvam AI] Error ${status}: ${msg}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error(`[Sarvam AI] Request timed out. Check your internet connection and try again.`);
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error(`Could not connect to Sarvam AI (${apiUrl}). Check network connection.`);
      } else {
        throw new Error(`Transcription failed: ${error.message}`);
      }
    }
  }

  // Alias for backward compatibility
  async transcribeCloudBYOK(audioFilePath) {
    return await this.transcribeSarvam(audioFilePath);
  }

}

module.exports = TranscriptionService;
