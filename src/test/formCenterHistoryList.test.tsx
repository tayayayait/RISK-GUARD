import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FormCenter from "@/pages/FormCenter";
import { FormHistoryService } from "@/services/formHistoryService";

vi.mock("@/services/formHistoryService", () => ({
  FormHistoryService: {
    listHistoryRecords: vi.fn(),
    deleteHistoryRecord: vi.fn(),
  },
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/forms/FormCard", () => ({
  FormCard: ({ title, href }: { title: string; href: string }) => <a href={href}>{title}</a>,
}));

describe("FormCenter history list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("기록은 기본 접힘 상태이며 토글 클릭 시 목록을 로드한다", async () => {
    vi.mocked(FormHistoryService.listHistoryRecords).mockResolvedValue([
      {
        id: "history-abc",
        formType: "risk-assessment",
        taskName: "지게차 상차 작업",
        siteName: "A현장",
        workDate: "2026-04-12",
        createdAt: "2026-04-12T09:00:00.000Z",
        expiresAt: "2026-05-12T09:00:00.000Z",
        rowCount: 2,
      },
    ]);

    render(
      <MemoryRouter>
        <FormCenter />
      </MemoryRouter>,
    );

    expect(FormHistoryService.listHistoryRecords).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("history-toggle-button"));

    await waitFor(() => {
      expect(FormHistoryService.listHistoryRecords).toHaveBeenCalledTimes(1);
    });

    const taskName = screen.getByText("지게차 상차 작업");
    const link = taskName.closest("a");
    expect(link).toBeTruthy();
    expect(link).toHaveAttribute("href", "/forms/risk-assessment?historyId=history-abc");
  });

  it("필터 클릭 시 위험성평가 기록서/산업재해조사표를 분리 표시한다", async () => {
    vi.mocked(FormHistoryService.listHistoryRecords).mockResolvedValue([
      {
        id: "history-risk",
        formType: "risk-assessment",
        taskName: "위험성평가 A",
        siteName: "현장 A",
        workDate: "2026-04-12",
        createdAt: "2026-04-12T09:00:00.000Z",
        expiresAt: "2026-05-12T09:00:00.000Z",
        rowCount: 2,
      },
      {
        id: "history-accident",
        formType: "accident-report",
        taskName: "사고조사 B",
        siteName: "현장 B",
        workDate: "2026-04-13",
        createdAt: "2026-04-13T09:00:00.000Z",
        expiresAt: "2026-05-13T09:00:00.000Z",
        rowCount: 0,
      },
    ]);

    render(
      <MemoryRouter>
        <FormCenter />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("history-toggle-button"));

    await waitFor(() => {
      expect(screen.getByText("위험성평가 A")).toBeInTheDocument();
      expect(screen.getByText("사고조사 B")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("history-filter-risk"));
    expect(screen.getByText("위험성평가 A")).toBeInTheDocument();
    expect(screen.queryByText("사고조사 B")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("history-filter-accident"));
    const accidentLink = screen.getByText("사고조사 B").closest("a");
    expect(accidentLink).toHaveAttribute("href", "/forms/accident-report?historyId=history-accident");
    expect(screen.queryByText("위험성평가 A")).not.toBeInTheDocument();
  });

  it("기록 삭제 버튼 클릭 시 해당 항목을 목록에서 제거한다", async () => {
    vi.mocked(FormHistoryService.listHistoryRecords).mockResolvedValue([
      {
        id: "history-a",
        formType: "risk-assessment",
        taskName: "A 기록",
        siteName: "현장 A",
        workDate: "2026-04-12",
        createdAt: "2026-04-12T09:00:00.000Z",
        expiresAt: "2026-05-12T09:00:00.000Z",
        rowCount: 1,
      },
      {
        id: "history-b",
        formType: "risk-assessment",
        taskName: "B 기록",
        siteName: "현장 B",
        workDate: "2026-04-12",
        createdAt: "2026-04-12T09:00:00.000Z",
        expiresAt: "2026-05-12T09:00:00.000Z",
        rowCount: 2,
      },
    ]);
    vi.mocked(FormHistoryService.deleteHistoryRecord).mockResolvedValue();

    render(
      <MemoryRouter>
        <FormCenter />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("history-toggle-button"));

    await waitFor(() => {
      expect(FormHistoryService.listHistoryRecords).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("A 기록")).toBeInTheDocument();
    expect(screen.getByText("B 기록")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("history-delete-history-a"));

    await waitFor(() => {
      expect(FormHistoryService.deleteHistoryRecord).toHaveBeenCalledWith("history-a");
    });

    expect(screen.queryByText("A 기록")).not.toBeInTheDocument();
    expect(screen.getByText("B 기록")).toBeInTheDocument();
  });
});
