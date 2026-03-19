# Automatic Project Knowledge Base Generation for OpenCode

**For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement automatic generation of a unique knowledge base (.sisyphus/ directory) for every project worked on with opencode, following the format and architecture of opencode's existing meta-knowledge system while insulating project-specific details from cross-project learning sync.

**Architecture:** 3 phases:
1. **Phase 1:** Detection and initialization mechanism (MVP)
2. **Phase 2:** Integration with existing meta-knowledge systems
3. **Phase 3:** Cross-project learning sync with global meta-KB

---

## Planning Philosophy

**Problem Statement:**
- Opencode's sophisticated meta-knowledge system (.sisyphus/, skill playbook, audit templates, meta-super-cycle) exists only in the opencode-setup repository
- When working on other projects, there's no automatic knowledge base initialization
- Users want project-specific KB but can sync beneficial learnings to global meta-KB

**Current System State (from META-KNOWLEDGE-SUMMARY.md):**
- ✅ Three-tier meta-knowledge system implemented:
  1. AGENTS.md hierarchy (37 files, 30 existing + 7 new)
  2. ECOSYSTEM.md (comprehensive documentation)
  3. KNOWLEDGE-GRAPH.json (navigable graph structure)
- ✅ Skill playbook with 7 audit prompts
- ✅ Meta-super-cycle automation that runs audits based on staleness
- ✅ Standardized audit report templates (*-audit-YYYY-MM-DD.md)
- ✅ .sisyphus/ directory structure: notepads/, plans/, drafts/, evidence/, analysis/, proposals/, reports/

**Design Decisions:**
- Detect when opencode starts in a directory without .sisyphus/
- Automatically initialize standard directory structure and template files
- Provide both automatic and manual trigger options (per user preference)
- Insulate project-specific files while allowing beneficial learning sync
- Use existing meta-knowledge templates and automation patterns

**User Requirements (from clarifications):**
- "Both perhaps?" → Automatic generation + explicit trigger command
- "I was thinking like our knowledge graphs of the project structure and relevant context" → Include project structure analysis
- "I want all our orchestration/opencode meta-kb/kg stuff to be synced with the opencode setup, yes... but all project specific file structures and project details... should be insulated" → Hybrid approach

---

## Phase 1: Detection and Initialization (MVP)

### Task 1: Create Initialization Detection Module

**Files:**
- Create: `packages/opencode-init-kb/src/kb-initializer.js`
- Create: `packages/opencode-init-kb/package.json`
- Modify: `scripts/resolve-root.mjs` (export detectKbStructure function)

**Step 1: Create the initialization module**

