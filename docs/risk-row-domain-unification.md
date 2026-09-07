# 위험성평가 도메인 통합 설계 (P0-2)

Date: 2026-08-19
Status: 설계안 (구현 전)

## 범위

포함하는 것만:

1. 실제 Supabase 저장
2. 위험요인별 허용 가능 여부 + 개선 후 위험성
3. 개선대책 담당자·기한·완료 여부 관리
4. 참여 근로자/근로자대표 + 결과 공유 기록

제외: 법제처 API, 기상 API, 음성입력, 오프라인, TBM, QR, 결재선, 평가 종류(최초/정기/수시).
0~100 종합 위험점수는 **참고지표로 유지**한다.

---

## 1. 핵심 발견 — 통합 다리는 이미 존재한다

`FormService.mapAssessmentToRiskFormDetailed(assessment)` (`src/services/formService.ts:4376`)가
이미 `AssessmentData` → `RiskAssessmentRow[]` 변환을 수행한다.

- hazard → 행 매핑 (`selectRiskHazards`)
- `frequency = ceil(weight/10)`, `severity = ceil(weight/8)`
- `currentMeasure` ← `analysis.immediateActions`, `reductionMeasure` ← `analysis.improvements`
- `legalBasis` ← evidence/lawActionItems 기반 해소 (`resolveRiskRowsLegalBasis`)
- 검증 (`applyRiskRowsValidation`) + 감사 이벤트

**따라서 AI 파이프라인을 새로 만들 필요가 없다.** 문제는 이 매퍼의 호출 위치다.

### 현재 (중복)

```
[주 흐름] 입력 → analyzeTaskToAssessment → AssessmentData → 카드 UI → PDF/DOCX
                                              (저장 없음, 행 구조 없음)

[서식센터] 입력 → analyzeTaskToAssessment(재호출!) → mapAssessmentToRiskForm → Row[] → 저장
                        ↑ 같은 작업을 다시 분석 → 주 흐름과 다른 결과
```

`FormEditor.tsx:1179`와 `FormEditor.tsx:809`가 `analyzeTaskToAssessment`를 독립 호출한다.
사용자가 주 흐름을 끝내고 서식센터에 가면 **같은 작업에 대해 다른 AI 분석 결과**를 받는다.

### 목표 (통합)

```
입력 → analyzeTaskToAssessment → AssessmentData
                                      ↓ mapAssessmentToRiskFormDetailed (호출 시점을 앞당김)
                                 riskRows: RiskAssessmentRow[]   ← 단일 진실
                                      ↓
              ┌───────────────┬───────────────┬──────────────┐
        분석결과 화면      문서 출력        서식센터        Supabase
        (표 + 카드)     (PDF/DOCX)      (문서 뷰)        (영구 저장)
```

서식센터는 **AI를 다시 돌리지 않고** 저장된 `riskRows`를 읽는다.

---

## 2. 도메인 모델

### 2.1 `RiskAssessmentRow` 확장 (`src/types/formTemplate.ts`)

기존 필드는 전부 유지. 추가만 한다. **신규 필드는 모두 optional** — 기존 91개 테스트를 깨지 않기 위함.

```ts
export type RiskAcceptability = "acceptable" | "not_acceptable";
export type ImprovementStatus = "planned" | "in_progress" | "done" | "deferred";

export interface RiskAssessmentRow {
  // ── 기존 (변경 없음) ──
  workProcess: string;
  category: string;
  cause: string;
  hazardFactor: string;
  legalBasis: string;
  currentMeasure: string;
  frequency: number;          // 1~5
  severity: number;           // 1~5
  riskLevel: string;          // "12(보통)"
  reductionMeasure: string;
  improvementDate?: string;
  completionDate?: string;
  responsiblePerson?: string;
  validationStatus?: RiskValidationStatus;
  reviewRequiredFields?: RiskValidationField[];
  reviewReasonCodes?: string[];
  expectedHazardType?: string;
  detectedHazardType?: string;
  controlIntent?: RiskControlIntent;

  // ── 신규: 요구사항 2 (허용 가능 여부 + 개선 후 위험성) ──
  acceptability?: RiskAcceptability;        // 시행규칙 제37조제1항제2호
  acceptabilityBasis?: string;              // 판단 근거 (자동 산출 + 편집 가능)
  postFrequency?: number;                   // 1~5
  postSeverity?: number;                    // 1~5
  postRiskLevel?: string;                   // 기존 필드. "6(보통)" 형식으로 통일
  postAcceptability?: RiskAcceptability;    // 개선 후 재판정

  // ── 신규: 요구사항 3 (이행 관리) ──
  improvementStatus?: ImprovementStatus;
  completionNote?: string;
}
```

