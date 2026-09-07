# 실사진 검증 샘플

M1 스캔 기능을 실제 라벨 사진으로 검증할 때 쓰는 폴더입니다.
사진은 저장소에 커밋하지 않습니다(`.gitignore` 처리). 여기에 파일만 넣고 아래를 실행하세요.

```bash
pnpm run verify:scan -- docs/scan-samples
```

기대값을 함께 주면 작업순서.md Phase 8 완료 조건(픽토그램 정확도 ≥90%, CAS 추출 성공률 ≥70%)을
그대로 채점합니다.

```bash
pnpm run verify:scan -- docs/scan-samples --expect docs/scan-samples/expectations.json
```

## 권장 구성 (30장)

| 구분 | 장수 | 목적 |
| --- | --- | --- |
| 선명한 GHS 라벨 | 10 | 기준 성능 |
| 흐림/초점 실패 | 5 | 저신뢰 처리(`confidence < 0.4`) 확인 |
| 역광·반사 | 5 | 조명 강건성 |
| 훼손·마모 라벨 | 5 | 교차검증 critical 경고가 실제로 뜨는지 |
| 외국어 라벨 / MSDS 문서 | 5 | 영문명 브리지 및 `docType` 분류 |

## expectations.json 형식

파일명을 키로 두고 정답만 적습니다. 모르는 항목은 생략하면 채점에서 제외됩니다.

```json
{
  "toluene-drum.jpg": { "casNo": "108-88-3", "pictograms": ["GHS02", "GHS07", "GHS08"] },
  "acetone-worn.jpg": { "chemNameKor": "아세톤" },
  "blurred-01.jpg":   {}
}
```

## 무엇을 보게 되는가

사진 1장마다 아래가 출력됩니다. 어느 단계에서 끊겼는지 바로 보입니다.

```
── toluene-drum.jpg
   판독      docType=ghs_label confidence=0.92
   CAS       108-88-3
   픽토그램  GHS02, GHS07, GHS08
   신호어    위험
   물질확정  톨루엔 (chemId=001032) by=cas
   안전정보  보호구 4행 / 응급조치 5그룹
   교차검증  0건
```
