# 사고 시나리오 이미지 표현 정책

## 목적
- 사고 원인과 즉시 조치가 **이미지 자체**만으로 이해되도록 한다.
- 이미지 위에 텍스트를 덧씌우는 방식(배지, 하단 설명 패널, 캘아웃)을 사용하지 않는다.
- 기본 표현 톤은 산업안전 교육자료에 적합한 **반실사 일러스트**로 유지하되, 설비/스케일/조명/배치는 실제 현장 맥락을 보존한다.
- 이미지 자체에서 `사고유형/위험위치/발생원인/부상위험 부위/즉시조치`가 한눈에 읽혀야 한다.
- 사고 시점은 **사고 직전 1-2초(pre-incident)**로 고정한다.

## UI/출력 정책
- 화면 상세 이미지(`AccidentPrediction`)는 순수 장면 이미지로만 노출한다.
- 기본 생성 구도는 **사고 직전(BEFORE) 단일 장면 1컷**으로 유지한다.
- 번들 PNG/PDF용 포스터는 시나리오별 `이미지 + 하단 설명 영역` 구조를 반복 출력한다.
- 번들 다운로드는 이미지 생성 성공(`imageUrl` 존재)한 시나리오를 모두 포함하며, `soft_fail`은 제외 조건이 아니다.
- 설명 텍스트는 이미지 내부 오버레이가 아니라 이미지 아래 별도 영역에 배치한다.
- 사고유형/위험위치/사유/즉시조치 텍스트는 이미지 외부 카드/설명 영역에서만 제공한다.
- 번들 카드 레이아웃은 이미지 영역을 우선한다.
  - 이미지 영역은 카드 높이의 약 70% 이상을 기본값으로 유지한다.
  - 이미지 렌더링은 `contain` 기준으로 중앙 배치해 원본 장면이 잘리지 않도록 유지한다.
  - 텍스트 영역은 하단 요약 블록으로 분리하고, `사고 유형 / 위험 위치 / 발생 이유 / 즉시 조치` 4개 항목만 표시한다.
- 포스터 캔버스는 이미지와 설명 영역 사이를 고정 간격으로 분리하고, 설명 텍스트를 캡션 영역 클리핑 내부에만 그려 이미지 영역 침범을 방지한다.
- 설명 텍스트는 행 단위 말줄임(truncate) 규칙으로 길이를 제한해 번들 PNG/PDF에서 이미지 가독성을 우선 보장한다.

## 프롬프트 정책
- 생성 프롬프트에 다음 금지 규칙을 명시한다.
  - 이미지 내부 캡션, 라벨, 배지, 콜아웃 박스, 화살표, 경고 문구 렌더 금지
  - `Before/After` 포함 모든 문자/숫자/워터마크 삽입 금지
- 생성 프롬프트의 기본 스타일을 **텍스트 없는 반실사 산업안전 교육 일러스트**로 명시한다.
- 부상위험 부위는 위험원과의 임박 경로가 보이도록 표현하고, 고어/과도한 손상 묘사는 금지한다.
- 즉시 조치 항목은 “행동 중인 장면”으로 표현하도록 강제한다.
  - 예: 비상정지 버튼 누르는 동작, 안전구역으로 즉시 이탈, 주변 작업자 제지 동작
- 아래 4개 시각신호를 `MANDATORY` 블록으로 고정한다.
  - 위험원 하이라이트(조명 대비, 경계 선명도, 위험구역 중심 구도)
  - 부상 가능 부위 강조(위험원-신체부위 임박 거리/자세)
  - 위험 진행 방향(낙하/비산/회전/충돌 궤적의 단일 주 벡터)
  - 즉시 조치 포인트(비상정지/차단점/이탈 경로 중 1개 이상, 행동 중 장면)
- 단일 장면 규칙을 명시한다.
  - 좌/우 분할, 전후 비교 패널, 다중 프레임 구성 금지
  - 사고유형/위험위치/발생이유는 단일 장면 안에서 위험 기제로 직접 표현
  - 작업자/장비/구조물/작업대상물 축척과 거리감은 실제 산업현장처럼 물리적으로 자연스럽게 유지
  - 특정 요소만 과도하게 거대/축소되어 보이는 비정상 원근·비율 금지
  - 장비 우선 계층 적용: `장비 고정 블록 -> 위험기제 블록 -> 사고유형 판별 블록 -> 공통 제약`
  - 사고유형 판별 블록은 유형별 MUST HAVE / MUST NOT HAVE 신호를 함께 강제한다.

## 사고유형 표준 키(18종)
- 끼임, 협착, 절단, 베임, 찔림, 충돌, 부딪힘, 맞음, 낙하·비래, 추락, 넘어짐, 감전, 화상, 폭발, 화재, 깔림, 압궤, 붕괴
- 입력 사고유형은 한/영 동의어를 표준 키로 정규화해 지시문을 구성한다.
- 유형별 MUST HAVE / MUST NOT HAVE 신호는 `docs/accident-type-visual-signal-matrix.md`를 단일 기준으로 사용한다.

## 품질 게이트 정책
- 이미지 품질 판정은 15요소 기준으로 평가한다.
1. hazard source visible
2. worker exposure path visible
3. accident direction visible
4. immediate action cue visible
5. injury-prone body part visible (부상위험 신체부위 및 위험원-신체부위 임박 경로 가시성)
6. pre-incident moment visible (사고 완료 상태 아님)
7. no readable text (이미지 내부 문자/숫자/워터마크 없음)
8. scale consistency visible (작업자/장비/구조물 축척 및 원근 일관성)
9. equipment context aligned (인식된 장비/위험부위 정합성)
10. mechanism salience visible (위험원→노출경로→임박궤적 가시성)
11. type discriminator visible (사고유형 구분 신호 명확성)
12. hazard hotspot salience visible (핵심 위험 지점 1차 시선 유도)
13. injury body part emphasis visible (부상 가능 부위 강조)
14. trajectory vector visible (단일 주 궤적 벡터 가시성)
15. immediate action point visible (즉시 조치 포인트 가시성)
- 자동 추론 및 Gemini 판정 응답 모두 위 15요소 기준을 사용한다.
- 하드 게이트는 아래 7축으로 고정한다.
  - equipment context aligned
  - mechanism salience visible
  - type discriminator visible
  - hazard hotspot salience visible
  - injury body part emphasis visible
  - trajectory vector visible
  - immediate action point visible
- 하드 게이트 중 하나라도 `false`면 결과를 `soft_fail`로 판정한다.

## 재생성 정책
- 1차 생성 실패 시 품질게이트 실패 사유를 기반으로 보강 힌트를 주입해 재생성한다.
- 하드 게이트 7축 중 `false` 항목이 있으면 누락 항목별 보강 힌트를 **우선** 주입한다.
- 최대 2회 추가 재생성(총 3회 시도)한다.
- 3회 모두 기준 미달이면 완전 폐기하지 않고, 정합 점수가 가장 높은 결과 1장을 최종 채택한다.
- 이미지 모델 폴백은 호출 폭주를 막기 위해 최대 2개 후보 모델까지만 순차 시도한다.

## 관련 코드
- `src/pages/AccidentPrediction.tsx`
- `src/services/predictionService.ts`
- `src/test/accidentPrediction.test.tsx`
- `src/test/predictionService.test.ts`
- `docs/accident-type-visual-signal-matrix.md`
