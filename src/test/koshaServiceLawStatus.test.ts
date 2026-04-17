import { beforeEach, describe, expect, it, vi } from "vitest";
import { KoshaService } from "@/services/koshaService";
import type { WorkProfile } from "@/types/assessment";
import { invokeBackend } from "@/services/edgeFunctionClient";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
}));

const profile: WorkProfile = {
  industry: "chemical",
  workLocation: "tank area",
  equipment: ["welder"],
  hazards: [
    {
      id: "h1",
      name: "flammable vapor release",
      type: "fire/explosion",
      weight: 35,
      confidence: "high",
      reason: "test hazard",
    },
  ],
};

describe("KoshaService.searchLaws", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success for split law/guide/media response", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      lawItems: [
        {
          id: "law-1",
          type: "law",
          sourceBadge: "법령",
          title: "제20조 출입의 금지",
          relevanceScore: 91,
          summaryBullets: ["법령 조문"],
          keywords: ["추락"],
          sourceType: "api",
          lawCategory: "4",
        },
      ],
      guideItems: [
        {
          id: "guide-1",
          type: "law",
          sourceBadge: "Guide",
          title: "위험성 평가 지침",
          relevanceScore: 84,
          summaryBullets: ["지침 요약"],
          keywords: ["폭발/화재"],
          sourceType: "api",
        },
      ],
      mediaItems: [
        {
          id: "media-1",
          type: "law",
          sourceBadge: "미디어",
          title: "화재예방 OPS",
          relevanceScore: 76,
          summaryBullets: ["작업 전 체크"],
          keywords: ["OPS", "화재"],
          sourceType: "api",
          mediaStyle: "OPS",
        },
      ],
      actionItems: [
        {
          id: "law-action-1",
          stage: "immediate",
          actionText: "작업 중 가스 농도를 측정하라",
          articleNumbers: ["제20조"],
          lawName: "산업안전보건기준에 관한 규칙",
          legalRequirement: "가스 농도 측정",
          generationType: "direct" as const,
        },
        {
          id: "law-action-2",
          stage: "same_day",
          actionText: "당일 조치 이행 상태를 기록하라",
          articleNumbers: ["제20조"],
          lawName: "산업안전보건기준에 관한 규칙",
          legalRequirement: "조치 이행 기록",
          generationType: "derived" as const,
        },
      ],
      meta: {
        sourceCounts: { api: 3, db: 0, storage: 0 },
        trackCounts: { law: 1, guide: 1, media: 1 },
        trackStatus: { law: "success", guide: "success", media: "success" },
      },
    });

    const result = await KoshaService.searchLaws("tank welding", profile);

    expect(result.status).toBe("success");
    expect(result.lawItems).toHaveLength(1);
    expect(result.guideItems).toHaveLength(1);
    expect(result.mediaItems).toHaveLength(1);
    expect(result.items).toHaveLength(3);
    expect(result.lawItems?.every((item) => item.sourceBadge === "법령")).toBe(true);
    expect(result.lawItems?.[0]?.lawCategory).toBe("4");
    expect(result.guideItems?.every((item) => item.sourceBadge === "Guide")).toBe(true);
    expect(result.mediaItems?.every((item) => item.sourceBadge === "미디어")).toBe(true);
    expect(result.lawGuideMeta?.sourceCounts.api).toBe(3);
    expect(result.lawGuideMeta?.trackCounts.guide).toBe(1);
    expect(result.lawGuideMeta?.trackCounts.media).toBe(1);
    expect(result.lawActionItems?.some((item) => item.stage === "same_day")).toBe(true);
    const sameDay = result.lawActionItems?.find((item) => item.stage === "same_day");
    expect(sameDay?.generationType).toBe("derived");
    expect(sameDay?.lawName).toBe("산업안전보건기준에 관한 규칙");
  });

  it("returns empty when all tracks are empty with empty reason", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      lawItems: [],
      guideItems: [],
      mediaItems: [],
      items: [],
      actionItems: [],
      meta: {
        sourceCounts: { api: 0, db: 0, storage: 0 },
        trackCounts: { law: 0, guide: 0, media: 0 },
        trackStatus: { law: "empty", guide: "empty", media: "empty" },
        guideEmptyReason: "NO_GUIDE_CANDIDATE",
      },
    });

    const result = await KoshaService.searchLaws("tank welding", profile);

    expect(result.status).toBe("empty");
    expect(result.guideItems).toHaveLength(0);
    expect(result.lawGuideMeta?.guideEmptyReason).toBe("NO_GUIDE_CANDIDATE");
  });

  it("returns success for legacy flattened list payload", async () => {
    vi.mocked(invokeBackend).mockResolvedValue([
      {
        id: "legacy-law",
        type: "law",
        sourceBadge: "법령",
        title: "기존 법령 카드",
        relevanceScore: 80,
        summaryBullets: ["요약"],
        keywords: ["안전"],
        sourceType: "api",
      },
    ]);

    const result = await KoshaService.searchLaws("tank welding", profile);

    expect(result.status).toBe("success");
    expect(result.items).toHaveLength(1);
    expect(result.lawItems).toHaveLength(1);
  });

  it("returns partial when a track fails but law data exists", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      lawItems: [
        {
          id: "law-1",
          type: "law",
          sourceBadge: "법령",
          title: "산업안전보건법 제1조",
          relevanceScore: 90,
          summaryBullets: ["법령 조문"],
          keywords: ["화기"],
          sourceType: "api",
        },
      ],
      guideItems: [],
      mediaItems: [],
      items: [
        {
          id: "law-1",
          type: "law",
          sourceBadge: "법령",
          title: "산업안전보건법 제1조",
          relevanceScore: 90,
          summaryBullets: ["법령 조문"],
          keywords: ["화기"],
          sourceType: "api",
        },
      ],
      actionItems: [],
      meta: {
        sourceCounts: { api: 1, db: 0, storage: 0 },
        trackCounts: { law: 1, guide: 0, media: 0 },
        trackStatus: { law: "success", guide: "error", media: "error" },
        trackErrors: {
          guide: ["UPSTREAM_500"],
          media: ["UPSTREAM_TIMEOUT"],
        },
      },
    });

    const result = await KoshaService.searchLaws("tank welding", profile);
    expect(result.status).toBe("partial");
    expect(result.lawGuideMeta?.trackStatus?.guide).toBe("error");
    expect(result.lawGuideMeta?.trackErrors?.media?.[0]).toContain("UPSTREAM_TIMEOUT");
  });

  it("returns error when tracks fail and no data exists", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      lawItems: [],
      guideItems: [],
      mediaItems: [],
      items: [],
      actionItems: [],
      meta: {
        sourceCounts: { api: 0, db: 0, storage: 0 },
        trackCounts: { law: 0, guide: 0, media: 0 },
        trackStatus: { law: "empty", guide: "error", media: "error" },
        trackErrors: {
          guide: ["MISSING_SECRET:DATA_GO_KR_API_KEY"],
          media: ["MISSING_SECRET:DATA_GO_KR_API_KEY"],
        },
      },
    });

    const result = await KoshaService.searchLaws("tank welding", profile);
    expect(result.status).toBe("error");
    expect(result.items).toHaveLength(0);
  });

  it("invokes law-guides endpoint with a 120-second timeout", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      items: [],
      lawItems: [],
      guideItems: [],
      mediaItems: [],
      actionItems: [],
      meta: {
        sourceCounts: { api: 0, db: 0, storage: 0 },
        trackCounts: { law: 0, guide: 0, media: 0 },
        trackStatus: { law: "empty", guide: "empty", media: "empty" },
      },
    });

    await KoshaService.searchLaws("tank welding", profile);

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "kosha-law-guides",
        timeoutMs: 120000,
      }),
    );
  });

  it("keeps storage source fields as-is", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      lawItems: [
        {
          id: "law-storage-1",
          type: "law",
          sourceBadge: "법령",
          title: "제27조 폭발 위험 작업",
          relevanceScore: 94,
          summaryBullets: ["조치 요구사항"],
          keywords: ["폭발/화재"],
          sourceType: "storage",
          legalBasis: "산업안전보건기준에 관한 규칙 제27조",
          articleNumber: "제27조",
        },
      ],
      guideItems: [],
      mediaItems: [],
      actionItems: [],
      meta: {
        sourceCounts: { api: 0, db: 0, storage: 1 },
        trackCounts: { law: 1, guide: 0, media: 0 },
        trackStatus: { law: "success", guide: "empty", media: "empty" },
      },
    });

    const result = await KoshaService.searchLaws("tank welding", profile);
    expect(result.status).toBe("success");
    expect(result.lawItems?.[0]?.sourceType).toBe("storage");
    expect(result.lawGuideMeta?.sourceCounts.storage).toBe(1);
  });
});
