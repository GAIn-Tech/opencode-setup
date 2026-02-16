/**
 * Backup Manager
 * Automatic backup with rotation for state files
 */

import fs from 'fs';
import path from 'path';

/**
 * BackupManager - Handles automatic backups with rotation
 */
class BackupManager {
  constructor(options = {}) {
    this.backupDir = options.backupDir || '.backups';
    this.maxBackups = options.maxBackups || 10;
    this.compress = options.compress || false;
    this.enabled = options.enabled !== false;
    
    // Ensure backup directory exists
    if (this.enabled && !fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }
  
  /**
   * Create a backup of a file
   * @param {string} filePath - Path to file to backup
   * @param {Object} options - Backup options
   */
  async backup(filePath, options = {}) {
    if (!this.enabled) return null;
    
    const {
      prefix = '',
      suffix = '',
      metadata = {},
    } = options;
    
    if (!fs.existsSync(filePath)) {
      console.warn(`[BackupManager] File not found: ${filePath}`);
      return null;
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const basename = path.basename(filePath);
    const backupName = `${prefix}${basename}${suffix}.${timestamp}.bak`;
    const backupPath = path.join(this.backupDir, backupName);
    
    try {
      // Read original file
      const content = fs.readFileSync(filePath);
      
      // Write backup
      fs.writeFileSync(backupPath, content);
      
      // Write metadata
      const metadataPath = backupPath + '.meta.json';
      fs.writeFileSync(metadataPath, JSON.stringify({
        originalPath: filePath,
        backupPath,
        timestamp: Date.now(),
        size: content.length,
        ...metadata,
      }, null, 2));
      
      console.log(`[BackupManager] Created backup: ${backupPath}`);
      
      // Run rotation
      await this.rotate(filePath);
      
      return backupPath;
    } catch (error) {
      console.error(`[BackupManager] Backup failed: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Rotate old backups, keeping only maxBackups
   * @param {string} originalPath - Original file path
   */
  async rotate(originalPath) {
    if (!this.enabled || this.maxBackups <= 0) return;
    
    const basename = path.basename(originalPath);
    const pattern = new RegExp(`^${basename}\\..*\\.bak$`);
    
    let backups = [];
    try {
      const files = fs.readdirSync(this.backupDir);
      backups = files
        .filter(f => pattern.test(f))
        .map(f => ({
          name: f,
          path: path.join(this.backupDir, f),
          time: fs.statSync(path.join(this.backupDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);
    } catch (error) {
      console.error(`[BackupManager] Rotation scan failed: ${error.message}`);
      return;
    }
    
    // Remove old backups beyond maxBackups
    const toRemove = backups.slice(this.maxBackups);
    for (const backup of toRemove) {
      try {
        fs.unlinkSync(backup.path);
        // Also remove metadata
        const metaPath = backup.path + '.meta.json';
        if (fs.existsSync(metaPath)) {
          fs.unlinkSync(metaPath);
        }
        console.log(`[BackupManager] Removed old backup: ${backup.name}`);
      } catch (error) {
        console.error(`[BackupManager] Failed to remove backup: ${error.message}`);
      }
    }
  }
  
  /**
   * Restore from a backup
   * @param {string} backupPath - Path to backup file
   * @param {string} targetPath - Target path to restore to
   */
  async restore(backupPath, targetPath) {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupPath}`);
    }
    
    // Create backup of current state before restore
    if (fs.existsSync(targetPath)) {
      await this.backup(targetPath, { prefix: 'pre-restore-' });
    }
    
    const content = fs.readFileSync(backupPath);
    fs.writeFileSync(targetPath, content);
    
    console.log(`[BackupManager] Restored: ${targetPath} from ${backupPath}`);
    return targetPath;
  }
  
  /**
   * List all backups for a file
   * @param {string} originalPath - Original file path
   */
  listBackups(originalPath) {
    const basename = path.basename(originalPath);
    const pattern = new RegExp(`^${basename}\\..*\\.bak$`);
    
    try {
      const files = fs.readdirSync(this.backupDir);
      return files
        .filter(f => pattern.test(f))
        .map(f => {
          const fullPath = path.join(this.backupDir, f);
          const stats = fs.statSync(fullPath);
          return {
            name: f,
            path: fullPath,
            size: stats.size,
            created: stats.mtime,
          };
        })
        .sort((a, b) => b.created - a.created);
    } catch (error) {
      console.error(`[BackupManager] List failed: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Get the latest backup for a file
   * @param {string} originalPath - Original file path
   */
  getLatestBackup(originalPath) {
    const backups = this.listBackups(originalPath);
    return backups.length > 0 ? backups[0] : null;
  }
  
  /**
   * Clean up all backups for a file
   * @param {string} originalPath - Original file path
   */
  async cleanup(originalPath) {
    const backups = this.listBackups(originalPath);
    for (const backup of backups) {
      try {
        fs.unlinkSync(backup.path);
        const metaPath = backup.path + '.meta.json';
        if (fs.existsSync(metaPath)) {
          fs.unlinkSync(metaPath);
        }
      } catch (error) {
        console.error(`[BackupManager] Cleanup failed: ${error.message}`);
      }
    }
    console.log(`[BackupManager] Cleaned up ${backups.length} backups for ${originalPath}`);
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create BackupManager instance
 * @param {Object} options - Options
 */
export function getBackupManager(options = {}) {
  if (!instance) {
    instance = new BackupManager(options);
  }
  return instance;
}

/**
 * Convenience function to backup a file
 * @param {string} filePath - Path to backup
 * @param {Object} options - Options
 */
export async function backupFile(filePath, options = {}) {
  const manager = getBackupManager();
  return manager.backup(filePath, options);
}

/**
 * Convenience function to restore from backup
 * @param {string} backupPath - Backup path
 * @param {string} targetPath - Target path
 */
export async function restoreFile(backupPath, targetPath) {
  const manager = getBackupManager();
  return manager.restore(backupPath, targetPath);
}

export { BackupManager };
export default { getBackupManager, backupFile, restoreFile, BackupManager };
