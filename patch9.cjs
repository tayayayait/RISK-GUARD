const fs = require('fs');
let c = fs.readFileSync('src/services/formService.ts', 'utf8');
const lines = c.split(/\r?\n/);
let changed = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function normalizeSpace(text: any) {')) {
    // Already patched to any?
    lines[i] = `function normalizeSpace(text: any) { if (typeof text !== "string") { console.error("FATAL_DEBUG_INFO:", typeof text, JSON.stringify(text)); return ""; }`;
    changed = true;
    break;
  } else if (lines[i].includes('function normalizeSpace(text: string) {')) {
    lines[i] = `function normalizeSpace(text: any) { if (typeof text !== "string") { console.error("FATAL_DEBUG_INFO:", typeof text, JSON.stringify(text)); return ""; }`;
    changed = true;
    break;
  }
}
if (changed) {
  fs.writeFileSync('src/services/formService.ts', lines.join('\n'));
  console.log('Patch 9 applied');
}