#### `postRiskLevel` 정리

현재 `formService.ts:4423`에 `postRiskLevel: "low"`가 하드코딩되어 있고,
`RiskAssessmentTable`에도 `documentBuilder`에도 **렌더링되지 않는다**. 사실상 미사용 필드다.
→ 하드코딩 제거, `formatRiskLevel(postFrequency, postSeverity)` 결과로 통일. 회귀 위험 낮음.

#### 허용 가능 여부 산출 규칙

기존 `toRiskLabel` 임계값(`>=15 높음`, `>=6 보통`, 그 미만 낮음)을 재사용한다.

| 위험성 점수 (빈도×강도) | 판정 | 근거 문구 자동 생성 |
|---|---|---|
| 1~5 | `acceptable` | "위험성 낮음. 현재 조치로 허용 가능한 수준" |
| 6~14 | `not_acceptable` | "위험성 보통. 감소대책 수립 필요" |
| 15~25 | `not_acceptable` | "위험성 높음. 작업 전 감소대책 이행 필수" |

- 초기값은 자동 산출, 화면에서 사용자가 뒤집을 수 있다(그 경우 `acceptabilityBasis` 직접 입력 요구).
- `not_acceptable` 인 행은 `reductionMeasure` + `responsiblePerson` + `improvementDate` 가 **필수**가 된다 (저장 시 검증).

### 2.2 참여자 / 공유 기록 (`src/types/assessment.ts` 신규)

행이 아니라 **평가 단위** 데이터다.

```ts
// 시행규칙 제37조의2 (근로자 참여)
export type ParticipantRole = "worker" | "worker_representative" | "manager" | "supervisor";
export type ParticipationMethod = "site_patrol" | "survey" | "interview" | "other";

export interface AssessmentParticipant {
  id: string;
  name: string;
  role: ParticipantRole;
  affiliation?: string;
  method: ParticipationMethod;   // 순회점검이 원칙, 설문·면담 병행
  participatedAt: string;        // ISO date
  note?: string;
}

// 시행규칙 제37조의3 (근로자 공유)
export type SharePhase = "before" | "after";
export type ShareMethod = "education" | "briefing" | "posting" | "written" | "electronic";

export interface AssessmentShareRecord {
  id: string;
  phase: SharePhase;             // before: 실시 일정 / after: 결과
  method: ShareMethod;
  sharedAt: string;
  audienceNote?: string;         // 대상·인원
  content: string;               // 공유한 내용
  recordedBy?: string;
}
```

### 2.3 `AssessmentData` 확장

```ts
export interface AssessmentData {
  // ... 기존 전부 유지 ...
  analysis: RiskAnalysis;              // score 0~100 = 참고지표로 유지

  // 신규
  riskRows: RiskAssessmentRow[];       // ← 법정 산출물 단일 진실
  participants: AssessmentParticipant[];
  shareRecords: AssessmentShareRecord[];
  evaluator?: string;                  // 시행규칙 제37조의4제1항제1호 담당자
  persistedId?: string;                // 서버 발급 UUID
}
```

`id` 는 현재 `assess-${Date.now()}` 다. 서버가 UUID를 발급하면 그 값을 라우트(`/assessments/:id`)에 쓴다.

---

## 3. DB 스키마

### 3.1 기존 테이블을 쓰지 않는 이유

`risk_assessment_history` 는 **스냅샷** 테이블이다.

- `expires_at` 기본값 30일 (법정 3년과 충돌)
- 엣지 함수 액션이 `create / list / get / delete` 뿐 — **update 없음**
- 서식센터 + 사고보고서 공용

주 흐름의 위험성평가는 **살아있는 문서**다. 확정 후에도 개선 이행 상태가 몇 주에 걸쳐 갱신된다.
스냅샷 테이블에 얹으면 안 된다. → 신규 테이블.

기존 테이블은 그대로 두고(사고보고서가 계속 사용), 위험성평가 스냅샷 생성만 신규 경로로 옮긴다.

### 3.2 신규 마이그레이션 `supabase/migrations/202608200001_risk_assessment_store.sql`

