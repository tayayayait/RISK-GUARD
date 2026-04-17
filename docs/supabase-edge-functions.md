# Supabase Edge Functions

Date: 2026-04-13

## Project

- Project ID: `dkslgsguxlznapiygier`
- Project URL: `https://dkslgsguxlznapiygier.supabase.co`

## Functions

| Function | Role | Upstream |
| --- | --- | --- |
| `gemini-analyze` | Task profile + risk narrative generation | Gemini API |
| `form-autofill-analyze` | Form Center profile/risk draft generation | Gemini API |
| `gemini-evidence-summary` | Evidence detail summary (`incidentRelevance`, `applicabilityReason`, `practicalActions`) | Gemini API |
| `kosha-disaster-cases` | Domestic disaster case evidence | `news_api02/getNews_api02` (`callApiId=1060`) |
| `kosha-fatality-cases` | Fatality board evidence | `news_api02/getNews_api02` (`callApiId=1040`) |
| `kosha-law-evidence` | Law/Guide/Media evidence wrapper (shared law-guides core) | Supabase Storage (`laws`) + `law_articles` + `srch/smartSearch` |
| `analysis-action-plan` | Stage action plan wrapper (`immediate/same_day/pre_resume`) | Supabase Storage (`laws`) + `law_articles` + `srch/smartSearch` |
| `kosha-law-guides` | Legacy combined response (evidence + actionItems) | `srch/smartSearch` |
| `risk-legal-basis-fit` | Risk form row-level legal-basis second-pass fit validation | Gemini API (+ rule fallback) |
| `kosha-materials` | Safety material links | `selectMediaList01/getselectMediaList01` |
| `form-history` | Form Center history CRUD (`create/list/get/delete`) + 30-day purge (`risk-assessment`, `accident-report`) | Supabase Postgres (`risk_assessment_history`) |
| `risk-validation-audit` | Risk row validation audit event ingest (best-effort) | Supabase Postgres (`risk_row_validation_audit`) |
| `company-profile` | 회사 고정정보 조회/업서트 (`get/upsert`) | Supabase Postgres (`company_profile_defaults`) |

## Form Center Automation Intake (2026-04-11)

- `/forms/:formType` editor supports direct intake:
  - free-text description (current work state / accident context)
  - one-click AI analysis + form autofill
- Backend path uses `form-autofill-analyze` when `formType` is provided.
- Backend path uses `gemini-analyze` for default assessment flow.
- Frontend timeout for `gemini-analyze` is `60000ms` (default backend client timeout is `30000ms`).
- Frontend timeout for `form-autofill-analyze` is `60000ms` (default backend client timeout is `30000ms`).
- `gemini-analyze` runtime guard (2026-04-14):
  - 기본 모델은 `flash` 단일 경로로 호출(필요 시 `GEMINI_ANALYZE_MODEL`로 오버라이드)
  - Gemini 1차 호출은 내부 타임아웃(기본 `30000ms`)을 사용
  - JSON repair 호출은 별도 타임아웃(기본 `25000ms`)을 사용
  - 실패 시 `504 UPSTREAM_TIMEOUT` 또는 `502`로 즉시 종료
  - 응답 정규화 단계에서 영문 fallback 문자열은 사용하지 않고 한국어 fallback으로 통일
  - `scenario`가 비어 있거나 한글 문맥이 없으면 작업위치/위험유형 기반 한국어 문장으로 자동 대체
  - `hazards.name/reason`가 비어 있거나 비한글 값이면 각각 `"{유형} 위험"` / 한국어 근거 문장으로 보정
  - `profile.hazards`가 문자열 배열로 내려오는 경우에도 항목별로 객체(`id/type/weight/confidence/reason`)로 승격 정규화하여 `PARSE_ERROR`를 방지
  - 최상위 예외는 shared `withErrorBoundary`에서 `500 INTERNAL_ERROR` + CORS 헤더로 강제 응답
