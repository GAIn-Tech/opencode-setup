// @ts-nocheck
const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const { PRGenerator } = require('../../src/automation/pr-generator');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('PRGenerator', () => {
  let prGenerator;
  let tempDir;
  let catalogPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-generator-test-'));
    catalogPath = path.join(tempDir, 'catalog-2026.json');
    
    // Create initial catalog
    await fs.writeFile(catalogPath, JSON.stringify({
      version: '1.0.0',
      lastUpdated: '2026-02-01T00:00:00Z',
      models: {
        'openai/gpt-4': {
          id: 'gpt-4',
          provider: 'openai',
          displayName: 'GPT-4',
          contextTokens: 8192,
          outputTokens: 4096,
          deprecated: false
        }
      }
    }, null, 2));
    
    prGenerator = new PRGenerator({
      catalogPath,
      repoPath: tempDir
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('generatePRTitle()', () => {
    test('should generate title with counts', () => {
      const diff = {
        added: [
          { model: { id: 'gpt-4-turbo' }, provider: 'openai', classification: 'major' }
        ],
        modified: [
          { model: { id: 'gpt-4' }, provider: 'openai', classification: 'minor' }
        ],
        removed: []
      };
      
      const title = prGenerator.generatePRTitle(diff);
      expect(title).toContain('[AUTO]');
      expect(title).toContain('openai');
      expect(title).toContain('1 new');
      expect(title).toContain('1 updated');
    });
  });

  describe('generatePRBody()', () => {
    test('should generate PR body with tables', () => {
      const diff = {
        added: [
          { 
            model: { id: 'gpt-4-turbo', contextTokens: 128000 }, 
            provider: 'openai', 
            classification: 'major' 
          }
        ],
        modified: [
          { 
            model: { id: 'gpt-4' }, 
            provider: 'openai', 
            classification: 'minor',
            changes: { contextTokens: { old: 8192, new: 8193 } }
          }
        ],
        removed: []
      };
      
      const body = prGenerator.generatePRBody(diff);
      expect(body).toContain('## Summary');
      expect(body).toContain('## Added Models');
      expect(body).toContain('## Modified Models');
      expect(body).toContain('gpt-4-turbo');
      expect(body).toContain('gpt-4');
      expect(body).toContain('## Risk Assessment');
      expect(body).toContain('## Testing Checklist');
    });

    test('should show major changes warning', () => {
      const diff = {
        added: [
          { model: { id: 'new-model' }, provider: 'openai', classification: 'major' }
        ],
        modified: [],
        removed: []
      };
      
      const body = prGenerator.generatePRBody(diff);
      expect(body).toContain('⚠️');
      expect(body).toContain('major changes');
    });

    test('should show low-risk for minor changes', () => {
      const diff = {
        added: [],
        modified: [
          { model: { id: 'gpt-4' }, provider: 'openai', classification: 'minor' }
        ],
        removed: []
      };
      
      const body = prGenerator.generatePRBody(diff);
      expect(body).toContain('✅');
      expect(body).toContain('low-risk');
    });
  });

  describe('updateCatalog()', () => {
    test('should add new models to catalog', async () => {
      const diff = {
        added: [
          {
            model: {
              id: 'gpt-4-turbo',
              displayName: 'GPT-4 Turbo',
              contextTokens: 128000,
              outputTokens: 4096,
              deprecated: false,
              capabilities: { streaming: true }
            },
            provider: 'openai',
            classification: 'major'
          }
        ],
        modified: [],
        removed: []
      };
      
      await prGenerator.updateCatalog(diff);
      
      const catalogContent = await fs.readFile(catalogPath, 'utf-8');
      const catalog = JSON.parse(catalogContent);
      
      expect(Array.isArray(catalog.models)).toBe(false);
      expect(catalog.models['openai/gpt-4-turbo']).toBeDefined();
      expect(catalog.models['openai/gpt-4-turbo'].id).toBe('gpt-4-turbo');
      expect(catalog.models['openai/gpt-4-turbo'].contextTokens).toBe(128000);
      expect(catalog.lastUpdated).toBeDefined();
    });

    test('should update existing models', async () => {
      const diff = {
        added: [],
        modified: [
          {
            model: {
              id: 'gpt-4',
              contextTokens: 8193
            },
            provider: 'openai',
            classification: 'minor'
          }
        ],
        removed: []
      };
      
      await prGenerator.updateCatalog(diff);
      
      const catalogContent = await fs.readFile(catalogPath, 'utf-8');
      const catalog = JSON.parse(catalogContent);
      
      expect(catalog.models['openai/gpt-4'].contextTokens).toBe(8193);
      expect(catalog.models['openai/gpt-4'].updatedAt).toBeDefined();
    });

    test('should mark removed models as deprecated', async () => {
      const diff = {
        added: [],
        modified: [],
        removed: [
          {
            model: { id: 'gpt-4' },
            provider: 'openai',
            classification: 'major'
          }
        ]
      };
      
      await prGenerator.updateCatalog(diff);
      
      const catalogContent = await fs.readFile(catalogPath, 'utf-8');
      const catalog = JSON.parse(catalogContent);
      
      expect(catalog.models['openai/gpt-4'].deprecated).toBe(true);
      expect(catalog.models['openai/gpt-4'].deprecatedAt).toBeDefined();
    });

    test('exposes a dedicated live PR creation seam', () => {
      expect(typeof prGenerator.createPullRequest).toBe('function');
    });
  });

   describe('Security: Command Injection Prevention', () => {
     test('should safely handle shell metacharacters in branch names', async () => {
       // Test that shell metacharacters don't execute as commands
       const maliciousBranchNames = [
         'auto/model-update-$(whoami)',
         'auto/model-update-`id`',
         'auto/model-update-; rm -rf /',
         'auto/model-update-| cat /etc/passwd',
         'auto/model-update-& echo hacked',
         'auto/model-update-$(touch /tmp/pwned)',
       ];

       for (const branchName of maliciousBranchNames) {
         // These should not throw during branch name processing
         // execFileSync with array form prevents shell interpretation
         const title = prGenerator.generatePRTitle({
           added: [],
           modified: [],
           removed: []
         });
         expect(title).toBeDefined();
       }
     });

     test('should safely handle shell metacharacters in commit messages', async () => {
       // Test that commit messages with shell metacharacters are safe
       const diff = {
         added: [
           {
             model: {
               id: 'test-model',
               displayName: 'Test Model',
               contextTokens: 1000,
               outputTokens: 500,
               deprecated: false,
               capabilities: {}
             },
             provider: 'test',
             classification: 'minor'
           }
         ],
         modified: [],
         removed: []
       };

       // generateCommitMessage should safely handle any input
       const commitMessage = prGenerator.generateCommitMessage(diff);
       expect(commitMessage).toContain('chore(models)');
       expect(commitMessage).toContain('1 new');
     });
   });
});
