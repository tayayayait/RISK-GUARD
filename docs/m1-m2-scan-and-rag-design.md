# M1(스캔-이해) · M2(근거 인용 안전 Q&A) 타당성 검토 및 구현 설계

작성일: 2026-08-18
검토 대상 저장소: `risk-guard` (Vite + React + Supabase Edge Functions + Gemini)

---

## 0. 결론 요약

| 기능 | 구현 가능성 | 핵심 근거 | 최대 난관 |
| --- | --- | --- | --- |
| **M1 스캔-이해** | **가능 · 데이터 확보 완료** | KOSHA MSDS OpenAPI가 MSDS 16개 항목 전체를 구조화 제공 (2·4·8·15항 = 유해성/응급조치/보호구/법규). 활용신청 완료 후 실호출 검증됨 | 사진 → 물질 특정(resolution)의 정확도 |
| **M2 근거 인용 Q&A** | **가능 · 코퍼스 확보 완료** | 법령 PDF를 조문 단위로 파싱해 4개 법령 **1,252 조문** 확보, API 기준값과 전 건 일치 검증 | ① 인용 환각 차단(프로그램적 검증 필수) ② 사내 SOP 온보딩 |

두 기능 모두 **기존 아키텍처(Supabase Edge Function + data.go.kr + Gemini)를 그대로 재사용**할 수 있습니다.
`supabase/functions/msds-scan-analyze/`, `supabase/functions/safety-rag-qa/` 디렉터리가 이미 비어 있는 상태로 생성되어 있어, 그 자리에 그대로 구현하면 됩니다.

**진행 상황 (2026-08-18)**
- ✅ MSDS·유독물GHS·화학물질정보 활용신청 완료 → 실호출 정상 확인 (2.3)
- ✅ 법령 PDF 조문 파서 `scripts/ingest-law-pdf.mjs` 완성 → 1,252 조문 파싱, 기준값 전 건 일치 (3.1-A′)
- ✅ M1 스캔-이해 전체 파이프라인 구현 완료 (Phase 1~9: 공용 XML 파서, MSDS API, GHS API, 캐시, 화학물질 확정, Edge Function, Gemini Vision, 교차검증, 프론트엔드 UI)
- ✅ 1차 구현 결함 8건 수정 + 회귀 테스트 7건 추가 (2026-08-19) — 상세: `작업순서.md` 부록 A
- ✅ **다국어는 범위에서 제외 · 한국어 전용 확정** (2026-08-19). 언어 선택 UI 및 번역 코드 제거
- ✅ 실사진 검증 도구 `scripts/verify-scan-image.ts` — 실 Gemini Vision 경로 동작 확인
- ⬜ M1 잔여: 실제 라벨 사진 30장으로 픽토그램 정확도·CAS 추출률 측정, `supabase db push` / `functions deploy`
- ⬜ 남은 선행 작업 (M2): Supabase `vector` 확장 활성화 + 스키마 마이그레이션 및 safety-rag-qa Edge Function 구현

---

## 1. 조사 방법 및 적용한 스킬

사용자 요청에 따라 `find-skills`를 설치하고, 그 절차(리더보드 확인 → 검색 → 설치수/출처 검증 → 설치)에 따라 아래 스킬을 선별·적용했습니다.

```bash
npx skills add https://github.com/vercel-labs/skills --skill find-skills
```

| 스킬 | 설치수 | 저장소 stars | 적용처 | 비고 |
| --- | --- | --- | --- | --- |
| `NomaDamas/k-skill@korean-law-search` | 4.3K | 7.2K | M2 법령 코퍼스 탐색 | ⚠️ 제3자 프록시(`k-skill-proxy.nomadamas.org`) 경유. 설치 시 **Med Risk / 1 alert**. **개발 중 탐색용으로만** 쓰고, 런타임은 `law.go.kr` 직접 호출 권장 |
| `langchain-ai/langchain-skills@langchain-rag` | 13.2K | 1.1K | M2 RAG 파이프라인 패턴 | 공식 LangChain. 청킹/리트리버 패턴 참조 (런타임 의존성으로 넣지는 않음) |
| `supabase/agent-skills@supabase-postgres-best-practices` | 353.9K | 공식 | M2 pgvector 스키마·인덱스 설계 | 이미 있는 `supabase` 스킬과 상호보완 |
| `google-deepmind/science-skills@pubchem-database` | 1.5K | 2.7K | M1 해외물질 폴백 | PUG-REST/PUG-View 엔드포인트 레퍼런스 확보 |

설치 위치: `.claude/skills/` (프로젝트 스코프), `find-skills`는 `.agents/skills/`.

검색했으나 **채택하지 않은 것**: `claude-office-skills/smart-ocr`(7.3K) · `paddleocr-text-recognition`(3.9K) — 로컬 파이썬 OCR 전제라 Edge Function 런타임(Deno)과 맞지 않음. M1의 OCR은 이미 프로젝트에 있는 Gemini 멀티모달로 처리하는 편이 배포·비용 모두 유리합니다.

---

## 2. M1 — 스캔·이해 (라벨 / MSDS / 작업지시서 / 경고표지)

### 2.1 전체 파이프라인