- `form-autofill-analyze` runtime guard (2026-04-14):
  - Gemini 1차 호출은 내부 타임아웃(기본 `22000ms`)을 사용
  - JSON repair 호출은 별도 타임아웃(기본 `7000ms`)을 사용
  - `risk-assessment` 자동작성은 모델을 `GEMINI_MODEL_PRO`로 고정해 즉시 pro 호출
  - `fixed` 전략 또는 `GEMINI_FORM_MODEL` 지정 시에도 `pro/flash` 대체 모델 후보를 포함해 자동 폴백
  - 모든 모델에서 timeout/파싱 실패 시 입력 텍스트 기반 규칙형 fallback payload를 200으로 반환 (`x-risk-guard-source=form-autofill-analyze-fallback`)
  - frontend는 Edge timeout(`Timeout: form-autofill-analyze`) 발생 시 동일 요청 무한 재시도하지 않음
  - 최상위 예외는 shared `withErrorBoundary`에서 `500 INTERNAL_ERROR` + CORS 헤더로 강제 응답
- Current scope in this release:
  - no attachment upload UI in Form Center
  - no server-side OCR/PDF parsing pipeline in this function
  - `risk-assessment`는 2단계 분리 흐름을 사용:
    - 초기 자동작성: `법적기준` 공란 유지
    - 수동 법령 매칭: `AI로 적합한 법령 찾기` 버튼 실행 시 `kosha-law-guides-form` + `risk-legal-basis-fit` 호출

## Form Center History Retention (2026-04-15)

- Edge function: `form-history`
  - single POST endpoint with `action=create|list|get|delete`
  - requires `scopeKey`; stores only SHA-256 hash (`scope_hash`)
  - `create` payload requires `formType`
    - `risk-assessment`: `riskRows` required
    - `accident-report`: `accidentData` required
  - `list` supports optional `formType` filter
  - purges expired rows (`expires_at <= now()`) on every request
- Table: `risk_assessment_history`
  - snapshot fields: `form_type`, `task_name`, `site_name`, `work_date`, `context_text`, `risk_rows`, `accident_data`
  - validation fields (optional payload):
    - `validation_summary` (`JSONB object`)
    - `validation_events` (`JSONB array`)
  - retention fields: `created_at`, `expires_at` (`default now() + 30 days`)
  - indexes: `(scope_hash, created_at desc)`, `(scope_hash, form_type, created_at desc)`, `(expires_at)`
- Frontend behavior:
  - history is saved after each form DOCX export succeeds (`risk-assessment`, `accident-report`)
  - history view is read-only (`historyId` query param)
  - Form Center list supports client-side filter (`전체/위험성평가 기록서/산업재해조사표`)
  - live draft resets when leaving/re-entering `/forms/:formType`

## Risk Validation Audit (2026-04-17)

- Edge function: `risk-validation-audit`
  - single POST endpoint
  - request body: `{ events: RiskRowValidationEvent[], source?, metadata? }`
  - empty events are accepted and return `{ inserted: 0 }`
  - ingest failure is non-blocking for form generation/export flow
- Table: `risk_row_validation_audit`
  - key fields: `event_timestamp`, `site_name`, `form_type`, `row_index`, `expected_hazard_type`, `detected_hazard_type`, `field`, `reason_code`, `rewritten`, `final_status`, `source`, `metadata`
  - constraints: `form_type='risk-assessment'`, `final_status in ('ok','review_required')`, `metadata json object`

## Company Profile Defaults (2026-04-13)

- Edge function: `company-profile`
  - single POST endpoint with `action=get|upsert`
  - key: `businessNumber` (사업자등록번호)
  - normalized key format: `XXX-XX-XXXXX` (10 digits)
  - deploy config: `[functions.company-profile].verify_jwt=false` (단순 POST 클라이언트와 호환)
- Table: `company_profile_defaults`
  - columns: `business_number(PK), management_number, business_name, industry, headquarters_address, updated_at`
  - upsert policy: same `business_number` writes latest values
- Frontend behavior:
  - `/settings`에서 회사 정보 저장
  - 사고조사표 자동작성 시 `Ⅰ. 사업장 정보` 고정값 자동 병합
  - 서버 실패 시 localStorage 캐시로 폴백하여 동일 브라우저 자동입력 유지

## Risk Assessment Table Layout Alignment (2026-04-12)

- `/forms/risk-assessment` 결과 표(`RiskAssessmentTable`)는 문서형 양식 레이아웃으로 구성된다.
- 표 구조:
  - 상단 메타 2행: `공정명/평가일시` + 중앙 타이틀 `위험성평가` + `평가자(리더및팀원)` 블록
  - 병합 헤더: `유해위험요인 파악`, `관련근거`, `현재위험성`
  - 14열 고정 순서: `작업내용, 분류, 원인, 유해위험요인, 법적기준, 현재상태 및 조치, 가능성(빈도), 중대성(강도), 위험성, 감소대책, 개선일, 완료일, 담당자, 비고`
