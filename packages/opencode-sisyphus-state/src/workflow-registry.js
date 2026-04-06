const { WorkflowLoader } = require('./workflow-loader');

/**
 * WorkflowRegistry — Registry of workflow definitions with versioning.
 *
 * Supports:
 * - Registering workflows by name + version
 * - Loading workflows by name (latest) or name + version
 * - Backward compatibility for older versions
 * - Listing available workflows
 *
 * @example
 *   const registry = new WorkflowRegistry();
 *   registry.register(workflow); // auto-registers by name + version
 *   const latest = registry.get('outer-loop-pr-review');
 *   const specific = registry.get('outer-loop-pr-review', '1.0.0');
 */
class WorkflowRegistry {
  /**
   * @param {object} [options]
   * @param {WorkflowLoader} [options.loader] - WorkflowLoader instance
   */
  constructor(options = {}) {
    this.loader = options.loader || new WorkflowLoader();
    /** @type {Map<string, Map<string, object>>} */
    this._workflows = new Map(); // name → Map<version, workflow>
  }

  /**
   * Register a workflow definition.
   *
   * @param {object} workflow - Workflow definition (from WorkflowLoader)
   * @returns {void}
   */
  register(workflow) {
    if (!workflow.name || !workflow.version) {
      throw new Error('Workflow must have name and version');
    }

    if (!this._workflows.has(workflow.name)) {
      this._workflows.set(workflow.name, new Map());
    }

    const versions = this._workflows.get(workflow.name);
    versions.set(workflow.version, workflow);
  }

  /**
   * Load workflows from a directory and register them.
   *
   * @param {string} dirPath - Directory containing workflow files
   * @returns {number} Number of workflows registered
   */
  loadDirectory(dirPath) {
    const workflows = this.loader.loadDirectory(dirPath);
    for (const [name, workflow] of workflows) {
      this.register(workflow);
    }
    return workflows.size;
  }

  /**
   * Get a workflow by name and optionally version.
   * If no version specified, returns the latest version.
   *
   * @param {string} name - Workflow name
   * @param {string} [version] - Specific version (optional)
   * @returns {object|null} Workflow definition or null if not found
   */
  get(name, version = null) {
    const versions = this._workflows.get(name);
    if (!versions || versions.size === 0) {
      return null;
    }

    if (version) {
      return versions.get(version) || null;
    }

    // Return latest version (highest semver)
    const sortedVersions = [...versions.keys()].sort(compareSemver);
    return versions.get(sortedVersions[sortedVersions.length - 1]) || null;
  }

  /**
   * List all registered workflows.
   *
   * @returns {Array<{name: string, versions: string[]}>}
   */
  list() {
    const result = [];
    for (const [name, versions] of this._workflows) {
      result.push({
        name,
        versions: [...versions.keys()].sort(compareSemver)
      });
    }
    return result;
  }

  /**
   * Check if a workflow exists.
   *
   * @param {string} name - Workflow name
   * @param {string} [version] - Specific version (optional)
   * @returns {boolean}
   */
  has(name, version = null) {
    return this.get(name, version) !== null;
  }

  /**
   * Get all versions of a workflow.
   *
   * @param {string} name - Workflow name
   * @returns {string[]} Sorted array of versions
   */
  getVersions(name) {
    const versions = this._workflows.get(name);
    if (!versions) return [];
    return [...versions.keys()].sort(compareSemver);
  }

  /**
   * Remove a specific version or all versions of a workflow.
   *
   * @param {string} name - Workflow name
   * @param {string} [version] - Specific version to remove (optional)
   * @returns {boolean} True if something was removed
   */
  remove(name, version = null) {
    const versions = this._workflows.get(name);
    if (!versions) return false;

    if (version) {
      return versions.delete(version);
    }

    return this._workflows.delete(name);
  }
}

/**
 * Compare two semver strings for sorting.
 * @private
 */
function compareSemver(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

module.exports = { WorkflowRegistry };