```
[사진 촬영]
   ↓ (client, image/jpeg base64)
[Edge: msds-scan-analyze]
   ├─ 1. VLM 추출 (Gemini, responseSchema 강제)
   │     → rawText, casNo[], productName, supplier, signalWord,
   │       pictograms[GHS01..GHS09], hCodes[], pCodes[], docType
   ├─ 2. 물질 확정 (resolution)  ★신뢰도의 핵심
   │     a) CAS 번호 있으면 → getChemList(searchCnd=1)   [정확 매칭]
   │     b) 없으면 국문명 → getChemList(searchCnd=0)      [유사 매칭 + 사용자 확인]
   │     c) 영문명뿐이면 → 환경공단 ncissbstn(searchGubun=1) → CAS 확보 → (a)
   │     d) 국내 미등재 → PubChem PUG-View (Safety and Hazards)
   ├─ 3. 상세 조회 (chemId → 필요한 섹션만 병렬)
   │     02 유해성·위험성 / 04 응급조치 / 07 취급·저장 / 08 보호구 / 15 법적규제
   ├─ 4. 교차검증
   │     VLM이 읽은 pictogram/H-code  vs  환경공단 GHS API의 pctgrmCd/hrmDngrCd
   │     → 불일치 시 "라벨과 공식 정보가 다름" 경고 카드 (실제 현장에서 매우 중요한 신호)
   └─ 5. 캐시 저장 (chem_substance / chem_section / chem_ghs)

   ※ 6단계였던 "사용자 언어 렌더링"은 범위에서 제외됨(한국어 전용). 근거는 작업순서.md 9.3
```

### 2.2 사용 API 상세 (실측 확인 완료)

#### (A) 한국산업안전보건공단_물질안전보건자료 조회 서비스 ★M1의 주축

- 데이터셋: <https://www.data.go.kr/data/15157612/openapi.do>
- Base: `https://apis.data.go.kr/B552468/msdschem` (**기존 smartSearch와 동일한 B552468 기관코드**)
- 포맷: XML / 개발계정 **1,000건/일**, 운영계정은 활용사례 등록 후 확장
- 라이선스: 이용허락범위 제한 없음

**오퍼레이션 (실측 스웨거 기준, 총 17개)**

| Operation | 내용 | M1 활용 |
| --- | --- | --- |
| `getChemList` | 화학물질 목록 검색 | **진입점** |
| `getChemDetail01` | 1. 화학제품과 회사에 관한 정보 | 제품/공급자 대조 |
| `getChemDetail02` | 2. 유해성·위험성 | ★**그림문자·신호어·H문구·P문구·NFPA** |
| `getChemDetail03` | 3. 구성성분의 명칭 및 함유량 | 혼합물 성분 |
| `getChemDetail04` | 4. 응급조치요령 | ★**눈/피부/흡입/섭취별 조치** |
| `getChemDetail05` | 5. 폭발·화재시 대처방법 | 소화 매체 |
| `getChemDetail06` | 6. 누출사고시 대처방법 | 누출 대응 |
| `getChemDetail07` | 7. 취급 및 저장방법 | 보관 규칙 |
| `getChemDetail08` | 8. 노출방지 및 개인보호구 | ★**호흡기/눈/손/신체 보호구 + 노출기준(국내·ACGIH)** |
| `getChemDetail09` | 9. 물리화학적 특성 | 인화점 등 |
| `getChemDetail10` | 10. 안정성 및 반응성 | 혼촉 위험 |
| `getChemDetail11` | 11. 독성에 관한 정보 | LD50 등 |
| `getChemDetail12` | 12. 환경에 미치는 영향 | — |
| `getChemDetail13` | 13. 폐기시 주의사항 | — |
| `getChemDetail14` | 14. 운송에 필요한 정보 | UN No. |
| `getChemDetail15` | 15. 법적 규제현황 | ★**산안법/화관법/위험물법 규제** → M2 연결고리 |
| `getChemDetail16` | 16. 그 밖의 참고사항 | 갱신일 |

**요청/응답 스키마**

```
GET /getChemList
  serviceKey (필수)
  searchWrd  (필수)  검색어 문자열 (ex. 벤젠)
  searchCnd  (필수)  0=국문명, 1=CAS No, 2=UN No, 3=KE No, 4=EN No
  numOfRows, pageNo (필수)
→ item: { chemId, chemNameKor, casNo, unNo, keNo, enNo, openYn, koshaConfirm, lastDate }

GET /getChemDetailNN
  serviceKey (필수), chemId (필수)
→ item: { msdsItemNo, msdsItemCode, upMsdsItemCode, msdsItemNameKor,
          itemDetail, lev(1~3), ordrIdx }
```

> `lev`(1~3) + `upMsdsItemCode` + `ordrIdx` 로 **가/나/다 → * 세부항목** 트리를 그대로 복원할 수 있습니다. UI에서 아코디언으로 렌더링하기에 이상적인 구조입니다.
> `getChemDetail02`의 `itemDetail`에는 NFPA 보건/화재/반응성이 0~4 점수로 들어옵니다 → 위험도 배지로 바로 사용 가능.

#### (B) 한국환경공단_유독물GHS 정보 조회 서비스 ★픽토그램 교차검증

- 데이터셋: <https://www.data.go.kr/data/15149423/openapi.do>
- Base: `https://apis.data.go.kr/B552584/kecoapi/ncisghs` · Operation `/ghsList`
- 파라미터: `serviceKey, pageNo, numOfRows, searchGubun(1=영문명,2=CAS번호,3=고유번호), searchNm, returnType(XML|JSON)`
- 응답 필드:
  ```
  sbstnId, casNo, sbstnNmKor, sbstnNmEng, sbstnTypeUnqno,
  sfsgwd        // 안전주의 신호어 (위험/경고)
  mfctrCn       // 독성계수(M-factor)
  unnm          // UN번호
  pctgrmCd      // ★그림문자 코드
  hrmflnList[]  // { hrmflnClsfArtclNm 유해성분류항목명,
                //   hrmDngrCd  ★유해위험코드(H-code),
                //   clsfGrd    분류등급,
                //   hrmPrevntCd ★유해예방코드(P-code) }
  ```
