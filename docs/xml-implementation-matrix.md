# XML 대비 구현 매트릭스

기준 문서: [`xml예시.md`](../xml예시.md)

## 1. 화면/라우트

| XML Screen | Route | 상태 | 구현 파일 |
|---|---|---|---|
| SCR-01 작업 입력 | `/assessments/new` | 구현 | `src/pages/AssessmentInput.tsx` |
| SCR-02 AI 분석 확인 | `/assessments/:id/profile-review` | 구현 | `src/pages/ProfileReview.tsx` |
| SCR-03 분석 결과 | `/assessments/:id/analysis` | 구현 | `src/pages/AnalysisResult.tsx` |
| SCR-04 근거 화면 | `/assessments/:id/evidence` | 구현 | `src/pages/EvidenceBoard.tsx` |
| SCR-05 교육 화면 | `/assessments/:id/materials` | 구현 | `src/pages/MaterialsBoard.tsx` |
| SCR-06 문서 출력 | `/assessments/:id/report` | 구현 | `src/pages/ReportOutput.tsx` |

### SCR-03 분석 결과 (2026-04 갱신)

| 항목 | 상태 | 설명 |
|---|---|---|
| 조항 클릭 상세 갱신 | 구현 | 조항 카드 클릭 시 우측 상세 패널이 즉시 선택 조항으로 갱신 |
| 중간 해상도 상세 확인 | 구현 | `xl` 미만에서 조항 클릭 시 우측 드로어를 자동 오픈 |
| 상세 패널 고정/스크롤 | 구현 | 우측 패널은 `sticky` 유지, 상세 본문은 내부 스크롤로 즉시 확인 |
| 카드 조치 우선 위계 | 개선 | 단계 카드의 첫 블록을 `현장 실행 조치` 중심으로 고정하고, 긴 설명은 1문장으로 축약 |
| 단계별 카드 템플릿 분리 | 개선 | `즉시/당일/재개 전/재발 방지` 카드가 라벨·톤·설명 규칙을 공유하지 않도록 분리 |
| 핵심 요구사항 실행형 표시 | 개선 | 핵심 법적 요구사항은 단계 prefix를 제거하고 `확인 항목 + 금지/주의 행위`가 함께 보이는 실행형 문장으로 표시 |
| 조치 필요 이유 문장 개선 | 개선 | `조치 필요 이유`는 1~2문장 완성형으로 표시하고, 단계 목적/위험요인/해당 조치(anchor)가 함께 전달되도록 보정 |
| 당일/재개전 공란 방지 | 개선 | `same_day`, `pre_resume`가 비어도 서버+UI 이중 폴백으로 필수 조치 카드를 생성 |
| 요약 조문 UI 제거 | 개선 | 우측 상세 패널의 `요약 조문` 섹션 제거, `핵심 발췌/적용 이유`만 노출 |
| 법령 카드 중복 제거 | 개선 | `법령명+조문번호` 기준으로 법령 근거 카드를 대표 1건만 표시 |
| 단계 간 법령 분산 강화 | 개선 | `즉시/당일/재개 전/재발방지` 단계별로 서로 다른 법령·조문을 우선 탐색하고, 후보 부족 시에만 제한적 재사용 + 사유 노출 |
| 하단 법령 근거 접기형 | 개선 | `법령 근거 N건` 요약/탐색 목록만 기본 노출하고, 상세 본문은 우측 패널에서만 확인 |

### SCR-04 근거 화면 (2026-04 갱신)

| 항목 | 상태 | 설명 |
|---|---|---|
| 법령 4영역 하위 탭 | 구현 | `산업안전보건법/시행령/시행규칙/기준에 관한 규칙` 분리 + 건수 표시 |
| 기본 구조 | 구현 | 법령 목록 중심 표시, 항목 선택 시 상세 모달 |
| 상세 AI 요약 3섹션 | 개선 | 법령/Guide 상세 모달에서만 `우리 회사 사고와의 관련성 / 적용 이유 / 실제 조치`를 생성하며, 미디어 상세 모달에는 AI 요약 버튼을 노출하지 않음 |
| 법령 실행지침 패널 | 개선 | SCR-04 화면에서 `법령 실행지침` 섹션 제거(근거 카드 중심 검토로 단순화) |

### SCR-02 위험요인 표 (2026-04 갱신)

