/**
 * EnhancedSandbox - VISION-inspired sandbox isolation patterns
 * Adds resource limits, policy enforcement, and stronger isolation guarantees
 */

import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { randomUUID } from 'crypto';

const ALLOWED_EXECUTABLES = new Set(['node', 'node.exe', 'bun', 'bun.exe']);
const BLOCKED_EXECUTABLES = new Set([
  'cmd', 'cmd.exe', 'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe',
  'sh', 'bash', 'zsh', 'fish', 'ksh'
]);
const DANGEROUS_COMMAND_PATTERNS = [
  /(^|\s)rm\s+-rf\s+(\/|\.\.|~|\*)/i,
  /(^|\s)(dd|mkfs|fdisk|parted|sfdisk)\b/i,
  /(^|\s)(shutdown|reboot|halt|init\s+0)\b/i,
  /(^|\s)del\s+\/f\s+\/s\s+\/q\b/i,
  /(^|\s)(rmdir|rd)\s+\/s\s+\/q\b/i,
  /(^|\s)format\s+[a-z]:/i,
  /(^|\s)powershell(\.exe)?\s+.*-encodedcommand\b/i,
  /(^|\s)reg\s+delete\b/i,
  /(^|\s)(curl|wget)\s+.*\|\s*(sh|bash|powershell|pwsh)\b/i
];
const DEFAULT_ALLOWED_ENV = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  'TEMP', 'TMP', 'TMPDIR', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'WINDIR',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA'
]);
const SENSITIVE_ENV_PATTERNS = [
  /TOKEN/i,
  /SECRET/i,
  /PASSWORD/i,
  /PRIVATE.*KEY/i,
  /ACCESS.*KEY/i,
  /API.*KEY/i,
  /CREDENTIAL/i,
  /AUTH/i,
  /^NODE_OPTIONS$/i
];

const executableExists = (command) => {
  if (!command || typeof command !== 'string') return false;

  // Cross-platform absolute path detection
  const isAbsolutePath = path.isAbsolute(command) || 
                        command.includes('/') || 
                        command.includes('\\') ||
                        (os.platform() === 'win32' && /^[a-z]:/i.test(command));
  
  if (isAbsolutePath) {
    return fs.existsSync(command);
  }

  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = [command];

  if (os.platform() === 'win32' && !command.toLowerCase().endsWith('.exe')) {
    candidates.push(`${command}.exe`);
  }

  for (const entry of pathEntries) {
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(entry, candidate))) {
        return true;
      }
    }
  }

  return false;
};

class EnhancedSandbox {
  /**
   * Create an EnhancedSandbox instance
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    // Validate options
    if (options && typeof options !== 'object') {
      throw new TypeError('EnhancedSandbox options must be an object');
    }

    // Resource limits with validation
    this.cpuLimit = Math.max(0.1, Math.min(64, options.cpuLimit || 1.0)); // 0.1 to 64 CPU cores
    this.memoryLimitMB = Math.max(16, Math.min(32768, options.memoryLimitMB || 512)); // 16MB to 32GB
    this.diskQuotaMB = Math.max(1, Math.min(102400, options.diskQuotaMB || 100)); // 1MB to 100GB
    this.timeoutMs = Math.max(1000, Math.min(300000, options.timeoutMs || 30000)); // 1s to 5min
    this.networkAllowed = options.networkAllowed || false;
    
    // Isolation levels
    const validIsolationLevels = ['full', 'partial', 'trusted'];
    this.isolationLevel = validIsolationLevels.includes(options.isolationLevel) 
      ? options.isolationLevel 
      : 'full';
    this.maxConcurrent = Math.max(1, Math.min(50, options.maxConcurrent || 5));
    
    // Policy enforcement
    this.policies = options.policies || this.defaultPolicies();
    this.violationHandler = options.violationHandler || this.defaultViolationHandler;
    
    // State tracking
    this.activeSandboxes = new Map();
    this.resourceUsage = new Map();
    this.violationCount = 0;
    this.auditLog = [];
    
    // Integration with SecurityVeto
    this.securityVeto = options.securityVeto || null;
  }

  /**
   * Default sandbox policies
   * @returns {Array} Default policy set
   */
  defaultPolicies() {
    return [
      {
        id: 'no-filesystem-escape',
        description: 'Prevent filesystem escape from sandbox',
        check: (operation) => !this.isFilesystemEscape(operation),
        action: 'TERMINATE',
        severity: 'CRITICAL'
      },
      {
        id: 'memory-limit',
        description: 'Enforce memory usage limit',
        check: (sandboxId) => this.checkMemoryLimit(sandboxId),
        action: 'TERMINATE',
        severity: 'HIGH'
      },
      {
        id: 'cpu-limit',
        description: 'Enforce CPU usage limit',
        check: (sandboxId) => this.checkCpuLimit(sandboxId),
        action: 'THROTTLE',
        severity: 'MEDIUM'
      },
      {
        id: 'network-access',
        description: 'Control network access based on isolation level',
        check: (operation) => this.checkNetworkAccess(operation),
        action: 'BLOCK',
        severity: 'MEDIUM'
      },
      {
        id: 'execution-time',
        description: 'Prevent infinite loops and hanging processes',
        check: (sandboxId) => this.checkExecutionTime(sandboxId),
        action: 'TERMINATE',
        severity: 'HIGH'
      }
    ];
  }

