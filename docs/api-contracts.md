# API Contracts (Supabase Edge Functions)

Date: 2026-04-13

## Common

- Base URL: `https://dkslgsguxlznapiygier.supabase.co/functions/v1`
- Method: `POST`
- Headers:
  - `apikey: <VITE_SUPABASE_ANON_KEY>`
  - `Authorization: Bearer <VITE_SUPABASE_ANON_KEY>`
  - `Content-Type: application/json`

## Runtime policy

- 운영 정책: **실데이터만 사용**
- 클라이언트/서버 모두 근거 데이터 `mock fallback` 사용 금지
- API 실패 시 빈 배열 대체가 아니라 오류 상태를 전달

## Matching policy (근거 3종 공통)

- 입력 컨텍스트: `taskName + hazard(top3) + equipment + workLocation + industry`
- 하드 필터: 입력 상위 위험유형(top2)과 후보 위험유형 교집합이 없으면 랭킹 전 제외
- API 계약 변경 없음: 요청/응답 스키마 유지, 내부 매칭 토큰만 보강
- CSV 보강(내부 전용):
  - `공공데이터포털 api/한국산업안전보건공단_건설업 공종별 세부공정 목록_20210910.csv`
  - `공공데이터포털 api/한국산업안전보건공단_업종별 기계설비 목록_20210909.csv`
  - 생성물: `supabase/functions/_shared/generated/kosha-catalog.ts`
- 1차 규칙 점수(`ruleScore`)
  - 위험유형 일치(핵심): 45점
  - 위험키워드 일치: 15점
  - 장비 직접일치: 18점
  - 장비 확장토큰 일치: 6점
  - 장소/공종 직접일치: 8점
  - 장소/공종 확장토큰 일치: 4점
  - 최신성: 최대 6점 (무날짜 0점)
- 2차 의미 점수(`semanticScore`)
  - 상위 15건만 Gemini 재랭킹
  - 기본 ON, 타임아웃 1.5초
  - 타임아웃/실패 시 규칙 점수만 사용
- 최종점수: `final = 0.8 * ruleScore + 0.2 * semanticScore`
- 필터(기본): `final >= 70`
- 법령 트랙 예외: 엄격 4축 게이트 우선 + 적응형 임계치(`60→55→50→45→40→35`)를 적용한다.
- 법령 트랙 적응형 종료 조건: 최소 목표 건수(현재 `6건`) 확보 시 하향 중단, 미충족이면 더 낮은 임계치로 재시도
- 임계치 미달 시: 강제 노출 없이 `[]` 반환
- 트랙별 반환 상한: 법령 `15`, Guide `10`, 미디어 `10`

## 1) `gemini-analyze`

- Path: `/gemini-analyze`
- Request:

```json
{
  "taskName": "저장탱크 외벽 용접",
  "taskDescription": "인화성 증기 잔류 가능 구간 용접 작업",
  "siteName": "A현장",
  "workDate": "2026-04-10",
  "photoCount": 2
}
```

- Response: `GeminiAnalyzeResult` compatible JSON

```json
{
  "profile": {
    "industry": "화학업",
    "workLocation": "저장탱크 외벽",
    "equipment": ["용접기", "가스검지기"],
    "hazards": [
      {
        "id": "h1",
        "name": "인화성 증기 폭발",
        "type": "폭발/화재",
        "weight": 35,
        "confidence": "high",
        "reason": "저장탱크 외벽 용접 중 잔류 인화성 증기가 점화원과 접촉할 수 있습니다."
      }
    ]
  }
}
```

- `hazards[].confidence`: 발생확률이 아닌 **AI 판단 신뢰도** (`high|medium|low`)
- `hazards[].reason`: 위험요인 추천 근거 문장
- `gemini-analyze`가 서버에서 `hazards[].reason`을 정규화하므로 빈 문자열로 내려오지 않음 (클라이언트의 `근거 없음`은 비상 폴백)
- Frontend timeout policy: `gemini-analyze` 호출은 `timeoutMs=60000`으로 실행(기본 30000ms 대비 상향)
- Runtime guard:
  - 기본 모델은 `flash` 단일 경로로 호출(필요 시 `GEMINI_ANALYZE_MODEL`로 오버라이드)
  - 1차 호출 내부 타임아웃 기본값 `30000ms`
  - JSON repair 호출 내부 타임아웃 기본값 `25000ms`
  - 실패 시 `504 UPSTREAM_TIMEOUT` 또는 `502` 계열로 명확히 실패 반환

## 1-1) `form-autofill-analyze`

- Path: `/form-autofill-analyze`
- Purpose: 서식센터 전용 분석(위험성평가 기록서/산업재해조사표 자동작성 초기값 생성)
- Request:

```json
{
  "taskName": "위험성평가표 작성",
  "taskDescription": "작업 상황 상세 내용",
  "siteName": "A현장",
  "workDate": "2026-04-10",
  "photoCount": 0,
  "formType": "risk-assessment",
  "formTemplateHint": "위험성평가표 열 구성 및 작성 원칙..."
}
```

- Response: `GeminiAnalyzeResult` compatible JSON
- `formType`: `risk-assessment | accident-report`
- `formTemplateHint`: 서식 구조/작성 규칙을 프롬프트에 강제하기 위한 힌트 문자열
- Form Center(`FormEditor`)는 현재 첨부 업로드 UI를 제공하지 않으므로 `photoCount`는 `0`으로 전달됨
- Form Center(`FormEditor`) 입력 라벨 정책:
  - `risk-assessment`: `작업 제목 (필수)`, `현재 작업 상황 (필수)` (사고 용어 미사용)
  - `accident-report`: `작업/사고 제목 (선택)`, `현재 작업 상황 / 사고 발생 내용 (필수)`
- Frontend timeout policy: `form-autofill-analyze` 호출은 `timeoutMs=60000`으로 실행(기본 30000ms 대비 상향)
- Form Center(`FormEditor`) 2단계 정책(`risk-assessment`):
  - 초기 `AI 분석 및 서식 자동작성`에서 위험성평가 행을 생성한 직후 행별 `원인/유해위험요인`을 Gemini로 의미 분석한다.
  - 의미 분석 결과를 `kosha-law-guides-form`에 전달해 공공데이터 스마트검색 API + 내부 DB/Storage 원문 후보를 검색·검증한다.
  - 검색 후보를 `risk-legal-basis-fit`의 Gemini 최종 선택 단계에 전달하고, 검증된 행만 `법적기준(legalBasis)`에 자동 입력한다.
  - `AI로 적합한 법령 찾기` 버튼은 동일 파이프라인을 수동 재실행하는 용도로 유지한다.

## 1-2) `form-history` (new)

- Path: `/form-history` (Supabase Function: `form-history`)
- Purpose: 서식센터 작성 완료본(DOCX 저장 시점) 기록의 생성/조회/삭제 (`risk-assessment`, `accident-report`)
- Request actions:
  - `{"action":"create","scopeKey":"...","payload":{"formType":"risk-assessment","taskName":"...","siteName":"...","workDate":"YYYY-MM-DD","contextText":"...","riskRows":[...],"validationSummary":{...},"validationEvents":[...]}}`
  - `{"action":"create","scopeKey":"...","payload":{"formType":"accident-report","taskName":"...","siteName":"...","workDate":"YYYY-MM-DD","contextText":"...","accidentData":{...}}}`
  - `{"action":"list","scopeKey":"...","formType":"risk-assessment|accident-report"}` (`formType` 미지정 시 전체)
  - `{"action":"get","scopeKey":"...","recordId":"..."}`
  - `{"action":"delete","scopeKey":"...","recordId":"..."}`