- **가치**: VLM이 사진에서 인식한 픽토그램/H코드를 이 코드값과 대조 → 인식 정확도를 자체 채점할 수 있고, "라벨이 낡아 지워진 경고"를 보완할 수 있습니다.

#### (C) 한국환경공단_화학물질 정보 조회 서비스 (이름 → CAS 브리지)

- 데이터셋: <https://www.data.go.kr/data/15149420/openapi.do>
- Base: `https://apis.data.go.kr/B552584/kecoapi/ncissbstn` · Operation `/chemSbstnList`
- 파라미터: `(B)`와 동일 형태 (`searchGubun` 1=영문명/2=CAS/3=고유번호)
- 제공: 물질ID, CAS번호, KE번호, 국·영문 물질명 및 유사명, 분자식, 분자량, 물질분류(고시일자·함량정보 포함)
- **가치**: 영문 상표명/이명만 읽힌 경우 CAS 번호를 얻어 (A)의 정확 조회로 넘기는 브리지.

#### (D) PubChem (국외/미등재 폴백)

- PUG-REST: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{name}/cids/JSON`
- PUG-View: `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/{cid}/JSON?heading=Safety+and+Hazards`
- 인증키 불필요. 단 **초당 5요청 / 분당 400요청** 등 이용약관 준수 필요 → Edge에서 레이트리밋 래핑 필수.
- 인용 시 <https://pubchem.ncbi.nlm.nih.gov/docs/citation-guidelines> 표기 의무.

#### (E) KOSHA 안전보건자료 링크 서비스 (다국어 교육자료) — *이미 연동됨*

- `http://apis.data.go.kr/B552468/selectMediaList01/getselectMediaList01` (`callApiId=1030`)
- 기존 `supabase/functions/kosha-materials`에서 `ctgr01(제작형태)/ctgr02(업종)/ctgr03(재해유형)`로 사용 중
- **외국인 근로자용 외국어 자료 구분 코드**가 있어, M1의 "사용자 언어 안내" 결과 하단에 *공식 다국어 자료 링크*를 붙일 수 있습니다. (LLM 번역 + 공식 자료 병기 = 신뢰도 확보)

#### (F) OCR / 픽토그램 인식 옵션 비교

| 방식 | 장점 | 단점 | 판단 |
| --- | --- | --- | --- |
| **Gemini 멀티모달** (`gemini-3.1-pro-preview`) | 이미 프로젝트에 키·클라이언트 존재. OCR+구조화 추출+픽토그램 분류를 **1콜**로 처리. `responseMimeType: application/json` + responseSchema로 enum 강제 | 흐릿/역광/훼손 라벨에서 환각 가능. 실사진 판독에 30s 타임아웃 필요(실측). enum 에 빈 문자열 금지 | **채택 · 실호출 검증 완료** |
| 네이버 CLOVA OCR | 한글 인쇄체 정확도 높음, 표 인식 강함 | 별도 계약·비용, 픽토그램 분류는 별도 | 정확도 미달 시 전처리 단계로 추가 |
| Google Cloud Vision `DOCUMENT_TEXT_DETECTION` | 저렴, 안정 | 의미 구조화는 별도 LLM 필요 | 대안 |
| 로컬 픽토그램 검출기(ONNX) | 오프라인, 결정론적 | 학습 데이터 구축 비용 | 오프라인 요구 생기면 검토 |

> **설계상 중요 포인트**: 픽토그램은 GHS01~GHS09 **9종 고정 집합**입니다. VLM에게 자유 서술을 시키지 말고 `enum: ["GHS01",...,"GHS09"]` 배열로 강제 출력시킨 뒤, (B) API의 `pctgrmCd`와 대조하는 구조가 정확도·검증가능성 모두에서 유리합니다.

### 2.3 실측 검증 로그 (2026-08-18 수행)

| 검증 | 결과 |
| --- | --- |
| `apis.data.go.kr/B552468/msdschem` 스웨거 확보 | ✅ 오퍼레이션 17개, 파라미터·응답 필드 전부 확인 |
| 초기 `getChemList` 호출 | ❌ `returnReasonCode=31 / DEADLINE_HAS_EXPIRED_ERROR` — HWP 가이드 에러표상 31은 "기한만료", 30이 "미등록"이므로 **등록은 되어 있고 활용기간만 만료** |
| **동일 키**로 `srch/smartSearch` 호출 | ✅ `resultCode=00 NORMAL_SERVICE` (키 자체는 유효) |
| **연장/활용신청 후 재호출 (2026-08-18)** | ✅ **해결** — `getChemList(톨루엔)` → `resultCode=00`, `chemId=001032`, `casNo=108-88-3`, `totalCount=86` |
| 유독물GHS `ghsList` (CAS 108-88-3) | ✅ `pctgrmCd="GHS02^GHS07^GHS08"`, `sfsgwd="위험"`, H304/H361/H315/H225/H336/H373 + P코드 |

**구현 시 주의**: GHS API의 다중값은 캐럿(`^`)으로 구분됩니다 (`"GHS02^GHS07^GHS08"`, `hrmPrevntCd="P301+P310^P331^P405^P501"`). 쉼표가 아닙니다.

개발계정 1,000건/일이므로 **캐시 테이블이 사실상 필수**입니다.

### 2.4 구현 구조

#### 신규 Edge Function

