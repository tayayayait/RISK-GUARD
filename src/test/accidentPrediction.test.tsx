import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccidentPrediction, { partitionScenarioBundleItems } from "@/pages/AccidentPrediction";
import { predictionService } from "@/services/predictionService";
import { fetchKoshaMachines } from "@/data/KOSHADataset";

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/services/predictionService", () => ({
  predictionService: {
    generatePrediction: vi.fn(),
    generateScenarioImage: vi.fn(),
  },
}));

vi.mock("@/data/KOSHADataset", () => ({
  fetchKoshaMachines: vi.fn(async () => []),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("AccidentPrediction page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchKoshaMachines).mockResolvedValue([]);
    vi.mocked(predictionService.generatePrediction).mockResolvedValue({
      scenarios: [
        {
          id: "scenario-1",
          accidentType: "추락 사고",
          riskLocation: "상부 작업 발판",
          reason: "난간이 없어 추락 위험이 있습니다.",
          immediateAction: "작업을 멈추고 난간을 설치합니다.",
          detail: "난간 설치 전에 작업을 재개하지 않습니다.",
        },
        {
          id: "scenario-2",
          accidentType: "끼임 사고",
          riskLocation: "프레스 가동부",
          reason: "손이 가동부에 가까워집니다.",
          immediateAction: "전원을 차단하고 인터록을 점검합니다.",
          detail: "정지 확인 후에만 접근합니다.",
        },
        {
          id: "scenario-3",
          accidentType: "감전 사고",
          riskLocation: "electrical panel",
          reason: "누전 상태에서 금속 접촉이 발생할 수 있습니다.",
          immediateAction: "전원을 끄고 절연 상태를 확인합니다.",
          detail: "절연 보호구를 착용하고 점검합니다.",
        },
      ],
      machineContext: "press",
    });
    vi.mocked(predictionService.generateScenarioImage).mockResolvedValue({
      imageUrl: "data:image/png;base64,abc123",
      qualityStatus: "pass",
      qualityReasons: ["테스트 통과"],
    });
  });

  it("renders three scenario cards with required fields after analysis", async () => {
    render(<AccidentPrediction />);

    fireEvent.change(screen.getByPlaceholderText("예: 프레스, 크레인, 절단기..."), {
      target: { value: "press" },
    });
    fireEvent.click(screen.getByRole("button", { name: "예측 시나리오 생성 (Gemini 기능 적용)" }));

    await waitFor(() => {
      expect(screen.getByText("시나리오 1")).toBeInTheDocument();
    });

    expect(screen.getByText("시나리오 2")).toBeInTheDocument();
    expect(screen.getByText("시나리오 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "통합 이미지 다운로드" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF 다운로드" })).toBeInTheDocument();
  });

  it("loads selected scenario visualization when card is clicked", async () => {
    render(<AccidentPrediction />);

    fireEvent.change(screen.getByPlaceholderText("예: 프레스, 크레인, 절단기..."), {
      target: { value: "press" },
    });
    fireEvent.click(screen.getByRole("button", { name: "예측 시나리오 생성 (Gemini 기능 적용)" }));

    const scenarioLabel = await screen.findByText("시나리오 1");
    const cardButton = scenarioLabel.closest("button");
    expect(cardButton).not.toBeNull();
    fireEvent.click(cardButton as HTMLButtonElement);

    await waitFor(() => {
      expect(predictionService.generateScenarioImage).toHaveBeenCalledTimes(1);
    });
    expect(predictionService.generateScenarioImage).toHaveBeenCalledWith(
      expect.objectContaining({
        machineContext: "press",
        scenario: expect.objectContaining({
          id: "scenario-1",
          accidentType: "추락 사고",
        }),
      }),
    );

    expect(await screen.findByAltText("selected scenario visualization")).toBeInTheDocument();
  });

  it("renders selected image even when quality status is soft_fail", async () => {
    vi.mocked(predictionService.generateScenarioImage).mockResolvedValueOnce({
      imageUrl: "data:image/png;base64,softfail",
      qualityStatus: "soft_fail",
      qualityReasons: ["3요소 일부 미충족"],
    });

    render(<AccidentPrediction />);

    fireEvent.change(screen.getByPlaceholderText("예: 프레스, 크레인, 절단기..."), {
      target: { value: "press" },
    });
    fireEvent.click(screen.getByRole("button", { name: "예측 시나리오 생성 (Gemini 기능 적용)" }));

    const scenarioLabel = await screen.findByText("시나리오 1");
    const cardButton = scenarioLabel.closest("button");
    expect(cardButton).not.toBeNull();
    fireEvent.click(cardButton as HTMLButtonElement);

    expect(await screen.findByAltText("selected scenario visualization")).toBeInTheDocument();
  });

  it("deduplicates repeated scenario clicks while image request is in-flight", async () => {
    let resolveImage: ((value: {
      imageUrl: string;
      qualityStatus: "pass";
      qualityReasons: string[];
    }) => void) | null = null;

    const pendingImage = new Promise<{
      imageUrl: string;
      qualityStatus: "pass";
      qualityReasons: string[];
    }>((resolve) => {
      resolveImage = resolve;
    });

    vi.mocked(predictionService.generateScenarioImage).mockReset();
    vi.mocked(predictionService.generateScenarioImage).mockReturnValue(pendingImage);

    render(<AccidentPrediction />);

    fireEvent.change(screen.getByPlaceholderText("예: 프레스, 크레인, 절단기..."), {
      target: { value: "press" },
    });
    fireEvent.click(screen.getByRole("button", { name: "예측 시나리오 생성 (Gemini 기능 적용)" }));

    const scenarioLabel = await screen.findByText("시나리오 1");
    const cardButton = scenarioLabel.closest("button");
    expect(cardButton).not.toBeNull();

    fireEvent.click(cardButton as HTMLButtonElement);
    fireEvent.click(cardButton as HTMLButtonElement);
    fireEvent.click(cardButton as HTMLButtonElement);

    await waitFor(() => {
      expect(predictionService.generateScenarioImage).toHaveBeenCalledTimes(1);
    });

    resolveImage?.({
      imageUrl: "data:image/png;base64,inflight-once",
      qualityStatus: "pass",
      qualityReasons: ["단일 요청 완료"],
    });

    expect(await screen.findByAltText("selected scenario visualization")).toBeInTheDocument();
  });

  it("includes soft-fail images in bundle and excludes only missing images", () => {
    const scenarios = [
      { id: "scenario-1", accidentType: "", riskLocation: "", reason: "", immediateAction: "", detail: "" },
      { id: "scenario-2", accidentType: "", riskLocation: "", reason: "", immediateAction: "", detail: "" },
      { id: "scenario-3", accidentType: "", riskLocation: "", reason: "", immediateAction: "", detail: "" },
    ];

    const result = partitionScenarioBundleItems(scenarios, {
      "scenario-1": {
        imageUrl: "data:image/png;base64,pass",
        qualityStatus: "pass",
        qualityReasons: [],
      },
      "scenario-2": {
        imageUrl: "data:image/png;base64,softfail",
        qualityStatus: "soft_fail",
        qualityReasons: ["품질 미달"],
      },
      "scenario-3": undefined,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].scenario.id).toBe("scenario-1");
    expect(result.items[1].scenario.id).toBe("scenario-2");
    expect(result.excludedScenarioIds).toEqual([]);
    expect(result.missingScenarioIds).toEqual(["scenario-3"]);
  });
});
