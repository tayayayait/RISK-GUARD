import { describe, expect, it } from "vitest";
import { crossCheckLabelWithOfficialRecord } from "../../supabase/functions/_shared/scan-crosscheck";
import { HazardSection } from "../../supabase/functions/_shared/msds-sections";
import { GhsSubstanceDetail } from "../../supabase/functions/_shared/ghs-api";

describe("scan-crosscheck logic", () => {
  it("detects critical discrepancy when official pictograms are missing on label", () => {
    const extraction = {
      docType: "ghs_label" as const,
      rawText: "톨루엔",
      pictograms: ["GHS02"],
      confidence: 0.9,
    };

    const ghsDetail: GhsSubstanceDetail = {
      casNo: "108-88-3",
      pictograms: ["GHS02", "GHS07", "GHS08"],
      hazardList: [],
    };

    const result = crossCheckLabelWithOfficialRecord({
      extraction,
      ghsDetail,
    });

    expect(result.discrepancies.length).toBeGreaterThan(0);
    const picDiscrepancy = result.discrepancies.find((d) => d.field === "pictograms");
    expect(picDiscrepancy).toBeDefined();
    expect(picDiscrepancy?.severity).toBe("critical");
    expect(picDiscrepancy?.message).toContain("GHS07, GHS08");
  });

  it("returns no discrepancies when label and official records match perfectly", () => {
    const extraction = {
      docType: "ghs_label" as const,
      rawText: "톨루엔",
      productName: "톨루엔",
      signalWord: "위험" as const,
      pictograms: ["GHS02", "GHS07", "GHS08"],
      confidence: 0.95,
    };

    const ghsDetail: GhsSubstanceDetail = {
      casNo: "108-88-3",
      signalWord: "위험",
      pictograms: ["GHS02", "GHS07", "GHS08"],
      hazardList: [],
    };

    const result = crossCheckLabelWithOfficialRecord({
      extraction,
      ghsDetail,
      officialProductName: "톨루엔",
    });

    expect(result.discrepancies).toHaveLength(0);
    expect(result.isLowConfidence).toBe(false);
  });

  it("detects critical discrepancy when official signal word is '위험' but label has '경고'", () => {
    const extraction = {
      docType: "ghs_label" as const,
      rawText: "톨루엔",
      signalWord: "경고" as const,
      pictograms: ["GHS02"],
      confidence: 0.9,
    };

    const ghsDetail: GhsSubstanceDetail = {
      casNo: "108-88-3",
      signalWord: "위험",
      pictograms: ["GHS02"],
      hazardList: [],
    };

    const result = crossCheckLabelWithOfficialRecord({
      extraction,
      ghsDetail,
    });

    const signalDiscrepancy = result.discrepancies.find((d) => d.field === "signalWord");
    expect(signalDiscrepancy).toBeDefined();
    expect(signalDiscrepancy?.severity).toBe("critical");
  });

  it("performs crosscheck using section 02 when GHS API record is not available", () => {
    const extraction = {
      docType: "ghs_label" as const,
      rawText: "톨루엔",
      signalWord: "경고" as const,
      pictograms: ["GHS02"],
      confidence: 0.8,
    };

    const hazardSection: HazardSection = {
      classifications: [],
      pictograms: ["GHS02", "GHS07", "GHS08"],
      signalWord: "위험",
      hCodes: [],
      pCodes: { prevention: [], response: [], storage: [], disposal: [] },
      nfpa: null,
    };

    const result = crossCheckLabelWithOfficialRecord({
      extraction,
      hazardSection,
      ghsDetail: null,
    });

    expect(result.discrepancies.some((d) => d.field === "pictograms" && d.severity === "critical")).toBe(true);
    expect(result.discrepancies.some((d) => d.field === "signalWord" && d.severity === "critical")).toBe(true);
  });

  it("skips crosscheck smoothly without throwing when neither GHS nor section 02 is present", () => {
    const extraction = {
      docType: "unknown" as const,
      rawText: "불명확한 라벨",
      pictograms: [],
      confidence: 0.7,
    };

    const result = crossCheckLabelWithOfficialRecord({
      extraction,
      hazardSection: undefined,
      ghsDetail: null,
    });

    expect(result.discrepancies).toHaveLength(0);
    expect(result.isLowConfidence).toBe(false);
  });

  it("flags lowConfidence when extraction confidence is below 0.4", () => {
    const extraction = {
      docType: "ghs_label" as const,
      rawText: "흐릿한 라벨 텍스트",
      pictograms: [],
      confidence: 0.3,
    };

    const result = crossCheckLabelWithOfficialRecord({
      extraction,
    });

    expect(result.isLowConfidence).toBe(true);
  });

  // ── 회귀: 라벨에서 읽어낸 값이 하나도 없으면 비교 대상이 없다.
  //    이전 구현은 텍스트 입력 모드(라벨 사진 없음)에서도
  //    "공식 그림문자가 라벨에 누락됨" critical 경고를 항상 띄웠다.
  const officialHazard = {
    classifications: [],
    pictograms: ["GHS02", "GHS07", "GHS08"],
    signalWord: "위험",
    hCodes: [],
    pCodes: { prevention: [], response: [], storage: [], disposal: [] },
    nfpa: null,
  } as HazardSection;

  it("does not report discrepancies when nothing was read from a label", () => {
    const result = crossCheckLabelWithOfficialRecord({
      // text 모드에서 만들어지는 형태: 읽어낸 라벨 값이 없다
      extraction: { rawText: "톨루엔", casNumbers: [], pictograms: [], confidence: 1.0 },
      hazardSection: officialHazard,
      officialProductName: "톨루엔",
    });

    expect(result.discrepancies).toEqual([]);
  });

  it("still reports discrepancies once at least one label field was read", () => {
    const result = crossCheckLabelWithOfficialRecord({
      extraction: { rawText: "", casNumbers: [], pictograms: ["GHS02"], confidence: 0.9 },
      hazardSection: officialHazard,
      officialProductName: "톨루엔",
    });

    const pictogramIssue = result.discrepancies.find((d) => d.field === "pictograms");
    expect(pictogramIssue?.severity).toBe("critical");
    expect(pictogramIssue?.onRecord).toContain("GHS07");
  });
});

