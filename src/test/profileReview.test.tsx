import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import ProfileReview from "@/pages/ProfileReview";
import { useAssessment, useOptionalAssessment } from "@/contexts/AssessmentContext";

vi.mock("@/contexts/AssessmentContext", () => ({
  useAssessment: vi.fn(),
  useOptionalAssessment: vi.fn(),
}));

const TEXT_CONFIRM_BUTTON = "\uBD84\uC11D \uACB0\uACFC \uD655\uC815";
const TEXT_PROGRESS = "\uC2E4\uC2DC\uAC04 \uC9C4\uD589 \uC0C1\uD0DC";
const TEXT_STAGE_PROFILE = "\uC791\uC5C5 \uD504\uB85C\uD544 \uD655\uC815";
const TEXT_STAGE_LAW = "\uBC95\uB839 \uADFC\uAC70 \uC218\uC9D1";
const TEXT_STAGE_ACTION = "\uC870\uCE58 \uD56D\uBAA9 \uAD6C\uC131";

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function clickConfirmButton() {
  const confirmButton = screen
    .getAllByRole("button")
    .find((button) => (button.textContent ?? "").includes("\uD655\uC815"));

  if (!confirmButton) {
    throw new Error("confirm button not found");
  }

  fireEvent.click(confirmButton);
}

describe("ProfileReview", () => {
  let mockContext: ReturnType<typeof useAssessment>;

  beforeEach(() => {
    const assessment = createMockAssessment();
    mockContext = {
      assessment: {
        ...assessment,
        currentStep: "profile_review",
      },
      setAssessment: vi.fn((nextAssessment) => nextAssessment),
      updateField: vi.fn(),
      currentStep: "profile_review",
      setCurrentStep: vi.fn(),
      isLoading: false,
      setIsLoading: vi.fn(),
      loadMockData: vi.fn(),
      startAnalysis: vi.fn(async () => assessment),
      confirmProfile: vi.fn(async () => undefined),
      prefetchLawGuidesForAnalysis: vi.fn(async () => undefined),
      loadEvidence: vi.fn(async () => undefined),
      reloadMaterials: vi.fn(async () => undefined),
      toggleEvidenceExcluded: vi.fn(),
      selectCitation: vi.fn(),
      selectMaterial: vi.fn(),
      generateReport: vi.fn(),
      updateReportSection: vi.fn(),
      updateChecklist: vi.fn(),
      updateBriefing: vi.fn(),
      exportReport: vi.fn(async () => ({ ok: true, message: "ok" })),
      canAccessStep: vi.fn(() => true),
      getStepRoute: vi.fn(() => "/assessments/new"),
    };

    vi.mocked(useAssessment).mockReturnValue(mockContext);
    vi.mocked(useOptionalAssessment).mockReturnValue(mockContext);
  });

  it("renders profile review layout", () => {
    render(
      <MemoryRouter>
        <ProfileReview />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: TEXT_CONFIRM_BUTTON })).toBeInTheDocument();
    expect(mockContext.setCurrentStep).not.toHaveBeenCalled();
  });

  it("shows staged loading while prefetch is pending", async () => {
    const prefetchDeferred = createDeferredPromise<void>();

    mockContext.assessment = {
      ...mockContext.assessment,
      evidenceItems: [],
      lawActionItems: [],
      lawGuideMeta: null,
      apiStatuses: {
        ...mockContext.assessment.apiStatuses,
        lawGuide: "idle",
      },
    };
    mockContext.confirmProfile = vi.fn(async () => undefined);
    mockContext.prefetchLawGuidesForAnalysis = vi.fn(() => prefetchDeferred.promise);

    vi.mocked(useAssessment).mockReturnValue(mockContext);
    vi.mocked(useOptionalAssessment).mockReturnValue(mockContext);

    render(
      <MemoryRouter>
        <ProfileReview />
      </MemoryRouter>,
    );

    await act(async () => {
      clickConfirmButton();
    });

    expect(await screen.findByText(TEXT_PROGRESS)).toBeInTheDocument();
    expect(screen.getByText(TEXT_STAGE_PROFILE)).toBeInTheDocument();
    expect(screen.getAllByText(TEXT_STAGE_LAW).length).toBeGreaterThan(0);
    expect(screen.getByText(TEXT_STAGE_ACTION)).toBeInTheDocument();

    await act(async () => {
      prefetchDeferred.resolve();
      await prefetchDeferred.promise;
    });
  });

  it("reuses existing law/action result without forcing regeneration when returning from later step", async () => {
    mockContext.assessment = {
      ...mockContext.assessment,
      currentStep: "evidence",
      status: "ready_for_report",
    };
    mockContext.confirmProfile = vi.fn(async () => undefined);
    mockContext.prefetchLawGuidesForAnalysis = vi.fn(async () => undefined);

    vi.mocked(useAssessment).mockReturnValue(mockContext);
    vi.mocked(useOptionalAssessment).mockReturnValue(mockContext);

    render(
      <MemoryRouter>
        <ProfileReview />
      </MemoryRouter>,
    );

    await act(async () => {
      clickConfirmButton();
    });

    expect(mockContext.confirmProfile).not.toHaveBeenCalled();
    expect(mockContext.prefetchLawGuidesForAnalysis).toHaveBeenCalledWith(expect.objectContaining({ force: false }));
    expect(screen.queryByText(TEXT_PROGRESS)).not.toBeInTheDocument();
  });
});
