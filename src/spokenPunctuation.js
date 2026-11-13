const Config = require('./config');

/**
 * Idiomatic phrases where punctuation words should be preserved as spoken words
 */
const PROTECTED_PHRASES = [
  // Period as noun
  /\bperiods?\s+of\s+[a-zA-Z]+/gi, // e.g. "period of time", "period of rest"
  /\b(?:time|grace|trial|pay|waiting|probationary|menstrual)\s+periods?\b/gi,
  /\bperiods?\s+(?:piece|drama|pain|cramps|products?)\b/gi,

  // Comma phrases
  /\bcomma\s+splice\b/gi,

  // Colon as organ / medical
  /\bcolons?\s+(?:cancer|cleanse|surgery|exam|screening|polyps?|hydrotherapy)\b/gi,

  // Dash as sprint or measurement
  /\b(?:\d+m|\d+-meter|50m|100m)\s+dash\b/gi,
  /\bdash\s+of\s+[a-zA-Z]+/gi // e.g. "dash of salt"
];

class SpokenPunctuation {
  /**
   * Check whether spoken punctuation is enabled in config
   */
  static isEnabled() {
    try {
      return Config.getSpokenPunctuation();
    } catch (e) {
      return true;
    }
  }

  /**
   * Applies case transformation commands:
   * "all caps <word>" -> UPPERCASE
   * "caps <word>" or "capitalize <word>" -> Capitalized
   * "lowercase <word>" -> lowercase
   */
  static applyCasingCommands(text) {
    if (!text) return '';
    let result = text;

    // "all caps word" or "caps lock word"
    result = result.replace(/\b(?:all\s+caps|caps\s+lock)\s+([a-zA-Z0-9_-]+)/gi, (match, word) => {
      return word.toUpperCase();
    });

    // "caps word" or "capitalize word"
    result = result.replace(/\b(?:caps|capitalize)\s+([a-zA-Z0-9_-]+)/gi, (match, word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });

    // "lowercase word"
    result = result.replace(/\blowercase\s+([a-zA-Z0-9_-]+)/gi, (match, word) => {
      return word.toLowerCase();
    });

    return result;
  }

  /**
   * Protect idiomatic expressions from false-positive replacement
   */
  static protectPhrases(text) {
    const placeholders = [];
    let protectedText = text;

    PROTECTED_PHRASES.forEach((pattern, index) => {
      protectedText = protectedText.replace(pattern, (match) => {
        const token = `__LISTNER_PROT_${index}_${placeholders.length}__`;
        placeholders.push({ token, match });
        return token;
      });
    });

    return { text: protectedText, placeholders };
  }

  /**
   * Restore protected idiomatic expressions
   */
  static restorePhrases(text, placeholders) {
    let result = text;
    for (const { token, match } of placeholders) {
      result = result.replace(token, match);
    }
    return result;
  }

  /**
   * Normalizes spaces around punctuation and formats sentence capitalization
   */
  static normalizeSpacingAndCapitalization(text) {
    if (!text) return '';
    let result = text;

    // 1. Remove space before punctuation: "hello , world ." -> "hello, world."
    result = result.replace(/[ \t]+([.,!?:;%—\)\],])/g, '$1');

    // 2. Remove space after opening brackets: "( hello )" -> "(hello)"
    result = result.replace(/([\(\[])[ \t]+/g, '$1');

    // 3. Ensure space before opening parenthesis if preceded by word: "word(" -> "word ("
    result = result.replace(/([a-zA-Z0-9])\(/g, '$1 (');

    // 4. Ensure space after punctuation if immediately followed by letter: "hello,world" -> "hello, world"
    result = result.replace(/([.,!?:;])([a-zA-Z])/g, '$1 $2');

    // 5. Trim spaces around newlines
    result = result.replace(/[ \t]*\n[ \t]*/g, '\n');

    // 6. Deduplicate multiple horizontal spaces
    result = result.replace(/[ \t]{2,}/g, ' ');

    // 7. Auto-capitalize sentences:
    // Capitalize beginning of string, after [.?!] followed by space, or after newlines
    result = result.replace(/(^|[\.\?!]\s+|\n+)([a-z])/g, (match, prefix, char) => {
      return prefix + char.toUpperCase();
    });

    return result.trim();
  }

  /**
   * Main formatting entry point.
   * Transforms spoken punctuation and formatting commands into typed punctuation.
   * 
   * @param {string} text - Raw speech transcription
   * @param {object} options - Optional overrides { force: boolean }
   * @returns {string} Formatted text
   */
  static format(text, options = {}) {
    if (!text || typeof text !== 'string') return text || '';
    if (!options.force && !this.isEnabled()) {
      return text;
    }

    // 1. Case transformation commands (all caps, caps, lowercase)
    let result = this.applyCasingCommands(text);

    // 2. Protect idiomatic compound phrases
    const { text: protectedText, placeholders } = this.protectPhrases(result);
    result = protectedText;

    // 3. Multi-word punctuation & formatting commands
    result = result
      .replace(/\bnew\s+paragraphs?\b/gi, '\n\n')
      .replace(/\bnew\s+lines?\b/gi, '\n')
      .replace(/\b(?:insert\s+tab|indent)\b/gi, '\t')
      .replace(/\bexclamation\s+(?:marks?|points?)\b/gi, '!')
      .replace(/\bquestion\s+marks?\b/gi, '?')
      .replace(/\bfull\s+stops?\b/gi, '.')
      .replace(/\b(?:open|start|begin)\s+quotes?\s*/gi, '"')
      .replace(/\s*\b(?:close|end)\s+quotes?\b/gi, '"')
      .replace(/\s*\b(?:open|left)\s+parenthes[ie]s\s*/gi, ' (')
      .replace(/\s*\b(?:close|right)\s+parenthes[ie]s\s*/gi, ')')
      .replace(/\s*\b(?:open|left)\s+brackets?\s*/gi, ' [')
      .replace(/\s*\b(?:close|right)\s+brackets?\s*/gi, ']')
      .replace(/\bdot\s+dot\s+dot\b/gi, '...')
      .replace(/\bem\s+dash\b/gi, '—')
      .replace(/\bforward\s+slash\b/gi, '/')
      .replace(/\b(?:at\s+sign|at\s+symbol)\b/gi, '@')
      .replace(/\b(?:hash\s+tags?|hash\s+signs?|hashtag)\b/gi, '#')
      .replace(/\bdollar\s+signs?\b/gi, '$')
      .replace(/\bpercent\s+signs?\b/gi, '%')
      .replace(/\b(?:ampersand\s+sign|and\s+sign)\b/gi, '&');

    // 4. Single-word punctuation commands
    result = result
      .replace(/\bperiods?\b/gi, '.')
      .replace(/\bcommas?\b/gi, ',')
      .replace(/\bcolons?\b/gi, ':')
      .replace(/\bsemicolons?\b/gi, ';')
      .replace(/\b(?:hyphens?|dash)\b/gi, '-')
      .replace(/\bslash\b/gi, '/')
      .replace(/\bbackslash\b/gi, '\\')
      .replace(/\bellipsis\b/gi, '...')
      .replace(/\basterisks?\b/gi, '*')
      .replace(/\bunderscores?\b/gi, '_')
      .replace(/\bampersands?\b/gi, '&');

    // 5. Restore protected idiomatic expressions
    result = this.restorePhrases(result, placeholders);

    // 6. Spacing & sentence capitalization normalization
    result = this.normalizeSpacingAndCapitalization(result);

    return result;
  }
}

module.exports = SpokenPunctuation;