- DOCX 내보내기 렌더링:
  - 페이지 규격은 고정 `A4 landscape`(`w:16838`, `h:11906`)를 사용한다.
  - `w:pgMar`는 `top=360`(약 6.35mm), `right/bottom/left=0`으로 설정해 표 시작 위치를 약간 아래로 내린다.
  - 페이지 분할 시 4단 헤더를 반복(`w:tblHeader`)해 후속 페이지 가독성을 유지한다.
- 상단 메타값은 자동 매핑하지 않고 공란으로 유지한다.
- `비고`는 표시 전용 공란 열이며 저장/조회 payload에는 포함하지 않는다.
- 결과 행 표시값은 문서형 작성 기준으로 정규화한다.
  - `작업내용`: 업종명이 아닌 실제 공정/작업단계 중심
  - `분류`: 6개 고정 체계(`기계적/작업특성/인적/환경적/관리적/전기적 요인`)
  - `분류` 자동 판정 우선순위: `전기 > 관리 > 인적 > hazard type 기본 매핑`
  - `법적기준`: `산업안전보건기준에 관한 규칙 제XX조(조문명)` 형식만 허용
- Prompt hint file: `src/lib/riskAssessmentTemplateHint.ts`
- `form-autofill-analyze` request uses:
  - `formType`
  - `formTemplateHint`
- 본 변경은 UI 레이아웃 변경 외에 위험행 검증 메타 저장(`validation_summary`, `validation_events`)과 감사 적재(`risk-validation-audit`)를 포함한다.

## Internal CSV Catalog (v1)

- Goal: improve evidence/material matching quality without changing external API contract.
- Source files:
  - `공공데이터포털 api/한국산업안전보건공단_건설업 공종별 세부공정 목록_20210910.csv`
  - `공공데이터포털 api/한국산업안전보건공단_업종별 기계설비 목록_20210909.csv`
- Generated module: `supabase/functions/_shared/generated/kosha-catalog.ts`
- Regenerate command:

```bash
pnpm run generate:kosha-catalog
```

- Notes:
  - generated module must be committed with code changes
  - `kosha-materials` query policy (v1):
    - 기본값은 `industryScope=profile`, `hazardScope=auto_top3`
    - `industryScope=all`이면 `ctgr02` 전체 코드(1,2,3,4,6) 병렬 조회
    - `hazardScope=all`이면 `ctgr03` 전체 코드(26개) 병렬 조회
    - 최종 조회는 `industryCodes × hazardCodes` 조합을 배치 병렬 처리 후 병합
    - `filters`로 `ctgr01/ctgr02/ctgr03` override 가능
    - 언어는 `ctgr04_kr=Y` 고정(한국어 전용)
    - 중복 제거는 `url+title` 기준
    - `keyword` 후처리 필터 + 관련도 가점 적용
    - `priorityMode`는 API 코드 필터가 아닌 정렬 모드
  - CSV augmentation keeps API contract and improves ranking/token quality

## `law_articles` Table (`kosha-law-evidence`)

- Primary columns:
  - `law_name`, `article_number`, `article_title`, `summary`
  - `hazard_types TEXT[]` (GIN index)
  - `remedial_actions TEXT[]`, `compliance_checklist TEXT[]`
  - `source_url`, `created_at`
- Recommended constraints:
  - unique key: `(law_name, article_number)`

## Storage Strategy (`kosha-law-evidence`)

- Bucket: `laws` (`LAW_STORAGE_BUCKET` override allowed)
- Allowed source file types: `.md`, `.pdf`
- Retrieval path policy:
  - law track prefers Storage -> DB -> API (fallback)
  - guide/media tracks use API-based candidates with ranking
- Current implementation reads plain text from markdown and parsed text blocks from PDF.

## Shared Hazard Taxonomy

- Shared module: `supabase/functions/_shared/hazard-taxonomy.ts`
- Matching uses normalized hazard type names across law/guide/media tracks.

## Required Secrets (Supabase)

