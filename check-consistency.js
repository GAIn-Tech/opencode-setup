const fs = require('fs');
const opencode = JSON.parse(fs.readFileSync('opencode-config/opencode.json', 'utf8'));
const catalog = JSON.parse(fs.readFileSync('opencode-config/models/catalog-2026.json', 'utf8'));

console.log('=== CATALOG STRUCTURE ===');
console.log('Catalog keys:', Object.keys(catalog));

console.log('\n=== PROVIDER CONSISTENCY ===');
const openProviders = Object.keys(opencode.provider || {}).sort();
console.log('opencode.json providers:', openProviders.join(', '));

if (catalog.providers) {
  const catalogProviders = Object.keys(catalog.providers).sort();
  console.log('catalog-2026.json providers:', catalogProviders.join(', '));
  
  const missingInOpen = catalogProviders.filter(p => !openProviders.includes(p));
  const missingInCatalog = openProviders.filter(p => !catalogProviders.includes(p));
  
  if (missingInOpen.length) console.log('\nWARN in catalog but not opencode.json:', missingInOpen.join(', '));
  if (missingInCatalog.length) console.log('\nWARN in opencode.json but not catalog:', missingInCatalog.join(', '));
  if (!missingInOpen.length && !missingInCatalog.length) console.log('\nOK Provider lists match');
}

console.log('\n=== MODEL COUNTS PER PROVIDER ===');
openProviders.forEach(p => {
  const openModels = Object.keys(opencode.provider[p].models || {});
  let catCount = 0;
  if (catalog.providers && catalog.providers[p]) {
    catCount = Object.keys(catalog.providers[p].models || {}).length;
  }
  const status = openModels.length === catCount ? 'OK' : 'WARN';
  console.log(status, p + ':', openModels.length, 'vs', catCount);
});

console.log('\n=== ENV VAR CHECK ===');
const envVars = new Set();
Object.values(opencode.provider || {}).forEach(p => {
  if (p.options && p.options.apiKey) {
    const match = p.options.apiKey.match(/\{env:(\w+)\}/);
    if (match) envVars.add(match[1]);
  }
});
console.log('Required env vars:', [...envVars].sort().join(', '));

console.log('\n=== SANITY CHECK COMPLETE ===');
