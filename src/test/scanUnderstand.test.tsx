import { describe, expect, it, vi, beforeEach } from "vitest";
import React, { type ReactNode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/services/userWorkHistoryService", () => ({
  UserWorkHistoryService: {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
  },
}));

import ScanUnderstand from "../pages/ScanUnderstand";
import * as msdsScanService from "../services/msdsScanService";
import type { ScanResponse } from "../services/msdsScanService";
import { UserWorkHistoryService } from "../services/userWorkHistoryService";

const mockTolueneResponse: ScanResponse = {
  docType: "msds",
  extraction: { rawText: "톨루엔 CAS 108-88-3" },
  substance: {
    chemId: "001032",
    chemNameKor: "톨루엔",
    casNo: "108-88-3",
    unNo: "1294",
    resolvedBy: "cas",
    confidence: "high",
  },
  hazard: {
    classifications: ["인화성 액체 : 구분2", "피부 부식성/자극성 : 구분2"],
    pictograms: ["GHS02", "GHS07", "GHS08"],
    signalWord: "위험",
    hCodes: [{ code: "H225", text: "고인화성 액체 및 증기" }],
    pCodes: { prevention: [], response: [], storage: [], disposal: [] },
    nfpa: null,
  },
  firstAid: {
    eye: ["물로 15분간 세척"],
    skin: ["오염된 의복 벗기"],
    inhalation: ["신선한 공기"],
    ingestion: ["토하게 하지 말 것"],
    physicianNote: [],
  },
  ppe: {
    exposureLimits: { domestic: "TWA : 50ppm", acgih: "TWA 20ppm", biological: null },
    engineeringControl: ["국소배기장치"],
    ppe: {
      respiratory: ["유기화합물용 방독마스크"],
      eye: ["보안경"],
      hand: ["내화학성 장갑"],
      body: ["보호복 및 안전화"],
    },
  },
  ppeChecklist: [
    {
      part: "respiratory",
      requirement:
        "노출되는 물질의 특성에 맞는 한국산업안전보건공단의 인증을 필한 호흡용 보호구를 착용 하시오 / 유기화합물용 방독마스크 / 산소가 부족한 경우(&amp;lt;19.6%), 송기마스크를 착용하시오",
      sourceItemCode: "H0602",
    },
    { part: "eye", requirement: "보안경 착용", sourceItemCode: "H0604" },
    { part: "hand", requirement: "내화학성 장갑 착용", sourceItemCode: "H0606" },
    { part: "body", requirement: "보호복 및 안전화 착용", sourceItemCode: "H0608" },
  ],
  discrepancies: [],
  sources: [
    { label: "안전보건공단 MSDS", api: "KOSHA", url: "https://msds.kosha.or.kr", retrievedAt: "2026-08-18" },
  ],
  disclaimer: "본 정보는 안전보건공단 화학물질정보시스템 자료를 바탕으로 한 참고용입니다.",
  meta: {
    servedFromCache: false,
  },
};

