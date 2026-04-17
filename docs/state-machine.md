# 상태 전이 명세

## Step 전이

1. `input`
2. `profile_review`
3. `analysis`
4. `evidence`
5. `materials`
6. `report`

`StepRouteGuard`는 현재 단계보다 미래 단계 직접 진입을 차단한다.
전역 헤더의 `RISK-GUARD` 브랜드를 클릭하면 언제든 `/`(입력/메인 화면)으로 이동한다.

## Status 전이

- 초기: `draft`
- 분석 시작: `analyzing`
- 프로필 검토 필요: `review_required`
- 분석 준비 완료: `analysis_ready`
- 근거 조회 중: `evidence_loading`
- 보고서 준비: `ready_for_report`
- 내보내기 중: `exporting`
- 완료: `completed`
- 오류: `error`

## 주요 액션

- `startAnalysis(input)`
  - `draft -> analyzing -> review_required`
- `confirmProfile(profile)`
  - `review_required -> analysis_ready`
- `loadEvidence(force?)`
  - `analysis_ready -> evidence_loading -> ready_for_report | analysis_ready(partial)`
  - 조기 종료(`hasEvidenceFetchSettled`)는 `4개 근거 API 상태(disaster/fatality/lawGuide/materials)가 모두 idle이 아니고`, 동시에 `loading`이 없는 경우에만 허용한다.
  - `lawGuide`만 사전조회된 상태(`lawGuide=error|empty|success`, 나머지 `idle`)에서는 조기 종료하지 않고 전체 근거 조회를 수행한다.
  - 생성 중(`analysis_ready` 초기 상태 또는 `evidence_loading`)에는 근거 화면 본문 대신 대기 로딩 화면을 먼저 노출한다.
  - 근거 자료 생성이 완료되어 API 상태가 `loading`이 아니게 된 시점에만 `currentStep=evidence`로 확정한다.
- `generateReport()`
  - `ready_for_report -> ready_for_report` + `currentStep=report`
  - SCR-06 진입 시 보고서 섹션을 항상 재생성해 최신 `citations` 선택 상태를 강제 반영한다.
  - `유사 재해사례 요약`/`사망사고 기반 경고`는 `citation.evidenceId -> evidenceItems` 조인 결과(제목+요약, 사고사망 메타, URL)를 사용한다.
  - 사고사망 배지는 `사고사망/사망사고/치명사고`를 동일 카테고리로 정규화한다.
  - 자동 생성되는 `권장 개선조치`/`작업 전 체크리스트`는 법조문 원문성 문장을 제외하고, 완결형 문장(예: `...해야 합니다.`)으로 후처리한다.
  - `checklistItems`가 비어 있어도 `immediateActions + lawActionItems(immediate/same_day/pre_resume)` 기준 자동 기본값(최대 10개)을 채운다.
  - `analysis.improvements`가 비어 있으면 `lawActionItems(improvement)`, 이후 `immediateActions/위험요인` 순서로 권장 개선조치를 자동 생성한다.
- `exportReport(format, profile)`
  - `ready_for_report -> exporting -> completed|error`
  - `profile=submission|review` 중 선택된 내보내기 프로필을 적용한다.
  - `format=docx|pdf` 산출물은 법정서식이 아닌 SCR-06 문서 출력 화면의 조사·분석 결과 요약본이다.
  - `submission(기본)`:
    - 결과/조치 중심 본문으로 구성한다.
    - 포함: `작업 개요`, `주요 위험요인`, `위험등급 및 즉시 조치`, `조치계획`, `법령·가이드 근거 요약`, `체크리스트`, `브리핑`
  - `review`:
    - 기존 전체 섹션을 유지하되, 출력 구조를 `본문 + 부록`으로 재정렬한다.
    - 부록: `유사 재해사례`, `사망사고 경고`, `법령/Guide/미디어 근거`, `교육자료`
  - `docx`: 선택 프로필 기준 결과 요약(메타 + 본문 섹션 + 체크리스트 + 브리핑) OOXML 문서 생성
  - `pdf`: 선택 프로필 기준 결과 요약 DOM 캡처(`html2canvas`) 후 A4 다중 페이지로 분할 저장

세부 매핑표는 [report-export-profiles.md](./report-export-profiles.md)를 따른다.

## 저장 상태

- 편집 발생 시 `saveState.status = saving`
- 300ms 이후 `saved`로 전환
- 저장 실패 시 `error`

## 위험행 검증 상태

- 위험성평가 각 행은 `validationStatus: ok | review_required` 상태를 가진다.
- 자동작성 파이프라인:
  1. 1차 생성
  2. 행 단위 검증
  3. 실패 필드 1회 재작성 후 재검증
  4. 재검증 실패 필드는 빈값으로 남기고 행 상태를 `review_required`로 확정
- 부분 실패 정책:
  - 실패 행만 `review_required`로 표시하고 다른 행은 `ok`로 유지한다.
  - 문서 다운로드는 상태와 무관하게 허용한다(비차단).
