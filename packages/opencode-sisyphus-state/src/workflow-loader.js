const fs = require('fs');
const path = require('path');

// Load workflow JSON schema (co-located with this loader)
const WORKFLOW_SCHEMA_PATH = path.join(__dirname, 'schema', 'workflow.json');

/**
 * WorkflowLoader — Loads and validates data-driven workflow definitions.
 *
 * Supports JSON and YAML workflow files.
 * Validates against the workflow JSON schema.
 * Resolves PEV role references to actual implementations.
 *
 * @example
 *   const loader = new WorkflowLoader();
 *   const workflow = loader.load('./workflows/outer-loop-pr-review.json');
 *   // workflow is validated and ready for executor
 */
class WorkflowLoader {
  /**
   * @param {object} [options]
   * @param {string} [options.schemaPath] - Path to workflow JSON schema
   * @param {object} [options.pevContract] - PEV contract for role resolution
   */
  constructor(options = {}) {
    this.schemaPath = options.schemaPath || WORKFLOW_SCHEMA_PATH;
    this.pevContract = options.pevContract || null;
    this._schema = null;
  }

  /**
   * Load workflow from JSON or YAML file.
   *
   * @param {string} filePath - Path to workflow definition file
   * @returns {object} Validated workflow definition
   */
  load(filePath) {
    const resolvedPath = path.resolve(filePath);
    
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Workflow file not found: ${resolvedPath}`);
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    let rawContent;
    
    try {
      rawContent = fs.readFileSync(resolvedPath, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read workflow file: ${err.message}`);
    }

    let workflowDef;
    
    if (ext === '.json') {
      try {
        workflowDef = JSON.parse(rawContent);
      } catch (err) {
        throw new Error(`Invalid JSON in workflow file: ${err.message}`);
      }
    } else {
      throw new Error(`Unsupported workflow file format: ${ext}. Use .json`);
    }

    // Validate against schema
    const validation = this.validate(workflowDef);
    if (!validation.valid) {
      throw new Error(`Workflow validation failed:\n${validation.errors.map(e => `  - ${e}`).join('\n')}`);
    }

    // Resolve PEV roles if contract is available
    if (this.pevContract) {
      workflowDef = this._resolvePevRoles(workflowDef);
    }

    // Set defaults from policy
    workflowDef = this._applyPolicyDefaults(workflowDef);

    return workflowDef;
  }

  /**
   * Validate a workflow definition against the schema.
   *
   * @param {object} workflowDef - Workflow definition object
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(workflowDef) {
    const errors = [];

    if (!workflowDef || typeof workflowDef !== 'object') {
      return { valid: false, errors: ['Workflow definition must be an object'] };
    }

    // Required fields
    if (!workflowDef.name || typeof workflowDef.name !== 'string') {
      errors.push('Workflow must have a non-empty string "name"');
    }

    if (!workflowDef.version || typeof workflowDef.version !== 'string') {
      errors.push('Workflow must have a string "version" (e.g., "1.0.0")');
    } else if (!/^\d+\.\d+\.\d+$/.test(workflowDef.version)) {
      errors.push('Workflow version must be semantic version format (e.g., "1.0.0")');
    }

    if (!Array.isArray(workflowDef.steps) || workflowDef.steps.length === 0) {
      errors.push('Workflow must have a non-empty "steps" array');
    } else {
      // Validate each step
      workflowDef.steps.forEach((step, index) => {
        if (!step.id || typeof step.id !== 'string') {
          errors.push(`Step[${index}] must have a non-empty string "id"`);
        }
        if (!step.type || typeof step.type !== 'string') {
          errors.push(`Step[${index}] must have a non-empty string "type"`);
        }
        if (step.pe_role && !['planner', 'executor', 'verifier', 'critic'].includes(step.pe_role)) {
          errors.push(`Step[${index}] pe_role must be one of: planner, executor, verifier, critic`);
        }
        if (step.type === 'parallel-for' && !step.foreach) {
          errors.push(`Step[${index}] parallel-for step must have a "foreach" field`);
        }
        if (typeof step.retries === 'number' && step.retries < 0) {
          errors.push(`Step[${index}] retries must be >= 0`);
        }
        if (typeof step.backoff_ms === 'number' && step.backoff_ms < 0) {
          errors.push(`Step[${index}] backoff_ms must be >= 0`);
        }
      });
    }

    // Validate PEV roles if present
    if (workflowDef.pe_roles && Array.isArray(workflowDef.pe_roles)) {
      const validRoles = ['planner', 'executor', 'verifier', 'critic'];
      for (const role of workflowDef.pe_roles) {
        if (!validRoles.includes(role)) {
          errors.push(`Invalid pe_role: ${role}. Must be one of: ${validRoles.join(', ')}`);
        }
      }
    }

    // Validate policy if present
    if (workflowDef.policy && typeof workflowDef.policy === 'object') {
      const p = workflowDef.policy;
      if (p.max_retries !== undefined && (typeof p.max_retries !== 'number' || p.max_retries < 0)) {
        errors.push('Policy max_retries must be a non-negative number');
      }
      if (p.backoff_ms !== undefined && (typeof p.backoff_ms !== 'number' || p.backoff_ms < 0)) {
        errors.push('Policy backoff_ms must be a non-negative number');
      }
      if (p.parallel_concurrency !== undefined && (typeof p.parallel_concurrency !== 'number' || p.parallel_concurrency < 1)) {
        errors.push('Policy parallel_concurrency must be >= 1');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Load workflow from a directory of workflow files.
   *
   * @param {string} dirPath - Directory containing workflow files
   * @returns {Map<string, object>} Map of workflow name → definition
   */
  loadDirectory(dirPath) {
    const resolvedDir = path.resolve(dirPath);
    
    if (!fs.existsSync(resolvedDir)) {
      throw new Error(`Workflow directory not found: ${resolvedDir}`);
    }

    const workflows = new Map();
    const files = fs.readdirSync(resolvedDir);

     for (const file of files) {
       const ext = path.extname(file).toLowerCase();
       if (ext === '.json') {
         const filePath = path.join(resolvedDir, file);
         try {
           const workflow = this.load(filePath);
           workflows.set(workflow.name, workflow);
         } catch (err) {
           console.warn(`[WorkflowLoader] Failed to load ${file}: ${err.message}`);
         }
       }
     }

    return workflows;
  }

  /**
   * Resolve PEV role references in workflow steps.
   * @private
   */
  _resolvePevRoles(workflowDef) {
    if (!this.pevContract) return workflowDef;

    const resolvedSteps = workflowDef.steps.map(step => {
      if (step.pe_role && this.pevContract[step.pe_role]) {
        return {
          ...step,
          _pev_impl: this.pevContract[step.pe_role]
        };
      }
      return step;
    });

    return {
      ...workflowDef,
      steps: resolvedSteps
    };
  }

  /**
   * Apply policy defaults to steps that don't override them.
   * @private
   */
  _applyPolicyDefaults(workflowDef) {
    const policy = workflowDef.policy || {};
    const defaultRetries = policy.max_retries ?? 3;
    const defaultBackoff = policy.backoff_ms ?? 1000;

    const resolvedSteps = workflowDef.steps.map(step => ({
      ...step,
      retries: step.retries ?? defaultRetries,
      backoff_ms: step.backoff_ms ?? defaultBackoff
    }));

    return {
      ...workflowDef,
      steps: resolvedSteps
    };
  }


}

module.exports = { WorkflowLoader };
