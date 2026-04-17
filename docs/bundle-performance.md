# 번들 성능 기록

## 2026-04-15 초기 번들/라우트 분할 최적화

### 측정 명령
- `pnpm build`

### 변경 전 (baseline)
- `assets/index-B6vIWKbi.js`: **1,250.59 kB** (gzip 395.26 kB)
- 경고:
  - `jspdf.es.min.js is dynamically imported ... but also statically imported ...`
  - `Some chunks are larger than 500 kB`

### 변경 후
- `assets/index-5pnHCNNN.js`: **222.55 kB** (gzip 72.69 kB)
- 분리 청크:
  - `assets/vendor-jspdf-Ex9zMdJg.js`: 387.06 kB (gzip 126.89 kB)
  - `assets/vendor-html2canvas-DXEQVQnt.js`: 201.04 kB (gzip 47.43 kB)
  - `assets/ReportOutput-C14wVQIJ.js`: 10.44 kB
  - `assets/FormEditor-CE3uO4rM.js`: 199.88 kB
  - 페이지 라우트별 lazy chunk 다수 생성
- 경고: 없음(500k 초과 경고 해소)
- 제거된 경고:
  - `jspdf dynamically imported but also statically imported`
  - `Some chunks are larger than 500 kB`

### 요약
- 메인 엔트리 청크가 1,250.59 kB → 221.70 kB로 감소.
- PDF 관련 대형 의존성(`jspdf`, `html2canvas`)은 초기 로드 경로에서 분리됨.
- PDF vendor split 이후 500k 임계 경고가 제거됨.

## 2026-04-15 P2 리렌더 최적화 후 재검증

### 측정 명령
- `pnpm build`
- `npm test`

### 결과
- `assets/index-C3J1qDyY.js`: **222.55 kB** (gzip 72.69 kB)
- `assets/FormEditor-JxnCtCu1.js`: **200.20 kB** (gzip 61.79 kB)
- `assets/AnalysisResult-aBDY2WR-.js`: **39.63 kB** (gzip 12.33 kB)
- `assets/AccidentPrediction-BtZihafg.js`: **90.55 kB** (gzip 29.16 kB)
- 경고: 없음(500k 초과 경고 미발생)
- 테스트: `61 passed`, `276 passed`

### 메모
- 이번 턴은 번들 분할 추가보다 `AnalysisResult/FormEditor`의 핸들러 안정화(`useCallback`) 및 메모화 중심 변경.
- 번들 총량은 기존 최적화 결과를 유지했고, 회귀 테스트는 전부 통과.