- `GEMINI_API_KEY`
- `GEMINI_MODEL_STRATEGY` (`hybrid` or `fixed`)
- `GEMINI_MODEL_FLASH` (default `gemini-3-flash-preview`)
- `GEMINI_MODEL_PRO` (default `gemini-3.1-pro-preview`)
- `GEMINI_MODEL_FIXED` (optional; fixed strategy only)
- `GEMINI_ANALYZE_MODEL` (optional; dedicated override for `gemini-analyze`)
- `GEMINI_FORM_MODEL` (optional; dedicated override for `form-autofill-analyze`)
- `GEMINI_SUMMARY_MODEL` (optional; fallback: `GEMINI_MODEL_FLASH`)
- `GEMINI_ANALYZE_PRIMARY_TIMEOUT_MS` (optional; default `30000`)
- `GEMINI_ANALYZE_REPAIR_TIMEOUT_MS` (optional; default `25000`)
- `GEMINI_FORM_PRIMARY_TIMEOUT_MS` (optional; default `18000`)
- `GEMINI_FORM_REPAIR_TIMEOUT_MS` (optional; default `7000`)
- `DATA_GO_KR_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LAW_STORAGE_BUCKET` (optional, default: `laws`)

## Frontend Env

`.env.local`

```bash
VITE_SUPABASE_URL=https://dkslgsguxlznapiygier.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_SUPABASE_USE_AUTH_HEADERS=true
```

- Default `VITE_SUPABASE_USE_AUTH_HEADERS=true`.
- When `true`, frontend includes `apikey` and `Authorization: Bearer <anon key>` headers.
- Set `false` only for explicit debugging. In this project, `false` can cause upstream timeout (`The signal has been aborted`) on `kosha-law-evidence`.
- Timeout policy:
  - `gemini-analyze`: `60000ms`
  - `form-autofill-analyze`: `60000ms`
  - `kosha-law-guides`, `kosha-law-guides-form`, `kosha-law-guides-assessment`, `analysis-action-plan`: `120000ms`

## Deploy

```bash
npx supabase login
npx supabase link --project-ref dkslgsguxlznapiygier
npx supabase secrets set --env-file ./supabase/.env.functions

npx supabase functions deploy gemini-analyze
npx supabase functions deploy form-autofill-analyze
npx supabase functions deploy gemini-evidence-summary
npx supabase functions deploy kosha-disaster-cases
npx supabase functions deploy kosha-fatality-cases
npx supabase functions deploy kosha-law-evidence
npx supabase functions deploy analysis-action-plan
npx supabase functions deploy risk-legal-basis-fit
npx supabase functions deploy kosha-materials
npx supabase functions deploy form-history
npx supabase functions deploy risk-validation-audit
npx supabase functions deploy company-profile
```

- `kosha-law-evidence` and `analysis-action-plan` are wrappers built on shared law-guides core.

## Deploy Encoding Check (Windows)

- If deploy fails with import-map parse errors, check for UTF-8 BOM in `deno.json`.

```powershell
Get-Content -Path "supabase/functions/gemini-evidence-summary/deno.json" -Encoding Byte -TotalCount 3
```

- If first bytes are `239 187 191` (BOM), rewrite without BOM:

```powershell
$path = "supabase/functions/gemini-evidence-summary/deno.json"
$raw = Get-Content -Path $path -Raw
[System.IO.File]::WriteAllText((Resolve-Path $path), $raw, [System.Text.UTF8Encoding]::new($false))
```

## Smoke Test

```bash
curl -X POST "https://dkslgsguxlznapiygier.supabase.co/functions/v1/kosha-law-guides" \
  -H "apikey: <anon key>" \
  -H "Authorization: Bearer <anon key>" \
  -H "Content-Type: application/json" \
  -d '{"taskName":"ladder work","profile":{"industry":"construction","workLocation":"work site","equipment":[],"hazards":[{"name":"fall","type":"fall"}]}}'
```

## Troubleshooting: CORS vs BOOT_ERROR

- Browser can show a CORS message:
  - `blocked by CORS policy: Response to preflight request doesn't pass access control check...`
- In this project, this often means function startup failure:
  - `{"code":"BOOT_ERROR","message":"Function failed to start (please check logs)"}`
- Quick `OPTIONS` check:

```bash
node -e "const f=['kosha-law-evidence','analysis-action-plan','kosha-law-guides'];(async()=>{for(const n of f){const r=await fetch('https://dkslgsguxlznapiygier.supabase.co/functions/v1/'+n,{method:'OPTIONS',headers:{Origin:'http://localhost:8080','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type'}});console.log(n,r.status,await r.text());}})();"
```

