'use strict';

const { WorkflowStore } = require('./database');
const { WorkflowExecutor } = require('./executor');
const { BudgetEnforcer } = require('./budget-enforcer');
const { ProviderQuotaManager } = require('./quota-manager');
const { createQuotaAwareRouterHandler } = require('./integrations/quota-routing');

/**
 * Sisyphus - Unified Orchestration Facade
 * 
 * Provides a simple API for workflow orchestration that wraps
 * all underlying components (WorkflowStore, WorkflowExecutor, BudgetEnforcer, etc.)
 * 
 * @example
 * const sisyphus = new Sisyphus({ config: { ... } });
 * sisyphus.on('step:start', (step) => console.log('Starting:', step.id));
 * sisyphus.on('step:complete', (step) => console.log('Completed:', step.id));
 * sisyphus.on('error', (err) => console.error('Error:', err));
 * await sisyphus.run(workflow);
 */
class Sisyphus {
  /**
   * @param {Object} [options={}]
   * @param {Object} [options.config] - Configuration for orchestration
   * @param {string} [options.dbPath] - Path to workflow database
   * @param {Object} [options.budgetConfig] - Budget enforcement config
   * @param {Object} [options.quotaConfig] - Provider quota config
   */
  constructor(options = {}) {
    this._options = options;
    this._store = null;
    this._executor = null;
    this._budgetEnforcer = null;
    this._quotaManager = null;
    this._eventListeners = new Map();
    this._initialized = false;
    
    // Initialize components
    this._init();
  }
  
  /**
   * Initialize all underlying components
   * @private
   */
  _init() {
    try {
      // Workflow storage
      this._store = new WorkflowStore(this._options.dbPath);
      
      // Budget enforcement
      this._budgetEnforcer = new BudgetEnforcer(this._options.budgetConfig || {});
      
      // Provider quota management
      this._quotaManager = new ProviderQuotaManager(this._options.quotaConfig || {});
      
      // Workflow executor with event emission
      this._executor = new WorkflowExecutor({
        store: this._store,
        budgetEnforcer: this._budgetEnforcer,
        quotaManager: this._quotaManager,
        onStepStart: (step) => this._emit('step:start', step),
        onStepComplete: (step) => this._emit('step:complete', step),
        onStepError: (step, err) => this._emit('step:error', { step, error: err }),
      });
      
      this._initialized = true;
    } catch (err) {
      console.error('[Sisyphus] Initialization failed:', err.message);
      this._initialized = false;
    }
  }
  
  /**
   * Check if Sisyphus is initialized
   * @returns {boolean}
   */
  isReady() {
    return this._initialized;
  }
  
  /**
   * Register event listener
   * @param {string} event - Event name ('step:start', 'step:complete', 'error')
   * @param {Function} callback - Called with event data
   * @returns {this}
   */
  on(event, callback) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, []);
    }
    this._eventListeners.get(event).push(callback);
    return this;
  }
  
  /**
   * Remove event listener
   * @param {string} event
   * @param {Function} callback
   * @returns {this}
   */
  off(event, callback) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) {
        listeners.splice(idx, 1);
      }
    }
    return this;
  }
  
  /**
   * Emit event to all listeners
   * @private
   */
  _emit(event, data) {
    const listeners = this._eventListeners.get(event) || [];
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (err) {
        console.error(`[Sisyphus] Event listener error for '${event}':`, err.message);
      }
    }
  }
  
  /**
   * Run a workflow
   * @param {Object} workflow - Workflow definition
   * @param {Object} [context={}] - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async run(workflow, context = {}) {
    if (!this._initialized) {
      throw new Error('Sisyphus not initialized');
    }
    
    this._emit('workflow:start', { workflow, context });
    
    try {
      // Validate workflow
      if (!workflow || !workflow.id) {
        throw new Error('Workflow must have an id');
      }
      
      // Check budget before execution
      const budgetCheck = this._budgetEnforcer.check(workflow, context);
      if (!budgetCheck.allowed) {
        throw new Error(`Budget exceeded: ${budgetCheck.message}`);
      }
      
      // Execute workflow
      const result = await this._executor.execute(workflow, {
        ...context,
        quotaManager: this._quotaManager,
      });
      
      this._emit('workflow:complete', { workflow, result });
      return result;
      
    } catch (err) {
      this._emit('error', { workflow, error: err });
      throw err;
    }
  }
  
  /**
   * Get workflow store for direct access
   * @returns {WorkflowStore}
   */
  getStore() {
    return this._store;
  }
  
  /**
   * Get executor for direct access
   * @returns {WorkflowExecutor}
   */
  getExecutor() {
    return this._executor;
  }
  
  /**
   * Get budget enforcer for direct access
   * @returns {BudgetEnforcer}
   */
  getBudgetEnforcer() {
    return this._budgetEnforcer;
  }
  
  /**
   * Get quota manager for direct access
   * @returns {ProviderQuotaManager}
   */
  getQuotaManager() {
    return this._quotaManager;
  }
  
  /**
   * Shutdown and cleanup resources
   * @returns {Promise<void>}
   */
  async shutdown() {
    this._emit('shutdown', {});
    // Close database connections, clear intervals, etc.
    if (this._store && this._store.close) {
      await this._store.close();
    }
    this._initialized = false;
  }
}

module.exports = { Sisyphus };