```
supabase/functions/msds-scan-analyze/index.ts   # 이미 빈 디렉터리 존재
supabase/functions/_shared/
  msds-api.ts          # getChemList / getChemDetailNN 클라이언트 + XML 파싱 + 재시도
  msds-sections.ts     # lev/upMsdsItemCode → 트리 정규화, 섹션별 도메인 타입
  ghs-api.ts           # ncisghs / ncissbstn 클라이언트
  ghs-codes.ts         # GHS01~09 ↔ pctgrmCd ↔ 한국어 명칭 ↔ 아이콘 매핑 (정적 테이블)
  pubchem.ts           # PUG-REST/PUG-View + 레이트리밋
  chem-resolution.ts   # CAS 정규식 추출 → 다단계 물질 확정 로직
```

기존 `_shared/http.ts`(`handlePreflight`/`jsonResponse`/`errorResponse`/`withErrorBoundary`)와
`law-guides-core.ts`의 `resolveServiceKey()`(`DATA_GO_KR_API_KEY` → `DATA_GO_API_KEY` → `PUBLIC_DATA_API_KEY`) 패턴을 그대로 재사용합니다.

#### 요청/응답 계약(안)

```ts
// POST /functions/v1/msds-scan-analyze
interface ScanRequest {
  image: string;                 // base64 (data URI prefix 제거)
  mimeType: "image/jpeg" | "image/png";
  locale: "ko" | "en" | "vi" | "th" | "km" | "uz" | "zh" | "ne";
  hint?: { productName?: string; casNo?: string };
}

interface ScanResponse {
  docType: "ghs_label" | "msds" | "work_order" | "warning_sign" | "unknown";
  extraction: {                          // 사진에서 읽은 값 (= 현장 실물)
    rawText: string;
    productName?: string; supplier?: string;
    casNumbers: string[];
    signalWord?: "위험" | "경고";
    pictograms: GhsPictogramCode[];      // enum 강제
    hCodes: string[]; pCodes: string[];
    confidence: number;                  // 0~1
  };
  substance?: {                          // 공식 DB에서 확정된 값
    chemId: string; chemNameKor: string; casNo?: string; unNo?: string;
    resolvedBy: "cas" | "name_ko" | "name_en_bridge" | "pubchem" | "unresolved";
  };
  sections: {                            // 필요한 섹션만
    hazard?: MsdsSectionTree;            // 02
    firstAid?: MsdsSectionTree;          // 04
    handling?: MsdsSectionTree;          // 07
    ppe?: MsdsSectionTree;               // 08
    regulation?: MsdsSectionTree;        // 15
  };
  ppeChecklist: Array<{                  // 08 → 체크리스트 정규화
    part: "respiratory" | "eye" | "hand" | "body";
    requirement: string; sourceItemCode: string;
  }>;
  discrepancies: Array<{                 // 4단계 교차검증 결과
    field: "pictogram" | "signalWord" | "hCode";
    onLabel: string; onRecord: string; severity: "info" | "warn" | "critical";
  }>;
  localized: { locale: string; body: LocalizedBlock[] };  // 원문+번역 병기
  sources: Array<{ label: string; api: string; url: string; retrievedAt: string }>;
  disclaimer: string;                    // 참고용 고지(법 제110·111조)
}
```

#### 캐시 스키마

```sql
-- 물질 마스터 (getChemList 결과)
create table public.chem_substance (
  chem_id        text primary key,
  chem_name_kor  text not null,
  cas_no         text,
  un_no          text, ke_no text, en_no text,
  last_date      text,
  fetched_at     timestamptz not null default now()
);
create index chem_substance_cas_idx  on public.chem_substance (cas_no);
create index chem_substance_name_idx on public.chem_substance
  using gin (to_tsvector('simple', chem_name_kor));

-- 섹션 원문 (getChemDetailNN 결과, 트리 그대로 보존)
create table public.chem_section (
  chem_id     text not null references public.chem_substance(chem_id) on delete cascade,
  section_no  smallint not null,        -- 1..16
  payload     jsonb not null,           -- item[] 원본 (lev/ordrIdx 포함)
  fetched_at  timestamptz not null default now(),
  primary key (chem_id, section_no)
);

-- GHS 교차검증용
create table public.chem_ghs (
  cas_no      text primary key,
  signal_word text, pictogram_cd text, un_no text,
  hazard_list jsonb,                    -- hrmflnList 원본
  fetched_at  timestamptz not null default now()
);

-- 스캔 이력 (감사 추적)
create table public.scan_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  doc_type text, chem_id text, locale text,
  extraction jsonb, discrepancies jsonb,
  created_at timestamptz not null default now()
);
alter table public.scan_history enable row level security;
```

TTL 정책: `chem_section`은 `last_date` 변동 시에만 갱신(월 1회 배치 비교) → 1,000건/일 제한 내에서 충분히 운용 가능.

---

## 3. M2 — 근거 인용 안전 Q&A (RAG)

### 3.1 코퍼스 소스 (실측 확인 완료)

> **2026-08-18 결정 변경**: 런타임 법령 수집은 **API가 아니라 PDF 인제스트**로 확정했습니다.
> 국가법령정보센터 저장본 PDF를 `scripts/ingest-law-pdf.mjs`로 조문 단위 파싱하며,
> API(`OC=test`)는 **조문 수 회귀 검증 기준값 확보용**으로만 사용합니다.
> 구현·검증 결과는 아래 **(A′) PDF 인제스트 파이프라인** 참고.

#### (A′) PDF 인제스트 파이프라인 ★현재 채택안