describe("ScanUnderstand Page & UI components", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(UserWorkHistoryService.list).mockResolvedValue([]);
    vi.mocked(UserWorkHistoryService.create).mockResolvedValue({
      id: "scan-history-1",
      feature: "chemical-scan",
      title: "톨루엔 화학물질 스캔",
      subtitle: "CAS 108-88-3",
      createdAt: "2026-08-20T01:00:00.000Z",
      updatedAt: "2026-08-20T01:00:00.000Z",
      input: { mode: "text", text: "톨루엔", productHint: "", imageIncluded: false },
      result: mockTolueneResponse,
    });
    vi.mocked(UserWorkHistoryService.remove).mockResolvedValue();
  });

  it("renders substance, 3 pictograms, and 4 PPE checklist rows on successful search", async () => {
    vi.spyOn(msdsScanService, "scanAndAnalyzeMsds").mockResolvedValue(mockTolueneResponse);

    render(<ScanUnderstand />);

    const searchInput = screen.getByTestId("text-search-input");
    fireEvent.change(searchInput, { target: { value: "톨루엔" } });

    const searchBtn = screen.getByTestId("search-button");
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(screen.getByTestId("substance-name")).toHaveTextContent("톨루엔");
    });

    expect(screen.getByTestId("signal-word-badge")).toHaveTextContent("위험");
    expect(screen.getByTestId("ghs-pictograms-row")).toBeInTheDocument();
    expect(screen.getByTestId("ppe-checklist-grid").children).toHaveLength(4);
    expect(UserWorkHistoryService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "chemical-scan",
        title: "톨루엔 화학물질 스캔",
        input: expect.objectContaining({ mode: "text", text: "톨루엔" }),
        result: mockTolueneResponse,
      }),
    );
  });

  it("opens and deletes a saved chemical scan from account history", async () => {
    const historyRecord = {
      id: "scan-history-2",
      feature: "chemical-scan" as const,
      title: "톨루엔 이전 스캔",
      subtitle: "CAS 108-88-3",
      createdAt: "2026-08-20T01:00:00.000Z",
      updatedAt: "2026-08-20T02:00:00.000Z",
      input: { mode: "text" as const, text: "108-88-3", productHint: "", imageIncluded: false },
      result: mockTolueneResponse,
    };
    vi.mocked(UserWorkHistoryService.list).mockResolvedValue([historyRecord]);
    vi.mocked(UserWorkHistoryService.get).mockResolvedValue(historyRecord);

    render(<ScanUnderstand />);

    expect(await screen.findByText("톨루엔 이전 스캔")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "톨루엔 이전 스캔 열기" }));

    await waitFor(() => {
      expect(UserWorkHistoryService.get).toHaveBeenCalledWith("scan-history-2", "chemical-scan");
      expect(screen.getByDisplayValue("108-88-3")).toBeInTheDocument();
      expect(screen.getByTestId("substance-name")).toHaveTextContent("톨루엔");
    });

    fireEvent.click(screen.getByRole("button", { name: "톨루엔 이전 스캔 삭제" }));
    await waitFor(() => {
      expect(UserWorkHistoryService.remove).toHaveBeenCalledWith("scan-history-2", "chemical-scan");
      expect(screen.queryByText("톨루엔 이전 스캔")).not.toBeInTheDocument();
    });
  });

  it("renders critical discrepancy banner at the top when critical discrepancies exist", async () => {
    const responseWithCritical: ScanResponse = {
      ...mockTolueneResponse,
      discrepancies: [
        {
          field: "pictograms",
          onLabel: "GHS02",
          onRecord: "GHS02, GHS07, GHS08",
          severity: "critical",
          message: "공식 유해성 그림문자 [GHS07, GHS08]가 현장 라벨에 누락되어 있습니다.",
        },
      ],
    };

    vi.spyOn(msdsScanService, "scanAndAnalyzeMsds").mockResolvedValue(responseWithCritical);

    render(<ScanUnderstand />);

    const searchInput = screen.getByTestId("text-search-input");
    fireEvent.change(searchInput, { target: { value: "톨루엔" } });
    fireEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("discrepancy-critical-banner")).toBeInTheDocument();
    });

    expect(screen.getByTestId("discrepancy-critical-banner")).toHaveTextContent("중대 불일치 발견");
  });

  it("shows unresolved notification view when substance is null", async () => {
    const unresolvedResponse: ScanResponse = {
      docType: "unknown",
      extraction: { rawText: "알 수 없는 라벨 텍스트" },
      substance: null,
      ppeChecklist: [],
      discrepancies: [],
      sources: [],
      disclaimer: "고지문",
      meta: { servedFromCache: false },
    };

    vi.spyOn(msdsScanService, "scanAndAnalyzeMsds").mockResolvedValue(unresolvedResponse);

    render(<ScanUnderstand />);

    const searchInput = screen.getByTestId("text-search-input");
    fireEvent.change(searchInput, { target: { value: "미지의 물질" } });
    fireEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("unresolved-view")).toBeInTheDocument();
    });

    expect(screen.getByText("물질을 특정하지 못했습니다")).toBeInTheDocument();
  });

  it("renders candidate selection buttons when needsUserSelection is returned and re-triggers scan on click", async () => {
    const selectionResponse: ScanResponse = {
      docType: "unknown",
      extraction: { rawText: "톨루엔" },
      substance: null,
      needsUserSelection: {
        candidates: [
          { chemId: "001032", chemNameKor: "톨루엔", casNo: "108-88-3" },
          { chemId: "001033", chemNameKor: "톨루엔 다이이소시아네이트", casNo: "26471-62-5" },
        ],
      },
      ppeChecklist: [],
      discrepancies: [],
      sources: [],
      disclaimer: "고지문",
      meta: { servedFromCache: false },
    };

    const spy = vi.spyOn(msdsScanService, "scanAndAnalyzeMsds")
      .mockResolvedValueOnce(selectionResponse)
      .mockResolvedValueOnce(mockTolueneResponse);

    render(<ScanUnderstand />);

    fireEvent.change(screen.getByTestId("text-search-input"), { target: { value: "톨루엔" } });
    fireEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("user-selection-modal")).toBeInTheDocument();
    });

    const candidateBtn = screen.getByTestId("candidate-button-001032");
    expect(candidateBtn).toHaveTextContent("톨루엔");

    fireEvent.click(candidateBtn);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("substance-name")).toHaveTextContent("톨루엔");
    });
  });

  it("renders PPE part labels in Korean and exposes no language selector", async () => {
    vi.spyOn(msdsScanService, "scanAndAnalyzeMsds").mockResolvedValue(mockTolueneResponse);

    render(<ScanUnderstand />);

    expect(screen.queryByTestId("language-select")).toBeNull();

    fireEvent.change(screen.getByTestId("text-search-input"), { target: { value: "108-88-3" } });
    fireEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("substance-name")).toBeInTheDocument();
    });

    expect(screen.getByText("호흡기 보호")).toBeInTheDocument();
    expect(screen.getByText("눈·안면 보호")).toBeInTheDocument();
    expect(screen.getByText("손 보호(장갑)")).toBeInTheDocument();
    expect(screen.getByText("신체·보호복")).toBeInTheDocument();
  });

  it("provides core summary and allows toggling detailed KOSHA requirements", async () => {
    vi.spyOn(msdsScanService, "scanAndAnalyzeMsds").mockResolvedValue(mockTolueneResponse);

    render(<ScanUnderstand />);

    fireEvent.change(screen.getByTestId("text-search-input"), { target: { value: "108-88-3" } });
    fireEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("substance-name")).toBeInTheDocument();
    });

    // 호흡기 보호 핵심 요약 및 태그 확인
    expect(screen.getByText("유기화합물용 방독마스크")).toBeInTheDocument();

    // 상세 보기 토글 버튼 확인 및 클릭
    const toggleBtn = screen.getByTestId("ppe-toggle-detail-respiratory");
    expect(toggleBtn).toHaveTextContent("공단 상세 규정 보기");

    // 상세 펼치기
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("ppe-detail-respiratory")).toBeInTheDocument();
    expect(screen.getByTestId("ppe-detail-respiratory")).toHaveTextContent("<19.6%"); // HTML entity decoded
    expect(toggleBtn).toHaveTextContent("상세 규정 접기");

    // 상세 접기
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId("ppe-detail-respiratory")).toBeNull();
  });

  it("toggles item check on card click and shows allChecked badge when all items are checked", async () => {
    vi.spyOn(msdsScanService, "scanAndAnalyzeMsds").mockResolvedValue(mockTolueneResponse);

    render(<ScanUnderstand />);

    fireEvent.change(screen.getByTestId("text-search-input"), { target: { value: "108-88-3" } });
    fireEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("substance-name")).toBeInTheDocument();
    });

    expect(screen.getByText("작업 전 착용 확인 필요")).toBeInTheDocument();

    // 4개 보호구 카드 순차 클릭
    fireEvent.click(screen.getByTestId("ppe-item-respiratory"));
    fireEvent.click(screen.getByTestId("ppe-item-eye"));
    fireEvent.click(screen.getByTestId("ppe-item-hand"));
    fireEvent.click(screen.getByTestId("ppe-item-body"));

    expect(screen.getByText("✓ 모든 보호구 착용 확인됨")).toBeInTheDocument();
  });

  it("always renders the legal disclaimer text", async () => {
    vi.spyOn(msdsScanService, "scanAndAnalyzeMsds").mockResolvedValue(mockTolueneResponse);

    render(<ScanUnderstand />);

    fireEvent.change(screen.getByTestId("text-search-input"), { target: { value: "톨루엔" } });
    fireEvent.click(screen.getByTestId("search-button"));

    await waitFor(() => {
      expect(screen.getByTestId("disclaimer-text")).toBeInTheDocument();
    });

    expect(screen.getByTestId("disclaimer-text")).toHaveTextContent("본 정보는 안전보건공단");
  });
});
