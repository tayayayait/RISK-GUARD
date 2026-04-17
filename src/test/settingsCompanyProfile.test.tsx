import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Settings from "@/pages/Settings";
import { CompanyProfileService } from "@/services/companyProfileService";

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/services/companyProfileService", () => ({
  CompanyProfileService: {
    getLatestProfile: vi.fn(),
    getByBusinessNumber: vi.fn(),
    upsert: vi.fn(),
  },
}));

describe("Settings company profile form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CompanyProfileService.getLatestProfile).mockResolvedValue({
      item: null,
      source: "none",
    });
    vi.mocked(CompanyProfileService.getByBusinessNumber).mockResolvedValue({
      item: null,
      source: "none",
    });
  });

  it("loads cached/server profile on mount", async () => {
    vi.mocked(CompanyProfileService.getLatestProfile).mockResolvedValue({
      item: {
        businessNumber: "123-45-67890",
        managementNumber: "A-001",
        businessName: "리스크가드 본사",
        industry: "제조업",
        headquartersAddress: "서울시 중구 1",
      },
      source: "server",
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("123-45-67890")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("리스크가드 본사")).toBeInTheDocument();
  });

  it("saves company profile and shows status", async () => {
    vi.mocked(CompanyProfileService.upsert).mockResolvedValue({
      item: {
        businessNumber: "123-45-67890",
        managementNumber: "A-001",
        businessName: "리스크가드 본사",
        industry: "제조업",
        headquartersAddress: "서울시 중구 1",
      },
      source: "server",
    });

    render(<Settings />);

    await waitFor(() => {
      expect(CompanyProfileService.getLatestProfile).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("사업자등록번호"), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByLabelText("산재관리번호(본사 고유 번호)"), { target: { value: "A-001" } });
    fireEvent.change(screen.getByLabelText("사업장명"), { target: { value: "리스크가드 본사" } });
    fireEvent.change(screen.getByLabelText("업종"), { target: { value: "제조업" } });
    fireEvent.change(screen.getByLabelText("소재지(본사 주소)"), { target: { value: "서울시 중구 1" } });

    fireEvent.click(screen.getByRole("button", { name: "회사 정보 저장" }));

    await waitFor(() => {
      expect(CompanyProfileService.upsert).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("회사 정보가 서버에 저장되었습니다. 산업재해조사표에서 자동 입력됩니다.")).toBeInTheDocument();
  });

  it("loads profile by business number on demand", async () => {
    vi.mocked(CompanyProfileService.getByBusinessNumber).mockResolvedValue({
      item: {
        businessNumber: "123-45-67890",
        managementNumber: "A-001",
        businessName: "리스크가드 본사",
        industry: "제조업",
        headquartersAddress: "서울시 중구 1",
      },
      source: "server",
    } as any);

    render(<Settings />);

    await waitFor(() => {
      expect(CompanyProfileService.getLatestProfile).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("사업자등록번호"), { target: { value: "1234567890" } });
    fireEvent.click(screen.getByRole("button", { name: "불러오기" }));

    await waitFor(() => {
      expect(CompanyProfileService.getByBusinessNumber).toHaveBeenCalledWith("1234567890");
    });
    expect(screen.getByDisplayValue("리스크가드 본사")).toBeInTheDocument();
  });
});