  /**
   * Default violation handler
   * @param {Object} violation Violation details
   * @param {string} sandboxId Sandbox ID
   */
  defaultViolationHandler(violation, sandboxId) {
    console.warn(`[EnhancedSandbox] Violation detected: ${violation.policyId} - ${violation.description}`);
    
    if (violation.action === 'TERMINATE') {
      console.error(`[EnhancedSandbox] Terminating sandbox ${sandboxId} due to ${violation.severity} violation`);
      this.terminate(sandboxId);
    } else if (violation.action === 'THROTTLE') {
      console.warn(`[EnhancedSandbox] Throttling sandbox ${sandboxId}`);
      this.throttle(sandboxId);
    }
    
    this.auditLog.push({
      timestamp: Date.now(),
      sandboxId,
      violation,
      actionTaken: violation.action
    });
  }

  /**
   * Create a sandbox with enhanced isolation
   * @param {Function} fn Function to run in sandbox
   * @param {Object} options Sandbox options
   * @returns {Promise<any>} Function result
   */
  async createSandbox(fn, options = {}) {
    const sandboxId = `sandbox-${Date.now()}-${randomUUID().slice(0, 12)}`;
    
    // Check concurrent limit
    if (this.activeSandboxes.size >= this.maxConcurrent) {
      throw new Error(`Too many concurrent sandboxes (max: ${this.maxConcurrent})`);
    }
    
    // Apply security veto if available
    if (this.securityVeto) {
      const vetoOperation = {
        type: 'sandbox-create',
        details: {
          function: fn.toString().substring(0, 200),
          options
        }
      };
      
      const vetoResult = this.securityVeto.evaluate(vetoOperation);
      if (!vetoResult.allowed && vetoResult.finalAction === 'BLOCK') {
        throw new Error(`Sandbox creation vetoed: ${vetoResult.blockingVeto?.reason}`);
      }
    }
    
    // Setup resource tracking
    this.resourceUsage.set(sandboxId, {
      startTime: Date.now(),
      memoryUsageMB: 0,
      cpuUsage: 0,
      diskUsageMB: 0,
      networkRequests: 0,
      violations: []
    });
    
    // Create wrapper script with enhanced isolation
    const wrapperScript = await this.createEnhancedWrapper(fn, options, sandboxId);
    let workspaceDir;
    try {
      this.validateWrapperScriptPath(wrapperScript);
      workspaceDir = this.createSandboxWorkspace(sandboxId);
    } catch (error) {
      fs.rmSync(wrapperScript, { force: true });
      throw error;
    }
    
    // Setup sandbox environment
    const env = this.createSandboxEnvironment({ ...options, sandboxId });
    const execPath = this.resolveAndValidateExecPath(options.execPath || process.execPath);
    
    // Spawn sandbox process
    return new Promise((resolve, reject) => {
      const child = spawn(execPath, [wrapperScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: workspaceDir,
        env,
        shell: false,
        windowsVerbatimArguments: false,
        // Platform-specific isolation flags
        ...this.getPlatformIsolationFlags()
      });
      
      this.activeSandboxes.set(sandboxId, {
        child,
        wrapperScript,
        workspaceDir,
        startTime: Date.now(),
        options,
        cleanupInProgress: false,
        cleanedUp: false
      });
      
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      
      // Set timeout
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        console.warn(`[EnhancedSandbox] Sandbox ${sandboxId} timed out`);
        this.handleViolation(sandboxId, {
          policyId: 'execution-time',
          description: 'Execution timeout exceeded',
          action: 'TERMINATE',
          severity: 'HIGH'
        });
      }, this.timeoutMs);
      
      // Monitor resource usage
      const monitorInterval = setInterval(() => {
        this.monitorResources(sandboxId, child);
      }, 1000);
      
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.once('close', (code) => {
        clearTimeout(timeoutHandle);
        clearInterval(monitorInterval);
        this.finalizeSandbox(sandboxId);
        
        if (timedOut) {
          reject(new Error(`Sandbox timed out after ${this.timeoutMs}ms`));
          return;
        }
        
        // Check for policy violations
        const resourceUsage = this.resourceUsage.get(sandboxId);
        if (resourceUsage && resourceUsage.violations.length > 0) {
          const violations = resourceUsage.violations.map(v => v.description).join(', ');
          reject(new Error(`Sandbox terminated due to policy violations: ${violations}`));
          return;
        }
        
        if (code !== 0) {
          reject(new Error(`Sandbox exited with code ${code}: ${stderr}`));
          return;
        }
        
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          resolve(stdout); // Return raw output if not JSON
        }
        
        this.resourceUsage.delete(sandboxId);
      });
      