- 수동 수정 정책:
  - 사용자가 셀을 수정하면 즉시 행 재검증을 수행한다.
  - 실패 조건이 해소되면 `review_required -> ok`로 복귀한다.

## 2026-04-10 Flow Update

- Initial transition from `profile_review` to `analysis` now waits for law search and law-action generation to finish.
- While this pre-processing runs, `ProfileReview` shows a dedicated full-screen loading state.
- Navigation to step 3 starts only after `confirmProfile(profile)` and `prefetchLawGuidesForAnalysis({ taskName, profile, force })` both complete.

## 2026-04-11 Loading UX Update

- `ProfileReview` pre-processing 로딩은 고정 목업이 아닌 **동적 단계 모델**로 동작한다.
- 단계 순서: `작업 프로필 확정 -> 법령 근거 수집 -> 조치 항목 구성 -> 결과 화면 준비`.
- 진행률은 단계 전환 시 즉시 갱신되고, `법령 근거 수집` 구간에서는 네트워크 대기 중에도 퍼센트가 실시간으로 증가한다.
- 각 단계 카드는 `완료 / 진행중 / 대기` 상태를 노출해 현재 처리 위치를 명확히 보여준다.

## 2026-04-12 Action Plan Stage Update

- Action plan stage는 `immediate | same_day | pre_resume | improvement` 4단계로 운영한다.
- 단계별 법령 선택은 독립 실행하며, 상위 단계 결과를 하위 단계에 자동 복사하지 않는다.
- 단계별 후보 탐색은 stage 목적 기반 우선군 + 확장군(`55→50→45→40→35`) 방식으로 동작한다.
- 단계별 선택 우선순위는 `미사용 법령+미사용 조문` -> `동일 법령 내 미사용 조문` -> `기존 조문 재사용(최후 예외)`로 고정한다.
- 동일 조문 재사용이 발생하면 `selectionReason`을 반드시 기록한다.
- `SCR-03`에서 단계가 비어 있으면 `적합 법령 없음(수동 검토 필요)` 행을 노출한다.

## 2026-04-12 Provider Boundary Split

- `AssessmentProvider`는 assessment 관련 라우트 하위에만 배치:
  - `/`
  - `/assessments/new`
  - `/assessments/:id/*`
- forms/prediction/settings 라우트는 AssessmentContext 외부에서 렌더한다.
- 공통 레이아웃(`AppHeader`, `AppSidebar`)은 optional context를 사용한다.
- FormEditor 분석은 AssessmentContext 대신 `analyzeTaskToAssessment`를 호출한다.

## 2026-04-13 Settings Company Profile Flow

- `/settings`는 회사 고정정보를 조회/저장하는 별도 상태를 가진다.
  - load: `loading -> loaded | error`
  - save: `idle -> saving -> success | error`
- 저장 소스 상태:
  - `server`: `company-profile` upsert 성공
  - `local`: 서버 실패 시 localStorage 폴백 저장
- 사고조사표(`forms/accident-report`)는 draft 생성 시 최신 회사 정보를 병합하고, 미등록 상태면 안내 배너를 표시한다.

## 2026-04-14 StepRouteGuard Boundary Hardening

- `StepRouteGuard`는 이제 `useOptionalAssessment`를 사용한다.
- `AssessmentProvider` 경계 밖에서 렌더되면 예외를 발생시키지 않고 `/assessments/new`로 리다이렉트한다.
- `targetStep="input"` 경로는 context 없이도 렌더를 허용한다.

## 2026-04-14 Evidence Waiting Gate Update

- `canAccessStep("evidence")`는 `analysis` 단계에서도 `status=analysis_ready | evidence_loading`이면 진입을 허용한다.
- 단, 진입 직후 근거 본문을 즉시 렌더하지 않고 내부 자료 생성 완료 전까지 로딩 기반 대기 화면을 유지한다.
- `loadEvidence()`는 생성 시작 시 `currentStep`을 즉시 올리지 않고, 결과 정리 이후에만 `currentStep=evidence`를 설정한다.
- `analysis` 화면의 `증거 화면으로 이동` 버튼은 `await loadEvidence()` 완료 후에만 라우팅한다.
- 버튼 클릭 이후 완료 전까지는 `analysis` 화면 내 전용 대기 화면을 렌더해 빈 화면 없이 상태를 보여준다.

## 2026-04-14 Evidence Settled Gate Hardening

- `hasEvidenceFetchSettled`는 이제 `any started + no loading`이 아니라 `all started + no loading`을 기준으로 판단한다.
- 목적: 법령 사전조회만 먼저 끝난 상태에서 `disaster/fatality/materials`가 `idle`로 남아도 `loadEvidence()`가 조기 종료되지 않도록 보장한다.

## 2026-04-15 Analysis Result Reuse Guard