```javascript
// packages/opencode-init-kb/src/kb-initializer.js
'use strict';

const fs = require('fs');
const path = require('path');

class KbInitializer {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.sisyphusDir = path.join(rootDir, '.sisyphus');
  }

  /**
   * Check if .sisyphus/ directory exists
   * @returns {boolean}
   */
  hasSisyphusDir() {
    return fs.existsSync(this.sisyphusDir);
  }

  /**
   * Get required directory structure for .sisyphus/
   * @returns {string[]}
   */
  getRequiredSubdirs() {
    return [
      'notepads',
      'plans',
      'drafts',
      'evidence',
      'analysis',
      'proposals',
      'reports'
    ];
  }

  /**
   * Initialize .sisyphus/ directory structure
   * @returns {boolean} success
   */
  initializeStructure() {
    try {
      // Create main directory
      if (!fs.existsSync(this.sisyphusDir)) {
        fs.mkdirSync(this.sisyphusDir, { recursive: true });
      }

      // Create subdirectories
      const subdirs = this.getRequiredSubdirs();
      for (const subdir of subdirs) {
        const subdirPath = path.join(this.sisyphusDir, subdir);
        if (!fs.existsSync(subdirPath)) {
          fs.mkdirSync(subdirPath, { recursive: true });
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize .sisyphus/ structure:', error);
      return false;
    }
  }

  /**
   * Copy template files from global templates to project .sisyphus/
   * @param {string} templatesDir - Directory containing template files
   * @returns {boolean} success
   */
  copyTemplateFiles(templatesDir) {
    try {
      // Copy skill-playbook template
      const playbookSource = path.join(templatesDir, 'skill-playbook-template.md');
      const playbookDest = path.join(this.sisyphusDir, 'notepads', 'skill-playbook.md');
      
      if (fs.existsSync(playbookSource) && !fs.existsSync(playbookDest)) {
        const content = fs.readFileSync(playbookSource, 'utf-8');
        const datedContent = content.replace('YYYY-MM-DD', new Date().toISOString().split('T')[0]);
        fs.writeFileSync(playbookDest, datedContent);
      }

      // Copy audit template structure
      const auditTemplates = [
        { source: 'health-audit-template.md', dest: 'notepads/health-audit.md' },
        { source: 'skill-coverage-template.md', dest: 'notepads/skill-coverage-audit.md' },
        { source: 'context-budget-template.md', dest: 'notepads/context-budget-audit.md' }
      ];

      for (const template of auditTemplates) {
        const sourcePath = path.join(templatesDir, template.source);
        const destPath = path.join(this.sisyphusDir, template.dest);
        
        if (fs.existsSync(sourcePath) && !fs.existsSync(destPath)) {
          const content = fs.readFileSync(sourcePath, 'utf-8');
          const datedContent = content.replace('YYYY-MM-DD', new Date().toISOString().split('T')[0]);
          fs.writeFileSync(destPath, datedContent);
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to copy template files:', error);
      return false;
    }
  }

  /**
   * Generate project-specific knowledge graph structure
   * @returns {Object} project structure info
   */
  analyzeProjectStructure() {
    const structure = {
      packages: [],
      scripts: [],
      configs: [],
      rootFiles: [],
      timestamp: new Date().toISOString()
    };

    try {
      // Scan for packages directory
      const packagesDir = path.join(this.rootDir, 'packages');
      if (fs.existsSync(packagesDir)) {
        const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
        structure.packages = entries
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name);
      }

      // Scan for scripts directory
      const scriptsDir = path.join(this.rootDir, 'scripts');
      if (fs.existsSync(scriptsDir)) {
        const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
        structure.scripts = entries
          .filter(entry => entry.isFile() && entry.name.endsWith('.mjs'))
          .map(entry => entry.name);
      }

      // Scan root for config files
      const rootEntries = fs.readdirSync(this.rootDir, { withFileTypes: true });
      structure.rootFiles = rootEntries
        .filter(entry => entry.isFile() && /\.(json|md|yaml|yml)$/.test(entry.name))
        .map(entry => entry.name);

    } catch (error) {
      console.error('Failed to analyze project structure:', error);
    }

    return structure;
  }

  /**
   * Create project structure knowledge file
   * @param {Object} structure - Project structure info
   * @returns {boolean} success
   */
  createProjectKnowledgeFile(structure) {
    try {
      const knowledgeFile = path.join(this.sisyphusDir, 'project-structure.md');
      const content = `# Project Structure Knowledge Base

**Generated:** ${new Date().toISOString()}
**Scope:** Project architecture and file organization

---

## Directory Structure

### Root Directory
${this.rootDir}

### Packages (${structure.packages.length})
${structure.packages.length > 0 ? structure.packages.map(p => `- ${p}`).join('\n') : '_No packages directory found_'}

### Scripts (${structure.scripts.length})
${structure.scripts.length > 0 ? structure.scripts.map(s => `- ${s}`).join('\n') : '_No .mjs scripts found_'}

### Root Config Files (${structure.rootFiles.length})
${structure.rootFiles.length > 0 ? structure.rootFiles.map(f => `- ${f}`).join('\n') : '_No config files found_'}

---

## Quick Reference

