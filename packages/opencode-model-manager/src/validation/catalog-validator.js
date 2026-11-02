'use strict';

const fs = require('fs').promises;
const path = require('path');

/**
 * Catalog Validator for model catalog integrity checks.
 * 
 * Validates catalog structure, schema compliance, and business rules.
 */
class CatalogValidator {
  /**
   * @param {object} options - Configuration options
   * @param {string} options.catalogPath - Path to catalog file
   * @param {string} options.schemaPath - Path to schema file
   */
  constructor(options = {}) {
    this.catalogPath = options.catalogPath || path.join(process.cwd(), 'opencode-config/models/catalog-2026.json');
    this.schemaPath = options.schemaPath || path.join(process.cwd(), 'opencode-config/models/schema.json');
  }

  /**
   * Validate catalog file.
   * 
   * @returns {Promise<object>} Validation result
   */
  async validate() {
    const errors = [];
    const warnings = [];
    
    try {
      // Load catalog
      const catalogContent = await fs.readFile(this.catalogPath, 'utf-8');
      const catalog = JSON.parse(catalogContent);
      
      // Load schema
      const schemaContent = await fs.readFile(this.schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      
      // Run validation checks
      this.validateStructure(catalog, errors);
      this.validateSchema(catalog, schema, errors);
      this.validateDuplicates(catalog, errors);
      this.validateRequiredFields(catalog, errors);
      this.validateForbiddenPatterns(catalog, errors, warnings);
      this.validateTimestamps(catalog, warnings);
      
      return {
        valid: errors.length === 0,
        errors,
        warnings,
        catalog,
        schema
      };
    } catch (error) {
      errors.push({
        type: 'FATAL',
        message: `Failed to load catalog: ${error.message}`,
        path: this.catalogPath
      });
      
      return {
        valid: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Validate basic structure.
   */
  validateStructure(catalog, errors) {
    if (!catalog.version) {
      errors.push({
        type: 'STRUCTURE',
        message: 'Missing required field: version',
        field: 'version'
      });
    }
    
    if (!catalog.lastUpdated) {
      errors.push({
        type: 'STRUCTURE',
        message: 'Missing required field: lastUpdated',
        field: 'lastUpdated'
      });
    }
    
    if (!Array.isArray(catalog.models)) {
      errors.push({
        type: 'STRUCTURE',
        message: 'Field "models" must be an array',
        field: 'models'
      });
    }
  }

  /**
   * Validate against schema.
   */
  validateSchema(catalog, schema, errors) {
    if (!catalog.models || !Array.isArray(catalog.models)) {
      return;
    }
    
    for (let i = 0; i < catalog.models.length; i++) {
      const model = catalog.models[i];
      
      // Check required fields from schema
      const requiredFields = ['id', 'provider', 'displayName'];
      for (const field of requiredFields) {
        if (!model[field]) {
          errors.push({
            type: 'SCHEMA',
            message: `Model missing required field: ${field}`,
            modelIndex: i,
            modelId: model.id || 'unknown',
            field
          });
        }
      }
      
      // Validate field types
      if (model.contextTokens !== undefined && typeof model.contextTokens !== 'number') {
        errors.push({
          type: 'SCHEMA',
          message: 'Field "contextTokens" must be a number',
          modelIndex: i,
          modelId: model.id,
          field: 'contextTokens'
        });
      }
      
      if (model.deprecated !== undefined && typeof model.deprecated !== 'boolean') {
        errors.push({
          type: 'SCHEMA',
          message: 'Field "deprecated" must be a boolean',
          modelIndex: i,
          modelId: model.id,
          field: 'deprecated'
        });
      }
    }
  }

  /**
   * Check for duplicate model IDs.
   */
  validateDuplicates(catalog, errors) {
    if (!catalog.models || !Array.isArray(catalog.models)) {
      return;
    }
    
    const seen = new Set();
    const duplicates = new Set();
    
    for (const model of catalog.models) {
      if (!model.id) continue;
      
      if (seen.has(model.id)) {
        duplicates.add(model.id);
      }
      seen.add(model.id);
    }
    
    for (const id of duplicates) {
      errors.push({
        type: 'DUPLICATE',
        message: `Duplicate model ID: ${id}`,
        modelId: id
      });
    }
  }

  /**
   * Validate required fields are present.
   */
  validateRequiredFields(catalog, errors) {
    if (!catalog.models || !Array.isArray(catalog.models)) {
      return;
    }
    
    for (let i = 0; i < catalog.models.length; i++) {
      const model = catalog.models[i];
      
      // Check for empty strings
      if (model.id === '') {
        errors.push({
          type: 'REQUIRED_FIELD',
          message: 'Model ID cannot be empty string',
          modelIndex: i
        });
      }
      
      if (model.provider === '') {
        errors.push({
          type: 'REQUIRED_FIELD',
          message: 'Provider cannot be empty string',
          modelIndex: i,
          modelId: model.id
        });
      }
    }
  }

  /**
   * Check for forbidden patterns.
   */
  validateForbiddenPatterns(catalog, errors, warnings) {
    if (!catalog.models || !Array.isArray(catalog.models)) {
      return;
    }
    
    const forbiddenPatterns = [
      { pattern: /test-model/i, severity: 'error', message: 'Test models not allowed in production catalog' },
      { pattern: /^tmp-/i, severity: 'error', message: 'Temporary model IDs not allowed' },
      { pattern: /^dev-/i, severity: 'warning', message: 'Development model detected' }
    ];
    
    for (let i = 0; i < catalog.models.length; i++) {
      const model = catalog.models[i];
      
      for (const { pattern, severity, message } of forbiddenPatterns) {
        if (pattern.test(model.id)) {
          const issue = {
            type: 'FORBIDDEN_PATTERN',
            message: `${message}: ${model.id}`,
            modelIndex: i,
            modelId: model.id,
            pattern: pattern.toString()
          };
          
          if (severity === 'error') {
            errors.push(issue);
          } else {
            warnings.push(issue);
          }
        }
      }
    }
  }

  /**
   * Validate timestamps.
   */
  validateTimestamps(catalog, warnings) {
    if (catalog.lastUpdated) {
      const lastUpdated = new Date(catalog.lastUpdated);
      const now = new Date();
      const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);
      
      if (hoursSinceUpdate > 24) {
        warnings.push({
          type: 'STALE_CATALOG',
          message: `Catalog not updated in ${Math.floor(hoursSinceUpdate)} hours`,
          lastUpdated: catalog.lastUpdated
        });
      }
    }
  }

  /**
   * Format validation results for display.
   */
  formatResults(result) {
    const lines = [];
    
    if (result.valid) {
      lines.push('✅ Catalog validation PASSED');
      lines.push('');
      lines.push(`Models: ${result.catalog?.models?.length || 0}`);
      lines.push(`Version: ${result.catalog?.version || 'unknown'}`);
      lines.push(`Last Updated: ${result.catalog?.lastUpdated || 'unknown'}`);
    } else {
      lines.push('❌ Catalog validation FAILED');
      lines.push('');
      lines.push(`Errors: ${result.errors.length}`);
    }
    
    if (result.errors.length > 0) {
      lines.push('');
      lines.push('ERRORS:');
      for (const error of result.errors) {
        lines.push(`  - [${error.type}] ${error.message}`);
        if (error.modelId) {
          lines.push(`    Model: ${error.modelId}`);
        }
      }
    }
    
    if (result.warnings.length > 0) {
      lines.push('');
      lines.push('WARNINGS:');
      for (const warning of result.warnings) {
        lines.push(`  - [${warning.type}] ${warning.message}`);
      }
    }
    
    return lines.join('\n');
  }
}

module.exports = { CatalogValidator };