- Expected healthy response: `200 ok` for `OPTIONS`.
- If `503 BOOT_ERROR`, fix/redeploy function first; CORS headers alone are not sufficient.
- If `OPTIONS` is `200` but browser still reports intermittent CORS on `POST`, treat it as runtime failure signal and inspect function logs for unhandled exception before changing frontend headers.

### BOOT_ERROR case: missing export from shared module

- Symptom example:
  - `Uncaught SyntaxError: The requested module '../_shared/law-guides-core.ts' does not provide an export named 'buildLawGuidesPayload'`
- Meaning:
  - deployed `index.ts` import signature and deployed `_shared/law-guides-core.ts` snapshot are mismatched.
  - this is a deployment snapshot inconsistency, not a request payload issue.
- Recovery:
  - redeploy all law-guide related functions from the same local revision:

```bash
npx supabase functions deploy kosha-law-guides
npx supabase functions deploy kosha-law-guides-form
npx supabase functions deploy kosha-law-guides-assessment
npx supabase functions deploy kosha-law-evidence
npx supabase functions deploy analysis-action-plan
```

- Verify immediately after deploy:
  - `OPTIONS` or `POST` on `kosha-law-guides-form` / `kosha-law-guides-assessment` returns `200` (not `503 BOOT_ERROR`).

## `kosha-law-guides` Response (3-track)

- `lawItems`: law track results
- `guideItems`: guide track results
- `mediaItems`: media track results
- `items`: flattened legacy list (`lawItems + guideItems + mediaItems`)
- `actionItems`: stage action items
- `meta.sourceCounts`: source breakdown (`api|db|storage`)
- `meta.trackCounts`: per-track count (`law|guide|media`)
- `meta.trackStatus`: per-track status (`success|empty|error`)
- `meta.trackErrors`: per-track error list
- `meta.trackEmptyReason`: per-track empty reason (`NO_CANDIDATE|FILTERED_OUT`)
- `meta.guideEmptyReason`: legacy guide-empty reason

## `analysis-action-plan` Response

- `actionItems`: stage actions (`immediate|same_day|pre_resume`)
- `stageCounts`: per-stage item counts
- Returns action-plan-focused payload built from shared law-guides core.
- `actionItems` optional fields:
  - `articleTitle`
  - `lawFitStatus` (`verified|review_required|unknown`)
  - `lawFitReason`
  - `lawFitScore` (`0~100`)
- Validation pipeline:
  - 1차: 법령 기반 action seed/내러티브 생성
  - 2차: 조치-법령 적합성 AI 검증(JSON)
  - 실패 처리: AI 실패/파싱 실패 시 규칙형 폴백으로 상태 산정
  - 정책: `review_required` 항목은 제거하지 않고 카드 유지 + 수동 검토 표시
- 내러티브 품질 보정:
  - `actionNeedReason/applicabilityReason/keyExcerpt/summaryArticle`는 문장 완결성 검사 후 미완성 종결(`및/등/여부/또는/으로/하여/하고/같은/수 있는`)이면 단계+조문+조치 앵커 기반 폴백 문장으로 재작성
  - action 설명 필드(`applicabilityReason/keyExcerpt/summaryArticle`)는 모두 단계명을 명시하고(`즉시 조치 단계/당일 조치 단계/작업 재개 전 확인 단계/재발 방지 단계`), 단계 문맥 누락 시 단계형 폴백으로 치환
  - `핵심 의미/적용 배경/현장 기준 요약` 3개 필드 간 유사도가 높으면 역할 충돌로 판정하고 필드별 템플릿으로 재작성
  - 우측 패널 표시 단계에서 문장을 문자 길이로 절단하지 않고 문장 경계로 정리해 완결형 문장만 노출
  - 패널 문장 종결이 불완전 단어(`작업 지속`, `작업할`, `위험이 있는 장소`)에 걸리면 섹션별 폴백 문장으로 치환
  - 서로 다른 조문의 내러티브가 유사도 임계치 이상으로 수렴하면 조문별 폴백으로 분기
  - 패널 3개 섹션(`핵심 의미/적용 배경/현장 기준 요약`)은 역할 중복 시 섹션별 템플릿으로 재작성

## `gemini-evidence-summary` Response

- Primary schema:
  - `incidentRelevance`
  - `applicabilityReason`
  - `practicalActions`
