const fs = require('fs');
const content = fs.readFileSync('opencode-config/opencode.json', 'utf-8');
const lines = content.split('\n');

let depth = 0;
let inString = false;
let escapeNext = false;
let charPos = 0;

// Track depth at each line end
const lineDepths = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (escapeNext) { escapeNext = false; continue; }
    if (inString) {
      if (ch === '\\') escapeNext = true;
      else if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
  }
  charPos += line.length + 1; // +1 for newline
  lineDepths.push(depth);
}

// Print depths around transitions to 1 (provider closing)
console.log('Lines where depth transitions TO 1 (provider closing prematurely?):');
for (let i = 1; i < lineDepths.length; i++) {
  if (lineDepths[i] === 1 && lineDepths[i-1] > 1) {
    console.log(`  Transition at line ${i+1}: depth ${lineDepths[i-1]} -> ${lineDepths[i]}: ${lines[i].trim()}`);
    console.log(`  Previous line ${i}: ${lines[i-1].trim()}`);
  }
}

// Print depths around line 375-385 (suspected edit area)
console.log('\nDepths around lines 370-390:');
for (let i = 370; i < 390 && i < lines.length; i++) {
  console.log(`  Line ${i+1} (depth after=${lineDepths[i]}): ${lines[i]}`);
}