- 입력: `legal-markdown/법령명(법종구분)(제00000호)(YYYYMMDD).pdf`
- 스크립트: `scripts/ingest-law-pdf.mjs` (`pnpm run ingest:law-pdf`, `--check`로 검증만)
- 추출기: **`pdfjs-dist`** (이미 프로젝트 의존성) — 신규 의존성 없음
- 산출물: `output/law-corpus/<법령명>.json` (gitignore 처리)

**검증 결과 (2026-08-18)** — 조문 수를 API 기준값과 대조하여 전 건 일치:

| 법령 | 시행일 | 파싱 조문 | API 기준 | 결과 |
| --- | --- | --- | --- | --- |
| 산업안전보건법 | 2026-08-01 | 185 | 185 | ✅ |
| 산업안전보건법 시행령 | 2026-08-01 | 125 | 125 | ✅ |
| 산업안전보건법 시행규칙 | 2026-08-01 | 252 | 252 | ✅ |
| 산업안전보건기준에 관한 규칙 | 2026-03-02 | 690 | 690 | ✅ |

총 **1,252 조문 / 1,103 항 / 3,949 호**, 편·장·절 계층 100% 부여, 러닝헤더 잔재 0건.

**파싱 과정에서 확정한 규칙 (모두 실제 오류를 잡고 추가된 것)**

1. **추출기 선택**: `pdftotext`(poppler)는 이 PDF에서 **한글이 전부 소실**됩니다(`제1조(목적)` → `1()`).
   `pdfjs-dist` / `pypdf` / `PyMuPDF`는 정상 추출됩니다. → 추출기 교체 시 반드시 재검증할 것.
2. **줄 복원**: pdfjs `getTextContent()`는 줄바꿈을 주지 않으므로 `transform[5]`(y좌표)로 묶어
   줄을 복원해야 합니다. 그래야 `①`/`1.` 계층 판별이 가능합니다.
3. **조문 시작 판정**: `제N조` 뒤에 `(제목)` / `삭제` / `[이동주석` / 줄끝 중 하나가 와야 합니다.
   이 제한이 없으면 줄바꿈으로 행 첫머리에 온 **조문 참조**(`제120조제5항, 제121조제4항…`)를
   새 조문으로 오인합니다. (산업안전보건법에서 18건 오탐 발생 → 0건)
4. **단조 증가 가드**: 조문 번호는 증가만 합니다. 역행하면 인용으로 간주합니다.
5. **이동/삭제 스텁**: `제336조` / `제610조 [종전 제610조는 제4조의2로 이동]`처럼 번호만 남은
   조문도 법령상 조문으로 카운트됩니다. 파싱은 하되 `isDeleted: true`로 색인에서 제외합니다.
6. **러닝헤더 제거**: 페이지마다 반복되는 법령명이 조문 본문 한가운데 섞입니다
   (`…있는 작업: 안전화 산업안전보건기준에 관한 규칙 4. 물체가…`).
   인용문 부분문자열 검증(3.3-④)을 깨뜨리므로 반드시 제거해야 합니다.
7. **부칙·별표 절단**: `부칙 <…>` / `[별표 N]` 이후는 본문에서 제외합니다.
   부칙 조문을 본문으로 인용하면 근거가 오염됩니다.

**회귀 기준값**은 `GOLDEN_ARTICLE_COUNTS`에 `법령명@시행일` 키로 고정해 두었습니다.
법령이 개정되면 이 값도 함께 갱신해야 하며, 값이 없으면 검증을 건너뛰고 경고만 남깁니다.

> 실제로 이 기준값 대조가 **버전 차이를 잡아냈습니다**: 제공된 PDF(시행 2026-08-01)에는
> **제31조의2(외국인근로자 기초안전보건교육)** 가 있는데 API가 반환한 판(시행 2026-06-01)에는
> 없어 184 vs 185 차이가 났습니다. 이 조문은 본 서비스의 다국어 기능과 직결됩니다.

**PDF 방식에서 잃는 것과 보완**

| 잃는 것 | 보완 |
| --- | --- |
| 조문별 시행일자 | 법령 단위 시행일자만 사용 + 답변에 "기준일" 명시 |
| 자동 개정 추적 | PDF 재배치 후 `pnpm run ingest:law-pdf:check` 수동 실행 |
| 조문키(안정 ID) | `법령명 + 조문번호` 자연키로 대체 |
| 별표·서식 | 본문 색인 제외, 원문 링크만 제공 |

#### (A) 국가법령정보 OPEN API — 검증 기준값 확보용

- 포털: <https://open.law.go.kr/LSO/openApi/guideList.do> (OC 인증키 발급: 마이페이지 → API인증키관리)
- 목록: `https://www.law.go.kr/DRF/lawSearch.do?OC={oc}&target=law&type=JSON&query={법령명}`
- 본문: `https://www.law.go.kr/DRF/lawService.do?OC={oc}&target=law&MST={일련번호}&type=JSON`
- 조문 단건: `lawService.do?target=lawjosub&ID={법령ID}&JO={6자리}&HANG=&HO=&MOK=`
- 행정규칙(고시·훈령): `target=admrul`

**실측 응답 구조** (`산업안전보건법`, MST=283449, 시행 2026-08-01):

```json
{ "법령": {
  "기본정보": { "법령명_한글": "산업안전보건법", "법령ID": "001766",
               "공포일자": "20260219", "시행일자": "20260801", "소관부처": {...} },
  "조문": { "조문단위": [ {
      "조문번호": "38", "조문키": "0038001", "조문제목": "안전조치",
      "조문내용": "제38조(안전조치)", "조문시행일자": "20260601",
      "항": [ { "항번호": "①", "항내용": "...",
                "호": [ { "호번호": "1.", "호내용": "..." } ] } ]
  } ] } } }
```

