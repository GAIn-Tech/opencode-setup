/**
 * SemanticMatcher - Additive semantic matching layer for SkillBank
 * 
 * Provides synonym expansion and domain signal detection as a FALLBACK
 * when keyword matching fails. Loads data synchronously at construction.
 * Fail-open: if data files cannot be loaded, disables itself (returns false always).
 * 
 * Data sources:
 * - opencode-config/skills/semantic-matching/synonyms.json
 * - opencode-config/skills/semantic-matching/domain-signals.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

class SemanticMatcher {
  constructor() {
    this.enabled = false;
    // Reverse maps: word → Set of canonical concepts/domains
    this.synonymReverseMap = new Map();
    this.domainReverseMap = new Map();

    this._loadData();
  }

  /**
   * Load synonym and domain signal data synchronously.
   * Fail-open: sets enabled=false on any error.
   * @private
   */
  _loadData() {
    try {
      const basePath = path.resolve(__dirname, '..', '..', '..', 'opencode-config', 'skills', 'semantic-matching');
      
      const synonymsRaw = fs.readFileSync(path.join(basePath, 'synonyms.json'), 'utf-8');
      const synonyms = JSON.parse(synonymsRaw);
      
      const domainSignalsRaw = fs.readFileSync(path.join(basePath, 'domain-signals.json'), 'utf-8');
      const domainSignals = JSON.parse(domainSignalsRaw);

      // Build reverse map for synonyms: each synonym word → set of canonical concepts
      for (const [canonical, words] of Object.entries(synonyms)) {
        if (!Array.isArray(words)) continue;
        for (const word of words) {
          const lower = word.toLowerCase();
          if (!this.synonymReverseMap.has(lower)) {
            this.synonymReverseMap.set(lower, new Set());
          }
          this.synonymReverseMap.get(lower).add(canonical.toLowerCase());
        }
      }

      // Build reverse map for domain signals: each signal word → set of domain categories
      for (const [domain, signals] of Object.entries(domainSignals)) {
        if (!Array.isArray(signals)) continue;
        for (const signal of signals) {
          const lower = signal.toLowerCase();
          if (!this.domainReverseMap.has(lower)) {
            this.domainReverseMap.set(lower, new Set());
          }
          this.domainReverseMap.get(lower).add(domain.toLowerCase());
        }
      }

      this.enabled = true;
    } catch (_err) {
      // Fail-open: disable semantic matching, do not throw
      this.enabled = false;
      this.synonymReverseMap.clear();
      this.domainReverseMap.clear();
    }
  }

  /**
   * Check if a skill matches a task context via semantic expansion.
   * 
   * Algorithm:
   * 1. Extract words from taskContext.description (split on whitespace/punctuation, lowercase)
   * 2. Synonym expansion: map each word to canonical concepts, check against skill.tags
   * 3. Domain signals: map each word to domain categories, check against skill.tags
   * 
   * @param {Object} skill - Skill object with tags and application_context
   * @param {Object} taskContext - Task context with description
   * @returns {boolean} true if semantic match found, false otherwise
   */
  match(skill, taskContext) {
    if (!this.enabled || !taskContext.description) return false;

    const tags = skill.tags;
    if (!tags || tags.length === 0) return false;

    // Lowercase tags once for comparison
    const lowerTags = tags.map(t => t.toLowerCase());

    // Extract words from description
    const words = taskContext.description.toLowerCase().split(/[\s\W]+/).filter(Boolean);

    // Step 1: Synonym expansion — check if any expanded canonical concept matches skill.tags
    for (const word of words) {
      const canonicals = this.synonymReverseMap.get(word);
      if (canonicals) {
        for (const canonical of canonicals) {
          if (lowerTags.includes(canonical)) return true;
          // Also check if canonical appears in application_context
          if (skill.application_context &&
              skill.application_context.toLowerCase().includes(canonical)) {
            return true;
          }
        }
      }
    }

    // Step 2: Domain signals — check if any signal word maps to a domain in skill.tags
    for (const word of words) {
      const domains = this.domainReverseMap.get(word);
      if (domains) {
        for (const domain of domains) {
          if (lowerTags.includes(domain)) return true;
        }
      }
    }

    return false;
  }
}

module.exports = { SemanticMatcher };
