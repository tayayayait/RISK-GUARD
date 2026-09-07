import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentProvider, useAssessment } from "@/contexts/AssessmentContext";
import { RiskAssessmentStoreService } from "@/services/riskAssessmentStoreService";
import { createMockAssessment } from "@/data/mockData";
import type { AssessmentData } from "@/types/assessment";

vi.mock("@/services/riskAssessmentStoreService", () => ({
  RiskAssessmentStoreService: {
    upsert: vi.fn(),
    patchRow: vi.fn(),
    addParticipant: vi.fn(),
    removeParticipant: vi.fn(),
    addShareRecord: vi.fn(),
    removeShareRecord: vi.fn(),
  },
}));

function buildAssessment(): AssessmentData {
  return {
    ...createMockAssessment(),
    status: "analysis_ready",
    currentStep: "analysis",
    riskRows: [
      {
        workProcess: "외벽 도장",
        category: "추락",
        cause: "발판 미고정",
        hazardFactor: "추락",
        legalBasis: "",
        currentMeasure: "안전대 착용",
        frequency: 3,
        severity: 4,
        riskLevel: "12(보통)",
        reductionMeasure: "안전난간 설치",
      },
    ],
  };
}

let harness: ReturnType<typeof useAssessment>;

function Harness() {
  harness = useAssessment();
  return (
    <div>
      <span data-testid="save-status">{harness.assessment?.saveState.status ?? "none"}</span>
      <span data-testid="persisted-id">{harness.assessment?.persistedId ?? ""}</span>
      <span data-testid="post-risk">{harness.assessment?.riskRows[0]?.postRiskLevel ?? ""}</span>
    </div>
  );
}

function renderHarness() {
  return render(
    <AssessmentProvider>
      <Harness />
    </AssessmentProvider>,
  );
}

describe("AssessmentContext 저장", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it("저장에 성공해야만 saved 상태가 된다", async () => {
    vi.mocked(RiskAssessmentStoreService.upsert).mockResolvedValue({
      id: "11111111-2222-3333-4444-555555555555",
      updatedAt: "2026-08-19T10:00:00.000Z",
    } as never);

    renderHarness();

    act(() => {
      harness.setAssessment(buildAssessment());
    });
    act(() => {
      harness.updateRiskRow(0, { responsiblePerson: "김안전" });
    });

    expect(screen.getByTestId("save-status").textContent).toBe("saving");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    await waitFor(() => {
      expect(screen.getByTestId("save-status").textContent).toBe("saved");
    });
    expect(screen.getByTestId("persisted-id").textContent).toBe("11111111-2222-3333-4444-555555555555");
    expect(RiskAssessmentStoreService.upsert).toHaveBeenCalledTimes(1);
  });

  it("저장에 실패하면 saved로 표시하지 않는다", async () => {
    vi.mocked(RiskAssessmentStoreService.upsert).mockRejectedValue(
      new Error("RISK_ASSESSMENT_STORE_BACKEND_UNAVAILABLE"),
    );

    renderHarness();

    act(() => {
      harness.setAssessment(buildAssessment());
    });
    act(() => {
      harness.updateRiskRow(0, { responsiblePerson: "김안전" });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    await waitFor(() => {
      expect(screen.getByTestId("save-status").textContent).toBe("error");
    });
    expect(screen.getByTestId("persisted-id").textContent).toBe("");
  });

  it("행 편집 시 개선 후 위험성을 다시 계산한다", async () => {
    vi.mocked(RiskAssessmentStoreService.upsert).mockResolvedValue({
      id: "11111111-2222-3333-4444-555555555555",
      updatedAt: "2026-08-19T10:00:00.000Z",
    } as never);

    renderHarness();

    act(() => {
      harness.setAssessment(buildAssessment());
    });
    act(() => {
      harness.updateRiskRow(0, { postFrequency: 1, postSeverity: 2 });
    });

    expect(screen.getByTestId("post-risk").textContent).toBe("2(낮음)");
  });

  it("저장 전에는 참여자를 추가할 수 없다", async () => {
    renderHarness();

    act(() => {
      harness.setAssessment(buildAssessment());
    });

    await expect(
      harness.addParticipant({ name: "박근로", role: "worker", method: "site_patrol" }),
    ).rejects.toThrow("ASSESSMENT_NOT_SAVED");

    expect(RiskAssessmentStoreService.addParticipant).not.toHaveBeenCalled();
  });

  it("저장된 평가에는 참여자와 공유 기록을 추가한다", async () => {
    vi.mocked(RiskAssessmentStoreService.upsert).mockResolvedValue({
      id: "11111111-2222-3333-4444-555555555555",
      updatedAt: "2026-08-19T10:00:00.000Z",
    } as never);
    vi.mocked(RiskAssessmentStoreService.addParticipant).mockResolvedValue({
      id: "p-1",
      name: "박근로",
      role: "worker_representative",
      affiliation: "",
      method: "site_patrol",
      participatedAt: "",
      note: "",
    });
    vi.mocked(RiskAssessmentStoreService.addShareRecord).mockResolvedValue({
      id: "s-1",
      phase: "after",
      method: "posting",
      sharedAt: "2026-08-19T10:00:00.000Z",
      audienceNote: "",
      content: "결과 게시",
      recordedBy: "",
    });

    renderHarness();

    act(() => {
      harness.setAssessment(buildAssessment());
    });
    act(() => {
      harness.updateRiskRow(0, { responsiblePerson: "김안전" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    await act(async () => {
      await harness.addParticipant({
        name: "박근로",
        role: "worker_representative",
        method: "site_patrol",
      });
      await harness.addShareRecord({ phase: "after", method: "posting", content: "결과 게시" });
    });

    expect(harness.assessment?.participants).toHaveLength(1);
    expect(harness.assessment?.participants[0].role).toBe("worker_representative");
    expect(harness.assessment?.shareRecords).toHaveLength(1);
    expect(harness.assessment?.shareRecords[0].phase).toBe("after");
  });

  it("재시도는 실패한 저장을 다시 시도한다", async () => {
    vi.mocked(RiskAssessmentStoreService.upsert)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        id: "11111111-2222-3333-4444-555555555555",
        updatedAt: "2026-08-19T10:00:00.000Z",
      } as never);

    renderHarness();

    act(() => {
      harness.setAssessment(buildAssessment());
    });
    act(() => {
      harness.updateRiskRow(0, { responsiblePerson: "김안전" });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    await waitFor(() => {
      expect(screen.getByTestId("save-status").textContent).toBe("error");
    });

    await act(async () => {
      await harness.retrySave();
    });

    await waitFor(() => {
      expect(screen.getByTestId("save-status").textContent).toBe("saved");
    });
    expect(RiskAssessmentStoreService.upsert).toHaveBeenCalledTimes(2);
  });
});
