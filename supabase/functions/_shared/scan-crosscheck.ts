import { HazardSection } from "./msds-sections.ts";
import { GhsSubstanceDetail } from "./ghs-api.ts";
import { VisionExtractionResult } from "./scan-vision.ts";

export type DiscrepancySeverity = "critical" | "warn" | "info";

export interface DiscrepancyItem {
  field: "pictograms" | "signalWord" | "hCodes" | "productName";
  onLabel: string;
  onRecord: string;
  severity: DiscrepancySeverity;
  message: string;
}

export interface CrossCheckResult {
  discrepancies: DiscrepancyItem[];
  isLowConfidence: boolean;
  warnings?: string[];
}

/**
 * 라벨/문서에서 추출된 정보와 공식 MSDS/GHS 기준값을 교차검증하여 불일치 항목 및 위험도를 판정
 */
export function crossCheckLabelWithOfficialRecord(params: {
  extraction?: Partial<VisionExtractionResult>;
  hazardSection?: HazardSection;
  ghsDetail?: GhsSubstanceDetail | null;
  officialProductName?: string;
}): CrossCheckResult {
  const discrepancies: DiscrepancyItem[] = [];
  const warnings: string[] = [];
  const { extraction, hazardSection, ghsDetail, officialProductName } = params;

  const confidence = extraction?.confidence ?? 1.0;
  const isLowConfidence = confidence < 0.4;

  if (!extraction) {
    return { discrepancies, isLowConfidence, warnings };
  }

  /**
   * 교차검증은 "라벨에서 읽어낸 값"과 "공식 기준값"의 비교다.
   * 라벨에서 아무것도 읽히지 않았다면 비교 대상이 없으므로 판정하지 않는다.
   *
   * 이 가드가 없으면 텍스트 입력 모드(라벨 사진 자체가 없음)나 판독 실패 이미지에서
   * "공식 그림문자가 라벨에 누락되었다"는 critical 경고가 항상 뜬다.
   * 허위 경고가 반복되면 사용자가 진짜 불일치를 무시하게 되므로 안전 신호가 무의미해진다.
   */
  const hasLabelSignal = Boolean(
    (extraction.pictograms && extraction.pictograms.length > 0) ||
      (extraction.signalWord && extraction.signalWord.trim()) ||
      (extraction.hCodes && extraction.hCodes.length > 0) ||
      (extraction.productName && extraction.productName.trim()),
  );

  if (!hasLabelSignal) {
    if (isLowConfidence) {
      warnings.push("Label extraction produced no comparable field; cross-check skipped.");
    }
    return { discrepancies, isLowConfidence, warnings };
  }

  // 1) 공식 픽토그램 결정 (GHS API 우선, 없으면 섹션02)
  let officialPictograms: string[] = [];
  if (ghsDetail && ghsDetail.pictograms.length > 0) {
    officialPictograms = ghsDetail.pictograms;
  } else if (hazardSection && hazardSection.pictograms.length > 0) {
    officialPictograms = hazardSection.pictograms;
  }

  const labelPictograms = extraction.pictograms || [];

  if (officialPictograms.length > 0) {
    // 공식에는 있는데 라벨에 누락된 픽토그램 (Critical)
    const missingInLabel = officialPictograms.filter((p) => !labelPictograms.includes(p));
    if (missingInLabel.length > 0) {
      discrepancies.push({
        field: "pictograms",
        onLabel: labelPictograms.join(", ") || "(없음)",
        onRecord: officialPictograms.join(", "),
        severity: "critical",
        message: `공식 유해성 그림문자 [${missingInLabel.join(", ")}]가 현장 라벨에 누락되어 있습니다.`,
      });
    }

    // 라벨에 추가로 표기된 픽토그램 (Warn)
    const extraInLabel = labelPictograms.filter((p) => !officialPictograms.includes(p));
    if (extraInLabel.length > 0) {
      discrepancies.push({
        field: "pictograms",
        onLabel: labelPictograms.join(", "),
        onRecord: officialPictograms.join(", "),
        severity: "warn",
        message: `공식 기준에 없는 추가 그림문자 [${extraInLabel.join(", ")}]가 라벨에 표기되어 있습니다.`,
      });
    }
  }

  // 2) 신호어 검증 (GHS API 우선, 없으면 섹션02)
  let officialSignalWord: string | null = null;
  if (ghsDetail?.signalWord) {
    officialSignalWord = ghsDetail.signalWord;
  } else if (hazardSection?.signalWord) {
    officialSignalWord = hazardSection.signalWord;
  }

  const labelSignalWord = extraction.signalWord;
  if (officialSignalWord && labelSignalWord) {
    if (officialSignalWord === "위험" && labelSignalWord === "경고") {
      discrepancies.push({
        field: "signalWord",
        onLabel: labelSignalWord,
        onRecord: officialSignalWord,
        severity: "critical",
        message: "공식 신호어는 '위험'이나 라벨에는 '경고'로 낮게 표기되어 있습니다.",
      });
    } else if (officialSignalWord === "경고" && labelSignalWord === "위험") {
      discrepancies.push({
        field: "signalWord",
        onLabel: labelSignalWord,
        onRecord: officialSignalWord,
        severity: "warn",
        message: "공식 신호어는 '경고'이나 라벨에는 '위험'으로 표기되어 있습니다.",
      });
    }
  }

  // 3) 제품명 vs 공식 물질명 비교 (Info)
  if (extraction.productName && officialProductName) {
    const p1 = extraction.productName.trim().toLowerCase();
    const p2 = officialProductName.trim().toLowerCase();
    if (p1 !== p2 && !p1.includes(p2) && !p2.includes(p1)) {
      discrepancies.push({
        field: "productName",
        onLabel: extraction.productName,
        onRecord: officialProductName,
        severity: "info",
        message: `제품명(${extraction.productName})과 공식 물질명(${officialProductName})이 일치하지 않습니다 (혼합물 여부 확인 필요).`,
      });
    }
  }

  return {
    discrepancies,
    isLowConfidence,
    warnings,
  };
}