```sql
-- 헤더
CREATE TABLE IF NOT EXISTS public.risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_hash TEXT NOT NULL,
  owner_id UUID,                       -- 인증 도입 시 채움 (지금은 NULL)
  task_name TEXT NOT NULL,
  task_description TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  work_date DATE,
  industry TEXT NOT NULL DEFAULT '',
  work_location TEXT NOT NULL DEFAULT '',
  evaluator TEXT NOT NULL DEFAULT '',
  reference_score INTEGER,             -- 0~100 참고지표
  reference_level TEXT,                -- critical|high|medium|low
  analysis_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,  -- profile/analysis/evidence 요약
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retain_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 years'),  -- 법 제36조제5항
  CONSTRAINT risk_assessments_scope_hash_length CHECK (char_length(scope_hash) >= 32),
  CONSTRAINT risk_assessments_status_check
    CHECK (status IN ('draft', 'confirmed', 'archived')),
  CONSTRAINT risk_assessments_reference_score_range
    CHECK (reference_score IS NULL OR reference_score BETWEEN 0 AND 100),
  CONSTRAINT risk_assessments_analysis_snapshot_object
    CHECK (jsonb_typeof(analysis_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_scope_updated
  ON public.risk_assessments (scope_hash, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_retain_until
  ON public.risk_assessments (retain_until);

-- 행 (정규화)
CREATE TABLE IF NOT EXISTS public.risk_assessment_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.risk_assessments(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  work_process TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  cause TEXT NOT NULL DEFAULT '',
  hazard_factor TEXT NOT NULL DEFAULT '',
  legal_basis TEXT NOT NULL DEFAULT '',
  current_measure TEXT NOT NULL DEFAULT '',
  frequency SMALLINT NOT NULL DEFAULT 1,
  severity SMALLINT NOT NULL DEFAULT 1,
  risk_level TEXT NOT NULL DEFAULT '',
  acceptability TEXT NOT NULL DEFAULT 'not_acceptable',
  acceptability_basis TEXT NOT NULL DEFAULT '',
  reduction_measure TEXT NOT NULL DEFAULT '',
  post_frequency SMALLINT,
  post_severity SMALLINT,
  post_risk_level TEXT NOT NULL DEFAULT '',
  post_acceptability TEXT,
  responsible_person TEXT NOT NULL DEFAULT '',
  improvement_date DATE,
  completion_date DATE,
  improvement_status TEXT NOT NULL DEFAULT 'planned',
  completion_note TEXT NOT NULL DEFAULT '',
  control_intent TEXT,
  validation_status TEXT NOT NULL DEFAULT 'ok',
  review_meta JSONB NOT NULL DEFAULT '{}'::jsonb,  -- reviewRequiredFields/reasonCodes/hazardType
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT risk_rows_row_index_non_negative CHECK (row_index >= 0),
  CONSTRAINT risk_rows_frequency_range CHECK (frequency BETWEEN 1 AND 5),
  CONSTRAINT risk_rows_severity_range CHECK (severity BETWEEN 1 AND 5),
  CONSTRAINT risk_rows_post_frequency_range
    CHECK (post_frequency IS NULL OR post_frequency BETWEEN 1 AND 5),
  CONSTRAINT risk_rows_post_severity_range
    CHECK (post_severity IS NULL OR post_severity BETWEEN 1 AND 5),
  CONSTRAINT risk_rows_acceptability_check
    CHECK (acceptability IN ('acceptable', 'not_acceptable')),
  CONSTRAINT risk_rows_post_acceptability_check
    CHECK (post_acceptability IS NULL OR post_acceptability IN ('acceptable', 'not_acceptable')),
  CONSTRAINT risk_rows_improvement_status_check
    CHECK (improvement_status IN ('planned', 'in_progress', 'done', 'deferred')),
  CONSTRAINT risk_rows_validation_status_check
    CHECK (validation_status IN ('ok', 'review_required')),
  CONSTRAINT risk_rows_review_meta_object CHECK (jsonb_typeof(review_meta) = 'object'),
  CONSTRAINT risk_rows_unique_index UNIQUE (assessment_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_risk_rows_assessment_index
  ON public.risk_assessment_rows (assessment_id, row_index);
CREATE INDEX IF NOT EXISTS idx_risk_rows_open_improvements
  ON public.risk_assessment_rows (improvement_status, improvement_date)
  WHERE improvement_status <> 'done';

-- 참여자 (시행규칙 제37조의2, 제37조의4제1항제2호)
CREATE TABLE IF NOT EXISTS public.risk_assessment_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.risk_assessments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  affiliation TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'site_patrol',
  participated_at DATE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT participants_role_check
    CHECK (role IN ('worker', 'worker_representative', 'manager', 'supervisor')),
  CONSTRAINT participants_method_check
    CHECK (method IN ('site_patrol', 'survey', 'interview', 'other')),
  CONSTRAINT participants_name_length CHECK (char_length(name) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS idx_participants_assessment
  ON public.risk_assessment_participants (assessment_id);

-- 공유 기록 (시행규칙 제37조의3)
CREATE TABLE IF NOT EXISTS public.risk_assessment_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.risk_assessments(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  method TEXT NOT NULL,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  audience_note TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shares_phase_check CHECK (phase IN ('before', 'after')),
  CONSTRAINT shares_method_check
    CHECK (method IN ('education', 'briefing', 'posting', 'written', 'electronic'))
);

CREATE INDEX IF NOT EXISTS idx_shares_assessment
  ON public.risk_assessment_shares (assessment_id);

-- updated_at 트리거 (company_profile_defaults 패턴 재사용)
CREATE OR REPLACE FUNCTION public.set_risk_assessment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_risk_assessments_updated_at ON public.risk_assessments;
CREATE TRIGGER trg_risk_assessments_updated_at
BEFORE UPDATE ON public.risk_assessments
FOR EACH ROW EXECUTE FUNCTION public.set_risk_assessment_updated_at();

DROP TRIGGER IF EXISTS trg_risk_assessment_rows_updated_at ON public.risk_assessment_rows;
CREATE TRIGGER trg_risk_assessment_rows_updated_at
BEFORE UPDATE ON public.risk_assessment_rows
FOR EACH ROW EXECUTE FUNCTION public.set_risk_assessment_updated_at();

-- RLS: 접근은 service role 엣지 함수만. anon 직접 접근 차단.
ALTER TABLE public.risk_assessments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessment_rows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessment_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessment_shares       ENABLE ROW LEVEL SECURITY;
-- 정책을 만들지 않으면 anon/authenticated 는 전부 거부되고 service_role 만 통과한다.
```

