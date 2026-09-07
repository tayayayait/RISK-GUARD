# External API & File Data Inventory

Date: 2026-04-14

## Runtime APIs

| Name | Edge Function | Upstream |
| --- | --- | --- |
| 국내 재해사례 | `kosha-disaster-cases` | `news_api02/getNews_api02` (`callApiId=1060`) |
| 사고사망사례 | `kosha-fatality-cases` | `news_api02/getNews_api02` (`callApiId=1040`) |
| 법령/Guide/미디어 근거 | `kosha-law-evidence` | `srch/smartSearch` (via shared core) |
| 3단계 법령 실행지침 | `analysis-action-plan` | `srch/smartSearch` (via shared core) |
| 법령+실행지침 통합(레거시) | `kosha-law-guides` | `srch/smartSearch` |
| 서식센터 법적기준 자동 매칭 | `kosha-law-guides-form` | Gemini 의미 분석 결과 기반 `srch/smartSearch` + `law_articles` + Storage `laws` |
| 안전보건 자료 | `kosha-materials` | `selectMediaList01/getselectMediaList01` |
| 근거 상세 AI 요약 | `gemini-evidence-summary` | Gemini API |

## Local File Data (Ranking Augmentation)

- `공공데이터포털 api/한국산업안전보건공단_건설업 공종별 세부공정 목록_20210910.csv`
- `공공데이터포털 api/한국산업안전보건공단_업종별 기계설비 목록_20210909.csv`
- Generated module: `supabase/functions/_shared/generated/kosha-catalog.ts`
- Regenerate command: `pnpm run generate:kosha-catalog`

## kosha-law-evidence Track Policy

- 적용 범위: Assessment 4단계 근거확인(`api_only`)
- 법령 소스 정책: 스마트검색 API only (DB/Storage 미사용)
- 실행 모드: `responseMode=evidence_only` (action/narrative/law-fit 단계 스킵)
- 법령 트랙: `category=1,2,3,4`
- 미디어 트랙: `category=6`
- Guide 트랙: `category=5,7,8,9,11`
- API 검색어 확장: `top hazards(name/type, up to 3) + taskName + workLocation + equipment(up to 3) + taskDescription/analysisScenario tokens`
- API-only + evidence-only 경로(`kosha-law-evidence`)는 워커 보호를 위해 검색어를 최대 `6`개로 제한
- smartSearch row 수: 법령 카테고리(1~4) `numOfRows=30`, Guide/미디어 `numOfRows=10`
- smartSearch timeout: per-request `8000ms`, total budget `45000ms`
- retry policy: timeout/abort/429/5xx 응답은 카테고리별 1회 재시도
- API-only + evidence-only 경로(`kosha-law-evidence`)는 semantic rerank를 비활성화(`semanticEnabled=false`)
- 위 경로에서 1차 검색이 전부 0건이면 hazard/generic seed(최대 3개)로 저비용 재검색을 1회 수행
- 위 경로에서 API 후보는 존재하지만 랭킹 결과가 0건이면 `threshold=0 + hazardTypeFilter=none` 저강도 랭킹으로 최소 카드 구성을 보장
- 법령 임계치 완화: `60 -> 55 -> 50 -> 45 -> 40 -> 35` 순으로 하향하며 최소 목표 건수(`6`) 확보 시 중단
- 임계치 완화는 최저 임계치에서 후보 점수를 한 번만 계산한 뒤 점수 필터만 변경해 Edge CPU 사용량을 제한
- 법령 랭킹 fallback: strict 축 후보(`hazardTypeFilter=none`) → 전체 후보(`required`) → 전체 후보(`none`, `50 -> 45 -> 40 -> 35 -> 30`)
- Guide/미디어 임계치: 기본 `55`, 0건일 때 `50 -> 45` 완화
- 응답 파싱: `header.resultCode/resultMsg`, `body.items.item`, `total_media`, `associated_word`, `categorycount`, `totalCount/pageNo/numOfRows`
- 오류 파싱: XML `OpenAPI_ServiceResponse`의 `returnAuthMsg/returnReasonCode`를 트랙 오류 코드로 변환
- `meta.trackStatus`: 트랙별 `success|empty|error`
- `meta.trackErrors`: 트랙별 API 오류 메시지
- `meta.trackEmptyReason`: 트랙별 empty 원인(`NO_CANDIDATE|FILTERED_OUT`)

## analysis-action-plan Policy

- 입력: `taskName`, `profile`, `taskDescription?`, `analysisScenario?`
- 출력: `actionItems`, `stageCounts`
- 단계: `immediate`, `same_day`, `pre_resume`
- `buildLawGuidesPayload` shared core를 사용해 action-only 응답을 생성

## 신규 검토 API (M1/M2, 2026-08-18 실측)

| Name | 예정 Edge Function | Upstream | 상태 |
| --- | --- | --- | --- |
| 물질안전보건자료(MSDS) 16항목 | `msds-scan-analyze` | `apis.data.go.kr/B552468/msdschem` (`getChemList`, `getChemDetail01~16`) | 구현 완료 (Phase 1~7) |
| 유독물 GHS 정보(그림문자/H·P코드) | `msds-scan-analyze` | `apis.data.go.kr/B552584/kecoapi/ncisghs/ghsList` | 구현 완료 (Phase 4, 7) |
| 화학물질 정보(이름→CAS 브리지) | `msds-scan-analyze` | `apis.data.go.kr/B552584/kecoapi/ncissbstn/chemSbstnList` | 구현 완료 (Phase 6, 7) |
| KOSHA GUIDE 목록 | `corpus-ingest-law` | `apis.data.go.kr/B552468/koshaguide/getKoshaGuide` | 활용신청 필요 (본문 없음, PDF URL만) |
| 법령 조문 원문 | `corpus-ingest-law` | `law.go.kr/DRF/lawSearch.do`, `lawService.do` (`target=law|lawjosub|admrul`) | `LAW_GO_KR_OC` 발급 필요 |
| PubChem 폴백 | `msds-scan-analyze` | `pubchem.ncbi.nlm.nih.gov/rest/pug`, `/rest/pug_view` | 구현 완료 (Phase 6, 7) |

- Swagger 원본: `공공데이터포털 api/swagger/*.swagger.json`
- 설계 문서: `docs/m1-m2-scan-and-rag-design.md`