- Response:
  - `create`: `{ item: FormHistorySummary }`
  - `list`: `{ items: FormHistorySummary[] }` (최신순)
  - `get`: `{ item: FormHistoryDetail }`
  - `delete`: `{ ok: true }`
- Summary fields:
  - `id`, `formType`, `taskName`, `siteName`, `workDate`, `createdAt`, `expiresAt`, `rowCount`
- Detail fields:
  - 공통: `contextText`, `riskRows`
  - 산업재해조사표: `accidentData`
  - 위험성평가 optional: `validationSummary`, `validationEvents`
- Optional/compatibility policy:
  - `validationSummary`, `validationEvents`는 optional 필드이며 미전달 시 기존 동작을 유지한다.
  - 구버전 payload(해당 필드 없음)도 서버에서 정상 저장/조회된다.
- Scope policy:
  - 서버는 `scopeKey` 원문을 저장하지 않고 SHA-256 해시(`scope_hash`)만 저장
  - `list/get`는 동일 `scope_hash` 범위만 조회
- Retention policy:
  - 저장 시 `expires_at = created_at + 30 days`
  - 모든 요청 시작 시 `expires_at <= now()` 레코드를 purge
  - `list/get`는 `expires_at > now()` 레코드만 반환

## 1-2a) `risk-validation-audit` (new)

- Path: `/risk-validation-audit` (Supabase Function: `risk-validation-audit`)
- Purpose: 위험성평가 자동작성 검증 이벤트를 비차단(best-effort)으로 감사 테이블에 적재
- Request:
  - `events: RiskRowValidationEvent[]`
  - `source?: string` (default: `form-editor`)
  - `metadata?: object`
- Response:
  - `{ inserted: number }`
- Runtime policy:
  - 적재 실패는 사용자 생성/다운로드 흐름을 차단하지 않는다.
  - 빈 이벤트 배열은 `inserted=0`으로 성공 반환한다.

## 1-3) `gemini-evidence-summary`

- Path: `/gemini/evidence-summary` (Supabase Function: `gemini-evidence-summary`)
- Request: 작업 정보 + 선택 근거 원문
- Response (정규 스키마):

```json
{
  "incidentRelevance": "현재 우리 회사 사고와의 관련성 설명",
  "applicabilityReason": "법령 적용 이유 설명",
  "practicalActions": ["실제 조치 1", "실제 조치 2"]
}
```

- 하위호환: 구 스키마(`summary/actions/cautions`)가 들어오면 서버/클라이언트에서 신규 스키마로 매핑해 처리

## 1-4) `company-profile` (new)

- Path: `/company-profile` (Supabase Function: `company-profile`)
- Purpose: 산업재해조사표 `Ⅰ. 사업장 정보` 고정값(사업자등록번호/산재관리번호/사업장명/업종/본사주소) 저장/조회
- Identity policy:
  - `businessNumber`를 회사 식별 키로 사용
  - 동일 `businessNumber` 요청은 upsert로 최신값으로 덮어씀
- Request actions:
  - `{"action":"get","businessNumber":"123-45-67890"}`
  - `{"action":"upsert","payload":{"businessNumber":"123-45-67890","managementNumber":"A-001","businessName":"리스크가드 본사","industry":"제조업","headquartersAddress":"서울시 중구 1"}}`
- Response:
  - `get`: `{ "item": CompanyProfile | null }`
  - `upsert`: `{ "item": CompanyProfile }`
- Validation:
  - `businessNumber`: 숫자 10자리(하이픈 허용) 형식 필수
  - `managementNumber/businessName/industry/headquartersAddress`: 필수 + 최대 길이 제한
- Auth/CORS policy:
  - 기본 클라이언트는 `VITE_SUPABASE_USE_AUTH_HEADERS=true`로 `apikey`/`Authorization` 헤더를 포함해 호출
  - `VITE_SUPABASE_USE_AUTH_HEADERS=false`로 강제하면 일부 Edge 함수에서 upstream 호출이 타임아웃(`The signal has been aborted`)될 수 있음
  - 배포 함수 설정은 계속 `verify_jwt=false`를 유지
- Frontend fallback policy:
  - 조회/저장 시 서버 실패 또는 미구성(`null response`)이면 localStorage 캐시로 폴백
  - 폴백 상태에서는 동일 브라우저에서 자동입력 유지

## 1-5) `risk-legal-basis-fit` (new)

- Path: `/risk-legal-basis-fit` (Supabase Function: `risk-legal-basis-fit`)
- Purpose: 위험성평가표 행별 위험 맥락 분석 및 법적기준 후보 최종 선택
- Context analysis request (`mode=analyze_context`):
  - `taskName: string`
  - `contextText?: string`
  - `rows: Array<{ rowIndex, workProcess, category, cause, hazardFactor, controlIntent? }>`
- Context analysis response:
  - `{ analyses: Array<{ rowIndex, hazardType, accidentMechanism, unsafeCondition, controlIntent, equipment[], searchTerms[] }> }`
  - `controlIntent`: `access_control | supervision | traffic_operation | operating_procedure | equipment_guard | energy_isolation | inspection_maintenance | ventilation_detection | ppe | structural_support | emergency_response | general_control`
  - 각 `controlIntent`는 한국어 법령 검색어 사전으로 확장된다. 예: `access_control -> 출입 통제/동선 분리`, `supervision -> 유도자 배치/신호수 배치`, `traffic_operation -> 제한속도/후진 경보`.
  - Gemini 문맥 분석 제한시간은 18초이며, 실패/타임아웃/빈 응답 시 서버가 입력 행에서 동일한 `controlIntent` 분류 규칙과 한국어 검색어 사전을 적용한 로컬 문맥 분석 결과로 대체한다.
  - 입력 행에 지게차·차량·이동장비와 충돌·후진·운반 신호가 함께 있으면 AI가 다른 위험유형을 반환해도 `차량/이동장비 충돌`을 우선 유지한다.
- Candidate review request (`mode=review_candidates`):
  - `taskName: string`
  - `contextText?: string`
  - `rows: Array<{ rowIndex, workProcess, category, cause, hazardFactor, selectedLegalBasis, candidateLegalBases[], candidateOptions[] }>`
  - `candidateOptions`: `{ legalBasis, articleNumber, articleTitle, clausePreview, originalText, rankingScore, sourceType("storage"|"db"|"api"|"action"|"fallback") }`
- Candidate review response:
  - `{ results: Array<{ rowIndex, recommendedLegalBasis, status("verified"|"review_required"|"unknown"), score(0~100), reason, evidenceExcerpt?, applicabilityReason?, reviewSource, fallbackReason? }> }`
  - `reviewSource`: `gemini | deterministic_fallback`
  - `fallbackReason`: `missing_secret | upstream_error | timeout | request_error | invalid_response`