| 항목 | 상태 | 설명 |
|---|---|---|
| 컬럼 4개 고정 | 구현 | `위험요인명 / AI 추천 가중치 / AI 신뢰도 / 추천 근거` |
| AI 신뢰도 표시 | 구현 | 읽기 전용 배지 (`high/medium/low`) |
| 추천 근거 표시 | 구현 | `hazards[].reason` 노출, 누락 시 `근거 없음` |
| 우측 기준 카드 | 구현 | 가중치 기준표 + 신뢰도 구간 + 신뢰도 의미(발생확률 아님) 안내 |

## 2. 데이터 상태

| 항목 | 상태 | 설명 |
|---|---|---|
| `AssessmentData.apiStatuses` | 구현 | Gemini/KOSHA(재해사례, 사고사망, 법령/Guide/미디어, 자료) 상태 관리 |
| `HazardItem.reason` | 구현 | 위험요인별 AI 추천 근거 문장 |
| `EvidenceFetchResult` | 구현 | `items + status(success/empty/error) + errorCode` |
| `AssessmentData.citations` | 구현 | 인용 근거 최대 12건 관리 |
| `EvidenceItem.aiSummary / CitationItem.aiSummary` | 개선 | 근거 상세 AI 요약 결과(관련성/적용 이유/실제 조치)를 근거/인용 데이터에 함께 저장 |
| `AssessmentData.selectedMaterials` | 구현 | 브리핑 포함 자료 추적 |
| `AssessmentData.saveState` | 구현 | `saving/saved/error` 저장 상태 |
| `AssessmentData.reportExportState` | 구현 | `pdf/docx/clipboard` 내보내기 상태 |

## 3. 서비스 연계

| 서비스 | 상태 | 설명 |
|---|---|---|
| `GeminiService.analyzeTask` | 구현 | Edge Function 응답만 사용, 실패 시 재시도 후 에러 반환(mock fallback 없음) |
| `EvidenceSummaryService.summarizeEvidence` | 신규 | 근거 상세 모달 AI 요약(사고 연관성/적용 이유/실제 조치 3섹션) |
| `KoshaService.searchDisasterCases` | 개선 | mock fallback 제거, 실데이터만 사용 |
| `KoshaService.queryFatalities` | 개선 | mock fallback 제거, 실데이터만 사용 |
| `KoshaService.searchLaws` | 개선 | mock fallback 제거, 실데이터만 사용 |
| `KoshaService.recommendMaterials` | 개선 | mock fallback 제거, 실데이터만 사용 |
| `supabase/functions/_shared/law-narratives.ts` | 개선 | 법령 evidence 설명 필드 품질 게이트 추가(원문 나열/열거형/3요소 누락 감지 시 fallback 템플릿 강제 적용) |
| `supabase/functions/_shared/matching.ts` | 신규 | 규칙 점수 + LLM 재랭킹 + 임계치 필터 엔진 |
| `supabase/functions/_shared/law-categories.ts` | 신규 | 법령/Guide/미디어 카테고리 화이트리스트 |
| `supabase/functions/form-autofill-analyze/index.ts` | 개선 | `formType=accident-report` 프롬프트 규칙을 사고서식 문체로 강화(상황 1~2문장, 원인 2~4개 요인 분리, 재발방지 3개 실행형 조치, 항목 간 중복 금지) |
| `src/services/formService.ts` | 개선 | 위험성평가 `법적근거` 매핑 시 위험축(`keywords`)과 문맥축(`work/equipment`)을 분리하고, 문맥 매칭에서 `작업/공종/process/equipment` 같은 일반 토큰을 제외해 힌트성 조문 오매칭을 차단 |
| `src/services/formService.ts` | 개선 | 산업재해조사표 자동작성 시 사고서식 전용 후처리를 적용: `재해관련 작업유형(당시 상황)`/`재해발생원인`/`재발방지계획`을 중복 제거·원인 분리·번호형 계획(3개)으로 생성 |
| `src/lib/documentBuilder.ts` | 개선 | DOCX 위험성평가 내보내기를 웹 표 구조와 동기화: 14열 고정 폭, 4단 헤더 병합(`gridSpan`/`vMerge`), 상단 메타 헤더, 셀 줄바꿈/정렬 규칙 + 고정 A4 가로(`16838x11906`) 페이지/무여백(`pgMar=0`) + 페이지 분할 시 헤더 반복(`tblHeader`) 적용 |
| `src/services/reportService.ts` | 개선 | SCR-06 내보내기를 법정서식 변환에서 분리하고, 결과 요약 DOCX/PDF 전용 빌더(`reportDocxBuilder/reportPdfBuilder`)를 호출하도록 변경. 인용 목록은 선택 근거 URL(법령/Guide/미디어)과 선택 교육자료 URL을 함께 포함하도록 구성 |
| `src/lib/reportBuilder.ts` | 개선 | SCR-06 섹션 생성 시 근거 배지 정규화(`사고사망/사망사고/치명사고`)를 적용하고, `citation.evidenceId` 조인 기반으로 유사 재해/사고사망 내용을 제목+요약(+사고 메타)+URL 형태로 출력. 또한 `법령/KOSHA Guide` 인용은 AI 요약 저장 항목에 한해 `관련성/적용 이유/실제 조치`를 함께 출력(미생성 항목은 제목만 유지). 개선조치/체크리스트 자동 채움 시 법조문 원문성 문장을 제외하고 완결형 문장으로 후처리 |
| `src/contexts/AssessmentContext.tsx` | 개선 | `generateReport()` 시 체크리스트 기본값 자동 채움 및 섹션 재생성 수행(문서 출력 재진입 시 최신 선택 근거 강제 반영) |
| `src/pages/ReportOutput.tsx` | 개선 | SCR-06 진입 시 기존 섹션 유무와 무관하게 보고서 재생성 실행 |
| `src/lib/reportDocxBuilder.ts` | 신규 | 조사·분석 결과 요약(메타/본문 섹션/체크리스트/브리핑) 기반 DOCX OOXML 빌더 |
| `src/lib/reportPdfBuilder.ts` | 신규 | 결과 요약 DOM을 임시 렌더링 후 `html2canvas + jsPDF`로 A4 다중 페이지 PDF 생성. URL 텍스트는 링크 annotation을 추가해 PDF 뷰어에서 클릭 즉시 열리도록 지원 |
| `src/lib/accidentReportDocxBuilder.ts` | 개선 | 산업재해조사표 DOCX를 HWP 기준 템플릿(`public/forms/산업재해조사표양식.docx`) 채움 방식으로 전환. 레이아웃은 템플릿 그대로 유지하고 `AccidentReportData` 입력값(파견사업주/건설업/체크항목 포함)을 `word/document.xml`의 지정 셀에만 반영 |

