const axios = require('axios');
const Config = require('./config');
const Logger = require('./logger');

const SARVAM_LANGUAGES = [
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'en-IN', name: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳' },
  { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  { code: 'od-IN', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', flag: '🇮🇳' }
];

class TranslationService {
  constructor() {
    this.apiUrl = 'https://api.sarvam.ai/translate';
  }

  static getSupportedLanguages() {
    return SARVAM_LANGUAGES;
  }

  /**
   * Translate text using Sarvam AI Mayura Translation API
   * @param {string} text - The input text to translate
   * @param {object} options - Optional overrides { apiKey, sourceLang, targetLang, model }
   */
  async translate(text, options = {}) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('No text provided for translation');
    }

    const apiKey = (options.apiKey || Config.getSarvamApiKey() || '').trim();
    if (!apiKey) {
      throw new Error('Sarvam AI API key is not configured. Please add your API key in Settings.');
    }

    const sourceLang = options.sourceLang || Config.getSarvamSourceLang() || 'en-IN';
    const targetLang = options.targetLang || Config.getSarvamTargetLang() || 'hi-IN';
    const model = options.model || Config.getSarvamModel() || 'mayura:v1';

    Logger.log(`[Sarvam AI] Translating (${sourceLang} -> ${targetLang}): "${text.substring(0, 60)}..."`);

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          input: text.trim(),
          source_language_code: sourceLang === 'auto' ? 'en-IN' : sourceLang,
          target_language_code: targetLang,
          model: model
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': apiKey
          },
          timeout: 20000
        }
      );

      if (response.data && response.data.translated_text) {
        const translated = response.data.translated_text.trim();
        Logger.success(`[Sarvam AI] Translation successful: "${translated.substring(0, 60)}..."`);
        return {
          success: true,
          originalText: text.trim(),
          translatedText: translated,
          sourceLang,
          targetLang
        };
      } else {
        throw new Error('Unexpected response format from Sarvam AI');
      }
    } catch (error) {
      let errMsg = error.message;
      if (error.response?.data) {
        const d = error.response.data;
        errMsg = d.message || d.detail || (typeof d === 'string' ? d : JSON.stringify(d));
      }
      Logger.error('[Sarvam AI] Translation failed:', errMsg);
      throw new Error(`Sarvam AI error: ${errMsg}`);
    }
  }
}

module.exports = TranslationService;