- Selection rule:
  - `recommendedLegalBasis`는 반드시 `candidateLegalBases` 내부 값만 허용
  - `status=verified`는 `evidenceExcerpt`가 해당 후보의 `originalText`에 실제 포함될 때만 허용한다. 불일치하거나 원문이 없으면 `review_required`로 낮춘다.
  - Gemini 최종 검증 제한시간은 20초이며, 실패/타임아웃 시 provenance 기반 deterministic fallback으로 대체
  - deterministic fallback의 자동 확정은 `selectedLegalBasis 일치 + 검증 출처(storage/db/api/action) + 행 랭킹 94점 이상 + 위험유형 직접 매핑`을 모두 충족한 후보만 허용
  - `sourceType=fallback` 또는 위 조건 미달 후보는 `review_required`로 반환
  - 프론트는 행 내용이 변경되지 않은 경우에만 2차 추천 결과를 반영
  - 서로 다른 `controlIntent` 행은 후보가 존재하는 한 서로 다른 조문을 선택한다.
  - AI가 동일 조문을 반복 추천하면 전체 행×후보 점수 행렬에서 `배정 행 수 → AI 추천 유지 → 후보 점수 합계` 순으로 최대화해 고유 조문을 재배정한다.
  - 프론트 완료 메시지는 `매칭 건수`, `검증 대체 건수`, `수동 검토 건수`를 분리해 표시
  - 위험성평가 표 상단에는 법적기준 매칭 기준(`사고유형·장비·원인·유해위험요인·통제목적`)과 조문 중복 억제 정책을 상시 표시한다.
  - 각 `법적기준` 셀은 행별 `controlIntent` 라벨과 `원문 확인/검토 후보/확인 불가` 상태를 표시한다. 검증된 후보는 접을 수 있는 `원문 근거`와 적용 판단을 함께 노출한다.

## 2) `kosha-disaster-cases`

- Path: `/kosha-disaster-cases`
- Upstream: `https://apis.data.go.kr/B552468/news_api02/getNews_api02`
- Fixed params: `callApiId=1060`
- Query strategy: `business+keyword`, `keyword only`, `무필터` 3개 변형을 각각 `pageNo=1..5`로 조회해 병합 후 dedupe + 임계치 필터
- Response: `EvidenceItem[]` (`type = case`)
- Source URL note: 업스트림 `callApiId=1060` 응답은 상세 원문 URL 필드를 제공하지 않는 경우가 많음. 검증 가능한 URL 필드(`url|link|filepath`)가 없으면 `url`은 비워서 반환.

## 3) `kosha-fatality-cases`

- Path: `/kosha-fatality-cases`
- Upstream: `https://apis.data.go.kr/B552468/news_api02/getNews_api02`
- Fixed params: `callApiId=1040`
- Query strategy: `business+keyword`, `keyword only`, `무필터` 3개 변형을 각각 `pageNo=1..5`로 조회해 병합 후 매칭 임계치 필터(미달 시 빈 배열 반환)
- Response: `EvidenceItem[]` (`type = fatality`)
- Source URL note: 업스트림 `callApiId=1040` 응답은 보통 `keyword/contents/arno`만 제공하며, 상세 원문 URL이 없을 수 있음.

## 3-1) `kosha-law-evidence` (new)

- Path: `/kosha-law-evidence`
- Scope: evidence tracks only (`lawItems`, `guideItems`, `mediaItems`, `items`, `meta`)
- Note: action plan fields are intentionally excluded from the primary contract
- Implementation: `buildLawGuidesPayload` shared-core wrapper (response narrowed to evidence fields)
- Internal execution mode: `buildLawGuidesPayload(..., { responseMode: "evidence_only" })`
  - evidence-only 경로에서는 action seed 생성, narrative 생성, law-fit 검증 단계를 수행하지 않는다.
- `api_only + evidence_only` 경로에서는 워커 사용량 보호를 위해 searchValues를 최대 `6`개로 제한하고 semantic rerank를 비활성화한다.
- 위 경로에서 1차 API 검색 결과가 0건이면 hazard/generic seed(최대 3개)로 추가 검색을 수행한다.
- 위 경로에서 API 후보는 존재하지만 랭킹 결과가 0건이면 `threshold=0 + hazardTypeFilter=none` 저강도 랭킹을 1회 적용한다.
- Law source policy (assessment 4단계): `api_only`
  - 법령 트랙: 스마트검색 `category=1,2,3,4`만 사용
  - Guide 트랙: 스마트검색 `category=5,7,8,9,11`
  - 미디어 트랙: 스마트검색 `category=6`
  - `law_articles`/Storage 후보는 4단계 근거확인 경로에서 사용하지 않음
- smartSearch parsing policy:
  - JSON: `response.header.resultCode/resultMsg`, `response.body.items.item`, `total_media`, `associated_word`, `categorycount`, `totalCount/pageNo/numOfRows` 파싱
  - XML error: `OpenAPI_ServiceResponse`의 `returnAuthMsg`, `returnReasonCode`를 추출해 트랙 오류 코드로 기록

## 3-2) `analysis-action-plan` (new)

- Path: `/analysis-action-plan`
- Scope: stage action plan only (`actionItems`, `stageCounts`)
- Stage keys: `immediate | same_day | pre_resume | improvement`
- Implementation: `buildLawGuidesPayload` shared-core wrapper (response narrowed to action plan fields)
- Filtering rule: `articleNumbers` 없는 action item은 제거하여 조문 없는 카드 노출을 방지
- Frontend timeout policy: `kosha-disaster-cases`, `kosha-fatality-cases`, `analysis-action-plan`, `kosha-law-evidence`, `kosha-law-guides*` 호출은 `timeoutMs=120000`으로 실행
- Shared smartSearch timeout policy (server internal):
  - per-request timeout: `API_FETCH_TIMEOUT_MS=8000`
  - total search budget: `API_FETCH_BUDGET_MS=45000`
  - retry: timeout/abort/429/5xx 계열은 카테고리 요청당 1회 재시도
  - timeout/abort는 `trackErrors`로 보존하고, 다른 트랙/데이터가 있으면 클라이언트는 `partial`로 처리한다.

## 4) `kosha-law-guides` (legacy combined)

- Migration note: keep for backward compatibility only. New clients should use
  `kosha-law-evidence` + `analysis-action-plan`.

- Path: `/kosha-law-guides`
- Upstream: `http://apis.data.go.kr/B552468/srch/smartSearch`
- Local sources:
  - Supabase Storage(`laws` 버킷) 법령 원문 파싱
  - `law_articles` 테이블
  - 스마트검색 API(폴백 + Guide/미디어 트랙)
- Scope:
  - 법령 트랙: Storage 우선, DB 차선, API(`category=1,2,3,4`) 폴백
  - Guide/미디어 트랙: 스마트검색 결과를 별도 트랙으로 분리
- Category strategy:
  - 법령: `1,2,3,4` (산업안전보건법, 시행령, 시행규칙, 산업안전보건 기준에 관한 규칙)
  - 미디어: `6`
  - Guide: `5,7,8,9,11`
