const fs = require('fs');
const path = require('path');

const opencodePath = path.join(__dirname, '../opencode-config/opencode.json');
const policiesPath = path.join(__dirname, '../packages/opencode-model-router-x/src/policies.json');

try {
  const opencode = JSON.parse(fs.readFileSync(opencodePath, 'utf8'));
  const policies = JSON.parse(fs.readFileSync(policiesPath, 'utf8'));

  // Extract model IDs from policies.json (source of truth for runtime)
  const policyModelIds = new Set();
  policies.models.forEach(model => {
    policyModelIds.add(model.id);
  });

  // Update opencode.json models to match policies.json
  const updatedModels = opencode.models.filter(model => {
    return policyModelIds.has(model.id);
  });

  // Add any new models from policies.json that aren't in opencode.json
  policies.models.forEach(model => {
    if (!policyModelIds.has(model.id)) return;
    if (!opencode.models.some(m => m.id === model.id)) {
      updatedModels.push({
        id: model.id,
        provider: model.provider,
        npmPackage: model.npmPackage || '',
        priority: model.priority || 'medium',
        intent: model.intent || 'general',
        apiKey: model.apiKey || '',
        description: model.description || '',
        tags: model.tags || []
      });
    }
  });

  opencode.models = updatedModels;

  // Add sync metadata
  opencode._synced = {
    syncedAt: new Date().toISOString(),
    syncedFrom: 'policies.json',
    originalModelCount: opencode.models.length,
    finalModelCount: updatedModels.length
  };

  // Write back to opencode.json
  fs.writeFileSync(opencodePath, JSON.stringify(opencode, null, 2) + '\n');

  console.log('✅ Model ID sync completed successfully.');
  console.log(`   Updated ${updatedModels.length} models in opencode.json`);
  console.log(`   Synced from policies.json (${policies.models.length} models)`);
  console.log(`   Synced at: ${opencode._synced.syncedAt}`);

} catch (err) {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
}