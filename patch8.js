const fs = require('fs');
let c = fs.readFileSync('src/services/formService.ts', 'utf8');
const lines = c.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function normalizeSpace(text: any) {')) {
    lines[i] = `function normalizeSpace(text: any) { if (typeof text !== "string") { console.error("FATAL_DEBUG_INFO:", typeof text, JSON.stringify(text)); return ""; }`;
    break;
  }
}
fs.writeFileSync('src/services/formService.ts', lines.join('\n'));
console.log('Patch 8 applied');