- 병합 규칙:
- API 검색어는 `상위 hazard name(최대 3) + 상위 hazard type(최대 3) + taskName + workLocation + equipment(최대 3) + taskDescription/analysisScenario 토큰` 조합으로 확장 생성
- 검색어는 문장형 seed 외에 공백 분해 토큰 fallback(불용어 제외)을 포함해 매칭 누락을 줄임
- API 검색어는 첫 결과에서 중단하지 않고 모든 후보 검색어를 순회
- smartSearch 요청 row 수: 법령 카테고리(1~4)는 `numOfRows=30`, Guide/미디어는 `numOfRows=10`
- 적응형 임계치 랭킹은 최저 임계치에서 점수를 1회 계산하고 임계치별 필터만 적용해 동일 후보군의 반복 점수 계산을 방지
- 법령 트랙: Storage 결과를 1순위로 사용하고, 엄격 4축 게이트(`작업유형/사고유형/위험요인/설비특성`) 후보를 우선 랭킹
- 법령 트랙 strict 결과가 최소 목표 건수(6건)에 못 미치면 전체 법령 후보로 확장해 동일 임계치(`60→55→50→45→40→35`) 재랭킹
- 법령 트랙 랭킹 fallback:
  - strict 축 통과 후보는 `hazardTypeFilter=none`으로 우선 랭킹(중복 하드필터 방지)
  - 결과 부족 시 전체 법령 후보 `hazardTypeFilter=required` 재랭킹
  - 여전히 부족하면 `hazardTypeFilter=none` + 완화 임계치(`50→45→40→35→30`)를 마지막으로 적용
  - primary source(Storage/DB)에서 최종 후보가 없을 때만 API 법령 후보로 동일 절차를 재시도
  - 법령 트랙 게이트: `사고유형 일치 필수` + `위험요인 토큰 1개 이상 일치 필수` + `작업유형 또는 설비 토큰 일치 필수`
  - 법령 트랙이 위 임계치에서 모두 탈락해도 후보가 존재하면 `threshold:20` 저강도 구조화 폴백(semantic 비활성)으로 최소 근거를 구성
  - 법령 후보는 `법령명+조문번호` 키 기준 대표 1건만 유지
  - Storage/DB/API 후보의 `articleNumber` 원본 값을 보존하고, 조문 추출 실패 시에도 원본 조문번호를 우선 사용
  - Guide 트랙: 위험유형 교집합 우선, 없으면 원후보로 완화 후 `threshold 55→50→45` 적응형 재랭킹
  - 미디어 트랙: 위험유형 교집합 우선, 없으면 원후보로 완화 후 `threshold 55→50→45` 적응형 재랭킹
  - 모호 조문/행동 동사 없는 문장 제외
  - 원문을 행동 문장으로 변환 후 단계 분류(`immediate|same_day|pre_resume|improvement`)
  - `pre_resume`는 `재개/재가동/허가 후 재개` 맥락일 때만 부여, 일반 `점검/확인`은 `same_day`
  - 중복 액션은 유사도 기준(0.8+)으로 병합하되 **동일 stage 내부에서만 병합**하고, 조문번호는 합산
  - 같은 조치 항목 내 조문번호는 공백 정규화 후 중복 제거
  - 액션 시드 후보 우선순위는 법령 카테고리 기준으로 조정(`4→1→3→2`)
  - 액션 시드는 stage-aware로 생성하며, 단계별 카테고리 탐색 우선순위를 독립 적용
  - 단계별 탐색은 `55→50→45` 임계치 확장 순으로 진행하고, 미사용 후보 우선 원칙을 강제
  - 모든 미사용 후보가 임계치 미달일 때만 동일 법령/조문 재사용을 허용
  - 재사용 시 `selectionMode=reused`, `selectionReason`(임계치/대체후보 점수/재사용 사유)을 필수 포함
  - 액션 시드가 비어도 법령 근거가 있으면 단계별 기본 시드(`immediate/same_day/pre_resume/improvement`)를 생성
  - `legalRequirement`, `clausePreview`는 조문 전체가 아니라 1문장(약 120자) 핵심 요구사항으로 제한
  - 동일도는 기존 하이브리드 랭킹(`rule + semantic`) 적용
- 위험유형 정규화:
  - 표준값: `추락/붕괴/질식/폭발/화재/감전/끼임/말림/절단/낙하물/비래/차량/이동장비 충돌/화학노출/소음/분진/반복작업`
  - 동의어(`폭발`, `화재`, `협착`, `화학물질누출` 등)는 서버에서 표준값으로 강제 정규화
- Storage 법령명 판별:
  - 한국어 헤더 우선
  - 헤더가 없으면 파일명 기반 판별
  - 영문 별칭 `Occupational Safety and Health Standards Rules`도 규칙으로 인정
  - Storage 파일 수집은 재귀 탐색으로 수행하며 확장자는 `.md/.pdf/.txt`를 지원
  - `LAW_ONLY_STANDARDS_RULES=true`일 때만 `산업안전보건기준에 관한 규칙` 계열로 강제 제한
- Request 확장(분석결과 설명형 생성용):
  - `taskDescription?: string`
  - `analysisScenario?: string`