- `ProfileReview`의 `분석 결과 확정`은 이제 현재 프로필 변경 여부를 먼저 비교한다.
- `ProfileReview` 화면 재진입 시에는 더 이상 `currentStep`을 `profile_review`로 강제 하향 갱신하지 않는다.
- 프로필이 동일하고 이미 법령/조치 데이터가 준비된 세션 상태라면 `prefetchLawGuidesForAnalysis(... force: false)` 경로로 기존 결과를 재사용한다.
- 이 경로에서는 `analysis -> profile_review -> analysis` 왕복 시 법령 근거/조치안 재생성이 발생하지 않는다.
- `evidence` 이상 단계에 도달한 세션에서 `AI 분석 확인`으로 돌아와 `분석 결과 확정`을 눌러도, 프로필 미변경이면 `confirmProfile`을 재실행하지 않는다.
- `AssessmentContext.setCurrentStep`은 이제 **최고 도달 단계만 유지**하며, `profile_review`/`analysis` 같은 이전 단계 요청으로 `materials`/`report` 접근 권한이 내려가지 않는다.
- 프로필이 변경되었거나 `lawGuide` 상태가 `error`인 경우에만 재생성을 강제한다.
- `prefetchLawGuidesForAnalysis`의 조기 종료 조건은 `법령 근거(evidence)`뿐 아니라 `lawActionItems`/`lawGuideMeta` 존재 여부도 함께 본다.

## 2026-04-15 Risk Category Auto-Matching Update

- `분류 재계산` 및 초기 행 정규화에서 사용하는 `deriveRiskCategoryFromRowSignals`는 이제 `원인(cause)` 신호를 우선 반영한다.
- `원인 + 유해위험요인` 텍스트에서 위험유형(`추락/붕괴/질식/폭발·화재/감전/끼임·말림/절단/낙하물·비래/차량·이동장비 충돌/화학노출/소음·분진·반복작업`)을 점수 기반으로 추론해 분류를 자동 매핑한다.
- `관리적 요인`, `인적 요인` 신호가 원인 문장에 명확히 존재하면 위험유형보다 우선하여 해당 분류를 적용한다.
- `전기적 요인`은 `감전/누전/절연/충전부/접지/통전` 같은 강한 전기 신호 또는 `전원 차단/전원 격리/전원 공급/배선/전기/전선` 약한 신호 2개 이상일 때만 적용해 단일 약한 키워드 오분류를 방지한다.
- `소음/분진/반복작업` 위험유형은 `환경적 요인`으로 매핑한다.

## 2026-04-15 Route Lazy Loading Boundary Update

- `AppRouter`는 페이지 라우트를 `React.lazy` 기반으로 로드한다.
- 라우트 렌더 경계는 페이지 단위 `Suspense` fallback으로 분리한다.
- 상태 전이 로직(`StepRouteGuard`, `AssessmentProvider`, `BrowserRouter`)과 단계 접근 제어 규칙은 변경하지 않는다.

## 2026-04-15 Route Preload Hint Update

- 사이드바(`AppSidebar`)와 단계 레일(`StepRail`)은 hover/focus/touch 시 목적지 라우트 청크 preload를 시도한다.
- preload는 네비게이션 접근 가능 단계(`canAccessStep`)에서만 실행한다.
- preload는 힌트 동작이며, 단계 전이 규칙/권한 제어/실제 이동 조건은 기존과 동일하다.

## 2026-04-16 Lazy Loader Cache Removal (HMR Context Split Fix)

- `src/lib/routeComponents.ts`에서 라우트 lazy 로더의 수동 Promise 캐시를 제거했다.
- 이유: 개발 환경 HMR에서 구버전 페이지 모듈과 신버전 `AssessmentProvider`가 혼재되면 `useAssessment must be used within AssessmentProvider` 예외가 발생할 수 있었다.
- preload 동작은 유지한다. 변경점은 `import()` 호출을 매번 실행해 번들러의 모듈 무효화/HMR 갱신 경로를 방해하지 않도록 한 것이다.

## 2026-04-16 Analysis Result Legal Basis Panel Removal

- `SCR-03` 분석 결과 화면에서 상단 `법령 근거` 패널을 제거했다.
- 법령 조문 상세(우측 패널) 진입은 액션 카드의 조문 버튼 경로만 유지한다.
- `lawActionItems`/법령 근거 데이터 생성 및 후속 단계(`evidence`, `report`) 로직은 변경하지 않는다.

## 2026-04-15 P2 Re-render Stabilization Update

- `FormEditor`의 주요 콜백(`행 편집`, `행 추가`, `AI로 위험성 추가`, `분류 재계산`, `AI 법령 검토 스케줄`)은 `useCallback` 기반으로 안정화했다.
- `RiskAssessmentTable`는 `memo` 적용으로 상위 상태 변경 시 불필요한 재렌더를 줄이도록 조정했다.
- `AnalysisResult`의 액션 카드 핸들러는 안정 참조로 교체해, 선택 상태 변경 시 재렌더 파급 범위를 축소했다.
- 상태 전이 정의(`draft -> analyzing -> ...`)와 라우팅 가드 규칙은 변경하지 않았다.