## 4. 근거 매칭 정책

| 항목 | 값 |
|---|---|
| 규칙 점수 | 위험요인 45 + 장비/작업어 25 + 장소/공종 15 + 최신성 15 |
| 의미 점수 | 상위 15건 Gemini 재랭킹 |
| 최종 점수 | `0.6 * ruleScore + 0.4 * semanticScore` |
| 임계치 | `70` |
| 최대 반환 | 탭별 `5`건 |
| 법령/Guide/미디어 검색 범위 | `category=1,2,3,4,5,6,7,8,9,11` |

## 5. 테스트

| 유형 | 상태 | 파일 |
|---|---|---|
| 단위: 위험점수 | 구현 | `src/test/riskScore.test.ts` |
| 단위: 질의/중복/정렬 | 구현 | `src/test/queryRules.test.ts` |
| 단위: DOCX 표 병합/열폭/줄바꿈 | 신규 | `src/test/riskAssessmentDocxLayout.test.ts` |
| 단위: SCR-06 결과 요약 DOCX 빌더 | 신규 | `src/test/reportDocxBuilder.test.ts` |
| 단위: SCR-06 결과 요약 PDF 빌더 | 신규 | `src/test/reportPdfBuilder.test.ts` |
| 단위: SCR-06 export format 라우팅 | 신규 | `src/test/reportService.test.ts` |
| 단위: SCR-06 선택 근거 반영/배지 정규화/자동 채움 | 신규 | `src/test/reportBuilderSelectionSync.test.ts` |
| 단위: 산업재해조사표 DOCX 필드 매핑 패키징 | 신규 | `src/test/accidentReportDocxBuilder.test.ts` |
| 단위: SCR-02 UI 컬럼/기준 카드 | 신규 | `src/test/profileReview.test.tsx` |
| 단위: 법령 내러티브 품질 게이트 | 개선 | `src/test/lawNarratives.test.ts` |
| 단위: 매칭 엔진/임계치/카테고리 | 신규 | `src/test/evidenceMatching.test.ts` |
| 통합: SCR-03 해석형 상세 패널 | 개선 | `src/test/analysisResultFlow.test.tsx` |
| 통합: 상태 전이 | 개선 | `src/test/stateFlow.test.tsx` |
| 통합: 문서 재생성 최신 선택 반영 + 자동 기본값 | 신규 | `src/test/stateFlow.test.tsx` |
| 통합: 근거 API error/empty 처리 | 신규 | `src/test/evidenceStatus.test.tsx` |
| E2E 시나리오 샘플 | 구현 | `tests/e2e/assessment-flow.spec.ts` |
