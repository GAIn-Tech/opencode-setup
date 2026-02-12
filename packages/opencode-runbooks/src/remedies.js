'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Remedy functions for opencode-runbooks.
 * Each remedy takes an error context object and returns { action, status, details }.
 * Remedies SUGGEST fixes — they do NOT auto-execute destructive operations.
 */

const MODEL_FALLBACK_CHAIN = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.0-flash',
  'deepseek-chat',
];

const remedies = {

  /**
   * Enable an MCP server in opencode.json
   * @param {object} ctx - { mcpName: string, configPath?: string }
   * @returns {{ action: string, status: string, details: object }}
   */
  enableMCP(ctx = {}) {
    const mcpName = ctx.mcpName || 'unknown';
    const configPath = ctx.configPath || path.join(process.cwd(), 'opencode.json');

    // Read existing config if available
    let config = {};
    let configExists = false;
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        configExists = true;
      }
    } catch (_) { /* ignore parse errors */ }

    const mcpServers = config.mcpServers || {};
    if (mcpServers[mcpName]) {
      return {
        action: 'no_change',
        status: 'already_enabled',
        details: { mcpName, configPath, message: `MCP server '${mcpName}' is already registered.` },
      };
    }

    // Return instructions — do not auto-modify without consent
    const snippet = {
      mcpServers: {
        ...mcpServers,
        [mcpName]: {
          command: `npx -y @opencode/${mcpName}-mcp`,
          args: [],
        },
      },
    };

    return {
      action: 'add_mcp_server',
      status: 'instruction',
      details: {
        mcpName,
        configPath,
        configExists,
        message: `Add the following to your opencode.json:`,
        config: JSON.stringify(snippet, null, 2),
        command: configExists
          ? `Edit ${configPath} and add "${mcpName}" under mcpServers`
          : `Create ${configPath} with mcpServers.${mcpName} configured`,
      },
    };
  },

  /**
   * Suggest the next fallback model when current is unavailable
   * @param {object} ctx - { currentModel?: string }
   * @returns {{ action: string, status: string, details: object }}
   */
  switchFallbackModel(ctx = {}) {
    const current = ctx.currentModel || '';
    const currentIdx = MODEL_FALLBACK_CHAIN.indexOf(current);
    const nextIdx = currentIdx >= 0 ? currentIdx + 1 : 0;
    const suggestion = MODEL_FALLBACK_CHAIN[nextIdx] || MODEL_FALLBACK_CHAIN[0];

    return {
      action: 'switch_model',
      status: 'suggestion',
      details: {
        currentModel: current || '(unknown)',
        suggestedModel: suggestion,
        fallbackChain: MODEL_FALLBACK_CHAIN,
        message: `Switch from '${current || 'current'}' to '${suggestion}'.`,
        command: `Set OPENCODE_MODEL=${suggestion} or update opencode.json provider.model`,
      },
    };
  },

  /**
   * Prompt user to set a missing environment variable
   * @param {object} ctx - { varName: string, platform?: string }
   * @returns {{ action: string, status: string, details: object }}
   */
  promptEnvVar(ctx = {}) {
    const varName = ctx.varName || 'UNKNOWN_VAR';
    const platform = ctx.platform || process.platform;
    const isWindows = platform === 'win32';

    const command = isWindows
      ? `setx ${varName} "your-value-here"`
      : `export ${varName}="your-value-here"`;

    const persistHint = isWindows
      ? 'setx persists across sessions. Restart your terminal after setting.'
      : `Add to ~/.bashrc or ~/.zshrc for persistence.`;

    return {
      action: 'set_env_var',
      status: 'instruction',
      details: {
        varName,
        platform,
        message: `Environment variable '${varName}' is not set.`,
        command,
        persistHint,
      },
    };
  },

  /**
   * Suggest uninstalling a duplicate plugin
   * @param {object} ctx - { pluginName: string, duplicateSource?: string }
   * @returns {{ action: string, status: string, details: object }}
   */
  uninstallDuplicate(ctx = {}) {
    const pluginName = ctx.pluginName || 'unknown-plugin';
    const duplicateSource = ctx.duplicateSource || 'global';

    return {
      action: 'uninstall_plugin',
      status: 'instruction',
      details: {
        pluginName,
        duplicateSource,
        message: `Duplicate plugin '${pluginName}' detected.`,
        command: duplicateSource === 'global'
          ? `npm uninstall -g ${pluginName}`
          : `npm uninstall ${pluginName}`,
        verify: `npm ls ${pluginName}`,
      },
    };
  },

  /**
   * Use next model in fallback chain when model is unavailable
   * @param {object} ctx - { currentModel?: string, errorCode?: string }
   * @returns {{ action: string, status: string, details: object }}
   */
  fallbackModelChain(ctx = {}) {
    const current = ctx.currentModel || '';
    const errorCode = ctx.errorCode || 'unknown';

    const currentIdx = MODEL_FALLBACK_CHAIN.indexOf(current);
    const remaining = currentIdx >= 0
      ? MODEL_FALLBACK_CHAIN.slice(currentIdx + 1)
      : MODEL_FALLBACK_CHAIN;

    const next = remaining[0] || null;

    return {
      action: 'fallback_model',
      status: next ? 'suggestion' : 'exhausted',
      details: {
        currentModel: current || '(unknown)',
        errorCode,
        nextModel: next,
        remainingChain: remaining,
        message: next
          ? `Model '${current}' unavailable (${errorCode}). Try '${next}'.`
          : `All models in fallback chain exhausted. Check API keys and network.`,
        command: next ? `Set OPENCODE_MODEL=${next}` : null,
      },
    };
  },

  /**
   * Suggest starting a new session when token budget exceeded
   * @param {object} ctx - { sessionId?: string, tokensUsed?: number, tokenLimit?: number }
   * @returns {{ action: string, status: string, details: object }}
   */
  suggestNewSession(ctx = {}) {
    const tokensUsed = ctx.tokensUsed || 0;
    const tokenLimit = ctx.tokenLimit || 0;

    return {
      action: 'new_session',
      status: 'suggestion',
      details: {
        sessionId: ctx.sessionId || '(current)',
        tokensUsed,
        tokenLimit,
        message: 'Session token budget exceeded. Start a new session.',
        suggestions: [
          'Use /handoff to create a context summary before starting fresh.',
          'Use distillation to compress context in the current session.',
          'Start a new opencode session with a focused prompt.',
        ],
      },
    };
  },

  /**
   * Check and fix Supermemory API key configuration
   * @param {object} ctx - { platform?: string }
   * @returns {{ action: string, status: string, details: object }}
   */
  checkSupermemoryKey(ctx = {}) {
    const platform = ctx.platform || process.platform;
    const isWindows = platform === 'win32';
    const keyName = 'SUPERMEMORY_API_KEY';

    // Check if key exists in environment (don't expose value)
    const keyExists = !!process.env[keyName];

    if (keyExists) {
      return {
        action: 'verify_key',
        status: 'instruction',
        details: {
          keyName,
          keyExists: true,
          message: `${keyName} is set but may be invalid. Verify it at your Supermemory dashboard.`,
          suggestions: [
            'Regenerate the API key from your Supermemory account.',
            'Ensure the key has not expired.',
            `Test with: curl -H "Authorization: Bearer $${keyName}" https://api.supermemory.ai/health`,
          ],
        },
      };
    }

    return {
      action: 'set_key',
      status: 'instruction',
      details: {
        keyName,
        keyExists: false,
        message: `${keyName} is not set.`,
        command: isWindows
          ? `setx ${keyName} "your-supermemory-api-key"`
          : `export ${keyName}="your-supermemory-api-key"`,
        persistHint: isWindows
          ? 'Restart your terminal after setx.'
          : `Add to ~/.bashrc or ~/.zshrc for persistence.`,
      },
    };
  },

  /**
   * Guide through git conflict resolution
   * @param {object} ctx - { files?: string[], operation?: string }
   * @returns {{ action: string, status: string, details: object }}
   */
  resolveGitConflict(ctx = {}) {
    const files = ctx.files || [];
    const operation = ctx.operation || 'merge';

    return {
      action: 'resolve_conflict',
      status: 'instruction',
      details: {
        conflictingFiles: files,
        operation,
        message: `Git ${operation} conflict detected${files.length ? ` in ${files.length} file(s)` : ''}.`,
        steps: [
          'Run: git status  (identify conflicting files)',
          'Open each conflicting file and resolve <<<<<<< / ======= / >>>>>>> markers',
          'Stage resolved files: git add <file>',
          operation === 'rebase'
            ? 'Continue: git rebase --continue'
            : 'Commit: git commit',
        ],
        abort: operation === 'rebase'
          ? 'git rebase --abort'
          : 'git merge --abort',
      },
    };
  },

  /**
   * Fix file/resource permission issues
   * @param {object} ctx - { filePath?: string, platform?: string }
   * @returns {{ action: string, status: string, details: object }}
   */
  fixPermissions(ctx = {}) {
    const filePath = ctx.filePath || '(unknown path)';
    const platform = ctx.platform || process.platform;
    const isWindows = platform === 'win32';

    return {
      action: 'fix_permissions',
      status: 'instruction',
      details: {
        filePath,
        platform,
        message: `Permission denied accessing '${filePath}'.`,
        command: isWindows
          ? `icacls "${filePath}" /grant "%USERNAME%:F"`
          : `chmod u+rw "${filePath}"`,
        suggestions: isWindows
          ? ['Run terminal as Administrator if system file.', 'Check if file is locked by another process.']
          : ['Use sudo if system-level access is needed.', 'Check file ownership with ls -la.'],
      },
    };
  },

  /**
   * Resolve port conflict
   * @param {object} ctx - { port?: number, platform?: string }
   * @returns {{ action: string, status: string, details: object }}
   */
  resolvePortConflict(ctx = {}) {
    const port = ctx.port || 3000;
    const platform = ctx.platform || process.platform;
    const isWindows = platform === 'win32';

    return {
      action: 'resolve_port',
      status: 'instruction',
      details: {
        port,
        platform,
        message: `Port ${port} is already in use.`,
        findProcess: isWindows
          ? `netstat -ano | findstr :${port}`
          : `lsof -i :${port}`,
        killCommand: isWindows
          ? `taskkill /PID <PID> /F`
          : `kill -9 <PID>`,
        alternative: `Use a different port: PORT=${port + 1} or set in config.`,
      },
    };
  },
};

module.exports = { remedies, MODEL_FALLBACK_CHAIN };
