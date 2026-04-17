const fs = require('fs');

try {
  let c = fs.readFileSync('src/services/formService.ts', 'utf8');
  c = c.replace(/const fallback = HAZARD_MEASURE_TEMPLATE\[normalizedType\]\?\.\[kind\]/g, 'const pool = HAZARD_MEASURE_TEMPLATE[normalizedType]?.[kind];\n  const fallback = (pool && pool.length > 0) ? pool[0]');
  fs.writeFileSync('src/services/formService.ts', c);

  let hints = fs.readFileSync('src/lib/riskAssessmentTemplateHint.ts', 'utf8');
  hints = hints.replace(/- 현재상태 및 조치와 감소대책은 해당 행의 원인·유해위험요인과 동일 메커니즘 축을 유지/, '- 현재상태 및 조치와 감소대책은 해당 행의 원인·유해위험요인과 동일 메커니즘 축을 유지\n  "- 동일한 위험유형이 연속될 경우, 예방·관리·설비 관점을 분산하여 행마다 문장 구조가 겹치지 않게 작성",');
  fs.writeFileSync('src/lib/riskAssessmentTemplateHint.ts', hints);

  let t = fs.readFileSync('C:/Users/dbcdk/.gemini/antigravity/brain/fc523556-06e2-42c0-be1b-512771e590d4/task.md', 'utf8');
  t = t.replace(/- \[ \] `HAZARD_MEASURE_TEMPLATE`/g, '- [x] `HAZARD_MEASURE_TEMPLATE`')
     .replace(/- \[ \] `rewriteMeasureByHazardType`/g, '- [x] `rewriteMeasureByHazardType`')
     .replace(/- \[ \] `riskAssessmentTemplateHint.ts`/g, '- [x] `riskAssessmentTemplateHint.ts`')
     .replace(/- \[ \] 기존 테스트 통과 검증/g, '- [/] 기존 테스트 통과 검증');
  fs.writeFileSync('C:/Users/dbcdk/.gemini/antigravity/brain/fc523556-06e2-42c0-be1b-512771e590d4/task.md', t);
  console.log('Patch success');
} catch(e) {
  console.error(e);
}
