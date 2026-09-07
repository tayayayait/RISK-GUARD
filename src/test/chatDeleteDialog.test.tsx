import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatDeleteDialog } from "@/components/qa/ChatDeleteDialog";
import type { SafetyQaSessionSummary } from "@/types/safetyQa";

describe("ChatDeleteDialog Component", () => {
  const mockSession: SafetyQaSessionSummary = {
    id: "session-1",
    sessionId: "session-1",
    title: "용접 작업 시 화재 예방 조치",
    lastAnswerMode: "grounded",
    createdAt: "2026-08-20T08:00:00Z",
    updatedAt: "2026-08-20T08:15:00Z",
    messageCount: 3,
  };

  it("모달이 열렸을 때 타이틀, 대상 세션 정보 및 경고 문구가 정상 표시된다", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ChatDeleteDialog
        open={true}
        onOpenChange={onOpenChange}
        session={mockSession}
        onConfirm={onConfirm}
        isDeleting={false}
      />
    );

    expect(screen.getByText("대화 기록 삭제")).toBeInTheDocument();
    expect(screen.getByText("용접 작업 시 화재 예방 조치")).toBeInTheDocument();
    expect(screen.getByText("법령인용")).toBeInTheDocument();
    expect(screen.getByText("메시지 3개")).toBeInTheDocument();
    expect(screen.getByText(/삭제된 대화 기록과 인용된 법령 내역은 복구할 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제하기" })).toBeInTheDocument();
  });

  it("삭제하기 버튼 클릭 시 onConfirm 콜백이 실행된다", () => {
    const onConfirm = vi.fn();

    render(
      <ChatDeleteDialog
        open={true}
        onOpenChange={vi.fn()}
        session={mockSession}
        onConfirm={onConfirm}
        isDeleting={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("삭제 중(isDeleting=true)일 때 로딩 인디케이터가 표시되고 버튼이 비활성화된다", () => {
    render(
      <ChatDeleteDialog
        open={true}
        onOpenChange={vi.fn()}
        session={mockSession}
        onConfirm={vi.fn()}
        isDeleting={true}
      />
    );

    expect(screen.getByText("삭제 중...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /삭제 중/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  });
});