- Response:
  - Legacy: `{ items: EvidenceItem[], actionItems: LawActionItem[] }`
  - Expanded: `{ items, lawItems, guideItems, mediaItems, actionItems, meta }`
  - `lawItems`에는 `lawCategory("1"|"2"|"3"|"4")`, `articleNumber`, `articleTitle`, `clausePreview`, `relevanceReason` 필드가 포함될 수 있음
  - `guideItems`에는 `articleNumber`, `clausePreview`, `relevanceReason` 필드가 포함될 수 있음
  - `lawItems.relevanceReason`은 AI semantic reason 우선, 미제공 시 규칙 기반 `matchReason`으로 폴백
  - 분석결과 전용 설명 필드(법령): `applicabilityReason`, `keyExcerpt`, `summaryArticle`
  - `mediaItems`에는 `fullContent`, `mediaStyle`, `clausePreview`, `relevanceReason` 필드가 포함될 수 있음
  - `actionItems` 확장 필드: `lawName`, `articleTitle`, `legalRequirement`, `generationType("direct"|"derived")`, `clausePreview`, `relevanceReason`, `actionNeedReason`, `applicabilityReason`, `keyExcerpt`, `summaryArticle`
  - `actionItems` 검증 필드: `lawFitStatus("verified"|"review_required"|"unknown")`, `lawFitReason`, `lawFitScore(0~100)`, `lawFitGateFailureCode?("INCIDENT_ANCHOR_MISMATCH")`
  - 2차 적합성 검증 정책:
    - `generateLawNarratives` 이후 조치-법령 적합성 AI 검증을 1회 수행하고, 그 결과에 사고내용 적합성 전용 2차 게이트를 추가 적용
    - 2차 게이트는 동의어·유사표현 정규화 앵커(`사고유형/위험요인/작업행위/설비/장비/장소`) 기반으로 판정
    - 도메인 규칙 매칭이 비어도 토큰 기반 lexical fallback 앵커를 생성해 표현 차이로 인한 과도한 탈락을 완화
    - 축별 게이트는 `incident` 측에 해당 축 앵커가 존재할 때만 필수로 적용(앵커 부재 축은 미스매치 강제 제외)
    - AI 실패/파싱오류/타임아웃 시 규칙형 폴백(단계 정합성 + 액션 앵커 + 법령요구사항 연결 + 사고내용 앵커 게이트)으로 판정
    - `lawFitGateFailureCode="INCIDENT_ANCHOR_MISMATCH"`인 카드만 분석결과에서 제외하고, 그 외 `review_required`는 유지 + 수동 검토 표시
  - `actionItems`는 단계별로 `2~3개` 생성을 목표로 하며(`immediate/same_day/pre_resume/improvement` 공통), 후보 부족 시 `selectionMode=reused`를 사용해 하한(2개)을 우선 충족
  - `actionItems.articleNumbers`는 조치당 조문 1:1 매핑을 위해 단일 조문(최대 1개)으로 정규화한다
  - `actionNarratives` 품질 보정은 `immediate/same_day/pre_resume/improvement` 4단계를 모두 대상으로 적용
  - `meta.trackStatus`: `{ law, guide, media }` 각각 `success|empty|error`
  - `meta.trackErrors`: 트랙별 에러 메시지 배열(`guide/media` 중심, 법령은 API-only 실패 시 포함 가능)
  - `meta.trackEmptyReason`: 트랙별 empty 원인(`NO_CANDIDATE` / `FILTERED_OUT`)
  - `meta.lawDiagnostics`: 법령 트랙 진단 메타(API/DB/Storage/selection)
    - storage: `listedPathCount`, `parsedArticleCount`, `articleNumberExtractRate`, `errors`
    - selection: `rawCandidateCount`, `strictCandidateCount`, `rankingPoolCount`, `droppedByStrictAxisCount`, `droppedByRankingThresholdCount`
  - `generationType=derived`는 자동 파생된 당일 조치 항목
  - 설명 필드 생성 정책: `AI 1회 배치 생성` 우선, 실패/파싱오류/필드누락 시 `규칙형 폴백`으로 보정
  - 설명 필드 품질 정책(법령 evidence): `keyExcerpt/summaryArticle`가 조문 원문 나열·열거형 패턴이거나 `적용 이유/현장 위험/필요 조치` 3요소가 누락되면 규칙형 설명 템플릿으로 강제 치환
  - 설명 필드 품질 정책(법령 evidence): `analysisScenario + 상위 hazards + 연결 action/applicationPoints` 컨텍스트 앵커가 반영되지 않은 일반론 문장은 저품질로 판정하고 사고 맥락형 폴백 문장으로 치환
  - 설명 필드 품질 정책(법령/action 공통): `핵심 의미/적용 배경/현장 기준 요약` 3개 필드 간 토큰 유사도가 임계치 이상이면 역할 충돌로 판정하고 필드별 폴백 문장으로 재작성
  - 문장 완결성 정책: `actionText/legalRequirement/actionNeedReason/applicabilityReason/keyExcerpt/summaryArticle`가 미완성 종결(`및/등/여부/또는/으로/하여/하고/같은/수 있는/중/전/후/시/확인/점검/유지/이행`) 또는 절단형 문장으로 끝나면 단계+조문+조치 앵커 기반 완결 문장으로 재작성
  - 조문 차별화 정책: 서로 다른 조문의 설명 필드가 유사도 임계치 이상으로 중복되면 해당 조문의 `articleNumber/articleTitle/legalRequirement`를 포함한 폴백 문장으로 강제 분기
  - action 설명은 단계 목적을 분리(`immediate` 즉시 차단, `same_day` 당일 점검, `pre_resume` 재개 전 확인, `improvement` 재발 방지)하고 stage 목적 문맥을 우선 반영
  - action 설명 필드(`applicabilityReason/keyExcerpt/summaryArticle`)는 모두 단계명을 문장에 명시한다(`즉시 조치 단계/당일 조치 단계/작업 재개 전 확인 단계/재발 방지 단계`)
  - 단계별 역할 정의를 고정: `immediate`(사고 확산 방지·긴급 통제), `same_day`(당일 점검·기록·누락 보완), `pre_resume`(재가동 허용 조건·승인 확인), `재발 방지`(절차 개선·교육·장비 보완)
  - 액션 선택 우선순위: `미사용 법령+미사용 조문` -> `동일 법령 내 미사용 조문` -> `기존 조문 재사용(최후 예외)`
  - 단계 내 1차 선택은 `동일 법령 반복 상한(기본 1건)`을 적용해 법령 다양성을 우선 확보하고, 후보 부족 시 상한을 완화해 하한(2개)을 충족
  - 액션 선택 임계치 완화는 `55 -> 50 -> 45 -> 40 -> 35` 순서로만 수행하며 `0` 임계치 폴백은 사용하지 않음
  - `actionItems` 확장 필드: `selectionMode("direct"|"derived"|"reused")`, `selectionReason`
  - `selectionReason`은 반복 선택 시 간결 문장으로 사유를 명시하며, `신규 법령/조문 후보 부족` 여부가 포함된다.
  - 분석결과 표시 텍스트(`actionNeedReason`, `applicabilityReason`, `keyExcerpt`, `summaryArticle`, `legalRequirement`, `clausePreview`)는 인위적 줄임표(`...`, `…`) 없이 전달
  - 분석결과 화면(`SCR-03`)은 카드에서 `현장 실행 조치`를 최상단에 배치하고 법령 정보는 `법령명+제N조(조문명)+원문보기`로 노출
  - 분석결과 화면(`SCR-03`)은 법령 상세 설명(`핵심 의미/적용 배경/현장 기준`)을 우측 패널 단일 허브에서만 노출
  - 분석결과 화면(`SCR-03`)의 우측 패널은 선택 카드 컨텍스트(actionId+법령명+조문번호+조문명) 기준으로 `선택 조문/핵심 의미/적용 배경/현장 기준 요약`을 동기 변경
  - 분석결과 화면(`SCR-03`)의 우측 패널 3개 섹션은 동일/유사 문장으로 수렴하지 않도록 섹션별 역할(`핵심 의미=규정 요지`, `적용 배경=사고 맥락 연결`, `현장 기준 요약=실행 순서`)을 분리해 표시
  - 분석결과 화면(`SCR-03`)의 우측 패널 3개 섹션은 선택 카드 단계를 항상 반영하며(기본: `단계 미지정(공통 기준)`), 단계별 문맥이 누락되면 섹션별 단계형 폴백 문장으로 재작성
  - 분석결과 화면(`SCR-03`)의 우측 패널 3개 섹션은 문자 길이 기준 중간 절단을 사용하지 않으며, 문장 경계 기준으로 완결 문장만 노출한다
  - 우측 패널 문장 끝이 불완전 단어(`작업 지속`, `작업할`, `위험이 있는 장소` 등)로 끝나면 섹션별 자연어 폴백 문장으로 재작성한다
  - 분석결과 화면(`SCR-03`)은 `keyExcerpt/summaryArticle`에 조문 원문 직접 폴백(`clausePreview`, bullet 단순 결합)을 사용하지 않고 설명형 문장 폴백을 우선 표시
  - 분석결과 화면(`SCR-03`)은 `summaryArticle` 값을 저장은 유지하되 UI에는 표시하지 않음(핵심 요구사항/적용 이유만 표시)
  - 분석결과 화면(`SCR-03`)의 법령 카드 `원문보기`는 Supabase Storage의 `kr-industrial-safety-and-health-standards-rules.pdf`를 공통 사용하며, 조문번호가 있으면 URL fragment `#search=제N조`를 붙여 조문 위치 이동을 우선 시도
  - 분석결과 화면(`SCR-03`)은 단계 간 중복 조치를 참조행으로 축약하지 않고, 단계별 실행 조치 카드를 그대로 유지해 현장 실행 단위를 우선 노출
  - 분석결과 화면(`SCR-03`)은 카드 1개에 다수 조문(`제113조, 제224조`)을 묶어 표시하지 않으며, 조치 카드당 조문 1개만 연결해 표시
  - 분석결과 화면(`SCR-03`)은 `actionNeedReason` 표시를 1~2문장 완성형으로 정리하고, 저품질/기계적 문구는 단계별 폴백 문장으로 치환
  - 분석결과 화면(`SCR-03`)은 `actionNeedReason`이 다수 카드에서 중복될 경우 액션 앵커+법적요구사항 기반 문장으로 재작성해 카드별 차이를 유지
  - 분석결과 화면(`SCR-03`)의 `현장 실행 조치(actionText)`는 미완성 종결(`...해야/위하여/조`)로 끝나면 단계별 완결형 문장으로 보정해 노출
  - 분석결과 화면(`SCR-03`)은 `same_day/pre_resume/improvement`가 비었을 때 상위 단계 복사를 하지 않고 `적합 법령 없음(수동 검토 필요)` 행을 표시
  - 분석결과 화면(`SCR-03`)의 `재발 방지 조치`는 AI-only 매핑이 아니라 backend `lawActionItems(stage=improvement)`를 우선 표시
  - 분석결과 화면(`SCR-03`)의 `핵심 법적 요구사항`은 단계 prefix(`즉시 조치 기준:` 등) 대신 실행형 문장으로 표시하며, `무엇을 확인해야 하는지 + 무엇을 하면 안 되는지`를 함께 노출
  - 분석결과 화면(`SCR-03`)은 동일 법령 반복 카드에 `selectionReason`을 `반복 선택 근거`로 표시하고, 비반복 사유도 필요 시 `선택 근거`로 노출
  - 분석결과 화면(`SCR-03`)의 하단 `법령 근거` 섹션은 기본 접힘 상태이며 헤더/목록에 `법령 근거 N건` 요약과 탐색 링크만 표시(상세 본문 미노출)