**To explore this project:**
1. Read \`AGENTS.md\` for comprehensive overview
2. Use \`ECOSYSTEM.md\` for dependency analysis  
3. Query \`KNOWLEDGE-GRAPH.json\` for impact analysis
4. Review audit reports in \`notepads/\` directory

**Available commands:**
- \`bun run meta-kb:synthesize\` - Regenerate meta-knowledge index
- \`bun run meta-kb:drift\` - Check for AGENTS.md drift
- \`node scripts/synthesize-meta-kb.mjs\` - Full meta-KB synthesis

---

## Project-Specific Notes

_Add project-specific documentation here as you work..._
`;

      fs.writeFileSync(knowledgeFile, content);
      return true;
    } catch (error) {
      console.error('Failed to create project knowledge file:', error);
      return false;
    }
  }

  /**
   * Complete initialization workflow
   * @returns {Object} initialization result
   */
  initialize() {
    const result = {
      success: false,
      actions: [],
      errors: []
    };

    // Check if already initialized
    if (this.hasSisyphusDir()) {
      return { success: true, actions: ['already_initialized'], errors: [] };
    }

    // Initialize structure
    if (this.initializeStructure()) {
      result.actions.push('structure_created');
    } else {
      result.errors.push('Failed to create .sisyphus/ structure');
      return result;
    }

    // Copy template files (if templates directory exists)
    const templatesDir = path.join(__dirname, '..', '..', 'templates');
    if (fs.existsSync(templatesDir)) {
      if (this.copyTemplateFiles(templatesDir)) {
        result.actions.push('templates_copied');
      }
    }

    // Analyze project structure
    const structure = this.analyzeProjectStructure();
    
    // Create project knowledge file
    if (this.createProjectKnowledgeFile(structure)) {
      result.actions.push('knowledge_file_created');
    }

    result.success = result.actions.length >= 1;
    return result;
  }
}