**확보 규모 (실측)**

| 법령 | MST | 시행일 | 조문단위 수 |
| --- | --- | --- | --- |
| 산업안전보건법 | 283449 | 2026-08-01 | 211 |
| 산업안전보건법 시행령 | 288347 | 2026-08-01 | — |
| **산업안전보건기준에 관한 규칙** | 273603 | 2026-03-02 | **853** |
| 중대재해 처벌 등에 관한 법률 | 228817 | 2022-01-27 | — |
| 화학물질관리법 | 276815 | 2025-10-01 | — |

> **핵심 이점**: 인용 단위(조·항·호)가 API 응답 구조와 1:1로 일치합니다. 즉 **청킹 전략을 고민할 필요 없이 "1 조문 = 1 청크"**로 두면 인용이 자동으로 정확해집니다.
> `조문시행일자`가 조문별로 따로 있어, "질문 시점 기준 시행 중인 조문만" 필터링하는 것도 가능합니다.
> 사용자 표시 링크: `https://www.law.go.kr/법령/산업안전보건법/제38조` (200 응답 확인)

#### (B) KOSHA 안전보건법령 스마트검색 — *이미 연동됨*

- `http://apis.data.go.kr/B552468/srch/smartSearch` (현재 키 정상 동작 확인)
- category: `1~4`=법령/규칙, `5,7,8,9,11`=KOSHA GUIDE 등, `6`=미디어
- AI 유사어 확장(`associated_word`) 제공 → **키워드 확장기(query expansion)** 로 활용
- 기존 `_shared/law-guides-core.ts`에 완성된 랭킹/임계치 완화/재시도 로직이 있으므로 그대로 재사용

#### (C) KOSHA GUIDE (기술지원규정) API

- 데이터셋: <https://www.data.go.kr/data/15144147/openapi.do>
- Base: `https://apis.data.go.kr/B552468/koshaguide` · Operation `/getKoshaGuide`
- 파라미터: `serviceKey, callApiId(고정), pageNo, numOfRows, techGdlnNm, techGdlnNo, ofancYmd`
- 응답: `techGdlnNm(규정명), techGdlnNo(규정번호), techGdlnOfancYmd(공표일자), fileDownloadUrl`
- **주의**: 본문이 아니라 **PDF 다운로드 URL만** 옵니다 → 본문 인덱싱하려면 PDF 파싱 배치 필요 (프로젝트에 이미 `pdfjs-dist` 존재).
- **법적 성격 태깅 필수**: KOSHA GUIDE는 법적 구속력이 없는 권고 기술지침입니다. 답변에서 법령과 **반드시 구분 표기**해야 합니다.

#### (D) 사내 SOP / 표준작업절차

- Supabase Storage 업로드 → `pdfjs-dist`로 텍스트 추출 → 청킹 → 임베딩
- 출처 라벨: `사내문서` (법령/공단자료와 시각적으로 구분)

### 3.2 인덱싱·검색 스택

| 레이어 | 선택 | 근거 |
| --- | --- | --- |
| 벡터 저장소 | **Supabase pgvector** | 이미 Supabase 사용 중. 별도 벤더 추가 없음. RLS로 사내 SOP 테넌트 격리 가능 |
| 임베딩 | **`gemini-embedding-2`** (`outputDimensionality: 1536`) | 현재 키로 사용 가능 확인. 기본 3072차원이나 **MRL 절단 1536 동작 확인** — pgvector HNSW의 `vector` 타입 2000차원 한계 내로 들어옴 (3072를 유지하려면 `halfvec` 필요) |
| 검색 | **하이브리드**: pgvector 코사인 + `tsvector` 전문검색 + KOSHA smartSearch | 법령은 정확 용어(“국소배기장치”, “밀폐공간”)가 결정적이라 순수 벡터검색만으로는 취약 |
| 리랭킹 | Gemini flash 기반 (기존 `ENABLE_GEMINI_RERANK` 패턴 재사용) | 이미 코드베이스에 리랭크 스위치 존재 |
| 생성 | `gemini-3.1-pro-preview` / `gemini-3.6-flash` (기존 라우팅 정책 준수) | `.env.example`의 cost-first 라우팅 정책 유지 |

**실측 확인**: `gemini-embedding-001`·`gemini-embedding-2` 모두 기본 3072차원, `outputDimensionality=1536` 지정 시 1536 반환.

#### 스키마

```sql
create extension if not exists vector;

create table public.safety_corpus (
  id              uuid primary key default gen_random_uuid(),
  source_type     text not null,      -- 'law' | 'admrul' | 'kosha_guide' | 'sop'
  authority       text not null,      -- '법률'|'대통령령'|'고용노동부령'|'고시'|'권고'|'사내'
  doc_title       text not null,      -- '산업안전보건기준에 관한 규칙'
  doc_key         text,               -- MST / 행정규칙ID / 파일ID
  article_no      text,               -- '38'
  article_title   text,               -- '안전조치'
  article_key     text,               -- '0038001'
  effective_date  date,               -- 조문시행일자
  content         text not null,      -- 조문 전문 (조+항+호 평문화)
  source_url      text,
  org_id          uuid,               -- SOP 테넌트 (법령은 null)
  search_vector   tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding       vector(1536),
  updated_at      timestamptz not null default now()
);

create index safety_corpus_fts_idx on public.safety_corpus using gin (search_vector);
create index safety_corpus_vec_idx on public.safety_corpus
  using hnsw (embedding vector_cosine_ops);
create index safety_corpus_scope_idx on public.safety_corpus (source_type, effective_date);
create unique index safety_corpus_natural_key
  on public.safety_corpus (source_type, doc_key, article_no)
  where org_id is null;

alter table public.safety_corpus enable row level security;
-- 법령/공단자료: 전체 읽기 / SOP: 소속 조직만
```

