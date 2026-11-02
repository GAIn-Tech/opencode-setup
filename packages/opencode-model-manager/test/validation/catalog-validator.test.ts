// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const { CatalogValidator } = require('../../src/validation/catalog-validator');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('CatalogValidator', () => {
  let validator;
  let tempDir;
  let catalogPath;
  let schemaPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validator-test-'));
    catalogPath = path.join(tempDir, 'catalog.json');
    schemaPath = path.join(tempDir, 'schema.json');
    
    // Create valid schema
    await fs.writeFile(schemaPath, JSON.stringify({
      version: '1.0.0',
      requiredFields: ['id', 'provider', 'displayName']
    }, null, 2));
    
    validator = new CatalogValidator({ catalogPath, schemaPath });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('validate()', () => {
    test('should pass for valid catalog', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        models: [
          {
            id: 'gpt-4',
            provider: 'openai',
            displayName: 'GPT-4',
            contextTokens: 8192,
            deprecated: false
          }
        ]
      }, null, 2));
      
      const result = await validator.validate();
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('should fail for missing version', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        lastUpdated: new Date().toISOString(),
        models: []
      }, null, 2));
      
      const result = await validator.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'STRUCTURE' && e.field === 'version')).toBe(true);
    });

    test('should fail for missing lastUpdated', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        version: '1.0.0',
        models: []
      }, null, 2));
      
      const result = await validator.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'STRUCTURE' && e.field === 'lastUpdated')).toBe(true);
    });

    test('should fail for non-array models', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        models: {}
      }, null, 2));
      
      const result = await validator.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'STRUCTURE' && e.field === 'models')).toBe(true);
    });
  });

  describe('validateDuplicates()', () => {
    test('should detect duplicate model IDs', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        models: [
          { id: 'gpt-4', provider: 'openai', displayName: 'GPT-4' },
          { id: 'gpt-4', provider: 'openai', displayName: 'GPT-4 Duplicate' }
        ]
      }, null, 2));
      
      const result = await validator.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'DUPLICATE' && e.modelId === 'gpt-4')).toBe(true);
    });
  });

  describe('validateRequiredFields()', () => {
    test('should fail for missing required fields', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        models: [
          { provider: 'openai', displayName: 'GPT-4' } // Missing id
        ]
      }, null, 2));
      
      const result = await validator.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'SCHEMA' && e.field === 'id')).toBe(true);
    });

    test('should fail for empty string ID', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        models: [
          { id: '', provider: 'openai', displayName: 'GPT-4' }
        ]
      }, null, 2));
      
      const result = await validator.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'REQUIRED_FIELD')).toBe(true);
    });
  });

  describe('validateForbiddenPatterns()', () => {
    test('should fail for test models', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        models: [
          { id: 'test-model-1', provider: 'openai', displayName: 'Test Model' }
        ]
      }, null, 2));
      
      const result = await validator.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.type === 'FORBIDDEN_PATTERN')).toBe(true);
    });

    test('should warn for dev models', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        models: [
          { id: 'dev-model-1', provider: 'openai', displayName: 'Dev Model' }
        ]
      }, null, 2));
      
      const result = await validator.validate();
      expect(result.warnings.some(w => w.type === 'FORBIDDEN_PATTERN')).toBe(true);
    });
  });

  describe('validateTimestamps()', () => {
    test('should warn for stale catalog', async () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 48); // 48 hours ago
      
      await fs.writeFile(catalogPath, JSON.stringify({
        version: '1.0.0',
        lastUpdated: oldDate.toISOString(),
        models: [
          { id: 'gpt-4', provider: 'openai', displayName: 'GPT-4' }
        ]
      }, null, 2));
      
      const result = await validator.validate();
      expect(result.warnings.some(w => w.type === 'STALE_CATALOG')).toBe(true);
    });
  });

  describe('formatResults()', () => {
    test('should format success message', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        models: [
          { id: 'gpt-4', provider: 'openai', displayName: 'GPT-4' }
        ]
      }, null, 2));
      
      const result = await validator.validate();
      const formatted = validator.formatResults(result);
      
      expect(formatted).toContain('✅');
      expect(formatted).toContain('PASSED');
      expect(formatted).toContain('Models: 1');
    });

    test('should format error message', async () => {
      await fs.writeFile(catalogPath, JSON.stringify({
        models: []
      }, null, 2));
      
      const result = await validator.validate();
      const formatted = validator.formatResults(result);
      
      expect(formatted).toContain('❌');
      expect(formatted).toContain('FAILED');
      expect(formatted).toContain('ERRORS:');
    });
  });
});