### 3.3 왜 행을 JSONB가 아니라 별도 테이블로 두는가

요구사항 3(담당자·기한·완료 관리) 때문이다.

- 개선 이행은 평가와 **수명주기가 다르다**. 평가는 확정되고, 이행은 몇 주 뒤 갱신된다.
- 행 하나만 UPDATE 하는 편이 문서 전체 재저장보다 안전하다.
- `idx_risk_rows_open_improvements` 부분 인덱스로 "미완료 개선대책" 조회가 공짜가 된다.

JSONB로 두면 이 세 가지가 전부 애플리케이션 코드로 넘어온다.

### 3.4 신원(scope_hash)에 대한 정직한 한계

인증이 없으므로 `formHistoryService`의 기존 패턴(localStorage 랜덤 키 → SHA-256 → `scope_hash`)을 재사용한다.
**브라우저 데이터를 지우면 3년치 기록에 접근할 수 없다.** 법정 보존 요건을 완전히 만족하지 못한다.

이번 범위에서 인증을 넣지 않되, `owner_id UUID` 컬럼을 지금 만들어 둔다.
인증 도입 시 `UPDATE ... SET owner_id = ...` + RLS 정책 추가만으로 끝나고, 테이블 재설계가 필요 없다.

---

## 4. 엣지 함수 `supabase/functions/risk-assessment-store/index.ts`

`form-history` 패턴을 그대로 따른다 (`_shared/http.ts`의 `handlePreflight/parseJsonBody/jsonResponse/errorResponse/sanitizeText` 재사용).

| action | 설명 |
|---|---|
| `upsert` | 헤더 + 행 전체 저장 (행은 `row_index` 기준 replace) |
| `patchRow` | 행 1개 부분 갱신 (이행 상태·담당자·기한·완료일) |
| `get` | 헤더 + 행 + 참여자 + 공유기록 |
| `list` | scope 내 목록 (요약) |
| `addParticipant` / `removeParticipant` | |
| `addShare` / `removeShare` | |
| `delete` | CASCADE 삭제 |