module.exports = { KbInitializer };
```

**Step 2: Create package.json for opencode-init-kb**

```json
{
  "name": "@jackoatmon/opencode-init-kb",
  "version": "0.1.0",
  "description": "Automatic knowledge base initialization for opencode projects",
  "main": "src/kb-initializer.js",
  "scripts": {
    "test": "node --test tests/"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

**Step 3: Add package to workspace**

Modify root `package.json` to include:
```json
{
  "workspaces": [
    "packages/*",
    "packages/opencode-init-kb"
  ]
}
```

**Step 4: Commit**
```bash
git add packages/opencode-init-kb/ package.json
git commit -m "feat: add opencode-init-kb package with KB initializer module"
```

---

### Task 2: Create Template Files for KB Initialization

**Files:**
- Create: `templates/skill-playbook-template.md`
- Create: `templates/health-audit-template.md`
- Create: `templates/skill-coverage-template.md`
- Create: `templates/context-budget-template.md`

**Step 1: Create skill-playbook-template.md**

```markdown
# Skill Exercise + Real Work Playbook

**Created:** YYYY-MM-DD
**Purpose:** Comprehensive skill system checkup while accomplishing real system improvement work. Each prompt exercises a distinct skill cluster and produces actionable output.

---

## PROMPT 1: Full Stack Health Audit

**What to say to the agent:**
\`\`\`
Run a full stack health audit of this project. Use code-doctor to perform fault localization across packages/, config/, and scripts/ directories. Use incident-commander to triage findings by severity. Use grep to search for common failure patterns. Use runbooks to match issues against known remediation patterns. Save findings to .sisyphus/notepads/health-audit-YYYY-MM-DD.md.
\`\`\`

**Real work:** 3+ issues fixed, actionable report produced
**Skills fired:** \`code-doctor\`, \`incident-commander\`, \`grep\`, \`runbooks\`, \`sequentialthinking\`

---
[Additional prompts following the same structure as opencode-setup's skill-playbook-2026-03-19.md]
```

**Step 2: Create audit template files**

Create simplified versions of the audit templates following the pattern in `opencode-setup/.sisyphus/notepads/`.

**Step 3: Commit**
```bash
git add templates/
git commit -m "feat: add KB initialization templates"
```

---

### Task 3: Integrate with Initialization Flow

**Files:**
- Modify: `scripts/setup-resilient.mjs` (add KB initialization step)
- Modify: `scripts/verify-setup.mjs` (check for .sisyphus/ directory)

**Step 1: Add KB initialization to setup script**

In `scripts/setup-resilient.mjs`:

```javascript
// Add at end of steps array
const steps = [
  // ... existing steps ...
  { label: 'init-kb', command: 'node', args: ['scripts/init-project-kb.mjs'] }
];

// Add function to run KB initialization
function runKbInitialization() {
  console.log('\n[setup-resilient] Initializing project knowledge base...');
  const { KbInitializer } = require('../packages/opencode-init-kb/src/kb-initializer');
  
  const initializer = new KbInitializer(process.cwd());
  const result = initializer.initialize();
  
  if (result.success) {
    console.log(`[setup-resilient]   KB initialized: ${result.actions.join(', ')}`);
  } else if (result.actions.includes('already_initialized')) {
    console.log('[setup-resilient]   .sisyphus/ already exists, skipping initialization');
  } else {
    console.log(`[setup-resilient]   WARNING: KB initialization failed: ${result.errors.join(', ')}`);
  }
}
```

**Step 2: Add init-project-kb.mjs script**

```javascript
#!/usr/bin/env node
// scripts/init-project-kb.mjs

const { KbInitializer } = require('../packages/opencode-init-kb/src/kb-initializer');

const initializer = new KbInitializer(process.cwd());
const result = initializer.initialize();

if (result.success || result.actions.includes('already_initialized')) {
  console.log('Knowledge base initialized successfully');
  process.exit(0);
} else {
  console.error('Knowledge base initialization failed:', result.errors);
  process.exit(1);
}
```

**Step 3: Update verification to check for .sisyphus/**

In `scripts/verify-setup.mjs`, add:
```javascript
// Check for .sisyphus/ directory
const sisyphusDir = path.join(root, '.sisyphus');
const sisyphusExists = existsSync(sisyphusDir) && lstatSync(sisyphusDir).isDirectory();
printCheck(
  'Project knowledge base initialized',
  sisyphusExists,
  sisyphusExists ? `Found ${sisyphusDir}` : null,
  'Run: bun run init-kb or re-run setup'
);
```

**Step 4: Add package.json scripts**

Add to root `package.json`:
```json
{
  "scripts": {
    "init-kb": "node scripts/init-project-kb.mjs",
    "kb:check": "node -e \"console.log(require('fs').existsSync('.sisyphus') ? 'KB exists' : 'KB missing')\""
  }
}
```

**Step 5: Commit**
```bash
git add scripts/init-project-kb.mjs scripts/setup-resilient.mjs scripts/verify-setup.mjs package.json
git commit -m "feat: integrate KB initialization into setup and verification"
```

---

### Task 4: Create Slash Command for Manual KB Generation

**Files:**
- Modify: `opencode-config/skills/superpowers/using-superpowers.md` (add KB command)
- Create: `opencode-config/skills/superpowers/init-kb.md` (skill definition)

**Step 1: Create init-kb skill**

```markdown
# Skill: init-kb

**Description:** Initialize project knowledge base (.sisyphus/ directory structure) for the current project

**Triggers:**
- "/init-kb"
- "initialize knowledge base"
- "create project kb"

**Steps:**
1. Check if .sisyphus/ directory exists
2. If not, initialize standard directory structure
3. Copy template files from global templates
4. Analyze project structure
5. Create project-structure.md knowledge file
6. Report success or errors

**Output:** Confirmation of KB initialization or error message

**Skills used:** None (standalone operation)
```

**Step 2: Modify using-superpowers.md**

Add init-kb to the list of available superpowers.

**Step 3: Commit**
```bash
git add opencode-config/skills/superpowers/init-kb.md
git commit -m "feat: add /init-kb slash command"
```

---

### Task 5: Validate Phase 1

**Run Phase 1 acceptance criteria:**

```bash
# 1. Test automatic initialization in new directory
cd /tmp/test-project
mkdir test-project && cd test-project
git init
echo '{"name":"test-project"}' > package.json
# Run opencode setup (which includes KB init)

# 2. Test manual initialization
node scripts/init-project-kb.mjs
# Assert: "Knowledge base initialized successfully"

# 3. Verify .sisyphus/ structure
ls -la .sisyphus/
# Assert: directories: notepads, plans, drafts, evidence, analysis, proposals, reports

# 4. Verify template files
ls .sisyphus/notepads/
# Assert: skill-playbook.md exists

# 5. Verify project knowledge file
cat .sisyphus/project-structure.md
# Assert: contains project structure analysis

# 6. Test slash command
# In opencode: "/init-kb"
# Assert: confirmation message

# 7. Run verification
cd /path/to/opencode-setup
bun run verify
# Assert: "Project knowledge base initialized" check passes
```

**Step 6: Commit Phase 1 completion**

```bash
git add .sisyphus/
git commit -m "chore: validate Phase 1 - KB automatic generation working"
```

---

## Phase 2: Integration with Existing Meta-Knowledge Systems

### Task 6: Connect KB to Meta-Super-Cycle

**Files:**
- Modify: `scripts/meta-super-cycle.mjs` (include project-specific audits)

**What this does:** Extend the meta-super-cycle to also run project-specific audits and generate project-specific reports.

---

### Task 7: Add Project-Specific Audit Templates

**Files:**
- Create: `.sisyphus/notepads/project-audit-template.md`

**What this does:** Create project-specific audit prompts that complement the global skill playbook.

---

### Task 8: Integrate with Learning Engine

**Files:**
- Modify: `packages/opencode-learning-engine/src/meta-kb-reader.js` (support project KBs)

**What this does:** Allow meta-KB reader to load project-specific knowledge from .sisyphus/ directory.

---

## Phase 3: Cross-Project Learning Sync

### Task 9: Create Learning Sync Mechanism

**Files:**
- Create: `scripts/sync-project-learnings.mjs`

**What this does:** Extract learnings from project KB and sync to global meta-KB (with proper filtering).

---

### Task 10: Update Global Meta-KB with Project Insights

**Files:**
- Modify: `scripts/synthesize-meta-kb.mjs` (include project learnings)

**What this does:** Include anonymized project insights in global meta-knowledge index.

---

## Success Metrics

| Phase | Tasks | Deliverable | Verification |
|-------|-------|-------------|--------------|
| 1 | 5 | Automatic KB initialization, slash command | `.sisyphus/` created, templates copied, `/init-kb` works |
| 2 | 3 | Integration with existing systems | Meta-super-cycle runs project audits, learning engine reads project KB |
| 3 | 2 | Cross-project learning sync | Project insights appear in global meta-KB |

**Total Tasks:** 10  
**Estimated Duration:** 6-8 hours  
**Risk Points:** ~200

---

## Execution Strategy

**Sequential Phases:**
- Phase 1 (Tasks 1-5) → Validate → Phase 2 (Tasks 6-8) → Validate → Phase 3 (Tasks 9-10)

**Dependencies:**
- Task 2 depends on Task 1 (needs module for copying templates)
- Task 3 depends on Task 2 (needs templates to copy)
- Task 4 depends on Task 1 (needs KbInitializer module)
- Task 6 depends on Task 1 (needs project KB structure)

---

## Plan Metadata

**Created:** 2026-03-20  
**Based on:** User requirement analysis + opencode meta-knowledge system  
**Total Tasks:** 10  
**Estimated Duration:** 6-8 hours  
**Estimated Risk Points:** ~200  
**Phases:** 3 (validated gates between each)

---