## 5) `kosha-materials`

- Path: `/kosha-materials`
- Upstream: `http://apis.data.go.kr/B552468/selectMediaList01/getselectMediaList01`
- Request body: `{ taskName, profile, filters? }`
  - `filters.keyword`: 검색어(후처리 필터)
  - `filters.materialTypeCode`: 제작형태(`ctgr01`)
  - `filters.industryCodeOverride`: 업종(`ctgr02`) 강제 지정
  - `filters.industryScope`: 업종 조회 스코프(`profile|selected|all`)
  - `filters.hazardCodesOverride`: 재해유형(`ctgr03[]`) 강제 지정
  - `filters.hazardScope`: 재해유형 조회 스코프(`auto_top3|selected|all`)
  - `filters.priorityMode`: 정렬 우선순위(`즉시교육|작업전 브리핑|참고자료`)
- Query policy:
  - 기본값은 `industryScope=profile`, `hazardScope=auto_top3`
  - `industryScope=all`이면 `ctgr02` 전체 코드(1,2,3,4,6) 병렬 조회
  - `hazardScope=all`이면 `ctgr03` 전체 코드(26개) 병렬 조회
  - 최종 조회는 `industryCodes × hazardCodes` 조합 병렬 호출 후 병합
  - `ctgr04_kr=Y` 고정(한국어 전용)
  - 중복 제거 키: `url + title` (없으면 `title` 기반)
- 후처리:
  - CSV 보강 토큰으로 내부 relevance 재정렬 및 `recommendReason`에 `공정/설비 일치 근거` 추가
  - `keyword` 존재 시 제목/추천사유 토큰 일치 항목만 남기고 관련도 가점 적용
  - `priorityMode`는 API 분류코드가 아닌 결과 정렬 모드로만 적용
- Response: `MaterialItem[]`

## Law guide response extension

```json
{
  "lawItems": [
    {
      "type": "law",
      "sourceBadge": "법령",
      "title": "제20조 출입의 금지 등",
      "sourceType": "api",
      "lawCategory": "4"
    }
  ],
  "guideItems": [
    {
      "type": "law",
      "sourceBadge": "Guide",
      "title": "이동식 고소작업대의 선정과 안전관리에 관한 기술지침",
      "sourceType": "api"
    }
  ],
  "mediaItems": [
    {
      "type": "law",
      "sourceBadge": "미디어",
      "title": "저장탱크 화재예방 OPS",
      "sourceType": "api",
      "mediaStyle": "OPS"
    }
  ],
  "items": [
    {
      "type": "law",
      "sourceBadge": "법령",
      "title": "제13조 안전난간의 구조 및 설치요건",
      "legalBasis": "산업안전보건기준에 관한 규칙 제13조",
      "sourceType": "storage"
    }
  ],
  "actionItems": [
    {
      "id": "law-action-1",
      "stage": "immediate",
      "actionText": "작업 시작 전에 안전난간을 설치하세요.",
      "articleNumbers": ["제13조"],
      "lawName": "산업안전보건기준에 관한 규칙",
      "legalRequirement": "사업주는 추락 위험을 방지하기 위해 안전난간을 설치해야 한다.",
      "generationType": "direct",
      "clausePreview": "사업주는 근로자의 추락 등의 위험을 방지하기 위하여 안전난간을 설치해야 한다.",
      "relevanceReason": "위험요인 40점, 장비/작업어 18점, 장소/공종 9점, 최신성 12점",
      "actionNeedReason": "맨홀 개방 직후 가연성 분위기와 점화 위험이 동시에 발생할 수 있는 상황입니다. 해당 조문은 위험 확산을 막기 위한 즉시 조치를 요구하므로, 현장에서는 안전난간 설치 및 접근 통제를 바로 실행해야 합니다.",
      "applicabilityReason": "해당 조문은 추락·접근 위험이 동시에 존재하는 작업조건에서 필수 안전조치를 규정하고 있어 현재 사고 상황에 직접 적용됩니다.",
      "keyExcerpt": "근로자 추락 및 2차 피해 방지를 위해 작업구간에 안전난간 등 방호조치를 설치해야 합니다.",
      "summaryArticle": "이 조문은 위험구간 접근을 통제하고 방호설비를 유지하도록 요구하며, 작업 전에는 설치 상태를 확인하고 작업 중에는 해체·미설치 상태를 방치하지 않도록 관리해야 합니다."
    }
  ],
  "meta": {
    "sourceCounts": {
      "api": 2,
      "db": 0,
      "storage": 1
    },
    "trackCounts": {
      "law": 1,
      "guide": 1,
      "media": 1
    },
    "trackStatus": {
      "law": "success",
      "guide": "success",
      "media": "success"
    },
    "trackErrors": {
      "guide": ["MISSING_SECRET:DATA_GO_KR_API_KEY"]
    },
    "trackEmptyReason": {
      "guide": "NO_CANDIDATE"
    },
    "guideEmptyReason": "NO_GUIDE_CANDIDATE"
  }
}
```

## Error schema

```json
{
  "error": {
    "code": "UPSTREAM_ERROR",
    "message": "KOSHA API failed",
    "details": "optional"
  }
}
```

- `400`: validation error
- `405`: method error
- `502`: upstream call error
- `503`: missing required secret

## Client status policy (law guides)

- `searchLaws` 결과 상태는 아래 기준으로 판정:
  - 트랙 오류(`meta.trackStatus` 중 `error`) + 데이터 있음(`items` 또는 `actionItems`) → `partial`
  - 트랙 오류 + 데이터 없음 → `error`
  - 트랙 오류 없음 + 데이터 있음 → `success`
  - 트랙 오류 없음 + 데이터 없음 → `empty`
  - 호출 실패(네트워크/런타임) → `error`

## Risk Assessment form auto-fill rules

- 위험성평가 결과 화면(`RiskAssessmentTable`)은 문서형 14열 고정 표를 사용한다.
  - 열 순서: `작업내용, 분류, 원인, 유해위험요인, 법적기준, 현재상태 및 조치, 가능성(빈도), 중대성(강도), 위험성, 감소대책, 개선일, 완료일, 담당자, 비고`
  - 상단 메타 2행(`공정명/평가일시`, `평가자(리더및팀원)`)은 자동 매핑 없이 공란으로 유지한다.
  - `비고`는 표시 전용 공란 열이며 데이터 모델/저장 payload에 포함하지 않는다.
  - DOCX 내 상단 제목/헤더 영역은 페이지 반복을 사용하지 않으며 첫 페이지에만 1회 표시한다.