> `supabase-postgres-best-practices` 스킬 지침 반영: 소문자 식별자, 생성 컬럼 기반 tsvector, 자연키 유니크 인덱스, RLS 기본 활성화.

### 3.3 인용 정확성 및 "모르면 모른다" 정책 ★

RAG에서 가장 흔한 실패는 *그럴듯한 조문번호를 지어내는 것*입니다. 이를 **프롬프트가 아니라 코드로** 막습니다.

```
1) 검색:   하이브리드 top-k (k=12) → 리랭크 → top-n (n=5)
2) 게이팅: 아래 중 하나라도 실패하면 생성 자체를 하지 않음
     - 최고 유사도 < THRESHOLD (초기값 0.62, 실측 후 튜닝)
     - source_type='law' 인 근거가 0건 (규제 질문인 경우)
     - effective_date > today 인 조문만 남은 경우
3) 생성:   responseSchema 강제
     { answer: string,
       citations: [{ corpusId: uuid, quote: string }],
       confidence: "high"|"medium"|"low",
       needsSafetyOfficerReview: boolean }
4) 검증(코드):
     - 모든 citations[].corpusId ∈ 실제 검색된 청크 ID 집합  → 아니면 폐기
     - citations[].quote 가 해당 청크 content 의 부분문자열   → 아니면 해당 인용 제거
     - 인용 0건이 되면 → 답변 폐기, 아래 5)로
5) 폴백:   "현재 확보된 근거로는 확정 답변이 어렵습니다.
            안전관리자 확인이 필요합니다." + 관련 검색결과 링크만 제시
```

**항상 안전관리자 확인으로 보내는 질문 유형** (분류기 또는 규칙):
- 개인 건강/의학적 판단 (“이 증상이면 병원 가야 하나요”)
- 특정 사업장의 법 위반 여부 판정 (“우리 현장은 불법인가요”)
- 작업 중단·재개 결정
- 사고 발생 직후 대응 (→ 119/사업장 비상연락 우선 안내)

**출처 표기 형식**

```
📘 산업안전보건기준에 관한 규칙 제32조(보호구의 지급 등)   [고용노동부령 · 시행 2026-03-02]
   "사업주는 다음 각 호의 어느 하나에 해당하는 작업을 하는 근로자에 대해서는…"
   → law.go.kr 원문 보기

📗 KOSHA GUIDE M-xxx-20xx   [권고 기술지침 · 법적 구속력 없음]
📙 사내 SOP: 도장작업 표준작업절차서 v3   [사내문서 · 2026-05 개정]
```

### 3.4 구현 구조

#### Edge Function

```
supabase/functions/safety-rag-qa/index.ts        # 이미 빈 디렉터리 존재
supabase/functions/corpus-ingest-law/index.ts    # 신규: 법령 수집 배치 (pg_cron 또는 수동)
supabase/functions/_shared/
  law-open-api.ts     # law.go.kr DRF 클라이언트 (lawSearch/lawService/admrul)
  corpus-chunker.ts   # 조문단위 → content 평문화 (조+항+호 결합)
  embedding.ts        # gemini-embedding-2, outputDimensionality=1536, 배치+재시도
  rag-retrieve.ts     # 하이브리드 검색 + RRF 결합 + 리랭크
  rag-guard.ts        # 게이팅 + 인용 검증 + abstain 판정  ★핵심
```

#### 프론트엔드

```
src/pages/SafetyQa.tsx            # 채팅 UI (인용 카드 + 신뢰도 배지 + 안전관리자 확인 배너)
src/pages/ScanUnderstand.tsx      # 카메라/업로드 → 결과 카드
src/services/safetyQaService.ts   # edgeFunctionClient 재사용
src/services/msdsScanService.ts
src/components/CitationCard.tsx   # 법령/GUIDE/SOP 시각 구분
src/components/PpeChecklist.tsx
src/components/GhsPictogram.tsx   # GHS01~09 SVG
```

`src/lib/routeComponents.ts` 라우팅 및 `src/services/edgeFunctionClient.ts` 호출 규약을 그대로 따릅니다.

#### 코퍼스 수집 배치 흐름

```
corpus-ingest-law (주 1회)
  1. lawSearch.do 로 대상 법령 MST 조회 (시행일자 변경 감지)
  2. lawService.do?type=JSON 로 전문 수집
  3. 조문단위 순회 → content 평문화 → 자연키로 upsert
  4. content 해시 변경분만 재임베딩 (비용 절감)
  5. ingest_log 기록
```

법령 개정은 잦으므로 **`시행일자` 변경 감지 → 델타 재인덱싱**이 운영 핵심입니다.

---

## 4. 필요한 신규 리소스

### 신규 시크릿 (Supabase Edge Functions)

| 키 | 용도 | 획득처 |
| --- | --- | --- |
| `DATA_GO_KR_API_KEY` | *기존* — MSDS/GHS 활용신청 완료(2026-08-18), 추가 발급 불필요 | data.go.kr |
| ~~`LAW_GO_KR_OC`~~ | PDF 인제스트 채택으로 **런타임 불필요**. 기준값 재확보 시에만 사용 | open.law.go.kr |
| `GEMINI_API_KEY` | *기존* — 임베딩 호출 추가 | — |
| `GEMINI_EMBEDDING_MODEL` | 기본 `gemini-embedding-2` | — |
| `RAG_SIMILARITY_THRESHOLD` | abstain 임계치 (기본 `0.62`) | — |

