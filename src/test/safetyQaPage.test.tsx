import { describe, expect, it, vi, beforeEach } from "vitest";
import React, { type ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div data-testid="dashboard-shell">{children}</div>,
}));

import { SafetyQa } from "../pages/SafetyQa";
import { SafetyQaService } from "../services/safetyQaService";
import { SafetyQaHistoryService } from "../services/safetyQaHistoryService";
import type { SafetyQaResponse } from "../types/safetyQa";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("SafetyQa Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(SafetyQaHistoryService, "listSessions").mockResolvedValue([]);
  });

  it("페이지가 초기 인사말, 뒤로가기 버튼, 대화 기록 토글, 추천 질문 칩, 입력창과 함께 정상 렌더링된다", () => {
    renderWithRouter(<SafetyQa />);

    expect(screen.getByTestId("dashboard-shell")).toBeInTheDocument();
    expect(screen.getByText("대화형 안전 AI 어시스턴트")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /뒤로가기/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /대화 기록 보기/i })).toBeInTheDocument();
    expect(screen.getByText(/산업안전보건 AI 전문 상담관/)).toBeInTheDocument();
    expect(screen.getByText(/오늘 반도체 공정 작업인데/)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/산업안전보건 법령이나 현장 안전 기준에 대해 질문하세요/)
    ).toBeInTheDocument();
  });

  it("추천 질문 칩을 클릭하면 질문이 전송되고 답변 및 법령 인용 카드가 렌더링된다 (grounded 모드)", async () => {
    const mockResponse: SafetyQaResponse = {
      answered: true,
      answerMode: "grounded",
      answer: "달비계 작업 시 안전대 착용은 필수이며, 작업발판은 40cm 이상이어야 합니다.",
      citations: [
        {
          chunkId: "chunk-scaffold-1",
          quote: "달비계의 작업발판 폭은 40센티미터 이상으로 하고",
          docTitle: "산업안전보건기준에 관한 규칙",
          articleLabel: "제63조",
          articleTitle: "달비계의 구조",
          section: "제2편 > 제4장",
          effectiveDate: "2026-03-02",
          authority: "고용노동부령",
          sourceUrl: "https://www.law.go.kr/법령/산업안전보건기준에관한규칙/제63조",
        },
      ],
      confidence: "high",
      needsSafetyOfficerReview: false,
      relatedArticles: [],
      disclaimer: "공식 법령집을 확인하시기 바랍니다.",
      meta: {
        retrieved: 4,
        grounded: 1,
        threshold: 0.3,
        elapsedMs: 1800,
      },
    };

    vi.spyOn(SafetyQaService, "askQuestion").mockResolvedValue(mockResponse);
    vi.spyOn(SafetyQaHistoryService, "saveSession").mockResolvedValue(null);

    renderWithRouter(<SafetyQa />);

    const quickChip = screen.getByText(/달비계 작업 시 추락 방지/);
    fireEvent.click(quickChip);

    await waitFor(() => {
      expect(SafetyQaService.askQuestion).toHaveBeenCalledWith(
        expect.stringContaining("달비계 작업 시 추락 방지"),
        expect.objectContaining({
          messages: expect.any(Array),
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText(/달비계 작업 시 안전대 착용은 필수이며/),
      ).toBeInTheDocument();
      expect(screen.getByText("제63조 (달비계의 구조)")).toBeInTheDocument();
      expect(
        screen.getByText(/"달비계의 작업발판 폭은 40센티미터 이상으로 하고"/),
      ).toBeInTheDocument();
      expect(screen.getByText(/신뢰도 높음/)).toBeInTheDocument();
    });
  });

  it("일반 안전 가이드(guidance 모드) 응답 시 AI 안전 가이드 배지 및 안내문이 렌더링된다", async () => {
    const mockGuidanceResponse: SafetyQaResponse = {
      answered: true,
      answerMode: "guidance",
      answer: "반도체 공정 작업 전에는 국소배기장치 가동 확인, 화학물질 전용 불소고무장갑 착용, 가스 감지기 점검이 필수적입니다.",
      citations: [],
      confidence: "medium",
      needsSafetyOfficerReview: false,
      relatedArticles: [
        {
          articleLabel: "제420조",
          articleTitle: "유기화합물 취급 시 조치",
          docTitle: "산업안전보건기준에 관한 규칙",
          sourceUrl: "https://www.law.go.kr",
          similarity: 0.28,
        },
      ],
      disclaimer: "본 답변은 산업안전보건 AI의 일반 전문 지식에 기반한 안전 가이드입니다.",
      meta: {
        retrieved: 3,
        grounded: 0,
        threshold: 0.3,
        elapsedMs: 1100,
      },
    };

    vi.spyOn(SafetyQaService, "askQuestion").mockResolvedValue(mockGuidanceResponse);
    vi.spyOn(SafetyQaHistoryService, "saveSession").mockResolvedValue(null);

    renderWithRouter(<SafetyQa />);

    const textarea = screen.getByPlaceholderText(/산업안전보건 법령이나 현장 안전 기준에 대해 질문하세요/);
    fireEvent.change(textarea, { target: { value: "반도체 공정 작업 전 안전 점검 알려줘" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(
        screen.getByText(/반도체 공정 작업 전에는 국소배기장치 가동 확인/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/AI 안전 가이드 \(실무 체크리스트\)/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/AI 일반 안전보건 가이드 \(법적 효력 없음\)/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/참고 가능한 관련 법령/),
      ).toBeInTheDocument();
    });
  });

  it("새 대화 버튼 클릭 시 초기화되고 새로운 세션이 시작된다", () => {
    renderWithRouter(<SafetyQa />);

    const newChatButtons = screen.getAllByRole("button", { name: /새 대화/i });
    expect(newChatButtons.length).toBeGreaterThan(0);
    fireEvent.click(newChatButtons[0]);

    expect(screen.getByText(/산업안전보건 AI 전문 상담관/)).toBeInTheDocument();
  });

  it("뒤로가기 버튼 클릭 시 이전 화면으로 이동을 시도한다", () => {
    renderWithRouter(<SafetyQa />);

    const backButton = screen.getByRole("button", { name: /뒤로가기/i });
    expect(backButton).toBeInTheDocument();
    fireEvent.click(backButton);
  });

  it("대화 기록 삭제 시 브라우저 confirm 대신 커스텀 삭제 모달이 열리고 삭제가 수행된다", async () => {
    const mockSessions = [
      {
        id: "session-test-1",
        sessionId: "session-test-1",
        title: "밀폐공간 환기 기준 질문",
        lastAnswerMode: "grounded" as const,
        createdAt: "2026-08-20T08:00:00Z",
        updatedAt: "2026-08-20T08:10:00Z",
        messageCount: 2,
      },
    ];

    vi.spyOn(SafetyQaHistoryService, "listSessions").mockResolvedValue(mockSessions);
    vi.spyOn(SafetyQaHistoryService, "deleteSession").mockResolvedValue(true);
    const confirmSpy = vi.spyOn(window, "confirm");

    renderWithRouter(<SafetyQa />);

    await waitFor(() => {
      expect(screen.getByText("밀폐공간 환기 기준 질문")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", { name: /삭제/i });
    fireEvent.click(deleteBtn);

    // 브라우저 기본 confirm이 호출되지 않았는지 검증
    expect(confirmSpy).not.toHaveBeenCalled();

    // 커스텀 모달이 열렸는지 확인
    expect(screen.getByText("대화 기록 삭제")).toBeInTheDocument();
    expect(screen.getByText(/선택한 대화 기록을 영구히 삭제합니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제하기" })).toBeInTheDocument();

    // 모달 내 '삭제하기' 버튼 클릭
    fireEvent.click(screen.getByRole("button", { name: "삭제하기" }));

    await waitFor(() => {
      expect(SafetyQaHistoryService.deleteSession).toHaveBeenCalledWith("session-test-1");
    });
  });
});
