# Resilient Subagent Model Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure subagent model assignments use antigravity Gemini models, detect failures early, and automatically fallback to appropriate alternatives.

**Architecture:** Add a model aliasing layer that redirects raw Gemini to antigravity versions, implement response validation for early failure detection, and create an automatic retry system with smart fallback selection based on category/intent.

**Tech Stack:** Node.js, oh-my-opencode plugin, opencode-model-router-x, central-config integration.

---

### Task 1: Fix oh-my-opencode.json category models

**Files:**
- Modify: `opencode-config/oh-my-opencode.json`

**Step 1: Update category models to use antigravity**

```json
{
  "categories": {
    "visual-engineering": {
      "model": "antigravity/antigravity-gemini-3-pro"
    },
    "artistry": {
      "model": "antigravity/antigravity-gemini-3-pro",
      "variant": "high"
    },
    "writing": {
      "model": "antigravity/antigravity-gemini-3-flash"
    }
  }
}
```

**Step 2: Update multimodal-looker agent**

```json
{
  "agents": {
    "multimodal-looker": {
      "model": "antigravity/antigravity-gemini-3-pro"
    }
  }
}
```

**Step 3: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('opencode-config/oh-my-opencode.json'))"
```

**Step 4: Commit**

```bash
git add opencode-config/oh-my-opencode.json
git commit -m "fix: use antigravity Gemini models for subagent categories"
```

---

### Task 2: Add model aliasing layer

**Files:**
- Create: `packages/opencode-model-router-x/src/model-alias-resolver.js`
- Modify: `packages/opencode-model-router-x/src/index.js`

**Step 1: Write the failing test**

Create `packages/opencode-model-router-x/test/model-alias-resolver.test.js`:

```javascript
const { describe, test, expect } = require('bun:test');
const { resolveModelAlias, MODEL_ALIASES } = require('../src/model-alias-resolver');