정책:
- `scopeKey` 정규화·해시는 `form-history`와 동일 로직 (`normalizeScopeKey`, `hashScopeKey`)
- 모든 쓰기는 `scope_hash` 일치 확인 후 수행
- 행 상한 200 (`MAX_RISK_ROWS` 동일), 참여자 100, 공유기록 50
- 문자열 길이 상한은 `form-history`의 `sanitizeRiskRows` 값을 그대로 사용

---

## 5. 파일별 변경 계획

### 신규

| 파일 | 역할 |
|---|---|
| `supabase/migrations/202608200001_risk_assessment_store.sql` | 위 스키마 |
| `supabase/functions/risk-assessment-store/index.ts` | 저장 API |
| `src/services/riskAssessmentStoreService.ts` | 프런트 클라이언트 (`formHistoryService` 구조 복제) |
| `src/lib/riskRowAcceptability.ts` | 허용 여부 산출 + 개선 후 위험성 계산 (순수 함수) |
| `src/components/assessment/RiskRowTable.tsx` | 주 흐름용 표. `RiskAssessmentTable`을 감싸고 신규 컬럼 추가 |
| `src/components/assessment/ParticipantPanel.tsx` | 참여자 입력·목록 |
| `src/components/assessment/SharePanel.tsx` | 공유 기록 입력·목록 |

### 수정

| 파일 | 변경 |
|---|---|
| `src/types/formTemplate.ts` | `RiskAssessmentRow`에 optional 신규 필드 6개 + 타입 2개 |
| `src/types/assessment.ts` | `AssessmentData`에 `riskRows/participants/shareRecords/evaluator/persistedId`. `calculateRiskScore` 주석에 "참고지표" 명시 |
| `src/contexts/AssessmentContext.tsx` | **setTimeout 가짜 저장 삭제(206–221행)**. 실제 저장 + 디바운스. `confirmProfile` 이후 `riskRows` 생성·보관. 행 편집/참여자/공유 액션 추가 |
| `src/services/assessmentAnalysisService.ts` | `buildBaseAssessment`에 신규 필드 초기값 |
| `src/services/formService.ts` | `mapAssessmentToRiskFormDetailed`: `postRiskLevel: "low"` 하드코딩 제거(4423행) → `acceptability`·`postFrequency/postSeverity` 산출 |
| `src/pages/AnalysisResult.tsx` | 위험성평가표 섹션 + 참여자 패널 추가. 기존 위험등급 카드는 "종합 참고지표"로 라벨 변경 |
| `src/pages/ReportOutput.tsx` | 공유 기록 패널 추가 |
| `src/pages/FormEditor.tsx` | risk-assessment일 때 `analyzeTaskToAssessment` 재호출 대신 저장된 `riskRows` 로드 |
| `src/components/forms/RiskAssessmentTable.tsx` | 허용 여부 뱃지, 개선 후 위험성 3열, 이행 상태 |
| `src/lib/documentBuilder.ts` | `RiskAssessmentDocxRow`에 신규 필드. `RiskAssessmentDocxMeta`에 참여자·공유 이력 |
| `src/lib/reportBuilder.ts` | 리포트 섹션에 `risk-table`, `participants`, `share-records` 추가 |
| `supabase/functions/form-history/index.ts` | `sanitizeRiskRows`가 신규 필드를 **드롭하지 않도록** 확장 |

### 제거 (중복)

| 위치 | 제거 대상 |
|---|---|
| `src/contexts/AssessmentContext.tsx:206-221` | 300ms setTimeout 가짜 저장 |
| `src/pages/FormEditor.tsx:1179` | risk-assessment 경로의 2차 AI 분석 |
| `src/components/layout/AppHeader.tsx:21` | 무조건 "자동 저장됨" 표시 |

`FormEditor.tsx:809`의 "AI로 위험요소 추가"는 **유지한다.** 이건 재분석이 아니라 행 추가 기능이고, 정상 작동한다.

---

## 6. 화면 배치 (기존 UI 유지 원칙)

새 스텝을 추가하지 않는다. 6단계 위저드 그대로.

```
3단계 분석 결과
├─ [기존] 종합 참고지표 카드 (0~100점) ← 라벨만 변경
├─ [기존] 즉시 조치 / 개선사항 카드
├─ [신규] 위험성평가표  ← 여기가 법정 산출물
└─ [신규] 참여자 패널

6단계 문서 출력
├─ [기존] 리포트 미리보기 / 프로필 토글 / PDF·DOCX·클립보드
└─ [신규] 공유 기록 패널
```

### 표 컬럼 배치 — 폭 폭발 방지

