import { describe, expect, it, vi } from "vitest";
import {
  deduplicateCandidates,
  rankCandidatesHybrid,
  type MatchCandidate,
  type MatchContext,
} from "../../supabase/functions/_shared/matching.ts";
import { isLawApiCategory, isLawGuideCategory } from "../../supabase/functions/_shared/law-categories.ts";

const context: MatchContext = {
  taskName: "저장탱크 외벽 용접",
  profile: {
    industry: "화학업",
    workLocation: "저장탱크 외벽",
    equipment: ["용접기", "가스검지기"],
    hazards: [
      { name: "폭발", weight: 35 },
      { name: "화학물질누출", weight: 25 },
      { name: "화재", weight: 20 },
    ],
  },
};

describe("evidence matching", () => {
  it("규칙 점수 기반으로 직접 연관 후보를 우선 정렬한다", async () => {
    const candidates: MatchCandidate[] = [
      {
        id: "a",
        title: "저장탱크 용접 중 인화성 증기 폭발 사례",
        content: "저장탱크 내부 잔류 증기와 용접 불티가 만나 폭발",
        keywords: ["저장탱크", "용접", "폭발"],
        date: "2026-02-10",
      },
      {
        id: "b",
        title: "탱크 배관 작업 중 화학물질 누출",
        content: "배관 손상으로 화학물질 누출 발생",
        keywords: ["화학물질누출", "배관"],
        date: "2026-02-10",
      },
    ];

    const ranked = await rankCandidatesHybrid(context, candidates, {
      semanticEnabled: false,
      threshold: 0,
      maxResults: 10,
    });

    expect(ranked[0].id).toBe("a");
    expect(ranked[0].ruleScore).toBeGreaterThan(ranked[1].ruleScore);
    expect(ranked[0].matchedKeywords).toContain("저장탱크");
  });

  it("임계치 미달 후보를 제외한다", async () => {
    const candidates: MatchCandidate[] = [
      {
        id: "related",
        title: "인화성 증기 존재 구간 용접 화재",
        content: "가스농도 측정 없이 용접하다 화재 발생",
        keywords: ["용접", "인화성", "화재"],
        date: "2026-03-01",
      },
      {
        id: "unrelated",
        title: "고소작업대 추락 사고",
        content: "아웃리거 미전개 상태에서 추락",
        keywords: ["고소작업대", "추락"],
        date: "2026-03-01",
      },
    ];

    const ranked = await rankCandidatesHybrid(context, candidates, {
      semanticEnabled: false,
      threshold: 70,
      maxResults: 10,
    });

    expect(ranked.some((item) => item.id === "related")).toBe(true);
    expect(ranked.some((item) => item.id === "unrelated")).toBe(false);
  });

  it("모든 후보가 임계치 미달이면 0건을 반환한다", async () => {
    const candidates: MatchCandidate[] = [
      {
        id: "u1",
        title: "지게차 후진 충돌",
        content: "물류창고 지게차 충돌 사고",
        keywords: ["지게차", "충돌"],
        date: "2026-03-01",
      },
      {
        id: "u2",
        title: "고소작업대 추락",
        content: "아웃리거 미전개 추락",
        keywords: ["고소작업대", "추락"],
        date: "2026-03-01",
      },
    ];

    const ranked = await rankCandidatesHybrid(context, candidates, {
      semanticEnabled: false,
      threshold: 70,
      maxResults: 10,
    });

    expect(ranked).toHaveLength(0);
  });

  it("입력 상위 위험유형과 교집합 없는 후보를 하드필터로 제외한다", async () => {
    const candidates: MatchCandidate[] = [
      {
        id: "explosion",
        title: "저장탱크 용접 중 폭발",
        content: "인화성 증기 폭발",
        keywords: ["폭발", "용접"],
        date: "2026-01-01",
      },
      {
        id: "forklift",
        title: "지게차에 끼임",
        content: "지게차 후진 중 끼임",
        keywords: ["지게차", "끼임"],
        date: "2026-01-01",
      },
    ];

    const ranked = await rankCandidatesHybrid(context, candidates, {
      semanticEnabled: false,
      threshold: 0,
      maxResults: 10,
    });

    expect(ranked.some((item) => item.id === "explosion")).toBe(true);
    expect(ranked.some((item) => item.id === "forklift")).toBe(false);
  });

  it("제목+날짜+URL 기준으로 중복을 제거한다", () => {
    const deduped = deduplicateCandidates([
      { id: "1", title: "A", content: "x", date: "2026-01-01", url: "https://a" },
      { id: "2", title: "A", content: "x", date: "2026-01-01", url: "https://a" },
      { id: "3", title: "A", content: "x", date: "2026-01-02", url: "https://a" },
    ]);

    expect(deduped).toHaveLength(2);
  });

  it("법령/Guide 카테고리만 허용한다", () => {
    expect(isLawGuideCategory("7")).toBe(true);
    expect(isLawGuideCategory("1")).toBe(true);
    expect(isLawGuideCategory("6")).toBe(true);
  });

  it("법령 전용 카테고리는 1~4만 허용한다", () => {
    expect(isLawApiCategory("1")).toBe(true);
    expect(isLawApiCategory("2")).toBe(true);
    expect(isLawApiCategory("3")).toBe(true);
    expect(isLawApiCategory("4")).toBe(true);
    expect(isLawApiCategory("6")).toBe(false);
    expect(isLawApiCategory("7")).toBe(false);
    expect(isLawApiCategory("11")).toBe(false);
  });

  it("CSV 보강 토큰을 켜면 공정 관련 후보 점수가 올라간다", async () => {
    const csvContext: MatchContext = {
      taskName: "아파트 파일 작업",
      profile: {
        industry: "건설업",
        workLocation: "지하층",
        equipment: [],
        hazards: [{ name: "추락", weight: 30 }],
      },
    };

    const candidates: MatchCandidate[] = [
      {
        id: "painting",
        title: "내벽 도장 중 추락 사고",
        content: "내벽 도장 작업 중 균형 상실로 추락",
        keywords: ["도장", "추락"],
        date: "2026-02-10",
      },
      {
        id: "drilling",
        title: "기초 천공 중 추락 사고",
        content: "천공 작업 중 개구부 추락",
        keywords: ["천공", "추락"],
        date: "2026-02-10",
      },
    ];

    const withoutCsv = await rankCandidatesHybrid(csvContext, candidates, {
      semanticEnabled: false,
      threshold: 0,
      maxResults: 10,
      csvEnhancementEnabled: false,
    });

    const withCsv = await rankCandidatesHybrid(csvContext, candidates, {
      semanticEnabled: false,
      threshold: 0,
      maxResults: 10,
      csvEnhancementEnabled: true,
    });

    const withoutCsvDrilling = withoutCsv.find((item) => item.id === "drilling");
    const withCsvDrilling = withCsv.find((item) => item.id === "drilling");

    expect(withoutCsvDrilling).toBeTruthy();
    expect(withCsvDrilling).toBeTruthy();
    expect(withCsvDrilling!.ruleScore).toBeGreaterThanOrEqual(withoutCsvDrilling!.ruleScore);
    expect(withCsv[0].id).toBe("drilling");
  });

  it("최신 비연관 후보보다 오래된 고연관 후보를 우선 정렬한다", async () => {
    const candidates: MatchCandidate[] = [
      {
        id: "old-related",
        title: "저장탱크 용접 중 인화성 증기 폭발",
        content: "저장탱크 용접 중 잔류 증기 폭발",
        keywords: ["저장탱크", "용접", "폭발"],
        date: "2020-01-10",
      },
      {
        id: "new-unrelated",
        title: "물류창고 지게차 충돌",
        content: "물류창고 후진 충돌",
        keywords: ["지게차", "충돌"],
        date: "2026-03-10",
      },
    ];

    const ranked = await rankCandidatesHybrid(context, candidates, {
      semanticEnabled: false,
      threshold: 0,
      maxResults: 10,
      hazardTypeFilter: "none",
    });

    expect(ranked[0].id).toBe("old-related");
  });

  it("날짜가 없으면 최신성 가점을 부여하지 않는다", async () => {
    const dateContext: MatchContext = {
      taskName: "추락 위험 작업",
      profile: {
        industry: "건설업",
        workLocation: "외벽",
        equipment: ["안전대"],
        hazards: [{ name: "추락", weight: 30 }],
      },
    };

    const candidates: MatchCandidate[] = [
      {
        id: "dated",
        title: "외벽 작업 중 추락 사고",
        content: "안전대 미체결로 추락",
        keywords: ["추락", "외벽", "안전대"],
        date: "2026-02-10",
      },
      {
        id: "undated",
        title: "외벽 작업 중 추락 사고",
        content: "안전대 미체결로 추락",
        keywords: ["추락", "외벽", "안전대"],
      },
    ];

    const ranked = await rankCandidatesHybrid(dateContext, candidates, {
      semanticEnabled: false,
      threshold: 0,
      maxResults: 10,
    });

    const dated = ranked.find((item) => item.id === "dated");
    const undated = ranked.find((item) => item.id === "undated");

    expect(dated).toBeTruthy();
    expect(undated).toBeTruthy();
    expect(dated!.ruleScore).toBeGreaterThan(undated!.ruleScore);
  });

  it("DB source 후보에 보너스 점수를 부여한다", async () => {
    const candidates: MatchCandidate[] = [
      {
        id: "db-1",
        title: "저장탱크 용접 중 폭발 예방",
        content: "인화성 증기 측정 및 점화원 차단",
        keywords: ["저장탱크", "용접", "폭발"],
        location: "db",
        url: "https://example.local/db-1",
      },
      {
        id: "api-1",
        title: "저장탱크 용접 중 폭발 예방",
        content: "인화성 증기 측정 및 점화원 차단",
        keywords: ["저장탱크", "용접", "폭발"],
        location: "1",
        url: "https://example.local/api-1",
      },
    ];

    const ranked = await rankCandidatesHybrid(context, candidates, {
      semanticEnabled: false,
      threshold: 0,
      maxResults: 10,
    });

    const dbCandidate = ranked.find((item) => item.id === "db-1");
    const apiCandidate = ranked.find((item) => item.id === "api-1");

    expect(dbCandidate).toBeTruthy();
    expect(apiCandidate).toBeTruthy();
    expect(dbCandidate!.ruleScore).toBeGreaterThan(apiCandidate!.ruleScore);
  });

  it("Gemini semantic reason을 파싱해 결과에 반영한다", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      scores: [{ id: "a", score: 93, reason: "위험요인과 조문 맥락이 직접 일치합니다." }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const ranked = await rankCandidatesHybrid(
      context,
      [
        {
          id: "a",
          title: "저장탱크 용접 중 폭발 예방",
          content: "인화성 증기 측정 및 점화원 차단",
          keywords: ["저장탱크", "용접", "폭발"],
          date: "2026-03-01",
        },
      ],
      {
        semanticEnabled: true,
        geminiApiKey: "test-key",
        threshold: 0,
        maxResults: 10,
      },
    );

    fetchMock.mockRestore();

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.semanticScore).toBe(93);
    expect(ranked[0]?.semanticReason).toContain("직접 일치");
  });

});
