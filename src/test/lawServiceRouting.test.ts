import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkProfile } from "@/types/assessment";

const { invokeBackendMock } = vi.hoisted(() => ({
  invokeBackendMock: vi.fn(),
}));

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: invokeBackendMock,
}));

const profile: WorkProfile = {
  industry: "제조업",
  workLocation: "절단 작업장",
  equipment: ["절단기"],
  hazards: [
    {
      id: "h-1",
      name: "절단 위험",
      type: "절단",
      weight: 25,
      confidence: "high",
      reason: "절단부 노출",
    },
  ],
};

function mockEmptyLawResponse() {
  invokeBackendMock.mockResolvedValue({
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
}

describe("Law service route isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockEmptyLawResponse();
  });

  it("AssessmentLawService uses evidence backend endpoint", async () => {
    const { AssessmentLawService } = await import("@/services/assessmentLawService");
    await AssessmentLawService.searchLaws("절단 작업", profile);

    expect(invokeBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "kosha-law-evidence",
        timeoutMs: 120000,
      }),
    );
  });

  it("FormLawService uses form backend endpoint by default when flag is unset", async () => {
    const { FormLawService } = await import("@/services/formLawService");
    await FormLawService.searchLaws("절단 작업", profile);

    expect(invokeBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "kosha-law-guides-form",
        timeoutMs: 120000,
      }),
    );
  });

  it("passes Gemini semantic intents to the form law backend", async () => {
    const { FormLawService } = await import("@/services/formLawService");
    const semanticIntents = [
      {
        rowIndex: 0,
        hazardType: "절단",
        accidentMechanism: "회전 절단날 접촉으로 인한 절단",
        unsafeCondition: "방호덮개 미설치",
        equipment: ["절단기"],
        searchTerms: ["절단기 방호덮개", "회전 절단날 접촉 방지"],
      },
    ];

    await FormLawService.searchLaws("절단 작업", profile, { semanticIntents });

    expect(invokeBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ semanticIntents }),
      }),
    );
  });

  it("FormLawService uses legacy endpoint when flag is false", async () => {
    vi.stubEnv("VITE_USE_FORM_LAW_BACKEND", "false");
    const { FormLawService } = await import("@/services/formLawService");
    await FormLawService.searchLaws("절단 작업", profile);

    expect(invokeBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "kosha-law-guides",
        timeoutMs: 120000,
      }),
    );
  });

  it("FormLawService uses form backend endpoint when flag is true", async () => {
    vi.stubEnv("VITE_USE_FORM_LAW_BACKEND", "true");
    const { FormLawService } = await import("@/services/formLawService");
    await FormLawService.searchLaws("절단 작업", profile);

    expect(invokeBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "kosha-law-guides-form",
        timeoutMs: 120000,
      }),
    );
  });

  it("AssessmentLawService does not fall back to legacy endpoint when evidence endpoint is unavailable", async () => {
    invokeBackendMock.mockResolvedValueOnce(null);
    const { AssessmentLawService } = await import("@/services/assessmentLawService");
    await AssessmentLawService.searchLaws("절단 작업", profile);

    expect(invokeBackendMock).toHaveBeenCalledTimes(1);
    expect(invokeBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "kosha-law-evidence",
        timeoutMs: 120000,
      }),
    );
  });

  it("FormLawService does not fall back to legacy endpoint when form endpoint is unavailable", async () => {
    invokeBackendMock.mockResolvedValueOnce(null);

    const { FormLawService } = await import("@/services/formLawService");
    await FormLawService.searchLaws("절단 작업", profile);

    expect(invokeBackendMock).toHaveBeenCalledTimes(1);
    expect(invokeBackendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "kosha-law-guides-form",
        timeoutMs: 120000,
      }),
    );
  });
});
