const cp = require('child_process');
try {
  cp.execSync('npx vitest run src/test/formServiceRiskAlignment.test.ts', {encoding:'utf8', stdio:['pipe','pipe','pipe']});
  console.log('Tests passed!');
} catch(e) {
  const errOutput = e.stdout + '\n' + e.stderr;
  const lines = errOutput.split('\n');
  lines.forEach(l => {
    if (l.includes('FATAL_DEBUG_INFO')) {
      console.log('CRITICAL:', l);
    }
  });
}