- Backward compatibility:
  - old schema (`summary/actions/cautions`) is normalized into primary schema in function layer

## Query / Fallback Policy (shared law-guides core)

- API fetch timeout: `4500ms` (`API_FETCH_TIMEOUT_MS`)
- Total API fetch budget: `30000ms` (`API_FETCH_BUDGET_MS`)
- `kosha-law-evidence` (`api_only + evidence_only`)는 워커 리소스 보호를 위해 searchValues를 최대 `10`개로 제한하고 semantic rerank를 비활성화
- 위 경로에서 1차 API 검색이 0건일 때 hazard/generic seed(최대 3개)로 추가 검색을 수행
- 위 경로에서 API 후보가 존재하지만 랭킹 결과가 0건이면 `threshold=0 + hazardTypeFilter=none` 저강도 랭킹으로 최소 근거 카드를 구성
- Ranking thresholds:
  - law (strict): `60`
  - guide/media adaptive thresholds: `55 -> 50 -> 45`
- Law strict gate (shared core):
  - accident type match required (normalized hazard type)
  - hazard-factor token match required (>=1)
  - work-type or equipment token match required (>=1)
- Evidence output limits:
  - law: `max 5`
  - guide/media: `max 5`
- Action-stage candidate thresholds:
  - `55 -> 50 -> 45 -> 0`
- Law source preference:
  - Storage first, then DB, then API fallback
- Law track fallback policy:
  - strict/완화 임계치(`60 -> 55 -> 50 -> 45 -> 40 -> 35`)를 모두 통과하지 못해도 후보가 존재하면 `threshold:20` 저강도 폴백으로 최소 근거를 구성
  - low-threshold 폴백은 semantic re-rank를 비활성화하고 rule 기반 정렬 결과를 사용
- Storage source parsing policy:
  - `laws` 버킷을 재귀 탐색하여 원문 파일을 수집
  - 지원 확장자: `.md`, `.pdf`, `.txt`
  - `LAW_ONLY_STANDARDS_RULES=true`일 때만 `산업안전보건기준에 관한 규칙` 계열로 제한
- Action-stage selection behavior:
  - if no unused candidate passes threshold, same article can be reused with `selectionReason`
  - stage 1차 선택은 동일 법령 반복 상한(기본 1건)을 적용해 법령 다양성을 우선 확보하고, 후보 부족 시 상한을 완화해 최소 개수를 채움
- Runtime diagnostics (`meta.lawDiagnostics`):
  - storage parsing 지표: `listedPathCount`, `attemptedPathCount`, `downloadedPathCount`, `parsedArticleCount`, `articleNumberExtractRate`, `errors`
  - selection 필터 지표: `rawCandidateCount`, `strictCandidateCount`, `rankingPoolCount`, `rankedCandidateCount`, `droppedByStrictAxisCount`, `droppedByRankingThresholdCount`

## Risk Assessment Row Generation Policy (consumer mapping)

- `related legal basis` (`관련근거`) is not filled during initial draft generation.
- `related legal basis` is mapped only when the user executes `AI로 적합한 법령 찾기`, using each row's `cause + hazardFactor` text first.
- `원인/유해위험요인`은 문장형 품질 보정을 적용한다.
  - `원인`: 작업조건 + 위험 발생 메커니즘 + 사고 가능성을 포함한 문장으로 정규화
  - `유해위험요인`: 단일 키워드 입력 시 `... 상태/조건으로 ... 사고 위험 증가` 형태로 확장
  - 길이 가이드: `원인` 18~56자, `유해위험요인` 12~36자(표 가독성 우선)
  - 행 개수 가이드: `3행 우선`으로 구성하고, 고유 메커니즘이 부족할 때만 `2행`으로 축소
  - 상류 AI timeout/파싱 실패 시 fallback payload도 동일 기준의 문장형 텍스트를 반환
  - `form-autofill-analyze`의 `risk-assessment` 모드는 hazards를 3행 우선으로 후처리하며, 중복 메커니즘을 제거하고 작업상황 근거 문장을 우선 유지한다.
  - hazards 후보가 부족하면 작업상황 절 분해/신호 분해 기반 파생 hazards를 추가하고, 최종 fallback hazards도 작업문맥 앵커를 포함해 생성한다.
  - consumer 매핑 단계에서 `원인/유해위험요인`은 원문 절을 그대로 재사용하지 않고 추론형 문장 템플릿으로 정규화한다.
  - consumer 매핑 단계는 최종 행 구성 시 메커니즘 시그니처 중복(`사고유형+행위+장비+실패상태`)을 억제해 동일 원인/요인 반복을 방지한다.
