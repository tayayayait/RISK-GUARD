const fs = require('fs');

try {
  const lines = fs.readFileSync('src/services/formService.ts', 'utf8').split(/\r?\n/);
  
  // Make sure we are changing the correct lines
  if (lines[3149].includes('const fallback = ')) {
    lines[3149] = '  const pool = HAZARD_MEASURE_TEMPLATE[normalizedType]?.[kind];\n  const fallback = pool?.[0]';
    fs.writeFileSync('src/services/formService.ts', lines.join('\n'));
    console.log('formService.ts correctly patched');
  } else {
    console.log('Line 3149 is not what we expect:', lines[3149]);
  }
} catch(e) {
  console.error(e);
}
