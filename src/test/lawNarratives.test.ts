import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFallbackNarratives,
  generateLawNarratives,
  parseNarrativeResponse,
} from "../../supabase/functions/_shared/law-narratives.ts";

const baseInput = {
  taskName: "화약 하차 작업",
  taskDescription: "윙바디 차량 적재함에서 화약을 굴착기 버켓으로 옮기는 작업이다.",
  analysisScenario: "바닥 암석을 밟고 미끄러져 절개면 아래로 추락한 사고가 발생했다.",
  profile: {
    industry: "건설업",
    workLocation: "절개면 인접 작업구역",
    equipment: ["굴착기", "윙바디 차량"],
    hazards: [
      { name: "추락", type: "추락", weight: 40 },
      { name: "폭발", type: "폭발", weight: 32 },
    ],
  },
  lawItems: [
    {
      id: "law-1",
      title: "산업안전보건기준에 관한 규칙",
      legalBasis: "산업안전보건기준에 관한 규칙 제20조",
      articleNumber: "제20조",
      articleTitle: "출입의 금지 등",
      clausePreview: "관계 근로자가 아닌 사람의 출입을 금지해야 한다.",
      summaryBullets: ["출입 통제", "위험구역 격리"],
      applicationPoints: ["출입 통제", "위험구역 격리"],
    },
  ],
  actionItems: [
    {
      id: "action-1",
      stage: "immediate" as const,
      actionText: "위험구역을 즉시 통제하고 작업을 중지해야 합니다.",
      articleNumbers: ["제20조"],
      articleTitle: "출입의 금지 등",
      legalBasis: "산업안전보건기준에 관한 규칙 제20조",
      lawName: "산업안전보건기준에 관한 규칙",
      legalRequirement: "관계 근로자가 아닌 사람의 출입을 금지해야 한다.",
      clausePreview: "위험구역 통제 및 출입 금지",
    },
  ],
};

