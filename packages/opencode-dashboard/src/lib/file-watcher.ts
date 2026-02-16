import chokidar from 'chokidar';
import { homedir } from 'os';
import { join } from 'path';
import { EventEmitter } from 'events';

export type WatchEventType = 
  | 'workflow:update'
  | 'learning:update'
  | 'health:update'
  | 'config:update'
  | 'session:update';

export interface WatchEvent {
  type: WatchEventType;
  path: string;
  timestamp: number;
}

class FileWatcherService extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private static instance: FileWatcherService | null = null;
  
  private readonly DEBOUNCE_MS = 100;
  
  private readonly watchPaths = {
    // Workflow state database
    workflow: join(homedir(), '.opencode', 'sisyphus-state.db'),
    workflowWal: join(homedir(), '.opencode', 'sisyphus-state.db-wal'),
    // Learning engine data
    antiPatterns: join(homedir(), '.opencode', 'learning', 'anti-patterns.json'),
    positivePatterns: join(homedir(), '.opencode', 'learning', 'positive-patterns.json'),
    // Health and monitoring
    healthLog: join(homedir(), '.opencode', 'healthd.log'),
    sessionBudgets: join(homedir(), '.opencode', 'session-budgets.json'),
    // Config files
    dashboardLock: join(homedir(), '.opencode', 'dashboard.lock'),
    // Session messages - LIVE session data!
    messagesDir: join(homedir(), '.opencode', 'messages'),
    // Model router state for performance tracking
    modelRouterState: join(homedir(), '.opencode', 'model-router-state.json'),
    // Graph memory state
    graphMemoryState: join(homedir(), '.opencode', 'graph-memory-state.json'),
    // RL state
    rlState: join(homedir(), '.opencode', 'skill-rl-state.json'),
    // Logs directory for session updates
    logsDir: join(homedir(), '.opencode', 'logs'),
  };

  static getInstance(): FileWatcherService {
    if (!FileWatcherService.instance) {
      FileWatcherService.instance = new FileWatcherService();
    }
    return FileWatcherService.instance;
  }

  start(): void {
    if (this.watcher) {
      console.log('[FileWatcher] Already running');
      return;
    }

    const pathsToWatch = Object.values(this.watchPaths);
    
    console.log('[FileWatcher] Starting file watcher for paths:', pathsToWatch);
    
    this.watcher = chokidar.watch(pathsToWatch, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
      // Don't fail if files don't exist yet
      ignorePermissionErrors: true,
    });

    this.watcher
      .on('change', (path) => this.handleFileChange(path, 'change'))
      .on('add', (path) => this.handleFileChange(path, 'add'))
      .on('unlink', (path) => this.handleFileChange(path, 'unlink'))
      .on('error', (error) => console.error('[FileWatcher] Error:', error))
      .on('ready', () => console.log('[FileWatcher] Ready and watching'));
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[FileWatcher] Stopped');
    }
    
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private handleFileChange(filePath: string, changeType: string): void {
    // Debounce by file path
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.emitEvent(filePath, changeType);
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(filePath, timer);
  }

  private emitEvent(filePath: string, changeType: string): void {
    const eventType = this.classifyEvent(filePath);
    
    const event: WatchEvent = {
      type: eventType,
      path: filePath,
      timestamp: Date.now(),
    };

    console.log(`[FileWatcher] ${changeType}: ${filePath} -> ${eventType}`);
    this.emit('change', event);
  }

  private classifyEvent(filePath: string): WatchEventType {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    
    if (normalizedPath.includes('sisyphus-state')) {
      return 'workflow:update';
    }
    if (normalizedPath.includes('messages') || normalizedPath.includes('msg_')) {
      return 'workflow:update'; // New session messages = workflow update
    }
    if (normalizedPath.includes('learning') || 
        normalizedPath.includes('anti-patterns') || 
        normalizedPath.includes('positive-patterns')) {
      return 'learning:update';
    }
    if (normalizedPath.includes('healthd') || 
        normalizedPath.includes('session-budgets')) {
      return 'health:update';
    }
    if (normalizedPath.includes('model-router') || 
        normalizedPath.includes('graph-memory') ||
        normalizedPath.includes('skill-rl')) {
      return 'session:update'; // Model performance = session update
    }
    if (normalizedPath.includes('config') || 
        normalizedPath.includes('.json')) {
      return 'config:update';
    }
    if (normalizedPath.includes('logs')) {
      return 'session:update';
    }
    
    return 'workflow:update'; // Default
  }

  getWatchPaths(): typeof this.watchPaths {
    return { ...this.watchPaths };
  }
}

export const fileWatcher = FileWatcherService.getInstance();
export default fileWatcher;
