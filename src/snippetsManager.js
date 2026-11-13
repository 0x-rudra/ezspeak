const crypto = require('crypto');
const Config = require('./config');

/**
 * Helper to escape special regex characters in a trigger phrase
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format a Date object into YYYY-MM-DD using local time
 */
function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date object into 12-hour local time (e.g. "02:30 PM")
 */
function formatLocalTime(date = new Date()) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // hour '0' should be '12'
  const strHours = String(hours).padStart(2, '0');
  return `${strHours}:${minutes} ${ampm}`;
}

class SnippetsManager {
  /**
   * Safely read text from system clipboard (Electron main process safe)
   */
  static getClipboardText() {
    try {
      const { clipboard } = require('electron');
      if (clipboard && typeof clipboard.readText === 'function') {
        return clipboard.readText() || '';
      }
    } catch (e) {
      // safe fallback if outside electron or clipboard unavailable
    }
    return '';
  }

  /**
   * Expand dynamic variables in an expansion template:
   * Supported: {date}, {time}, {datetime}, {year}, {clipboard}
   */
  static expandVariables(template, customVars = {}) {
    if (typeof template !== 'string' || !template) return '';
    const now = customVars.now || new Date();
    const dateStr = customVars.date || formatLocalDate(now);
    const timeStr = customVars.time || formatLocalTime(now);
    const datetimeStr = customVars.datetime || `${dateStr} ${timeStr}`;
    const yearStr = customVars.year || String(now.getFullYear());
    const clipboardStr = customVars.clipboard !== undefined 
      ? String(customVars.clipboard) 
      : this.getClipboardText();

    return template
      .replace(/\{date\}/gi, dateStr)
      .replace(/\{time\}/gi, timeStr)
      .replace(/\{datetime\}/gi, datetimeStr)
      .replace(/\{year\}/gi, yearStr)
      .replace(/\{clipboard\}/gi, clipboardStr);
  }

  /**
   * Get all snippets from config
   */
  static getSnippets() {
    return Config.getSnippets();
  }

  /**
   * Add or update a snippet
   */
  static saveSnippet(snippetData) {
    if (!snippetData || typeof snippetData !== 'object') {
      throw new Error('Invalid snippet data');
    }
    const trigger = String(snippetData.trigger || '').trim();
    if (!trigger) {
      throw new Error('Snippet trigger cannot be empty');
    }
    const expansion = String(snippetData.expansion || '');

    const snippets = this.getSnippets();
    const existingIndex = snippetData.id ? snippets.findIndex(s => s.id === snippetData.id) : -1;

    let savedItem;
    if (existingIndex >= 0) {
      savedItem = {
        ...snippets[existingIndex],
        trigger,
        expansion,
        enabled: snippetData.enabled !== undefined ? Boolean(snippetData.enabled) : snippets[existingIndex].enabled,
        updatedAt: new Date().toISOString()
      };
      snippets[existingIndex] = savedItem;
    } else {
      savedItem = {
        id: snippetData.id || crypto.randomUUID(),
        trigger,
        expansion,
        enabled: snippetData.enabled !== undefined ? Boolean(snippetData.enabled) : true,
        createdAt: new Date().toISOString()
      };
      snippets.push(savedItem);
    }

    Config.setSnippets(snippets);
    return savedItem;
  }

  /**
   * Delete snippet by ID
   */
  static deleteSnippet(id) {
    if (!id) return false;
    const snippets = this.getSnippets();
    const filtered = snippets.filter(s => s.id !== id);
    if (filtered.length !== snippets.length) {
      Config.setSnippets(filtered);
      return true;
    }
    return false;
  }

  /**
   * Toggle enabled/disabled status
   */
  static toggleSnippet(id, enabled) {
    const snippets = this.getSnippets();
    const snippet = snippets.find(s => s.id === id);
    if (snippet) {
      snippet.enabled = enabled !== undefined ? Boolean(enabled) : !snippet.enabled;
      Config.setSnippets(snippets);
      return snippet;
    }
    return null;
  }

  /**
   * Replaces any snippet triggers found in text with their expanded content.
   * Matches triggers case-insensitively with word boundaries.
   * Longer triggers take precedence over shorter ones.
   */
  static expandSnippets(text, customVars = {}) {
    if (!text || typeof text !== 'string') return text || '';
    const snippets = this.getSnippets().filter(s => s.enabled !== false && s.trigger && s.trigger.trim());
    if (snippets.length === 0) return text;

    // Sort by trigger length descending to prevent shorter triggers from shadowing longer ones
    const sorted = [...snippets].sort((a, b) => b.trigger.trim().length - a.trigger.trim().length);

    let result = text;
    for (const snippet of sorted) {
      const cleanTrigger = snippet.trigger.trim();
      // Replace sequences of spaces in trigger with \s+ to match speech with varied spacing
      const escapedWords = cleanTrigger.split(/\s+/).map(escapeRegex).join('\\s+');
      // Match with word boundaries
      const regex = new RegExp(`\\b${escapedWords}\\b`, 'gi');

      if (regex.test(result)) {
        // Expand dynamic variables for this expansion
        const expandedContent = this.expandVariables(snippet.expansion, customVars);
        result = result.replace(regex, expandedContent);
      }
    }

    return result;
  }
}

module.exports = SnippetsManager;

