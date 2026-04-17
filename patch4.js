const fs = require('fs');
try {
  let c = fs.readFileSync('src/services/formService.ts', 'utf8');
  const lines = c.split(/\r?\n/);
  
  let patched = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const fallback = HAZARD_MEASURE_TEMPLATE') && lines[i].includes('[normalizedType]?.[kind]')) {
      lines[i] = '  const pool = HAZARD_MEASURE_TEMPLATE[normalizedType]?.[kind];\n  const fallback = pool?.[0]';
      patched = true;
    }
  }

  if (patched) {
    fs.writeFileSync('src/services/formService.ts', lines.join('\n'));
    console.log('Patched successfully');
  } else {
    console.log('Already patched or not found');
  }
} catch(e) {
  console.error(e);
}