- 후보 소스 제약:
  - `sourceType=storage` + 안전보건규칙 원문(`kr-industrial-safety-and-health-standards-rules.pdf`)만 사용
  - action candidate는 동일 조문의 조문명을 storage에서 교차확인할 수 있을 때만 허용
- Row-level checks:
  - hazard token match (1+, strict 2+ when row tokens are rich)
  - work/equipment context token match
  - context-hint-only pass is not allowed when work/equipment tokens exist
  - normalized accident type is used for score boost and final consistency validation, not as a mandatory pre-gate
- Fallback policy:
  - run `HAZARD_ARTICLE_MAP` fallback when Storage ranking misses
  - fallback also runs when accident type is not detected, using row-text hazard inference
  - `비계`, `발판`, `고정불량` keyword expressions are normalized to `추락`
- AI second-pass policy:
  - on `AI로 적합한 법령 찾기`, frontend performs first row mapping then calls `risk-legal-basis-fit` with row text + top candidate set
  - service returns `recommendedLegalBasis/status/score/reason` per row
  - row 결과는 조문 기준 전역 dedupe 없이 행 단위로 유지한다(중복 조문 정리는 후단 배정 정책에서 처리)
  - recommendation outside candidate set is discarded
  - Gemini failure/timeout falls back to deterministic scorer (service still returns results)
- If row-level confidence is still low after fallback/action ranking, `legalBasis` is returned as empty string.
- 법적기준 출력은 `^산업안전보건기준에 관한 규칙 제\\d+조\\(.+\\)$`를 만족할 때만 허용하며, 조문번호/조문명 미확정 시 빈값 처리
- Multi-row assignment policy:
  - rows with fewer eligible candidates are assigned first
  - unused law article is preferred
  - same article reuse is not allowed within one risk assessment
  - when user edits `작업내용/분류/원인/유해위험요인`, `legalBasis` is cleared and waits for next manual matching run
- category handling policy:
  - `분류` 입력은 6개 선택값으로 제한
  - `원인/유해위험요인` 수정 시 분류는 자동 덮어쓰기하지 않음
  - 사용자가 `분류 재계산` 액션을 수행할 때만 일괄 재분류
- `current measure` / `reduction measure` generation policy:
  - one sentence per row
  - target max length: 60 chars
  - sentence must be complete (no trailing fragments such as `및/후/등`)
  - newline/list markers removed
  - base near-duplicate suppression using similarity threshold `0.85`
  - row-level diversity pass:
    - per-column (`current measure`끼리, `reduction measure`끼리) similarity `0.76+` 문장은 행 앵커 기준으로 재작성
    - same-row `current measure` vs `reduction measure` similarity `0.72+`는 `reduction measure` 재작성으로 역할 분리

## 2026-04-12 Law Backend Split

### Added functions

- `kosha-law-guides-form` (`mode=form`, `lawSourcePolicy=storage_db_only`)
- `kosha-law-guides-assessment` (`mode=assessment`)

### Legacy compatibility

- `kosha-law-guides`는 deprecated endpoint로 유지
- 동작: `buildLawGuidesPayload(body, { mode: "assessment" })`로 위임
- 관측: deprecation warning 로그 + `x-risk-guard-deprecated: true` header
- 운영 계획: 1 릴리즈 후 제거

### Deployment commands (additions)

```bash
npx supabase functions deploy kosha-law-guides-form
npx supabase functions deploy kosha-law-guides-assessment
```

### Frontend binding

- assessment: `AssessmentLawService` -> `kosha-law-guides-assessment`
  - fallback: when assessment endpoint returns `null` (for example, missing deployment / runtime unavailable), client retries once via legacy `kosha-law-guides`
- forms: `FormLawService`
  - default (unset or `VITE_USE_FORM_LAW_BACKEND=true`): `kosha-law-guides-form`
  - runtime fallback: 없음 (form endpoint `null` 시 legacy 재시도하지 않음)
  - source policy: Storage + DB only (smartSearch API 비활성)
  - compatibility fallback (`VITE_USE_FORM_LAW_BACKEND=false`): `kosha-law-guides`
