import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatResetDialog } from "@/components/qa/ChatResetDialog";

describe("ChatResetDialog Component", () => {
  it("초기화 확인 모달이 정상 렌더링되고 확인 버튼 클릭 시 onConfirm이 호출된다", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ChatResetDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("현재 대화 초기화")).toBeInTheDocument();
    expect(screen.getByText(/진행 중인 대화를 초기화하고/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "초기화하기" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "초기화하기" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
