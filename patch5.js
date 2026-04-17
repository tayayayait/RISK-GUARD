const fs = require('fs');
let c = fs.readFileSync('src/services/formService.ts', 'utf8');
const target = 'function normalizeSpace(text: string) {';
const replacement = `function normalizeSpace(text: string) {
  if (typeof text !== 'string') {
    console.error("DEBUG normalizeSpace invalid text:", text, "type:", typeof text);
    return "";
  }`;
if (c.includes(target) && !c.includes('DEBUG normalizeSpace')) {
  c = c.replace(target, replacement);
  fs.writeFileSync('src/services/formService.ts', c);
}