function mockGeminiPayload(body: unknown) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(body) }],
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("law narratives", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses valid AI JSON payload from code fence", () => {
    const parsed = parseNarrativeResponse([
      "```json",
      JSON.stringify({
        evidenceNarratives: [{ id: "law-1", applicabilityReason: "적용 배경 문장입니다." }],
        actionNarratives: [{ id: "action-1", actionNeedReason: "즉시 조치가 필요한 이유입니다." }],
      }),
      "```",
    ].join("\n"));

    expect(parsed).not.toBeNull();
    expect(parsed?.evidenceNarratives?.[0]?.id).toBe("law-1");
    expect(parsed?.actionNarratives?.[0]?.id).toBe("action-1");
  });

  it("returns null for invalid JSON payload", () => {
    const parsed = parseNarrativeResponse("not-a-json-response");
    expect(parsed).toBeNull();
  });

  it("builds non-empty fallback narratives with complete sentence endings", () => {
    const fallback = buildFallbackNarratives(baseInput);

    const evidence = fallback.evidenceById["law-1"];
    const action = fallback.actionById["action-1"];

    expect(evidence?.applicabilityReason).toBeTruthy();
    expect(evidence?.keyExcerpt).toBeTruthy();
    expect(evidence?.summaryArticle).toBeTruthy();
    expect(action?.actionNeedReason).toBeTruthy();
    expect(action?.applicabilityReason).toBeTruthy();
    expect(action?.summaryArticle).toBeTruthy();
    expect((evidence?.keyExcerpt ?? "").includes("...")).toBe(false);
    expect((action?.actionNeedReason ?? "").includes("...")).toBe(false);
    expect(/[.!?]$/.test(action?.actionNeedReason ?? "")).toBe(true);
  });

  it("keeps fallback values when AI response omits fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockGeminiPayload({
        evidenceNarratives: [{ id: "law-1", applicabilityReason: "AI 적용 배경입니다." }],
        actionNarratives: [{ id: "action-1", actionNeedReason: "즉시 조치가 필요한 이유입니다." }],
      }),
    );

    const result = await generateLawNarratives({
      ...baseInput,
      geminiApiKey: "test-key",
      timeoutMs: 2000,
    });

    expect(result.source).toBe("ai");
    expect(result.evidenceById["law-1"]?.applicabilityReason).toBeTruthy();
    expect(/[.!?]$/.test(result.evidenceById["law-1"]?.applicabilityReason ?? "")).toBe(true);
    expect(result.evidenceById["law-1"]?.keyExcerpt).toBeTruthy();
    expect(result.evidenceById["law-1"]?.summaryArticle).toBeTruthy();
    expect(result.actionById["action-1"]?.actionNeedReason).toBeTruthy();
    expect(result.actionById["action-1"]?.applicabilityReason).toBeTruthy();
    expect(result.actionById["action-1"]?.applicabilityReason).toContain("즉시 단계");
    expect(result.actionById["action-1"]?.keyExcerpt).toContain("즉시 단계");
    expect(result.actionById["action-1"]?.summaryArticle).toContain("즉시 단계");
    expect(result.actionById["action-1"]?.summaryArticle).toBeTruthy();
  });

  it("replaces incomplete sentence endings with stage/action anchored fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockGeminiPayload({
        evidenceNarratives: [
          {
            id: "law-1",
            applicabilityReason: "현장 적용 여부",
            keyExcerpt: "점검 및",
            summaryArticle: "작업 절차 확인 등",
          },
        ],
        actionNarratives: [
          {
            id: "action-1",
            actionNeedReason: "즉시 조치 이행 여부",
            applicabilityReason: "위험 통제 여부",
            keyExcerpt: "현장 기준 적용 및",
            summaryArticle: "확인 절차 점검 등",
          },
        ],
      }),
    );

    const result = await generateLawNarratives({
      ...baseInput,
      geminiApiKey: "test-key",
      timeoutMs: 2000,
    });

    const awkwardEnding = /(및|등|여부|또는|으로|하여|하고|같은|수 있는)\.?$/;
    const action = result.actionById["action-1"];
    const evidence = result.evidenceById["law-1"];

    expect(action?.actionNeedReason).toBeTruthy();
    expect(action?.actionNeedReason ?? "").not.toMatch(awkwardEnding);
    expect(action?.applicabilityReason ?? "").not.toMatch(awkwardEnding);
    expect(action?.keyExcerpt ?? "").not.toMatch(awkwardEnding);
    expect(action?.summaryArticle ?? "").not.toMatch(awkwardEnding);
    expect(/[.!?]$/.test(action?.actionNeedReason ?? "")).toBe(true);
    expect(/[.!?]$/.test(evidence?.applicabilityReason ?? "")).toBe(true);
  });

  it("splits similar evidence narratives by article when different clauses receive duplicate text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockGeminiPayload({
        evidenceNarratives: [
          {
            id: "law-1",
            applicabilityReason: "이 조문은 작업 위험 통제에 직접 적용됩니다.",
            keyExcerpt: "핵심 의미는 작업 전 위험원 차단과 점검을 요구하는 것입니다.",
            summaryArticle: "현장에서는 작업 전 확인과 작업 중 통제를 순서대로 수행해야 합니다.",
          },
          {
            id: "law-2",
            applicabilityReason: "이 조문은 작업 위험 통제에 직접 적용됩니다.",
            keyExcerpt: "핵심 의미는 작업 전 위험원 차단과 점검을 요구하는 것입니다.",
            summaryArticle: "현장에서는 작업 전 확인과 작업 중 통제를 순서대로 수행해야 합니다.",
          },
        ],
      }),
    );

    const result = await generateLawNarratives({
      ...baseInput,
      lawItems: [
        ...baseInput.lawItems,
        {
          ...baseInput.lawItems[0],
          id: "law-2",
          legalBasis: "산업안전보건기준에 관한 규칙 제28조",
          articleNumber: "제28조",
          articleTitle: "점화원 관리",
          clausePreview: "점화원 관리와 환기 상태를 점검해야 한다.",
          applicationPoints: ["점화원 관리", "환기 점검"],
        },
      ],
      actionItems: [
        ...baseInput.actionItems,
        {
          ...baseInput.actionItems[0],
          id: "action-2",
          articleNumbers: ["제28조"],
          legalBasis: "산업안전보건기준에 관한 규칙 제28조",
          legalRequirement: "점화원 관리와 환기 상태를 점검해야 한다.",
        },
      ],
      geminiApiKey: "test-key",
      timeoutMs: 2000,
    });

    const evidence1 = result.evidenceById["law-1"];
    const evidence2 = result.evidenceById["law-2"];

    expect(evidence1?.keyExcerpt).toBeTruthy();
    expect(evidence2?.keyExcerpt).toBeTruthy();
    expect(evidence1?.keyExcerpt).not.toEqual(evidence2?.keyExcerpt);
    expect(`${evidence2?.applicabilityReason ?? ""} ${evidence2?.keyExcerpt ?? ""}`).toContain("제28조");
  });

  it("replaces duplicated AI actionNeedReason with stage-aware fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockGeminiPayload({
        actionNarratives: [
          { id: "action-1", actionNeedReason: "동일 문장입니다." },
          { id: "action-2", actionNeedReason: "동일 문장입니다." },
        ],
      }),
    );

    const result = await generateLawNarratives({
      ...baseInput,
      actionItems: [
        ...baseInput.actionItems,
        {
          ...baseInput.actionItems[0],
          id: "action-2",
          stage: "pre_resume",
          actionText: "작업 재개 전 허용 조건을 확인해야 합니다.",
          legalRequirement: "재개 승인 전 확인 절차를 완료해야 한다.",
        },
      ],
      geminiApiKey: "test-key",
      timeoutMs: 2000,
    });

    const reason1 = result.actionById["action-1"]?.actionNeedReason ?? "";
    const reason2 = result.actionById["action-2"]?.actionNeedReason ?? "";

    expect(reason1).toBeTruthy();
    expect(reason2).toBeTruthy();
    expect(reason1).not.toEqual(reason2);
    expect(reason2).toContain("재개");
  });

  it("rebuilds action narrative fields when section texts are duplicated and stage context is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockGeminiPayload({
        actionNarratives: [
          {
            id: "action-1",
            actionNeedReason: "위험을 점검해야 합니다.",
            applicabilityReason: "위험을 점검해야 합니다.",
            keyExcerpt: "위험을 점검해야 합니다.",
            summaryArticle: "위험을 점검해야 합니다.",
          },
        ],
      }),
    );

    const result = await generateLawNarratives({
      ...baseInput,
      geminiApiKey: "test-key",
      timeoutMs: 2000,
    });

    const action = result.actionById["action-1"];
    expect(action?.actionNeedReason).toContain("즉시 단계");
    expect(action?.applicabilityReason).toContain("즉시 단계");
    expect(action?.keyExcerpt).toContain("즉시 단계");
    expect(action?.summaryArticle).toContain("즉시 단계");
    expect(new Set([
      action?.applicabilityReason ?? "",
      action?.keyExcerpt ?? "",
      action?.summaryArticle ?? "",
    ]).size).toBe(3);
  });

  it("falls back when AI request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream error", { status: 500 }),
    );

    const result = await generateLawNarratives({
      ...baseInput,
      geminiApiKey: "test-key",
      timeoutMs: 1500,
    });

    expect(result.source).toBe("fallback");
    expect(result.evidenceById["law-1"]?.applicabilityReason).toBeTruthy();
    expect(result.actionById["action-1"]?.actionNeedReason).toBeTruthy();
  });

  it("builds prompt with completion and clause-specific rules", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockGeminiPayload({
        evidenceNarratives: [],
        actionNarratives: [],
      }),
    );

    await generateLawNarratives({
      ...baseInput,
      geminiApiKey: "test-key",
      timeoutMs: 2000,
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const requestBody = typeof init?.body === "string"
      ? JSON.parse(init.body) as {
        contents?: Array<{ parts?: Array<{ text?: string }> }>;
      }
      : {};
    const prompt = requestBody.contents?.[0]?.parts?.[0]?.text ?? "";

    expect(prompt).toContain("완결된 한 문장");
    expect(prompt).toContain("서로 다른 조문");
    expect(prompt).toContain("핵심 의미");
    expect(prompt).toContain("적용 배경");
    expect(prompt).toContain("현장 기준 요약");
    expect(prompt).toContain("단계명을 명시한다");
    expect(prompt).toContain("사고 원인·작업방식·위험요인");
  });
});
