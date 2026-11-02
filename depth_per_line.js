const fs = require('fs');
const content = fs.readFileSync('opencode-config/opencode.json', 'utf-8');
const lines = content.split('\n');

let depth = 0;
let inString = false;
let escapeNext = false;
const lineDepths = [];

for (let i = 0; i < lines.length; i++) {
  const depthBefore = depth;
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
  lineDepths.push({ before: depthBefore, after: depth, line: lines[i] });
}

// Print specific ranges
function printRange(start, end) {
  for (let i = start - 1; i < end && i < lineDepths.length; i++) {
    const {before, after, line} = lineDepths[i];
    const marker = before !== after ? ` [${before}->${after}]` : '';
    console.log(`${(i+1).toString().padStart(4)}: (${after.toString().padStart(2)})${marker.padEnd(10)} ${line.substring(0, 80)}`);
  }
}

console.log('=== Lines 160-180 ===');
printRange(160, 182);
console.log('\n=== Lines 335-385 ===');
printRange(335, 385);
