import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatHistoryPanel } from "@/components/qa/ChatHistoryPanel";
import type { SafetyQaSessionSummary } from "@/types/safetyQa";

describe("ChatHistoryPanel", () => {
  const mockSessions: SafetyQaSessionSummary[] = [
    {
      id: "1",
      sessionId: "session-scaffold",
      title: "달비계 작업 시 추락 방지 기준",
      lastAnswerMode: "grounded",
      createdAt: "2026-08-19T08:00:00Z",
      updatedAt: "2026-08-19T08:05:00Z",
      messageCount: 2,
    },
    {
      id: "2",
      sessionId: "session-semicon",
      title: "반도체 공정 작업 안전 수칙",
      lastAnswerMode: "guidance",
      createdAt: "2026-08-19T07:00:00Z",
      updatedAt: "2026-08-19T07:10:00Z",
      messageCount: 4,
    },
  ];

  it("대화 목록과 새 대화 버튼이 정상적으로 렌더링된다", () => {
    const onSelect = vi.fn();
    const onNewChat = vi.fn();
    const onDelete = vi.fn();

    render(
      <ChatHistoryPanel
        sessions={mockSessions}
        currentSessionId="session-scaffold"
        onSelectSession={onSelect}
        onNewChat={onNewChat}
        onDeleteSession={onDelete}
      />
    );

    expect(screen.getByText("새 대화 시작")).toBeInTheDocument();
    expect(screen.getByText("대화 목록 (2)")).toBeInTheDocument();
    expect(screen.getByText("달비계 작업 시 추락 방지 기준")).toBeInTheDocument();
    expect(screen.getByText("반도체 공정 작업 안전 수칙")).toBeInTheDocument();
    expect(screen.getByText("법령인용")).toBeInTheDocument();
    expect(screen.getByText("안전가이드")).toBeInTheDocument();
  });

  it("새 대화 시작 버튼 클릭 시 onNewChat 콜백이 실행된다", () => {
    const onNewChat = vi.fn();

    render(
      <ChatHistoryPanel
        sessions={mockSessions}
        currentSessionId="session-scaffold"
        onSelectSession={vi.fn()}
        onNewChat={onNewChat}
        onDeleteSession={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("새 대화 시작"));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it("세션 항목 클릭 시 onSelectSession이 sessionId와 함께 호출된다", () => {
    const onSelect = vi.fn();

    render(
      <ChatHistoryPanel
        sessions={mockSessions}
        currentSessionId="session-scaffold"
        onSelectSession={onSelect}
        onNewChat={vi.fn()}
        onDeleteSession={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("반도체 공정 작업 안전 수칙"));
    expect(onSelect).toHaveBeenCalledWith("session-semicon");
  });

  it("삭제 버튼 클릭 시 onDeleteSession이 호출된다", () => {
    const onDelete = vi.fn();

    render(
      <ChatHistoryPanel
        sessions={mockSessions}
        currentSessionId="session-scaffold"
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteSession={onDelete}
      />
    );

    const deleteButtons = screen.getAllByRole("button", { name: /삭제/i });
    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith("session-scaffold", expect.any(Object));
  });

  it("세션이 없을 때 빈 상태 안내가 표시된다", () => {
    render(
      <ChatHistoryPanel
        sessions={[]}
        currentSessionId={null}
        onSelectSession={vi.fn()}
        onNewChat={vi.fn()}
        onDeleteSession={vi.fn()}
      />
    );

    expect(screen.getByText("저장된 대화가 없습니다.")).toBeInTheDocument();
  });
});
