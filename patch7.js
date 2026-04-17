const fs = require('fs');
let c = fs.readFileSync('src/services/formService.ts', 'utf8');
const lines = c.split(/\r?\n/);
let patched = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function normalizeSpace(text: string) {')) {
    lines[i] = `function normalizeSpace(text: any) { if (typeof text !== "string") { require("fs").appendFileSync("debug_out.txt", "INVALID_TEXT_TYPE: " + typeof text + " VALUE: " + JSON.stringify(text) + "\\n"); return ""; }`;
    patched = true;
    break;
  }
}
if (patched) {
  fs.writeFileSync('src/services/formService.ts', lines.join('\n'));
  console.log('Patch 7 applied');
} else {
  console.log('Not patched');
}
