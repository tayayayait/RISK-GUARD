const fs = require('fs');
try {
  let c = fs.readFileSync('src/services/formService.ts', 'utf8');
  const target = '  const fallback = HAZARD_MEASURE_TEMPLATE[normalizedType]?.[kind]';
  const replacement = '  const pool = HAZARD_MEASURE_TEMPLATE[normalizedType]?.[kind];\n  const fallback = pool?.[0]';
  if (c.includes(target)) {
    c = c.replace(target, replacement);
    fs.writeFileSync('src/services/formService.ts', c);
    console.log('Replaced successfully');
  } else {
    console.log('Target not found in file');
  }
} catch(e) {
  console.error(e);
}