- 결과 행 값 정규화 규칙:
  - `작업내용(workProcess)`: 업종명(`건설업`, `제조업` 등) 대신 실제 작업단계/공정명 중심으로 표기한다.
  - `분류(category)`: 6개 고정 체계(`기계적 요인`, `작업특성 요인`, `인적 요인`, `환경적 요인`, `관리적 요인`, `전기적 요인`)로만 표기한다.
  - `분류` 자동 판정은 `원인 + 유해위험요인` 혼합 규칙을 사용하며 우선순위는 `전기 > 관리 > 인적 > hazard type 기본 매핑`이다.
  - `화학노출 -> 환경적 요인`, `소음/분진/반복작업 -> 작업특성 요인`을 기본 매핑으로 고정한다.
  - 위험행 생성은 사고 유형 예외분기 없이 공통 파이프라인으로 처리하며, `taskDescription`/`scenario`를 문장·절 단위로 분해해 `작업상황-원인-유해위험요인-위험요소` 신호를 추출한다.
  - 단일 문장 입력에서도 연결어/신호어 기반 절 분해를 확장해 다중 사고 메커니즘 신호를 추출한다.
  - 위험행 후보는 `profile hazard + clause hazard + context signal hazard`를 통합 랭킹해 선정한다.
  - 작업 맥락 프로파일은 `taskName + taskDescription + scenario` 기반으로 생성하며, `명시+직접추론` 범위의 허용 위험유형만 최종 후보로 사용한다.
- 전기계 작업 키워드(`분전반/배전반/배선/전선/차단기/충전부/전원 차단/전원 격리/전원 공급/절연`)가 확인되면 허용 위험유형에 `감전`을 포함하고 비관련 유형은 강한 패널티 후 제외한다.
  - 후보 점수는 `위험유형 일치 + 장비/행위 축 일치 + 원문 앵커 토큰 일치 - 맥락 충돌 패널티`를 사용하며, 정합 점수 미달 후보는 제거한다.
  - `원인/유해위험요인`은 작업상황 원문을 단순 복사하지 않고, `장비·행위·실패상태·사고유형` 추론 템플릿으로 재구성한다.
  - 후보 부족 시 fallback 행도 작업문맥 앵커(장비/행위/실패상태 토큰)를 포함한 문장형 `원인/유해위험요인`으로 생성한다.
  - 사고유형은 단일 키워드 선확정이 아니라 문맥 축(`장비/상황/대상/행위/위험요인`) 점수 합산으로 판정한다.
  - 충돌 가능 유형(예: 차량 협착 vs 회전부 끼임)은 문맥 신호 강도(장비/행위/공간관계)로 우선순위를 결정한다.
  - 유사 신호는 중복 제거(유사도 기반) 후 정보량/명확도 점수로 정렬해 상위 행만 선택한다.
  - 중복 억제는 유사도 외에 `사고유형+행위+장비+실패상태+통제목적` 메커니즘 시그니처와 `사고유형+controlIntent` 시그니처 단위로 적용한다.
  - 결과 행 수는 `3행 우선`으로 생성하되, 고유 통제 목적이 부족하면 `1~2행`으로 축소한다.
  - 행 수를 채우기 위한 작업 맥락 밖 위험유형 확장과 동일 통제 목적의 강제 행 생성을 금지한다.
  - `원인(cause)`, `유해위험요인(hazardFactor)`은 길이 제한 내에서 문장 경계 기준으로 잘라 생성하며, 조사/연결어로 끝나는 미완성 문장(예: `...가`, `...및`)은 허용하지 않는다.
  - `법적기준(legalBasis)`: `산업안전보건기준에 관한 규칙 제XX조(조문명)` 형식으로만 표기한다.
- `관련근거(법적기준)` 매칭은 초기 생성 직후 자동 실행하며, 수동 버튼으로 동일 절차를 재실행할 수 있다.
- 결과 표는 법적기준 매칭 기준을 사용자가 확인할 수 있도록 `사고유형·장비·원인·유해위험요인·통제목적` 기준 안내와 행별 통제목적 라벨을 표시한다.
- 검색 전에 Gemini가 각 행의 `원인+유해위험요인`을 `위험유형/사고메커니즘/불안전상태/통제목적/장비/검색구문`으로 구조화한다.
- 서식 전용 백엔드(`kosha-law-guides-form`)는 `lawSourcePolicy=storage_db_only`로 실행해 내부 DB/Storage 법령 후보만 사용한다.
- DB/Storage 후보는 조문번호와 조문명을 확인할 수 있고 안전보건규칙 원문 정보가 있는 경우만 행 매칭 후보로 허용한다.
- 행 단위 사고유형은 `원인(cause)+유해위험요인(hazardFactor)`를 우선으로 정규화하고, `분류(category)`는 보조 신호로만 사용한다.
- 행 단위 매핑은 `원인+유해위험요인+작업상황` 축 기반 strict 매칭으로 후보를 랭킹한다.
  - `RiskLawContext.taskHazardTypes + taskContextTokens`를 랭킹 입력으로 사용하며, 행 위험유형과 작업 허용 위험유형을 동시에 충족하는 후보만 통과시킨다.
  - `위험요인 토큰` 1개 이상 일치 필수(행 토큰이 충분한 경우 2개 이상으로 상향)
  - `작업유형 토큰` 또는 `설비 토큰`이 존재하면 실제 토큰 일치 필수(`context hint` 단독 통과 금지)
  - 행 `원인/유해위험요인`에서 추출한 행 특이 토큰이 충분한 경우 최소 1개 이상 일치 필수
  - `사고유형(정규화 hazard type)`은 필수 게이트가 아니라 점수 보정 + 최종 정합성 검증 용도로 사용
  - 법령 후보 점수에 문맥 축(`장비/상황/대상/행위/위험요인`) 일치 가점을 반영한다.
  - 행 문맥과 법령 문맥이 충돌(예: 차량 협착 맥락에서 회전부 방호 조문)하면 강한 감점 또는 제외한다.
  - 내부 신뢰 점수 기준 미달 시에만 공란 처리
- 행별 배정 순서:
  1. Storage/action/fallback 후보를 모두 수집
  2. 행 축(strict) + 토큰밀도 + 충돌/일반문구 패널티를 반영해 단일 점수로 재정렬
  3. 사고 단위 전역 배정에서 조문번호 중복을 금지하고, 최대 가중치 이분 매칭으로 고유 조문 조합을 선택
    - 조문번호 메타데이터(`articleNumber`)가 비어 있으면 `legalBasis` 문자열에서 조문번호를 재추출해 동일 조문 중복을 차단한다.
  - 점수 우선순위는 `배정 가능한 행 수`, `AI 추천 유지`, `행별 controlIntent 적합 점수` 순이다.
  - 차량/이동장비 기준 조문맵은 저장 원문과 대조한 `제39조·제40조·제171조·제172조·제179조·제184조·제197조·제199조·제200조`를 사용하며, 조문명이 불일치했던 제196조·제198조 항목은 제거했다.
  4. 고유 후보가 부족하고 DB/Storage 후보가 `review_required`이면 최상위 후보를 표시하되 수동 검토 상태를 유지