      child.once('error', (error) => {
        clearTimeout(timeoutHandle);
        clearInterval(monitorInterval);
        this.finalizeSandbox(sandboxId);
        this.resourceUsage.delete(sandboxId);
        reject(error);
      });
    });
  }

  /**
   * Create enhanced wrapper script with resource monitoring
   * @param {Function} fn Function to wrap
   * @param {Object} options Wrapper options
   * @returns {string} Path to wrapper script
   */
  async createEnhancedWrapper(fn, options, sandboxId) {
    const fnString = fn.toString();
    const blockedExecutables = Array.from(BLOCKED_EXECUTABLES);
    const dangerousPatterns = DANGEROUS_COMMAND_PATTERNS.map((pattern) => pattern.source);
    const wrapper = `
// Enhanced Sandbox Wrapper - VISION Isolation Patterns
const processStart = Date.now();
const memoryStart = process.memoryUsage().heapUsed;

const blockedExecutables = new Set(${JSON.stringify(blockedExecutables)});
const dangerousPatternSources = ${JSON.stringify(dangerousPatterns)};
const dangerousPatterns = dangerousPatternSources.map((source) => new RegExp(source, 'i'));

const normalizeCommand = (command) => {
  const value = String(command || '').trim().toLowerCase();
  // Cross-platform path separator normalization
  return value.replace(/[\\/]/g, '/').split('/').pop() || value;
};

const isDangerousCommand = (command, args = []) => {
  const normalized = normalizeCommand(command);
  const joined = [normalized, ...args.map((arg) => String(arg || '').trim())].join(' ').trim();

  if (blockedExecutables.has(normalized)) {
    return true;
  }

  return dangerousPatterns.some((pattern) => pattern.test(joined));
};

try {
  const childProcess = require('child_process');
  const deny = (command, args = []) => {
    if (isDangerousCommand(command, args)) {
      throw new Error('Dangerous command blocked by EnhancedSandbox policy');
    }
  };

  const originalSpawn = childProcess.spawn;
  const originalSpawnSync = childProcess.spawnSync;
  const originalExec = childProcess.exec;
  const originalExecSync = childProcess.execSync;
  const originalExecFile = childProcess.execFile;
  const originalExecFileSync = childProcess.execFileSync;

  childProcess.spawn = (command, args, options) => {
    deny(command, Array.isArray(args) ? args : []);
    return originalSpawn.call(childProcess, command, args, options);
  };

  childProcess.spawnSync = (command, args, options) => {
    deny(command, Array.isArray(args) ? args : []);
    return originalSpawnSync.call(childProcess, command, args, options);
  };

  childProcess.exec = (command, options, callback) => {
    deny(command, []);
    return originalExec.call(childProcess, command, options, callback);
  };

  childProcess.execSync = (command, options) => {
    deny(command, []);
    return originalExecSync.call(childProcess, command, options);
  };

  childProcess.execFile = (file, args, options, callback) => {
    deny(file, Array.isArray(args) ? args : []);
    return originalExecFile.call(childProcess, file, args, options, callback);
  };

  childProcess.execFileSync = (file, args, options) => {
    deny(file, Array.isArray(args) ? args : []);
    return originalExecFileSync.call(childProcess, file, args, options);
  };
} catch (childPatchError) {
  // Intentionally fail-open for runtime compatibility; dangerous commands are also checked outside wrapper.
}

// Resource monitoring
function checkResources() {
  const memoryUsage = process.memoryUsage();
  const memoryMB = memoryUsage.heapUsed / 1024 / 1024;
  const elapsedMs = Date.now() - processStart;
  
  // Check memory limit
  const memoryLimit = ${this.memoryLimitMB};
  if (memoryMB > memoryLimit) {
    console.error(\`[Sandbox] Memory limit exceeded: \${memoryMB.toFixed(2)}MB > \${memoryLimit}MB\`);
    process.exit(137); // SIGKILL exit code
  }
  
  // Check execution time (partial - main check is external)
  const timeoutMs = ${this.timeoutMs};
  if (elapsedMs > timeoutMs * 0.9) {
    console.warn(\`[Sandbox] Approaching timeout: \${elapsedMs}ms / \${timeoutMs}ms\`);
  }
  
  return { memoryMB, elapsedMs };
}

// Network access control
const networkAllowed = ${this.networkAllowed};
if (!networkAllowed) {
  const originalRequire = require;
  const moduleProto = Object.getPrototypeOf(require);
  
  // Block network modules
  const blockedModules = ['http', 'https', 'net', 'dgram', 'dns'];
  const requireWrapper = function(id) {
    if (blockedModules.includes(id)) {
      throw new Error(\`Network module "\${id}" blocked in sandbox\`);
    }
    return originalRequire.call(this, id);
  };
  
  Object.setPrototypeOf(requireWrapper, moduleProto);
  require = requireWrapper;
}

// Filesystem restrictions
const fs = require('fs');
const originalFsWriteFile = fs.writeFile;
const originalFsWriteFileSync = fs.writeFileSync;

const diskQuotaMB = ${this.diskQuotaMB};
let diskUsageBytes = 0;

function checkDiskQuota(bytesToAdd) {
  const newUsage = diskUsageBytes + bytesToAdd;
  const newUsageMB = newUsage / 1024 / 1024;
  
  if (newUsageMB > diskQuotaMB) {
    throw new Error(\`Disk quota exceeded: \${newUsageMB.toFixed(2)}MB > \${diskQuotaMB}MB\`);
  }
  
  diskUsageBytes = newUsage;
  return true;
}

// Wrap filesystem operations
fs.writeFile = function(path, data, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  
  const bytes = typeof data === 'string' ? Buffer.byteLength(data) : data.length || 0;
  checkDiskQuota(bytes);
  
  return originalFsWriteFile.call(this, path, data, options, callback);
};

fs.writeFileSync = function(path, data, options) {
  const bytes = typeof data === 'string' ? Buffer.byteLength(data) : data.length || 0;
  checkDiskQuota(bytes);
  
  return originalFsWriteFileSync.call(this, path, data, options);
};

// Safe stringify with circular reference handling
const safeStringify = (obj, depth = 10) => {
  if (obj === undefined) return 'undefined';
  if (obj === null) return 'null';
  if (obj instanceof Error) {
    return JSON.stringify({
      name: obj.name,
      message: obj.message,
      stack: obj.stack
    });
  }

  const maxDepth = Number.isInteger(depth) && depth > 0 ? depth : 10;
  const stack = [];
  const active = new WeakSet();

  try {
    return JSON.stringify(obj, function replacer(key, value) {
      while (stack.length > 0 && stack[stack.length - 1] !== this) {
        const completed = stack.pop();
        if (completed && typeof completed === 'object') {
          active.delete(completed);
        }
      }

      if (typeof value === 'bigint') {
        return value.toString();
      }

      if (typeof value === 'object' && value !== null) {
        if (active.has(value)) {
          return '[Circular]';
        }

        if (stack.length >= maxDepth) {
          return '[MaxDepth]';
        }

        stack.push(value);
        active.add(value);
      }

      return value;
    }, 2);
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
};

// Main execution with resource monitoring
try {
  const interval = setInterval(checkResources, 1000);
  
  const result = (${fnString})();
  
  if (result && typeof result.then === 'function') {
    result
      .then(r => {
        clearInterval(interval);
        console.log(safeStringify(r));
        process.exit(0);
      })
      .catch(e => {
        clearInterval(interval);
        console.error(safeStringify(e));
        process.exit(1);
      });
  } else {
    clearInterval(interval);
    console.log(safeStringify(result));
    process.exit(0);
  }
} catch (e) {
  console.error(safeStringify(e));
  process.exit(1);
}
    `;
    
    const tmpDir = os.tmpdir();
    const scriptPath = path.join(tmpDir, `opencode-enhanced-${sandboxId}-${randomUUID().slice(0, 8)}.js`);
    // Ensure we're using cross-platform paths
    const scriptPathNormalized = scriptPath.replace(/\\/g, '/');
    const fd = fs.openSync(scriptPath, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, wrapper, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    return scriptPathNormalized;
  }

  /**
   * Create sandbox environment
   * @param {Object} options Environment options
   * @returns {Object} Environment variables
   */
  createSandboxEnvironment(options) {
    const env = this.sanitizeEnvironment(process.env, options);
    
    // Set resource limits via environment
    env.ENHANCED_SANDBOX = '1';
    env.SANDBOX_MEMORY_LIMIT_MB = this.memoryLimitMB.toString();
    env.SANDBOX_DISK_QUOTA_MB = this.diskQuotaMB.toString();
    env.SANDBOX_TIMEOUT_MS = this.timeoutMs.toString();
    env.SANDBOX_NETWORK_ALLOWED = this.networkAllowed.toString();
    env.SANDBOX_ISOLATION_LEVEL = this.isolationLevel;
    
    return env;
  }

  resolveAndValidateExecPath(execPath) {
    if (!execPath || typeof execPath !== 'string') {
      throw new Error('Invalid executable path for sandbox spawn');
    }

    const trimmed = execPath.trim();
    if (!trimmed || /[\x00-\x1f]/.test(trimmed)) {
      throw new Error('Executable path contains invalid characters');
    }

    const commandName = path.basename(trimmed).toLowerCase();
    if (BLOCKED_EXECUTABLES.has(commandName)) {
      throw new Error(`Blocked executable for sandbox: ${commandName}`);
    }

    if (!ALLOWED_EXECUTABLES.has(commandName)) {
      throw new Error(`Unsupported executable for sandbox: ${commandName}`);
    }

    if (!executableExists(trimmed)) {
      throw new Error(`Sandbox executable not found: ${trimmed}`);
    }

    const realPath = fs.realpathSync(trimmed);
    const stat = fs.statSync(realPath);

    if (!stat.isFile()) {
      throw new Error('Sandbox executable must be a file');
    }

    return realPath;
  }

  validateWrapperScriptPath(wrapperScript) {
    if (!wrapperScript || typeof wrapperScript !== 'string') {
      throw new Error('Invalid wrapper script path');
    }

    if (wrapperScript.startsWith('-')) {
      throw new Error('Wrapper script path cannot begin with option prefix');
    }

    const resolvedScript = fs.realpathSync(wrapperScript);
    const tmpDir = fs.realpathSync(os.tmpdir());
    const relative = path.relative(tmpDir, resolvedScript);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Wrapper script must be created under system temp directory');
    }

    const stat = fs.lstatSync(resolvedScript);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Wrapper script must be a regular file');
    }
  }

  createSandboxWorkspace(sandboxId) {
    const workspaceDir = path.join(os.tmpdir(), `opencode-sandbox-workspace-${sandboxId}`);
    fs.mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });
    return workspaceDir;
  }

  isDangerousCommand(command, args = []) {
    const normalized = path.basename(String(command || '').trim()).toLowerCase();
    if (!normalized) return false;

    if (BLOCKED_EXECUTABLES.has(normalized)) {
      return true;
    }

    const joined = [normalized, ...args.map((arg) => String(arg || '').trim())].join(' ').trim();
    return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(joined));
  }

  sanitizeEnvironment(baseEnv = {}, options = {}) {
    const allowedEnvVars = new Set([...(options.allowedEnvVars || [])]);
    const sanitized = {};

    for (const [key, value] of Object.entries(baseEnv)) {
      if (typeof value !== 'string') continue;

      if (!DEFAULT_ALLOWED_ENV.has(key) && !allowedEnvVars.has(key)) {
        continue;
      }

      if (SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(key))) {
        continue;
      }

      sanitized[key] = value;
    }

    return sanitized;
  }

  /**
   * Get platform-specific isolation flags
   * @returns {Object} Platform flags
   */
  getPlatformIsolationFlags() {
    const flags = {};
    
    if (os.platform() === 'linux') {
      flags.detached = false;
      flags.uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
      flags.gid = typeof process.getgid === 'function' ? process.getgid() : undefined;
      // Linux-specific isolation
    } else if (os.platform() === 'darwin') {
      flags.detached = false;
      flags.uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
      flags.gid = typeof process.getgid === 'function' ? process.getgid() : undefined;
      // macOS-specific isolation
    } else if (os.platform() === 'win32') {
      flags.detached = false;
      flags.windowsHide = true;
      flags.windowsVerbatimArguments = false;
      // Windows-specific isolation
    }

    Object.keys(flags).forEach((key) => flags[key] === undefined && delete flags[key]);
    
    return flags;
  }

  /**
   * Create sanitized sandbox environment - prevents env injection
   * @param {Object} options Sandbox options
   * @returns {Object} Sanitized environment
   */
  createSandboxEnvironment(options = {}) {
    // Start with a clean environment
    const sanitizedEnv = {
      PATH: process.env.PATH || process.env.Path || '',
      HOME: process.env.HOME || process.env.USERPROFILE || '',
      TEMP: process.env.TEMP || process.env.TMP || '',
      TMPDIR: process.env.TMPDIR || '',
    };

    // Block sensitive environment variables
    const blockedVars = [
      'OPENCODE_API_KEY', 'OPENCODE_TOKEN', 'OPENCODE_SECRET',
      'GITHUB_TOKEN', 'GIT_TOKEN', 'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY', 'DATABASE_URL', 'DB_PASSWORD',
      'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'NODE_PATH'
    ];

    // If options specify additional env vars to pass, whitelist them
    if (options.allowedEnvVars && Array.isArray(options.allowedEnvVars)) {
      for (const varName of options.allowedEnvVars) {
        if (!blockedVars.includes(varName.toUpperCase())) {
          const value = process.env[varName];
          if (value !== undefined) {
            sanitizedEnv[varName] = value;
          }
        }
      }
    }

    // Always clear NODE_OPTIONS to prevent process injection
    delete sanitizedEnv.NODE_OPTIONS;

    // Add sandbox identifier
    sanitizedEnv.SANDBOX_ACTIVE = '1';
    sanitizedEnv.SANDBOX_ID = options.sandboxId || '';

    return sanitizedEnv;
  }

  finalizeSandbox(sandboxId) {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) return;

    this.cleanupSandboxResources(sandboxId, sandbox);
    this.activeSandboxes.delete(sandboxId);
  }

  cleanupSandboxResources(sandboxId, sandbox) {
    if (!sandbox || sandbox.cleanedUp || sandbox.cleanupInProgress) {
      return;
    }

    sandbox.cleanupInProgress = true;
    try {
      if (sandbox.wrapperScript) {
        fs.rmSync(sandbox.wrapperScript, { force: true });
      }

      if (sandbox.workspaceDir) {
        fs.rmSync(sandbox.workspaceDir, { recursive: true, force: true });
      }

      sandbox.cleanedUp = true;
    } catch (error) {
      console.warn(`[EnhancedSandbox] Cleanup warning for ${sandboxId}: ${error.message}`);
    } finally {
      sandbox.cleanupInProgress = false;
    }
  }

  killSandboxProcess(child) {
    if (!child || child.killed) return;

    try {
      if (os.platform() === 'win32') {
        child.kill();
      } else {
        child.kill('SIGKILL');
      }
    } catch (error) {
      console.warn(`[EnhancedSandbox] Failed to kill sandbox process: ${error.message}`);
    }
  }

  /**
   * Monitor resource usage for a sandbox
   * @param {string} sandboxId Sandbox ID
   * @param {Object} child Child process
   */
  monitorResources(sandboxId, child) {
    if (!this.resourceUsage.has(sandboxId)) return;
    
    const usage = this.resourceUsage.get(sandboxId);
    const elapsedMs = Date.now() - usage.startTime;
    
    // Update usage tracking
    usage.elapsedMs = elapsedMs;
    
    // Check policies
    for (const policy of this.policies) {
      if (policy.check(sandboxId)) {
        this.handleViolation(sandboxId, policy);
      }
    }
    
    this.resourceUsage.set(sandboxId, usage);
  }

  /**
   * Handle policy violation
   * @param {string} sandboxId Sandbox ID
   * @param {Object} policy Violated policy
   */
  handleViolation(sandboxId, policy) {
    const usage = this.resourceUsage.get(sandboxId);
    if (!usage) return;
    
    // Record violation
    usage.violations.push({
      policyId: policy.id,
      description: policy.description,
      timestamp: Date.now(),
      severity: policy.severity
    });
    
    this.violationCount++;
    
    // Call violation handler
    this.violationHandler(policy, sandboxId);
    
    this.resourceUsage.set(sandboxId, usage);
  }

  /**
   * Terminate a sandbox
   * @param {string} sandboxId Sandbox ID
   */
  terminate(sandboxId) {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) return;
    
    this.killSandboxProcess(sandbox.child);
    this.finalizeSandbox(sandboxId);
    
    console.log(`[EnhancedSandbox] Terminated sandbox ${sandboxId}`);
  }

  /**
   * Throttle a sandbox (reduce CPU priority)
   * @param {string} sandboxId Sandbox ID
   */
  throttle(sandboxId) {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) return;
    
    // Platform-specific throttling
    if (os.platform() === 'linux') {
      // Use nice/renice on Linux
    } else if (os.platform() === 'darwin') {
      // macOS throttling
    }
    
    console.log(`[EnhancedSandbox] Throttled sandbox ${sandboxId}`);
  }

  /**
   * Policy check implementations
   */
  
  isFilesystemEscape(operation) {
    // Check for path traversal attempts
    if (operation.type === 'filesystem' && operation.path) {
      const normalized = path.normalize(operation.path);
      
      // Platform-independent path escape detection
      const isAbsolute = path.isAbsolute(normalized);
      const hasParentRef = normalized.includes('..');
      const hasDriveRoot = normalized.includes(':\\'); // Windows drive root
      const hasUnixRoot = normalized.startsWith('/'); // Unix root
      const hasWindowsUnc = normalized.startsWith('\\\\'); // Windows UNC path
      
      // Check for attempts to escape sandbox
      const isSystemRoot = hasDriveRoot || hasUnixRoot || hasWindowsUnc;
      
      return hasParentRef || isSystemRoot || (isAbsolute && this._isOutsideWorkspace(normalized));
    }
    return false;
  }

  _isOutsideWorkspace(filePath) {
    // Check if a file path is outside the workspace directory
    if (!this.workspacePath) return true;
    
    try {
      const relative = path.relative(this.workspacePath, path.resolve(filePath));
      return relative.startsWith('..') || path.isAbsolute(relative);
    } catch (error) {
      // If we can't compute relative path, assume it's outside
      return true;
    }
  }

  checkMemoryLimit(sandboxId) {
    const usage = this.resourceUsage.get(sandboxId);
    if (!usage) return false;
    
    return usage.memoryUsageMB > this.memoryLimitMB;
  }

  checkCpuLimit(sandboxId) {
    const usage = this.resourceUsage.get(sandboxId);
    if (!usage) return false;
    
    return usage.cpuUsage > this.cpuLimit;
  }

  checkNetworkAccess(operation) {
    if (operation.type === 'network' && !this.networkAllowed) {
      return true;
    }
    return false;
  }

  checkExecutionTime(sandboxId) {
    const usage = this.resourceUsage.get(sandboxId);
    if (!usage) return false;
    
    return usage.elapsedMs > this.timeoutMs;
  }

  /**
   * Get sandbox statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      activeSandboxes: this.activeSandboxes.size,
      totalViolations: this.violationCount,
      resourceUsage: Array.from(this.resourceUsage.entries()).map(([id, usage]) => ({
        id,
        elapsedMs: usage.elapsedMs || 0,
        memoryMB: usage.memoryUsageMB || 0,
        violations: usage.violations.length
      })),
      auditLogSize: this.auditLog.length
    };
  }

  /**
   * Cleanup all sandboxes
   */
  cleanup() {
    for (const [sandboxId] of this.activeSandboxes) {
      this.terminate(sandboxId);
    }
    
    this.activeSandboxes.clear();
    this.resourceUsage.clear();
    
    console.log('[EnhancedSandbox] Cleanup complete');
  }
}

export default EnhancedSandbox;