현재 13열이다. 3열을 그냥 더하면 못 쓴다. 다음과 같이 흡수한다.

| 요구 항목 | 배치 |
|---|---|
| 허용 가능 여부 | **컬럼 추가 없음.** 기존 `위험성` 셀 안에 뱃지 (`12(보통) · 허용 불가`) |
| 개선 후 위험성 | `감소대책` 뒤에 `개선 후` 그룹 헤더 + 2열 (가능성/중대성은 셀 내 인라인 입력, 결과 1열) |
| 이행 상태 | **컬럼 추가 없음.** 기존 `완료일` 셀을 상태 셀렉트 + 날짜 조합으로 |

순증 1열(13 → 14열).

---

## 7. 저장 트리거

| 시점 | 동작 |
|---|---|
| AI 분석 완료 (`applyGeminiAnalysis` 직후) | `upsert` → 서버 UUID 발급 → 라우트 id 교체 |
| 프로필 확정 (`confirmProfile`) | `riskRows` 생성 후 `upsert` |
| 표 셀 편집 | 2초 디바운스 후 `patchRow` |
| 참여자·공유 추가/삭제 | 즉시 |
| 근거·자료 단계 진입 | `analysis_snapshot` 갱신 |

`saveState`는 **실제 응답 결과만** 반영한다.

- 성공 → `saved` + `lastSavedAt`
- 실패 → `error` + 헤더에 "저장 실패 · 재시도" 버튼 (현재는 라벨만 있고 동작이 없음)
- 백엔드 미설정(`VITE_SUPABASE_URL` 없음) → `error` + "저장 서버 미연결". **절대 `saved`로 표시하지 않는다.**

---

## 8. 데이터 마이그레이션

**불필요하다.** 주 흐름은 지금까지 아무것도 저장한 적이 없다(가짜 저장이었으므로).
기존 `risk_assessment_history` 스냅샷은 서식센터 이력으로 읽기 전용 유지.

---

## 9. 실행 순서 (PR 단위)

| PR | 내용 | 검증 |
|---|---|---|
| 1 | 마이그레이션 + 엣지 함수 + `riskAssessmentStoreService` | 서비스 단위 테스트 (`formHistoryService.test.ts` 패턴) |
| 2 | 타입 확장 + `riskRowAcceptability` + `formService` 매퍼 수정 | 기존 formService 테스트 9종 통과 확인 |
| 3 | `AssessmentContext` 실제 저장 (가짜 저장 제거) | 저장 실패 시 error 표시 테스트 |
| 4 | 분석 결과 화면 위험성평가표 + 이행 관리 | `riskAssessmentTableLayout.test.tsx` 확장 |
| 5 | 참여자·공유 패널 + 문서 출력 반영 | `riskAssessmentDocxLayout.test.ts` 확장 |
| 6 | FormEditor 중복 분석 제거 | `formEditorRiskRegeneration.test.tsx` 수정 |

PR1~3까지만 끝나도 "저장되는 서비스"가 되고, PR4~5에서 법정 산출물이 완성된다.

---

## 10. 리스크

| 리스크 | 완화 |
|---|---|
| `formService.ts` 4,573줄 + 관련 테스트 9종 | 신규 필드 전부 optional. 기존 필드 시맨틱 불변 |
| `form-history`의 `sanitizeRiskRows`가 신규 필드를 조용히 드롭 | PR2에서 함께 확장. 드롭 방지 테스트 추가 |
| 표 14열의 모바일 가독성 | 이번 범위는 데스크톱 기준. 기존 가로 스크롤 안내 문구 유지 |
| `scope_hash` 디바이스 종속 | `owner_id` 컬럼 선반영. 인증 도입을 다음 우선순위로 명시 |
| `AnalysisResult.tsx` 1,955줄에 UI 추가 | 신규 UI는 별도 컴포넌트로 분리해 페이지는 조립만 |

---

## 11. 이번 범위에서 의도적으로 제외

평가 종류(최초/정기/수시), 법제처 API 연동, 기상 연동, 음성 입력, 오프라인, TBM 모드, QR 게시, 결재선.

평가 종류는 시행규칙 제37조제2항 요건이라 곧 필요하지만, 이번 스키마에 컬럼을 미리 넣지 않는다.
추가 시 `ALTER TABLE ... ADD COLUMN assessment_kind TEXT` 한 줄이면 되므로 선반영 이득이 없다.