- 자동작성 또는 수동 재검색 시 `Gemini 행 맥락 분석 → 하이브리드 후보 검색 → 행별 1차 랭킹 → Gemini 최종 선택`을 순차 실행한다.
- 위험유형 보강 규칙: `비계`, `발판`, `고정불량` 계열 표현은 `추락`으로 정규화한다.
- 행 집합 배정은 후보가 적은 행부터 처리하며, 동일 조문은 기본적으로 중복 배정하지 않는다.
- 동일 사고 내 동일 조문은 우선 재사용하지 않는다. 다만 고유 후보가 부족한 `review_required` 행은 검증된 DB/Storage 최상위 후보를 제한적으로 재사용한다.
- 프론트(`FormEditor`)는 조문 중복 시 재매핑을 먼저 시도하고, 실패한 `review_required` 행에는 DB/Storage 최상위 후보와 `검토 필요` 상태를 함께 유지한다.
- `unknown`이거나 유효한 DB/Storage 후보가 없으면 저장값은 `legalBasis=\"\"`로 유지한다.
- `관련근거` 표시 형식은 정규식 `^산업안전보건기준에 관한 규칙 제\\d+조\\(.+\\)$`를 만족해야 하며, 미충족 시 공란 처리한다.
- 조문번호 또는 조문명이 하나라도 미확정이면 `legalBasis=\"\"`로 반환한다(추정 출력 금지).
- 저신뢰/모호 DB/Storage 후보는 `review_required`로 표시하며 자동 확정값과 구분한다. `unknown` 후보는 공란으로 유지한다.
- 위험유형(사고 메커니즘) 불일치 후보는 검색 점수가 높아도 자동 확정하지 않고 제외한다.
- `threshold:0` 완화 폴백은 사용하지 않으며, 법령 evidence 후보가 모두 임계치 미달일 때만 `threshold:20` 저강도 폴백을 적용한다.
- `현재상태 및 조치`, `감소대책`은 행별 1문장(최대 60자 내외)으로 생성한다.
- 행 생성 마지막 단계에서 `row consistency gate`를 적용해 `원인/유해위험요인/현재상태 및 조치/감소대책/법적기준`의 사고 메커니즘 일치 여부를 검증한다.
  - 검증 실패는 문서 전체 중단이 아니라 행 단위 처리로 제한한다.
  - 1차 생성 후 실패 필드는 위험유형 템플릿 기반으로 1회 재작성하고 재검증한다.
  - 재검증 실패 시 `현재상태 및 조치/감소대책`은 위험유형 템플릿으로 재작성된 값을 유지하고 행 상태를 `review_required`로 확정한다. 원인·유해위험요인·법적기준의 미해결 값은 기존 공란 정책을 유지한다.
  - 다른 행/필드는 계속 생성하며 다운로드는 차단하지 않는다.
  - `현재상태 및 조치/감소대책`이 행 위험유형 신호와 불일치하거나 행 앵커 토큰(장비/행위/실패상태)과 연결되지 않으면 해당 위험유형+행 앵커 기준 문장으로 자동 재작성한다.
  - 대책 문장에 기대 위험유형 외 강한 상충 신호가 우세하면(예: 감전 행에 `안전대/추락` 중심 문구), 기대 유형 신호가 일부 포함돼도 재작성한다.
  - `작업자 전원 확인`처럼 인원 의미의 `전원`은 감전 단서로 단독 사용하지 않는다.
  - 재작성 문장은 1문장/60자 정책을 유지한다.
  - 행 집합 최종 단계에서 `현재상태 및 조치`와 `감소대책`을 각각 별도 중복 집합으로 관리해, 동일/유사 문장 반복을 억제한다.
    - 행 간 유사도(`jaccard`)가 `0.76+`이면 다른 행앵커로 재작성한다.
    - 같은 행 내 `현재상태 및 조치`와 `감소대책` 유사도(`jaccard`)가 `0.72+`이면 `감소대책`을 재작성해 역할을 분리한다.
  - `법적기준`이 행 위험유형 또는 작업 허용 위험유형과 불일치하면 재선정하며, 재선정 실패 시 공란으로 둔다.
- 대책 문장은 미완성 어미(`및/후/등` 등)로 종료되지 않도록 보정하고, 항상 완결형 문장으로 출력한다.
- 대책 문장은 기본 중복 억제(0.85+) 외에 행 다양성 보정(0.76+)을 추가 적용한다.
- 서식센터 `AI 분석 및 서식 자동작성` 재실행 시 위험성평가 행은 append/부분 병합 없이 전체 재생성한다.
- 재생성 실패 시 직전 위험성평가 행 데이터는 유지하고 오류 메시지만 표시한다.
- 행 추가 시(`행 추가`) 신규 행은 6개 체계 중 기본 분류값으로 생성되고, `분류/원인/유해위험요인` 수정 시 전체 행 `관련근거`를 즉시 재배정한다.
- `AI로 위험성 추가` 버튼은 현재 작업 상황 입력(`20자 이상`)이 충족된 상태에서만 활성화한다.
- `AI로 위험성 추가`는 `form-autofill-analyze` 재호출 결과에서 기존 행과 중복되지 않는 후보 1건만 반영한다(원인+유해위험요인 유사도 + 핵심어 중복 복합 판정).
  - 정규화 텍스트 완전일치(`원인+유해위험요인`)는 즉시 중복으로 처리한다.
  - 동일 사고 메커니즘 신호에서는 `유사도>=0.75` + `핵심어 1개 이상`일 때만 중복으로 본다.
  - 사고 메커니즘 신호가 다르면 거의 동일 서술(`유사도>=0.9` + `핵심어 3개 이상`)인 경우에만 중복으로 본다.
- 1차 AI 후보가 모두 중복이면, 기존 행 요약을 포함한 중복금지 가이드를 추가해 1회 재시도한다.
- 마지막 행이 빈 행이면 append 대신 해당 빈 행을 우선 채운다. 빈 행이 없으면 새 행을 추가한다.
- AI 후보가 전부 기존 행과 중복이면 행은 유지하고 안내 메시지만 표시한다.
- `분류`는 사용자 직접 선택값을 유지하며, 자동 재분류는 `분류 재계산` 액션에서만 수행한다.
- `RiskAssessmentRow`는 하위호환 optional 검증 메타 필드를 포함한다.
  - `validationStatus: "ok" | "review_required"`
  - `reviewRequiredFields: string[]`
  - `reviewReasonCodes: string[]`
  - `expectedHazardType?: string`
  - `detectedHazardType?: string`

## 2026-04-12 Boundary Isolation Update

### New law-guide endpoints

- `kosha-law-guides-form`
  - 목적: 서식센터 전용 법령 근거 생성
  - 정책: strict mode (`mode=form`) + `lawSourcePolicy=default`
  - 법령 소스: 공공데이터 스마트검색 API + Storage + DB
  - 검색 입력: Gemini 행별 의미 분석 결과(`semanticIntents`)를 우선 검색 시드 및 위험 프로필로 사용
  - 저신뢰 결과는 빈 근거 허용
- `kosha-law-guides-assessment`
  - 목적: 위험성 평가 흐름 전용 근거 탐색
  - 정책: assessment mode (`mode=assessment`), 탐색/증빙 중심
- `kosha-law-guides` (legacy)
  - 목적: 하위호환 전용
  - 정책: 내부적으로 assessment mode로 위임 + `x-risk-guard-deprecated: true`
  - 제거 계획: 다음 프로덕션 릴리즈 1회 후 제거

### Frontend routing contract

- `AssessmentProvider` scope: `/` + `/assessments/*` 전용
- `/forms/*`, `/prediction`, `/settings`는 AssessmentContext 비의존 경로

### Frontend law backend switch

- env: `VITE_USE_FORM_LAW_BACKEND` (default `true`, strict)
- `false` => forms law search uses legacy `kosha-law-guides`
- `true` or unset => forms law search uses `kosha-law-guides-form`
- forms fallback: 없음 (`kosha-law-guides-form` 결과가 `null`이어도 legacy 재시도하지 않음)
- assessment flow law search always uses `kosha-law-evidence`
- assessment flow does not call legacy fallback when `kosha-law-evidence` returns `null`
