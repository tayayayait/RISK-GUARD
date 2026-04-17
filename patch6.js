const fs = require('fs');
let c = fs.readFileSync('src/services/formService.ts', 'utf8');
const lines = c.split(/\r?\n/);
let patched = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i] === 'function normalizeSpace(text: string) {') {
    lines[i] = 'function normalizeSpace(text: string) { if (typeof text !== "string") { console.error("DEBUG type:", typeof text, "val:", JSON.stringify(text)); return ""; }';
    patched = true;
    break;
  }
}
if (patched) {
  fs.writeFileSync('src/services/formService.ts', lines.join('\n'));
  console.log('Injected debug proxy');
} else {
  console.log('Not patched');
}