### 신규 npm 의존성

거의 없습니다. Edge Function은 Deno 표준 fetch로 충분하고, PDF 파싱은 이미 있는 `pdfjs-dist`를 씁니다.
LangChain은 **도입하지 않는 것을 권장** — 이 파이프라인은 fetch + SQL 두 개면 끝나고, Edge Function 번들 크기/콜드스타트에 불리합니다. (`langchain-rag` 스킬은 패턴 참조용으로만 사용)

### 활용신청이 필요한 공공데이터

1. 한국산업안전보건공단_물질안전보건자료 조회 서비스 (15157612) — **필수**
2. 한국환경공단_유독물GHS 정보 조회 서비스 (15149423) — 픽토그램 검증용
3. 한국환경공단_화학물질 정보 조회 서비스 (15149420) — 이름→CAS 브리지
4. 한국산업안전보건공단_기술지원규정(코샤가이드) (15144147) — M2 GUIDE 트랙
5. 국가법령정보 OPEN API — 별도 포털(open.law.go.kr)

---

## 5. 리스크 및 법적 유의사항

| 리스크 | 영향 | 완화 |
| --- | --- | --- |
| **MSDS는 법적으로 제조·수입자 의무** (산안법 제110·111조). 공단 데이터는 "참고용" | 공식 MSDS 대체로 오인 시 법적 문제 | 모든 M1 결과에 고지문 고정 노출 + "현장 비치 MSDS 원본 확인" 문구 |
| VLM 오인식 (훼손 라벨, 유사 제품명) | 잘못된 보호구 안내 = 인명 위험 | ① CAS 정확매칭 우선 ② confidence 노출 ③ 불일치 경고 카드 ④ 저신뢰 시 결과 제시 대신 "안전관리자 확인" |
| **번역 오류** (외국인 근로자 대상) | 응급조치 오해 | 한국어 원문 **항상 병기**, 공식 다국어 자료 링크 동시 제공, 응급조치 항목은 픽토그램/아이콘 병용 |
| 법령 개정 지연 반영 | 폐지 조문 인용 | `조문시행일자` 필터 + 주 1회 델타 수집 + 응답에 "기준일" 표기 |
| 인용 환각 | 신뢰 붕괴 | 3.3의 **코드 레벨 인용 검증** (프롬프트 신뢰 금지) |
| 개발계정 1,000건/일 | 시연 중 한도 초과 | 캐시 테이블 선행 + 운영계정 전환 신청 |
| `korean-law-search` 스킬의 제3자 프록시 | 질의 내용 외부 전송 | 개발 탐색용으로만 사용, 런타임 코드에는 미포함 |

---

## 6. 단계별 로드맵

| 단계 | 산출물 | 선행조건 |
| --- | --- | --- |
| ~~0. 준비~~ | ✅ MSDS·유독물GHS·화학물질정보 활용신청 완료 (2026-08-18). 남은 것: `vector` 확장 활성화 | — |
| ~~1a. M2 조문 파싱~~ | ✅ `scripts/ingest-law-pdf.mjs` 완성, 4개 법령 1,252 조문 파싱, API 기준값과 전 건 일치 | — |
| **1b. M2 코퍼스 적재** | `safety_corpus` 스키마 + 임베딩 배치 (파싱 JSON → pgvector) | `vector` 확장 |
| **2. M2 검색·답변** | `safety-rag-qa` + `rag-guard` 인용 검증 + `SafetyQa.tsx` | 1 |
| **3. M1 데이터** | `msds-api.ts`/`ghs-api.ts` + 캐시 테이블 + 물질 확정 로직 (텍스트 입력으로 먼저 검증) | ✅ 해제됨 |
| **4. M1 비전** | Gemini 스캔 추출(enum 강제) + 교차검증 + `ScanUnderstand.tsx` | 3 |
| **5. 다국어** | 원문+번역 병기 렌더링 + KOSHA 다국어 자료 링크 | 4 |
| **6. 품질** | 골든셋(법령 Q&A 50문 / 라벨 사진 30장) 회귀 테스트, abstain율·인용정확도 측정 | 2, 4 |

**권장 순서 근거**: M2를 먼저 하는 이유는 (a) 외부 승인 대기가 없고, (b) M1의 `getChemDetail15`(법적 규제현황)가 결국 M2의 법령 근거로 연결되므로 M2가 M1의 출력 품질을 끌어올리기 때문입니다.

---

## 부록: 재현 가능한 검증 명령

```bash
# 1. MSDS 스웨거 (오퍼레이션 17개)
curl -s -A "Mozilla/5.0" "https://www.data.go.kr/data/15157612/openapi.do" | grep -o "const swaggerJson"

# 2. MSDS 호출 (활용신청 후)
curl -s "https://apis.data.go.kr/B552468/msdschem/getChemList?serviceKey=$KEY&searchWrd=톨루엔&searchCnd=0&numOfRows=3&pageNo=1"

# 3. 법령 조문 구조 확인
curl -s "https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&MST=283449&type=JSON"

# 4. 안전보건규칙 조문 수 (853건)
curl -s "https://www.law.go.kr/DRF/lawService.do?OC=test&target=law&LM=산업안전보건기준에%20관한%20규칙&type=JSON"

# 5. 임베딩 차원 확인 (1536 절단)
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=$GK" \
  -H "Content-Type: application/json" \
  -d '{"content":{"parts":[{"text":"보호구 지급 의무"}]},"outputDimensionality":1536}'
```