describe('Model Alias Resolver', () => {
  test('redirects raw Gemini to antigravity', () => {
    expect(resolveModelAlias('google/gemini-3-pro')).toBe('antigravity/antigravity-gemini-3-pro');
    expect(resolveModelAlias('google/gemini-3-flash')).toBe('antigravity/antigravity-gemini-3-flash');
    expect(resolveModelAlias('gemini-3-pro')).toBe('antigravity/antigravity-gemini-3-pro');
  });

  test('passes through non-aliased models', () => {
    expect(resolveModelAlias('anthropic/claude-opus-4-6')).toBe('anthropic/claude-opus-4-6');
    expect(resolveModelAlias('antigravity/antigravity-gemini-3-pro')).toBe('antigravity/antigravity-gemini-3-pro');
  });

  test('handles undefined/null gracefully', () => {
    expect(resolveModelAlias(undefined)).toBe(undefined);
    expect(resolveModelAlias(null)).toBe(null);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test packages/opencode-model-router-x/test/model-alias-resolver.test.js
```

Expected: FAIL - module not found

**Step 3: Write implementation**

Create `packages/opencode-model-router-x/src/model-alias-resolver.js`:

```javascript
'use strict';

/**
 * Model Alias Resolver
 * 
 * Redirects unstable/raw model IDs to preferred stable alternatives.
 * Primary use case: redirect raw Gemini models to antigravity versions.
 */

const MODEL_ALIASES = {
  // Raw Gemini → Antigravity Gemini
  'google/gemini-3-pro': 'antigravity/antigravity-gemini-3-pro',
  'google/gemini-3-flash': 'antigravity/antigravity-gemini-3-flash',
  'google/gemini-3-flash-8b': 'antigravity/antigravity-gemini-3-flash-8b',
  'gemini-3-pro': 'antigravity/antigravity-gemini-3-pro',
  'gemini-3-flash': 'antigravity/antigravity-gemini-3-flash',
  'gemini-3-flash-8b': 'antigravity/antigravity-gemini-3-flash-8b',
  
  // Legacy aliases
  'gemini-2.5-pro': 'antigravity/antigravity-gemini-3-pro',
  'gemini-2.5-flash': 'antigravity/antigravity-gemini-3-flash',
};

/**
 * Resolve model alias to preferred model ID
 * 
 * @param {string} modelId - Original model ID
 * @returns {string} - Resolved model ID (alias target or original)
 */
function resolveModelAlias(modelId) {
  if (!modelId) return modelId;
  return MODEL_ALIASES[modelId] || modelId;
}

/**
 * Check if a model has an alias
 * 
 * @param {string} modelId - Model ID to check
 * @returns {boolean} - True if model has an alias
 */
function hasAlias(modelId) {
  return modelId in MODEL_ALIASES;
}

/**
 * Get all aliases for a target model
 * 
 * @param {string} targetModelId - Target model ID
 * @returns {string[]} - Array of model IDs that alias to this target
 */
function getAliasesFor(targetModelId) {
  return Object.entries(MODEL_ALIASES)
    .filter(([_, target]) => target === targetModelId)
    .map(([alias]) => alias);
}

module.exports = {
  MODEL_ALIASES,
  resolveModelAlias,
  hasAlias,
  getAliasesFor,
};
```

**Step 4: Run test to verify it passes**

```bash
bun test packages/opencode-model-router-x/test/model-alias-resolver.test.js
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/opencode-model-router-x/src/model-alias-resolver.js packages/opencode-model-router-x/test/model-alias-resolver.test.js
git commit -m "feat: add model alias resolver for Gemini → antigravity redirect"
```

---

### Task 3: Add response validation with early failure detection

**Files:**
- Create: `packages/opencode-model-router-x/src/response-validator.js`
- Create: `packages/opencode-model-router-x/test/response-validator.test.js`

**Step 1: Write the failing test**

```javascript
const { describe, test, expect } = require('bun:test');
const { validateResponse, ResponseValidationError, FAILURE_TYPES } = require('../src/response-validator');

describe('Response Validator', () => {
  test('detects empty response', () => {
    const result = validateResponse({ content: '' });
    expect(result.valid).toBe(false);
    expect(result.failureType).toBe(FAILURE_TYPES.EMPTY_RESPONSE);
  });

  test('detects null/undefined response', () => {
    expect(validateResponse(null).failureType).toBe(FAILURE_TYPES.NULL_RESPONSE);
    expect(validateResponse(undefined).failureType).toBe(FAILURE_TYPES.NULL_RESPONSE);
  });

  test('detects rate limit error in content', () => {
    const result = validateResponse({ 
      content: 'Error: Rate limit exceeded. Please try again later.' 
    });
    expect(result.valid).toBe(false);
    expect(result.failureType).toBe(FAILURE_TYPES.RATE_LIMITED);
  });

  test('detects model unavailable error', () => {
    const result = validateResponse({ 
      content: 'The model is currently unavailable.' 
    });
    expect(result.valid).toBe(false);
    expect(result.failureType).toBe(FAILURE_TYPES.MODEL_UNAVAILABLE);
  });

  test('accepts valid response', () => {
    const result = validateResponse({ 
      content: 'Here is your answer: The code looks correct.' 
    });
    expect(result.valid).toBe(true);
    expect(result.failureType).toBe(null);
  });

  test('detects truncated/incomplete response', () => {
    const result = validateResponse({ 
      content: 'Let me explain: First, you need to',
      stop_reason: 'max_tokens'
    });
    expect(result.valid).toBe(false);
    expect(result.failureType).toBe(FAILURE_TYPES.TRUNCATED);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test packages/opencode-model-router-x/test/response-validator.test.js
```

**Step 3: Write implementation**

Create `packages/opencode-model-router-x/src/response-validator.js`:

```javascript
'use strict';

/**
 * Response Validator
 * 
 * Validates LLM responses for early failure detection.
 * Catches empty responses, rate limits, model unavailability, etc.
 */

const FAILURE_TYPES = {
  NULL_RESPONSE: 'null_response',
  EMPTY_RESPONSE: 'empty_response',
  RATE_LIMITED: 'rate_limited',
  MODEL_UNAVAILABLE: 'model_unavailable',
  TRUNCATED: 'truncated',
  MALFORMED: 'malformed',
  TIMEOUT: 'timeout',
  AUTH_ERROR: 'auth_error',
};

// Patterns that indicate failure (case-insensitive)
const FAILURE_PATTERNS = {
  [FAILURE_TYPES.RATE_LIMITED]: [
    /rate.?limit/i,
    /too.?many.?requests/i,
    /quota.?exceeded/i,
    /please.?try.?again.?later/i,
    /429/,
  ],
  [FAILURE_TYPES.MODEL_UNAVAILABLE]: [
    /model.*(unavailable|not.?found|deprecated)/i,
    /service.*(unavailable|temporarily)/i,
    /503/,
    /502/,
  ],
  [FAILURE_TYPES.AUTH_ERROR]: [
    /unauthorized/i,
    /invalid.?api.?key/i,
    /authentication.?failed/i,
    /401/,
    /403/,
  ],
};

class ResponseValidationError extends Error {
  constructor(message, failureType, details = {}) {
    super(message);
    this.name = 'ResponseValidationError';
    this.failureType = failureType;
    this.details = details;
    this.retriable = this.#isRetriable(failureType);
  }

  #isRetriable(failureType) {
    // These failures might succeed with a different model
    return [
      FAILURE_TYPES.RATE_LIMITED,
      FAILURE_TYPES.MODEL_UNAVAILABLE,
      FAILURE_TYPES.TIMEOUT,
    ].includes(failureType);
  }
}

/**
 * Validate an LLM response
 * 
 * @param {object} response - Response object with content, stop_reason, etc.
 * @param {object} options - Validation options
 * @returns {object} - { valid: boolean, failureType: string|null, message: string }
 */
function validateResponse(response, options = {}) {
  const {
    minContentLength = 10,
    allowTruncated = false,
  } = options;

  // Null/undefined response
  if (response === null || response === undefined) {
    return {
      valid: false,
      failureType: FAILURE_TYPES.NULL_RESPONSE,
      message: 'Response is null or undefined',
    };
  }

  // Extract content
  const content = typeof response === 'string' 
    ? response 
    : (response.content || response.text || response.message || '');

  // Empty response
  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      failureType: FAILURE_TYPES.EMPTY_RESPONSE,
      message: 'Response content is empty',
    };
  }

  // Check for failure patterns in content
  for (const [failureType, patterns] of Object.entries(FAILURE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return {
          valid: false,
          failureType,
          message: `Response contains ${failureType} indicator`,
        };
      }
    }
  }

  // Check for truncation
  if (!allowTruncated && response.stop_reason === 'max_tokens') {
    return {
      valid: false,
      failureType: FAILURE_TYPES.TRUNCATED,
      message: 'Response was truncated due to max_tokens',
    };
  }

  // Content too short (might indicate partial failure)
  if (content.trim().length < minContentLength) {
    return {
      valid: false,
      failureType: FAILURE_TYPES.EMPTY_RESPONSE,
      message: `Response too short (${content.trim().length} < ${minContentLength} chars)`,
    };
  }

  return {
    valid: true,
    failureType: null,
    message: 'Response is valid',
  };
}

/**
 * Quick check if response indicates a retriable failure
 * 
 * @param {object} response - Response to check
 * @returns {boolean} - True if failure is retriable with different model
 */
function isRetriableFailure(response) {
  const result = validateResponse(response);
  if (result.valid) return false;
  
  return [
    FAILURE_TYPES.RATE_LIMITED,
    FAILURE_TYPES.MODEL_UNAVAILABLE,
    FAILURE_TYPES.TIMEOUT,
    FAILURE_TYPES.EMPTY_RESPONSE,
  ].includes(result.failureType);
}

module.exports = {
  FAILURE_TYPES,
  ResponseValidationError,
  validateResponse,
  isRetriableFailure,
};
```

**Step 4: Run test to verify it passes**

```bash
bun test packages/opencode-model-router-x/test/response-validator.test.js
```

**Step 5: Commit**

```bash
git add packages/opencode-model-router-x/src/response-validator.js packages/opencode-model-router-x/test/response-validator.test.js
git commit -m "feat: add response validator for early failure detection"
```

---

### Task 4: Add subagent retry manager

**Files:**
- Create: `packages/opencode-model-router-x/src/subagent-retry-manager.js`
- Create: `packages/opencode-model-router-x/test/subagent-retry-manager.test.js`

**Step 1: Write the failing test**

```javascript
const { describe, test, expect } = require('bun:test');
const { SubagentRetryManager } = require('../src/subagent-retry-manager');
const { FAILURE_TYPES } = require('../src/response-validator');

describe('Subagent Retry Manager', () => {
  test('returns fallback model on failure', () => {
    const manager = new SubagentRetryManager();
    
    const fallback = manager.getFallbackModel({
      originalModel: 'google/gemini-3-pro',
      failureType: FAILURE_TYPES.EMPTY_RESPONSE,
      category: 'visual-engineering',
    });
    
    expect(fallback).not.toBe('google/gemini-3-pro');
    expect(fallback).toBeDefined();
  });

  test('tracks failure count per model', () => {
    const manager = new SubagentRetryManager();
    
    manager.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
    manager.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
    
    expect(manager.getFailureCount('google/gemini-3-pro')).toBe(2);
  });

  test('marks model as unstable after threshold', () => {
    const manager = new SubagentRetryManager({ failureThreshold: 3 });
    
    for (let i = 0; i < 3; i++) {
      manager.recordFailure('google/gemini-3-pro', FAILURE_TYPES.EMPTY_RESPONSE);
    }
    
    expect(manager.isUnstable('google/gemini-3-pro')).toBe(true);
  });

  test('respects max retry attempts', () => {
    const manager = new SubagentRetryManager({ maxRetries: 2 });
    
    expect(manager.shouldRetry({ attemptNumber: 1 })).toBe(true);
    expect(manager.shouldRetry({ attemptNumber: 2 })).toBe(true);
    expect(manager.shouldRetry({ attemptNumber: 3 })).toBe(false);
  });

  test('provides category-appropriate fallbacks', () => {
    const manager = new SubagentRetryManager();
    
    const fallback = manager.getFallbackModel({
      originalModel: 'google/gemini-3-pro',
      failureType: FAILURE_TYPES.RATE_LIMITED,
      category: 'visual-engineering',
    });
    
    // Should get a model suitable for visual-engineering
    expect(['anthropic/claude-sonnet-4-5', 'openai/gpt-5.2', 'antigravity/antigravity-claude-sonnet-4-5']).toContain(fallback);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
bun test packages/opencode-model-router-x/test/subagent-retry-manager.test.js
```

**Step 3: Write implementation**

Create `packages/opencode-model-router-x/src/subagent-retry-manager.js`:

```javascript
'use strict';

const { FAILURE_TYPES } = require('./response-validator');
const { resolveModelAlias } = require('./model-alias-resolver');

/**
 * Subagent Retry Manager
 * 
 * Manages retry logic and fallback model selection for subagent tasks.
 * Tracks model stability and provides intelligent fallback selection.
 */

// Category → Fallback models (in priority order)
const CATEGORY_FALLBACKS = {
  'visual-engineering': [
    'antigravity/antigravity-gemini-3-pro',
    'anthropic/claude-sonnet-4-5',
    'openai/gpt-5.2',
  ],
  'ultrabrain': [
    'anthropic/claude-opus-4-6',
    'openai/gpt-5.3-codex',
    'antigravity/antigravity-claude-opus-4-6-thinking',
  ],
  'deep': [
    'anthropic/claude-opus-4-6',
    'openai/gpt-5.3-codex',
    'antigravity/antigravity-claude-sonnet-4-5-thinking',
  ],
  'artistry': [
    'antigravity/antigravity-gemini-3-pro',
    'anthropic/claude-sonnet-4-5',
    'openai/gpt-5.2',
  ],
  'quick': [
    'anthropic/claude-haiku-4-5',
    'antigravity/antigravity-gemini-3-flash',
    'openai/gpt-5',
  ],
  'writing': [
    'antigravity/antigravity-gemini-3-flash',
    'anthropic/claude-sonnet-4-5',
    'openai/gpt-5.2',
  ],
  'unspecified-low': [
    'anthropic/claude-sonnet-4-5',
    'antigravity/antigravity-claude-sonnet-4-5',
    'openai/gpt-5.2',
  ],
  'unspecified-high': [
    'anthropic/claude-opus-4-6',
    'openai/gpt-5.3-codex',
    'antigravity/antigravity-claude-opus-4-6-thinking',
  ],
};

// Default fallback chain for unknown categories
const DEFAULT_FALLBACKS = [
  'anthropic/claude-sonnet-4-5',
  'openai/gpt-5.2',
  'antigravity/antigravity-gemini-3-pro',
];

class SubagentRetryManager {
  #failureCounts = new Map();
  #unstableModels = new Set();
  #options;

  constructor(options = {}) {
    this.#options = {
      maxRetries: options.maxRetries || 3,
      failureThreshold: options.failureThreshold || 5,
      unstableWindowMs: options.unstableWindowMs || 5 * 60 * 1000, // 5 minutes
      ...options,
    };
  }

  /**
   * Record a model failure
   */
  recordFailure(modelId, failureType) {
    const resolved = resolveModelAlias(modelId);
    const key = resolved;
    
    const current = this.#failureCounts.get(key) || { count: 0, lastFailure: 0 };
    current.count++;
    current.lastFailure = Date.now();
    current.lastFailureType = failureType;
    this.#failureCounts.set(key, current);

    // Mark as unstable if threshold exceeded
    if (current.count >= this.#options.failureThreshold) {
      this.#unstableModels.add(key);
      console.warn(`[SubagentRetryManager] Model ${resolved} marked unstable after ${current.count} failures`);
    }
  }

  /**
   * Record a model success (reduces failure count)
   */
  recordSuccess(modelId) {
    const resolved = resolveModelAlias(modelId);
    const current = this.#failureCounts.get(resolved);
    
    if (current) {
      current.count = Math.max(0, current.count - 1);
      if (current.count < this.#options.failureThreshold) {
        this.#unstableModels.delete(resolved);
      }
    }
  }

  /**
   * Get failure count for a model
   */
  getFailureCount(modelId) {
    const resolved = resolveModelAlias(modelId);
    return this.#failureCounts.get(resolved)?.count || 0;
  }

  /**
   * Check if model is currently unstable
   */
  isUnstable(modelId) {
    const resolved = resolveModelAlias(modelId);
    
    // Check if unstable status has expired
    const stats = this.#failureCounts.get(resolved);
    if (stats && this.#unstableModels.has(resolved)) {
      if (Date.now() - stats.lastFailure > this.#options.unstableWindowMs) {
        this.#unstableModels.delete(resolved);
        return false;
      }
    }
    
    return this.#unstableModels.has(resolved);
  }

  /**
   * Determine if we should retry
   */
  shouldRetry({ attemptNumber, failureType }) {
    if (attemptNumber > this.#options.maxRetries) {
      return false;
    }

    // Don't retry auth errors - they won't magically fix themselves
    if (failureType === FAILURE_TYPES.AUTH_ERROR) {
      return false;
    }

    return true;
  }

  /**
   * Get fallback model for a failed request
   */
  getFallbackModel({ originalModel, failureType, category, attemptNumber = 1 }) {
    const resolved = resolveModelAlias(originalModel);
    const fallbacks = CATEGORY_FALLBACKS[category] || DEFAULT_FALLBACKS;
    
    // Filter out unstable models and the original model
    const available = fallbacks.filter(m => {
      const resolvedFallback = resolveModelAlias(m);
      return resolvedFallback !== resolved && !this.isUnstable(resolvedFallback);
    });

    if (available.length === 0) {
      // All fallbacks are unstable or same as original - return first fallback anyway
      console.warn(`[SubagentRetryManager] All fallbacks exhausted for ${category}, using first available`);
      return fallbacks.find(m => resolveModelAlias(m) !== resolved) || fallbacks[0];
    }

    // Return fallback based on attempt number
    const index = Math.min(attemptNumber - 1, available.length - 1);
    return available[index];
  }

  /**
   * Get all unstable models
   */
  getUnstableModels() {
    return Array.from(this.#unstableModels);
  }

  /**
   * Reset all tracking
   */
  reset() {
    this.#failureCounts.clear();
    this.#unstableModels.clear();
  }
}

module.exports = {
  SubagentRetryManager,
  CATEGORY_FALLBACKS,
  DEFAULT_FALLBACKS,
};
```

**Step 4: Run test to verify it passes**

```bash
bun test packages/opencode-model-router-x/test/subagent-retry-manager.test.js
```

**Step 5: Commit**

```bash
git add packages/opencode-model-router-x/src/subagent-retry-manager.js packages/opencode-model-router-x/test/subagent-retry-manager.test.js
git commit -m "feat: add subagent retry manager with smart fallback selection"
```

---

### Task 5: Wire components into model router index

**Files:**
- Modify: `packages/opencode-model-router-x/src/index.js`

**Step 1: Add imports and exports**

Add to top of file:
```javascript
const { resolveModelAlias, hasAlias, MODEL_ALIASES } = require('./model-alias-resolver');
const { validateResponse, isRetriableFailure, FAILURE_TYPES, ResponseValidationError } = require('./response-validator');
const { SubagentRetryManager, CATEGORY_FALLBACKS } = require('./subagent-retry-manager');
```

Add to module.exports:
```javascript
module.exports = {
  // ... existing exports ...
  
  // Model aliasing
  resolveModelAlias,
  hasAlias,
  MODEL_ALIASES,
  
  // Response validation
  validateResponse,
  isRetriableFailure,
  FAILURE_TYPES,
  ResponseValidationError,
  
  // Subagent retry
  SubagentRetryManager,
  CATEGORY_FALLBACKS,
};
```

**Step 2: Add alias resolution to selectModel**

In the `ModelRouter` class, wrap model selection with alias resolution:

```javascript
selectModel(context = {}) {
  // ... existing logic ...
  
  // Resolve any aliases before returning
  if (result && result.model) {
    result.model = resolveModelAlias(result.model);
  }
  
  return result;
}
```

**Step 3: Commit**

```bash
git add packages/opencode-model-router-x/src/index.js
git commit -m "feat: wire alias resolver, validator, and retry manager into router"
```

---

### Task 6: Add central-config integration for retry settings

**Files:**
- Modify: `opencode-config/central-config.json`

**Step 1: Add retry settings to central config**

Add new section to `sections`:
```json
{
  "subagent_retry": {
    "max_retries": {
      "value": 3,
      "soft": { "min": 1, "max": 5 },
      "hard": { "min": 0, "max": 10 },
      "locked": false,
      "rl_allowed": true
    },
    "failure_threshold": {
      "value": 5,
      "soft": { "min": 2, "max": 10 },
      "hard": { "min": 1, "max": 20 },
      "locked": false,
      "rl_allowed": true
    },
    "unstable_window_ms": {
      "value": 300000,
      "soft": { "min": 60000, "max": 600000 },
      "hard": { "min": 30000, "max": 1800000 },
      "locked": false,
      "rl_allowed": true
    },
    "early_timeout_ms": {
      "value": 30000,
      "soft": { "min": 10000, "max": 60000 },
      "hard": { "min": 5000, "max": 120000 },
      "locked": false,
      "rl_allowed": true
    }
  }
}
```

**Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('opencode-config/central-config.json'))"
```

**Step 3: Commit**

```bash
git add opencode-config/central-config.json
git commit -m "feat: add subagent retry settings to central config"
```

---

### Task 7: Update documentation

**Files:**
- Modify: `docs/central-config.md`

**Step 1: Add subagent retry section**

```markdown
### `subagent_retry`
Subagent failure handling and retry behavior:
- `max_retries` - Maximum retry attempts before giving up (default: 3)
- `failure_threshold` - Failures before marking model unstable (default: 5)
- `unstable_window_ms` - How long a model stays marked unstable (default: 5 min)
- `early_timeout_ms` - Faster timeout for known-unstable models (default: 30s)
```

**Step 2: Commit**

```bash
git add docs/central-config.md
git commit -m "docs: add subagent retry configuration documentation"
```

---

### Task 8: Run full test suite and verify

**Step 1: Run all model-router tests**

```bash
bun test packages/opencode-model-router-x/test/
```

**Step 2: Run central-config tests**

```bash
bun test packages/opencode-config-loader/test/central-config.test.js
```

**Step 3: Run verification**

```bash
bun run verify
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete resilient subagent routing implementation"
```

---

## Summary

This plan implements:

1. **Model aliasing** - Redirects raw Gemini to antigravity versions automatically
2. **Response validation** - Detects empty responses, rate limits, and errors early
3. **Smart retry** - Tracks model stability, provides category-appropriate fallbacks
4. **Central config integration** - Retry settings are configurable and RL-learnable
5. **Fixed oh-my-opencode.json** - Categories now use antigravity models

The system will now:
- Never use raw `google/gemini-*` models (always aliased to antigravity)
- Detect failures within milliseconds instead of waiting for full timeout
- Automatically retry with the next best model for the category
- Learn optimal retry settings through RL

---

Plan complete and saved to `docs/plans/2026-02-23-resilient-subagent-routing.md`. Two execution options:

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
