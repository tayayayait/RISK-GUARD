import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeatureHistoryPanel } from "@/components/history/FeatureHistoryPanel";

describe("FeatureHistoryPanel", () => {
  const item = {
    id: "history-1",
    title: "프레스 사고 예측",
    subtitle: "시나리오 3개",
    updatedAt: "2026-08-20T01:00:00.000Z",
  };

  it("이전 작업을 목록으로 표시하고 열기·삭제 동작을 전달한다", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();

    render(
      <FeatureHistoryPanel
        items={[item]}
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByText("프레스 사고 예측")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "프레스 사고 예측 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "프레스 사고 예측 삭제" }));

    expect(onOpen).toHaveBeenCalledWith(item);
    expect(onDelete).toHaveBeenCalledWith(item);
  });

  it("기록이 없을 때 안내 문구를 표시한다", () => {
    render(<FeatureHistoryPanel items={[]} onOpen={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText("저장된 작업 기록이 없습니다.")).toBeInTheDocument();
  });
});
