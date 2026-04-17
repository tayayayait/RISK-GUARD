import { describe, expect, it } from "vitest";
import {
  buildLawActionItems,
  classifyLawActionStage,
  extractArticleNumber,
  isAmbiguousClause,
  toActionSentence,
  type LawActionSeed,
} from "../../supabase/functions/_shared/law-actions.ts";

describe("law action builder", () => {
  it("extracts article numbers", () => {
    expect(extractArticleNumber("산업안전보건기준에 관한 규칙 제10조")).toBe("제10조");
    expect(extractArticleNumber("제12조(비상구의 설치)")).toBe("제12조");
  });

  it("filters ambiguous clause-like sentences", () => {
    expect(isAmbiguousClause("사업주는 필요한 조치를 하여야 한다")).toBe(true);
    expect(isAmbiguousClause("다만, 예외 사유가 있는 경우에는 제외한다")).toBe(true);
    expect(isAmbiguousClause("안전난간을 설치해야 한다")).toBe(false);
  });

  it("converts legal sentence into actionable sentence", () => {
    const sentence = toActionSentence("사업주는 안전난간을 설치하여야 한다.");
    expect(sentence).toContain("설치");
    expect(/[.!?]$/.test(sentence)).toBe(true);
  });

  it("prefers stageHint over keyword inference", () => {
    expect(classifyLawActionStage("즉시 중지 조치", "remedial", "same_day")).toBe("same_day");
  });

  it("classifies recurrence-prevention wording as improvement", () => {
    expect(classifyLawActionStage("재발 방지를 위해 작업 절차를 개선하고 교육을 강화한다.", "content")).toBe("improvement");
  });

  it("does not merge similar actions across different stages", () => {
    const seeds: LawActionSeed[] = [
      {
        rawText: "작업을 중지하고 출입을 통제하세요.",
        stageHint: "immediate",
        articleNumber: "제10조",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "remedial",
        score: 95,
      },
      {
        rawText: "작업을 중지하고 출입을 통제하세요.",
        stageHint: "same_day",
        articleNumber: "제11조",
        lawName: "산업안전보건법",
        source: "checklist",
        score: 92,
      },
    ];

    const built = buildLawActionItems(seeds, 5, 0.8);
    expect(built.filter((item) => item.actionText.includes("출입")).length).toBe(2);
    expect(built.some((item) => item.stage === "immediate")).toBe(true);
    expect(built.some((item) => item.stage === "same_day")).toBe(true);
  });

  it("spreads same-day cards across different law/article keys when alternatives exist", () => {
    const seeds: LawActionSeed[] = [
      {
        rawText: "당일 점검 결과를 기록하세요.",
        stageHint: "same_day",
        articleNumber: "제10조",
        legalBasis: "산업안전보건법 제10조",
        lawName: "산업안전보건법",
        source: "checklist",
        score: 98,
      },
      {
        rawText: "당일 보호구 착용 상태를 확인하세요.",
        stageHint: "same_day",
        articleNumber: "제11조",
        legalBasis: "산업안전보건법 제11조",
        lawName: "산업안전보건법",
        source: "checklist",
        score: 97,
      },
      {
        rawText: "당일 위험구역 표시 상태를 확인하세요.",
        stageHint: "same_day",
        articleNumber: "제10조",
        legalBasis: "산업안전보건법 제10조",
        lawName: "산업안전보건법",
        source: "checklist",
        score: 96,
      },
    ];

    const built = buildLawActionItems(seeds, 2, 0.8);
    const sameDay = built.filter((item) => item.stage === "same_day");
    const articleSet = new Set(sameDay.flatMap((item) => item.articleNumbers));

    expect(sameDay.length).toBe(2);
    expect(articleSet.has("제10조")).toBe(true);
    expect(articleSet.has("제11조")).toBe(true);
  });

  it("prioritizes law diversity in a stage when alternatives exist", () => {
    const seeds: LawActionSeed[] = [
      {
        rawText: "당일 점검 결과를 기록하세요.",
        stageHint: "same_day",
        articleNumber: "제10조",
        legalBasis: "산업안전보건기준에 관한 규칙 제10조",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "checklist",
        score: 99,
      },
      {
        rawText: "당일 보호구 착용 상태를 확인하세요.",
        stageHint: "same_day",
        articleNumber: "제11조",
        legalBasis: "산업안전보건기준에 관한 규칙 제11조",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "checklist",
        score: 98,
      },
      {
        rawText: "당일 위험표지 상태를 확인하세요.",
        stageHint: "same_day",
        articleNumber: "제12조",
        legalBasis: "산업안전보건법 제12조",
        lawName: "산업안전보건법",
        source: "checklist",
        score: 97,
      },
    ];

    const built = buildLawActionItems(seeds, 2, 0.8);
    const sameDay = built.filter((item) => item.stage === "same_day");
    const lawSet = new Set(sameDay.map((item) => item.lawName));

    expect(sameDay.length).toBe(2);
    expect(lawSet.size).toBe(2);
  });

  it("marks cross-stage reused law/article with selection metadata", () => {
    const seeds: LawActionSeed[] = [
      {
        rawText: "작업을 즉시 중지하세요.",
        stageHint: "immediate",
        articleNumber: "제10조",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "remedial",
        score: 95,
      },
      {
        rawText: "당일 점검표를 작성하세요.",
        stageHint: "same_day",
        articleNumber: "제10조",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "checklist",
        score: 93,
      },
    ];

    const built = buildLawActionItems(seeds, 5, 0.8);
    const sameDay = built.find((item) => item.stage === "same_day");

    expect(sameDay).toBeTruthy();
    expect(sameDay?.selectionMode).toBe("reused");
    expect((sameDay?.selectionReason ?? "").length).toBeGreaterThan(0);
  });

  it("keeps provided selectionReason for reused items", () => {
    const seeds: LawActionSeed[] = [
      {
        rawText: "재개 전 확인 조건을 점검하세요.",
        stageHint: "pre_resume",
        articleNumber: "제10조",
        lawName: "산업안전보건법 시행규칙",
        source: "checklist",
        score: 88,
        selectionMode: "reused",
        selectionReason: "대체 후보 점수가 임계치 미달이라 동일 조문을 재사용했습니다.",
      },
    ];

    const built = buildLawActionItems(seeds, 5, 0.8);
    const preResume = built.find((item) => item.stage === "pre_resume");

    expect(preResume?.selectionMode).toBe("reused");
    expect(preResume?.selectionReason).toContain("대체 후보");
  });

  it("does not merge same-stage actions when article numbers differ", () => {
    const seeds: LawActionSeed[] = [
      {
        rawText: "작업을 중지하고 접근을 통제하세요.",
        stageHint: "immediate",
        articleNumber: "제13조",
        legalBasis: "산업안전보건기준에 관한 규칙 제13조",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "remedial",
        score: 90,
      },
      {
        rawText: "작업을 중지하고 접근을 통제하세요.",
        stageHint: "immediate",
        articleNumber: "제224조",
        legalBasis: "산업안전보건기준에 관한 규칙 제224조",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "checklist",
        score: 89,
      },
    ];

    const built = buildLawActionItems(seeds, 3, 0.8);
    const immediate = built.filter((item) => item.stage === "immediate");

    expect(immediate).toHaveLength(2);
    expect(immediate.map((item) => item.articleNumbers[0])).toEqual(expect.arrayContaining(["제13조", "제224조"]));
    expect(immediate.every((item) => item.articleNumbers.length <= 1)).toBe(true);
  });

  it("keeps 2~3 stage actions when minimum stage count is requested", () => {
    const seeds: LawActionSeed[] = [
      {
        rawText: "작업을 즉시 중지하고 접근을 통제하세요.",
        stageHint: "immediate",
        articleNumber: "제13조",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "remedial",
        score: 95,
      },
      {
        rawText: "점화원을 차단하고 전원 상태를 재확인하세요.",
        stageHint: "immediate",
        articleNumber: "제224조",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "checklist",
        score: 94,
      },
      {
        rawText: "위험구역 출입을 통제하고 감시자를 배치하세요.",
        stageHint: "immediate",
        articleNumber: "제295조",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "content",
        score: 93,
      },
    ];

    const built = buildLawActionItems(seeds, 3, 0.8, 2);
    const immediate = built.filter((item) => item.stage === "immediate");

    expect(immediate.length).toBeGreaterThanOrEqual(2);
    expect(immediate.length).toBeLessThanOrEqual(3);
  });

  it("preserves articleTitle from action seed", () => {
    const seeds: LawActionSeed[] = [
      {
        rawText: "위험구역 출입을 통제하세요.",
        stageHint: "immediate",
        articleNumber: "제20조",
        articleTitle: "출입의 금지 등",
        lawName: "산업안전보건기준에 관한 규칙",
        source: "remedial",
        score: 95,
      },
    ];

    const built = buildLawActionItems(seeds, 3, 0.8);
    expect(built).toHaveLength(1);
    expect(built[0].articleNumbers[0]).toBe("제20조");
    expect(built[0].articleTitle).toBe("출입의 금지 등");
  });
});
