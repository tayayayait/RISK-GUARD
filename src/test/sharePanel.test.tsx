import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAssessment } from "@/contexts/AssessmentContext";
import { SharePanel } from "@/components/assessment/SharePanel";
import { createMockAssessment } from "@/data/mockData";
import type { AssessmentShareRecord } from "@/types/assessment";

vi.mock("@/contexts/AssessmentContext", () => ({
  useAssessment: vi.fn(),
}));

const toastMock = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
  useToast: () => ({ toast: (...args: unknown[]) => toastMock(...args) }),
}));

function mount({
  shareRecords = [] as AssessmentShareRecord[],
  persistedId = "assessment-uuid",
}: { shareRecords?: AssessmentShareRecord[]; persistedId?: string } = {}) {
  const addShareRecord = vi.fn(async () => undefined);
  const removeShareRecord = vi.fn(async () => undefined);

  vi.mocked(useAssessment).mockReturnValue({
    assessment: { ...createMockAssessment(), shareRecords, persistedId },
    addShareRecord,
    removeShareRecord,
  } as never);

  render(<SharePanel />);
  return { addShareRecord, removeShareRecord };
}

describe("SharePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("실시 후 공유 기록이 없으면 경고를 보여준다", () => {
    mount();

    expect(screen.getByTestId("share-after-warning")).toBeInTheDocument();
  });

  it("공유 시점·방법·대상과 함께 기록을 추가한다", async () => {
    const { addShareRecord } = mount();

    fireEvent.change(screen.getByLabelText("공유 시점"), { target: { value: "before" } });
    fireEvent.change(screen.getByLabelText("공유 방법"), { target: { value: "education" } });
    fireEvent.change(screen.getByLabelText("공유 대상"), { target: { value: "도장반 12명" } });
    fireEvent.change(screen.getByLabelText("공유 내용"), { target: { value: "평가 일정 안내" } });
    fireEvent.click(screen.getByTestId("share-add"));

    await waitFor(() => {
      expect(addShareRecord).toHaveBeenCalledWith({
        phase: "before",
        method: "education",
        content: "평가 일정 안내",
        audienceNote: "도장반 12명",
      });
    });
  });

  it("내용이 비어 있으면 저장하지 않는다", async () => {
    const { addShareRecord } = mount();

    fireEvent.click(screen.getByTestId("share-add"));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
    expect(addShareRecord).not.toHaveBeenCalled();
  });

  it("평가가 저장되기 전에는 기록 버튼을 막는다", () => {
    mount({ persistedId: "" });

    expect(screen.getByTestId("share-add")).toBeDisabled();
  });

  it("기록된 공유 이력을 목록으로 보여주고 삭제할 수 있다", async () => {
    const record: AssessmentShareRecord = {
      id: "share-1",
      phase: "after",
      method: "posting",
      sharedAt: "2026-04-14T00:00:00.000Z",
      audienceNote: "도장반 12명",
      content: "위험성 결정 결과 게시",
    };
    const { removeShareRecord } = mount({ shareRecords: [record] });

    expect(screen.queryByTestId("share-after-warning")).not.toBeInTheDocument();
    expect(screen.getByText("위험성 결정 결과 게시")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("공유 기록 삭제"));

    await waitFor(() => {
      expect(removeShareRecord).toHaveBeenCalledWith("share-1");
    });
  });
});
