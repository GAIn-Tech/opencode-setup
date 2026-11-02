const fs = require('fs');
const content = fs.readFileSync('opencode-config/opencode.json', 'utf-8');

let depth = 0;
let inString = false;
let escapeNext = false;

for (let i = 0; i < content.length; i++) {
  const ch = content[i];
  if (escapeNext) { escapeNext = false; continue; }
  if (inString) {
    if (ch === '\\') { escapeNext = true; }
    else if (ch === '"') { inString = false; }
  } else {
    if (ch === '"') { inString = true; }
    else if (ch === '{') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && i < content.length - 10) {
        const lineNum = content.substring(0, i+1).split('\n').length;
        console.log('Root closes early at char', i, 'line', lineNum);
        console.log('Context before:', content.substring(Math.max(0,i-400), i+1));
        console.log('---AFTER---');
        console.log(content.substring(i+1, i+200));
        break;
      }
    }
  }
}
console.log('Done scanning');
