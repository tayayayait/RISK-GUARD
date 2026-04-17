import React, { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  Upload,
  AlertTriangle,
  Search,
  Activity,
  Image as ImageIcon,
  ShieldAlert,
  Clock3,
  BadgeCheck,
  Loader2,
  MapPin,
  Eye,
  Download,
  FileDown,
} from "lucide-react";
import {
  predictionService,
  PredictionResult,
  PredictionScenario,
  ScenarioImageGenerationResult,
  ScenarioImageQualityStatus,
} from "@/services/predictionService";
import { fetchKoshaMachines, KoshaMachineData } from "@/data/KOSHADataset";
import { toast } from "sonner";

type ScenarioImageStatus = "idle" | "loading" | "success" | "error";

interface ScenarioImageState {
  status: ScenarioImageStatus;
  imageUrl?: string;
  qualityStatus?: ScenarioImageQualityStatus;
  qualityReasons?: string[];
  errorMessage?: string;
}

const DEFAULT_SCENARIO_IMAGE_STATE: ScenarioImageState = { status: "idle" };

interface ScenarioBundleItem {
  scenario: PredictionScenario;
  imageUrl: string;
}

interface ScenarioBundleBuildResult {
  items: ScenarioBundleItem[];
  excludedScenarioIds: string[];
}

interface ScenarioBundlePartitionResult extends ScenarioBundleBuildResult {
  missingScenarioIds: string[];
}

export function partitionScenarioBundleItems(
  scenarios: PredictionScenario[],
  imageResults: Record<string, ScenarioImageGenerationResult | undefined>,
): ScenarioBundlePartitionResult {
  const items: ScenarioBundleItem[] = [];
  const excludedScenarioIds: string[] = [];
  const missingScenarioIds: string[] = [];

  for (const scenario of scenarios) {
    const imageResult = imageResults[scenario.id];
    if (!imageResult?.imageUrl) {
      missingScenarioIds.push(scenario.id);
      continue;
    }
    items.push({
      scenario,
      imageUrl: imageResult.imageUrl,
    });
  }

  return {
    items,
    excludedScenarioIds,
    missingScenarioIds,
  };
}

const POSTER_WIDTH = 1240;
const POSTER_HEIGHT = 1754;
const POSTER_TEXT_LINE_HEIGHT = 18;
const POSTER_TEXT_ROW_GAP = 4;
const POSTER_CARD_PADDING = 14;
const POSTER_IMAGE_TEXT_GAP = 12;

function drawContainImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(x, y, width, height);
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

async function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 로드 실패"));
    image.src = url;
  });
}

async function createScenarioPosterCanvas(
  bundleItems: ScenarioBundleItem[],
  analyzedAt: Date | null,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("포스터 캔버스를 생성하지 못했습니다.");
  }

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const margin = 40;
  const contentWidth = canvas.width - margin * 2;
  const headerHeight = 132;
  const panelGap = 20;
  const panelCount = Math.max(bundleItems.length, 1);
  const panelHeight = (canvas.height - margin - headerHeight - margin - panelGap * (panelCount - 1)) / panelCount;
  const generatedLabel = analyzedAt
    ? analyzedAt.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })
    : new Date().toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(margin, margin, contentWidth, headerHeight);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 40px 'Pretendard', 'Noto Sans KR', sans-serif";
  ctx.fillText("현장 사고발생 위험 시나리오 게시판", margin + 28, margin + 56);
  ctx.font = "500 20px 'Pretendard', 'Noto Sans KR', sans-serif";
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText("이미지는 크게, 설명은 하단 요약 블록으로 분리", margin + 28, margin + 92);
  ctx.fillText(`생성 시각: ${generatedLabel}`, margin + 28, margin + 118);

  const loadedImages = await Promise.all(bundleItems.map((item) => loadImageElement(item.imageUrl)));

  bundleItems.forEach((item, index) => {
    const image = loadedImages[index];
    const panelX = margin;
    const panelY = margin + headerHeight + index * (panelHeight + panelGap);
    const panelWidth = contentWidth;
    const cardInnerX = panelX + POSTER_CARD_PADDING;
    const cardInnerY = panelY + POSTER_CARD_PADDING;
    const cardInnerWidth = panelWidth - POSTER_CARD_PADDING * 2;
    const textAreaHeight = Math.max(Math.floor(panelHeight * 0.22), 108);
    const imageHeight = Math.max(
      panelHeight - POSTER_CARD_PADDING * 2 - POSTER_IMAGE_TEXT_GAP - textAreaHeight,
      140,
    );
    const textAreaY = cardInnerY + imageHeight + POSTER_IMAGE_TEXT_GAP;
    const textPaddingX = 18;
    const textStartX = cardInnerX + textPaddingX;
    const textContentWidth = cardInnerWidth - textPaddingX * 2;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX + 1, panelY + 1, panelWidth - 2, panelHeight - 2);

    drawContainImage(ctx, image, cardInnerX, cardInnerY, cardInnerWidth, imageHeight);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cardInnerX, textAreaY, cardInnerWidth, textAreaHeight);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(cardInnerX + 0.5, textAreaY + 0.5, cardInnerWidth - 1, textAreaHeight - 1);

    ctx.save();
    ctx.beginPath();
    ctx.rect(cardInnerX + 1, textAreaY + 1, cardInnerWidth - 2, textAreaHeight - 2);
    ctx.clip();

    ctx.fillStyle = "#1e293b";
    ctx.font = "700 16px 'Pretendard', 'Noto Sans KR', sans-serif";
    ctx.fillText(`시나리오 ${index + 1}`, textStartX, textAreaY + 20);

    const descriptionRows: Array<{
      label: string;
      value: string;
      maxLines: number;
    }> = [
      { label: "사고 유형", value: item.scenario.accidentType, maxLines: 1 },
      { label: "위험 위치", value: item.scenario.riskLocation, maxLines: 1 },
      { label: "발생 이유", value: item.scenario.reason, maxLines: 1 },
      { label: "즉시 조치", value: item.scenario.immediateAction, maxLines: 1 },
    ];

    const wrapTextByWidth = (text: string, maxWidth: number): string[] => {
      const normalized = text.replace(/\s+/g, " ").trim();
      if (!normalized) {
        return ["-"];
      }
      const lines: string[] = [];
      let current = "";
      for (const char of normalized) {
        const candidate = current + char;
        if (ctx.measureText(candidate).width <= maxWidth || current.length === 0) {
          current = candidate;
          continue;
        }
        lines.push(current);
        current = char;
      }
      if (current) {
        lines.push(current);
      }
      return lines;
    };

    const truncateLines = (lines: string[], maxLines: number, maxWidth: number): string[] => {
      if (lines.length <= maxLines) {
        return lines;
      }
      const sliced = lines.slice(0, maxLines);
      let last = sliced[maxLines - 1];
      while (last.length > 0 && ctx.measureText(`${last}...`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      sliced[maxLines - 1] = `${last}...`;
      return sliced;
    };

    let cursorY = textAreaY + 38;
    descriptionRows.forEach((row) => {
      const label = `${row.label}:`;
      ctx.font = "700 14px 'Pretendard', 'Noto Sans KR', sans-serif";
      const labelWidth = ctx.measureText(label).width + 10;
      const valueMaxWidth = Math.max(textContentWidth - labelWidth, 10);

      ctx.fillStyle = "#0f172a";
      ctx.fillText(label, textStartX, cursorY);

      ctx.font = "500 14px 'Pretendard', 'Noto Sans KR', sans-serif";
      ctx.fillStyle = "#1e293b";
      const wrapped = truncateLines(wrapTextByWidth(row.value, valueMaxWidth), row.maxLines, valueMaxWidth);
      wrapped.forEach((line, lineIndex) => {
        ctx.fillText(line, textStartX + labelWidth, cursorY + lineIndex * POSTER_TEXT_LINE_HEIGHT);
      });

      cursorY += wrapped.length * POSTER_TEXT_LINE_HEIGHT + POSTER_TEXT_ROW_GAP;
    });

    ctx.restore();
  });

  return canvas;
}

async function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((fileBlob) => resolve(fileBlob), "image/png");
  });
  if (!blob) {
    throw new Error("이미지 파일 생성 실패");
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AccidentPrediction() {
  const [query, setQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [machines, setMachines] = useState<KoshaMachineData[]>([]);
  const [filteredMachines, setFilteredMachines] = useState<KoshaMachineData[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<Date | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioImageMap, setScenarioImageMap] = useState<Record<string, ScenarioImageState>>({});
  const [bundleExportMode, setBundleExportMode] = useState<"none" | "png" | "pdf">("none");
  const requestTokenRef = useRef(0);
  const scenarioImageMapRef = useRef<Record<string, ScenarioImageState>>({});
  const inFlightScenarioImageRequestsRef = useRef<
    Record<string, Promise<ScenarioImageGenerationResult | undefined>>
  >({});

  useEffect(() => {
    fetchKoshaMachines().then((data) => setMachines(data));
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    scenarioImageMapRef.current = scenarioImageMap;
  }, [scenarioImageMap]);

  const selectedScenario = useMemo(() => {
    if (!result || !selectedScenarioId) {
      return null;
    }
    return result.scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null;
  }, [result, selectedScenarioId]);

  const selectedScenarioImageState = selectedScenario
    ? scenarioImageMap[selectedScenario.id] ?? DEFAULT_SCENARIO_IMAGE_STATE
    : DEFAULT_SCENARIO_IMAGE_STATE;
  const isBundleExporting = bundleExportMode !== "none";

  const { isAnyImageLoading, isAllImagesGenerated } = useMemo(() => {
    if (!result) {
      return { isAnyImageLoading: false, isAllImagesGenerated: false };
    }

    let loading = false;
    let allGenerated = true;
    for (const scenario of result.scenarios) {
      const status = (scenarioImageMap[scenario.id] ?? DEFAULT_SCENARIO_IMAGE_STATE).status;
      if (status === "loading") {
        loading = true;
      }
      if (status !== "success") {
        allGenerated = false;
      }
    }

    return {
      isAnyImageLoading: loading,
      isAllImagesGenerated: allGenerated,
    };
  }, [result, scenarioImageMap]);

  const handleGenerateAllImages = async () => {
    if (!result) return;
    
    const tasks = result.scenarios.map(async (scenario) => {
      const state = scenarioImageMap[scenario.id] ?? DEFAULT_SCENARIO_IMAGE_STATE;
      if (state.status === "success" || state.status === "loading") {
        return;
      }
      await fetchScenarioImage(scenario);
    });

    await Promise.all(tasks);
  };

  const analyzedAtLabel = analyzedAt
    ? analyzedAt.toLocaleString("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";

  const analysisModeLabel = selectedImage ? "사진 기반 분석" : "텍스트 기반 분석";

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (!value) {
      setFilteredMachines([]);
      setShowDropdown(false);
      return;
    }

    const filtered = machines
      .filter((machine) => machine.machineNameKorean.includes(value) || machine.description.includes(value))
      .slice(0, 5);
    setFilteredMachines(filtered);
    setShowDropdown(true);
  };

  const handleSelectMachine = (machine: KoshaMachineData) => {
    setQuery(machine.machineNameKorean);
    setShowDropdown(false);
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setQuery("");
  };

  const clearImage = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedImage(null);
    setPreviewUrl(null);
  };

  const fetchScenarioImage = async (scenario: PredictionScenario): Promise<ScenarioImageGenerationResult | undefined> => {
    const token = requestTokenRef.current;
    const inFlight = inFlightScenarioImageRequestsRef.current[scenario.id];
    if (inFlight) {
      return inFlight;
    }

    const currentState = scenarioImageMapRef.current[scenario.id] ?? DEFAULT_SCENARIO_IMAGE_STATE;
    if (currentState.status === "success" && currentState.imageUrl) {
      return {
        imageUrl: currentState.imageUrl,
        qualityStatus: currentState.qualityStatus ?? "pass",
        qualityReasons: currentState.qualityReasons ?? [],
      };
    }

    const requestPromise = (async (): Promise<ScenarioImageGenerationResult | undefined> => {
      setScenarioImageMap((prev) => ({
        ...prev,
        [scenario.id]: { status: "loading" },
      }));

      try {
        const imageResult = await predictionService.generateScenarioImage({
          machineContext: result?.machineContext || query,
          scenario,
          imageFile: selectedImage || undefined,
          recognizedContext: result?.recognizedContext,
        });

        if (token !== requestTokenRef.current) {
          return undefined;
        }

        if (!imageResult?.imageUrl) {
          setScenarioImageMap((prev) => ({
            ...prev,
            [scenario.id]: {
              status: "error",
              errorMessage: "시각화 이미지를 만들지 못했습니다.",
            },
          }));
          return undefined;
        }

        setScenarioImageMap((prev) => ({
          ...prev,
          [scenario.id]: {
            status: "success",
            imageUrl: imageResult.imageUrl,
            qualityStatus: imageResult.qualityStatus,
            qualityReasons: imageResult.qualityReasons,
          },
        }));
        return imageResult;
      } catch (error: unknown) {
        if (token !== requestTokenRef.current) {
          return undefined;
        }
        const message = error instanceof Error ? error.message : "이미지 생성 중 오류가 발생했습니다.";
        setScenarioImageMap((prev) => ({
          ...prev,
          [scenario.id]: {
            status: "error",
            errorMessage: message,
          },
        }));
        return undefined;
      } finally {
        delete inFlightScenarioImageRequestsRef.current[scenario.id];
      }
    })();

    inFlightScenarioImageRequestsRef.current[scenario.id] = requestPromise;
    return requestPromise;
  };

  const handleScenarioClick = (scenario: PredictionScenario) => {
    setSelectedScenarioId(scenario.id);
    void fetchScenarioImage(scenario);
  };

  const ensureBundleItems = async (): Promise<ScenarioBundleBuildResult | null> => {
    if (!result) {
      return null;
    }

    const imageResults: Record<string, ScenarioImageGenerationResult | undefined> = {};
    for (const scenario of result.scenarios) {
      const imageResult = await fetchScenarioImage(scenario);
      imageResults[scenario.id] = imageResult;
    }

    const partitioned = partitionScenarioBundleItems(result.scenarios, imageResults);
    if (partitioned.missingScenarioIds.length > 0) {
      const firstFailedId = partitioned.missingScenarioIds[0].replace("scenario-", "");
      toast.error(`시나리오 ${firstFailedId} 이미지 생성에 실패했습니다.`);
      return null;
    }

    if (partitioned.items.length === 0) {
      toast.error("품질 기준을 통과한 이미지가 없어 통합 파일을 생성할 수 없습니다.");
      return null;
    }

    return {
      items: partitioned.items,
      excludedScenarioIds: partitioned.excludedScenarioIds,
    };
  };

  const getBundleBaseFilename = () => {
    const date = analyzedAt ?? new Date();
    const token = date.toISOString().replace(/[:.]/g, "-");
    return `risk-guard-scenarios-${token}`;
  };

  const handleDownloadScenarioBundlePng = async () => {
    if (!result || isBundleExporting) {
      return;
    }

    if (isAnyImageLoading) {
      toast.warning("이미지 생성이 진행 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const allGenerated = result.scenarios.every(
      (s) => (scenarioImageMap[s.id] ?? DEFAULT_SCENARIO_IMAGE_STATE).status === "success"
    );
    if (!allGenerated) {
      toast.warning("아직 생성되지 않은 이미지가 있습니다. 각 시나리오 카드를 클릭해 이미지를 먼저 확인해 주세요.");
      return;
    }

    setBundleExportMode("png");
    try {
      const bundleResult = await ensureBundleItems();
      if (!bundleResult) {
        return;
      }
      const posterCanvas = await createScenarioPosterCanvas(bundleResult.items, analyzedAt);
      await downloadCanvasAsPng(posterCanvas, `${getBundleBaseFilename()}.png`);
      if (bundleResult.excludedScenarioIds.length > 0) {
        toast.success("게시용 통합 이미지 파일을 다운로드했습니다. 일부 시나리오는 품질 기준 미달로 번들에서 제외되었습니다.");
      } else {
        toast.success("게시용 통합 이미지 파일을 다운로드했습니다.");
      }
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "통합 이미지 파일 생성에 실패했습니다.";
      toast.error(message);
    } finally {
      setBundleExportMode("none");
    }
  };

  const handleDownloadScenarioBundlePdf = async () => {
    if (!result || isBundleExporting) {
      return;
    }

    if (isAnyImageLoading) {
      toast.warning("이미지 생성이 진행 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const allGenerated = result.scenarios.every(
      (s) => (scenarioImageMap[s.id] ?? DEFAULT_SCENARIO_IMAGE_STATE).status === "success"
    );
    if (!allGenerated) {
      toast.warning("아직 생성되지 않은 이미지가 있습니다. 각 시나리오 카드를 클릭해 이미지를 먼저 확인해 주세요.");
      return;
    }

    setBundleExportMode("pdf");
    try {
      const bundleResult = await ensureBundleItems();
      if (!bundleResult) {
        return;
      }

      const posterCanvas = await createScenarioPosterCanvas(bundleResult.items, analyzedAt);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;

      let targetWidth = pageWidth - margin * 2;
      let targetHeight = (posterCanvas.height / posterCanvas.width) * targetWidth;
      if (targetHeight > pageHeight - margin * 2) {
        targetHeight = pageHeight - margin * 2;
        targetWidth = (posterCanvas.width / posterCanvas.height) * targetHeight;
      }

      const drawX = (pageWidth - targetWidth) / 2;
      const drawY = (pageHeight - targetHeight) / 2;
      const posterDataUrl = posterCanvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(posterDataUrl, "JPEG", drawX, drawY, targetWidth, targetHeight);
      pdf.save(`${getBundleBaseFilename()}.pdf`);
      if (bundleResult.excludedScenarioIds.length > 0) {
        toast.success("게시용 PDF 파일을 다운로드했습니다. 일부 시나리오는 품질 기준 미달로 번들에서 제외되었습니다.");
      } else {
        toast.success("게시용 PDF 파일을 다운로드했습니다.");
      }
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "PDF 파일 생성에 실패했습니다.";
      toast.error(message);
    } finally {
      setBundleExportMode("none");
    }
  };

  const handlePredict = async () => {
    if (!query && !selectedImage) {
      return;
    }

    requestTokenRef.current += 1;
    setLoading(true);
    setResult(null);
    setAnalyzedAt(null);
    setSelectedScenarioId(null);
    setScenarioImageMap({});
    inFlightScenarioImageRequestsRef.current = {};
    setBundleExportMode("none");
    setShowDropdown(false);

    try {
      const prediction = await predictionService.generatePrediction(query, selectedImage || undefined);
      setResult(prediction);
      setAnalyzedAt(new Date());
      toast.success("분석이 완료되었습니다.");
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell>
      <div className="max-w-6xl mx-auto space-y-space-6 pb-space-8">
        <header className="mb-space-8 pt-space-4">
          <h1 className="text-heading-1 text-neutral-900 tracking-tight mb-space-2 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-primary-500" />
            사고/피해 예측 시각화
          </h1>
          <p className="text-body-lg text-neutral-600">
            기계명 또는 현장 사진을 입력하면 발생 가능한 사고를 분석해 시나리오 카드로 보여줍니다.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-6">
          <div className="lg:col-span-5 bg-white rounded-radius-lg border border-neutral-200 shadow-sm p-space-6">
            <h2 className="text-heading-3 text-neutral-900 mb-space-4">상황 입력</h2>

            <div className="space-y-space-6">
              <div className="relative">
                <label className="block text-body-sm font-medium text-neutral-700 mb-space-2">
                  기계·설비명 또는 현장 설명
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-neutral-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => handleQueryChange(event.target.value)}
                    placeholder="예: 프레스, 크레인, 절단기..."
                    className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-radius-md focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow disabled:opacity-50 disabled:bg-neutral-100"
                    disabled={!!selectedImage}
                  />
                </div>

                {showDropdown && filteredMachines.length > 0 && !selectedImage && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-neutral-200 rounded-radius-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredMachines.map((machine) => (
                      <button
                        key={machine.id}
                        type="button"
                        onClick={() => handleSelectMachine(machine)}
                        className="w-full text-left px-4 py-2 hover:bg-primary-050 focus:bg-primary-050 transition-colors cursor-pointer border-b border-neutral-100 last:border-0"
                      >
                        <div className="font-medium text-neutral-900">{machine.machineNameKorean}</div>
                        <div className="text-body-xs text-neutral-500 truncate">{machine.description}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center opacity-70">
                <div className="flex-1 border-t border-neutral-200" />
                <span className="px-3 text-body-xs font-semibold text-neutral-400 uppercase tracking-widest">or</span>
                <div className="flex-1 border-t border-neutral-200" />
              </div>

              <div>
                <label className="block text-body-sm font-medium text-neutral-700 mb-space-2">현장 사진 업로드</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-neutral-300 border-dashed rounded-radius-md hover:border-primary-500 transition-colors bg-neutral-050 cursor-pointer relative overflow-hidden group">
                  <div className="space-y-1 text-center">
                    {previewUrl ? (
                      <div className="relative w-full max-h-48 overflow-hidden rounded-md flex justify-center">
                        <img src={previewUrl} alt="업로드 이미지 미리보기" className="object-contain max-w-full h-40" />
                      </div>
                    ) : (
                      <>
                        <Upload className="mx-auto h-12 w-12 text-neutral-400 group-hover:text-primary-500 transition-colors" />
                        <div className="flex text-body-sm text-neutral-600 justify-center">
                          <label
                            htmlFor="file-upload"
                            className="relative cursor-pointer bg-transparent rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                          >
                            <span>여기를 클릭해 파일 선택</span>
                            <input id="file-upload" name="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleImageChange} />
                          </label>
                        </div>
                        <p className="text-body-xs text-neutral-500 pt-1">PNG, JPG 10MB 이하 권장</p>
                      </>
                    )}
                  </div>
                  {previewUrl && (
                    <input id="file-upload-overlap" type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*" onChange={handleImageChange} />
                  )}
                </div>
                {previewUrl && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={clearImage}
                      className="text-body-sm text-danger-600 hover:text-danger-700 font-medium px-2 py-1 bg-danger-50 hover:bg-danger-100 rounded transition-colors"
                    >
                      이미지 지우기
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handlePredict}
                disabled={loading || (!query && !selectedImage)}
                className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-radius-md shadow-sm text-body-md font-medium text-white 
                  ${loading || (!query && !selectedImage) ? "bg-neutral-400 cursor-not-allowed opacity-70" : "bg-primary-600 hover:bg-primary-700"} 
                  transition-colors mt-space-8`}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    분석 데이터 처리 중...
                  </span>
                ) : (
                  "예측 시나리오 생성 (Gemini 기능 적용)"
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 relative rounded-radius-lg border border-neutral-200 shadow-md-token overflow-hidden flex flex-col min-h-[600px] bg-gradient-to-b from-white to-neutral-100">
            <div className="relative z-10 p-space-6 border-b border-neutral-200/90 bg-white/80 backdrop-blur">
              <div className="flex justify-between items-start gap-space-4">
                <div>
                  <h2 className="text-heading-3 text-neutral-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary-600" />
                    분석 결과
                  </h2>
                  <p className="text-body-sm text-neutral-500 mt-1">
                    예측된 사고 시나리오 3개를 카드로 보여주고, 선택한 카드의 시각화를 생성합니다.
                  </p>
                </div>
                {result && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-body-sm font-medium bg-success-050 text-success-600 border border-success-600/20">
                    <BadgeCheck className="w-4 h-4" />
                    분석 완료
                  </span>
                )}
              </div>

              {result && (
                <div className="mt-space-4 grid grid-cols-1 sm:grid-cols-3 gap-space-3">
                  <div className="rounded-radius-md border border-neutral-200 bg-white p-space-3 shadow-sm">
                    <p className="text-caption text-neutral-500 flex items-center gap-1.5">
                      <Clock3 className="w-3.5 h-3.5 text-primary-600" />
                      생성 시각
                    </p>
                    <p className="mt-1 text-body-sm text-neutral-800 font-medium">{analyzedAtLabel}</p>
                  </div>
                  <div className="rounded-radius-md border border-neutral-200 bg-white p-space-3 shadow-sm">
                    <p className="text-caption text-neutral-500 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-warning-600" />
                      분석 모드
                    </p>
                    <p className="mt-1 text-body-sm text-neutral-800 font-medium">{analysisModeLabel}</p>
                  </div>
                  <div className="rounded-radius-md border border-neutral-200 bg-white p-space-3 shadow-sm">
                    <p className="text-caption text-neutral-500 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-info-600" />
                      시나리오 개수
                    </p>
                    <p className="mt-1 text-body-sm text-neutral-800 font-medium">{result.scenarios.length}개</p>
                  </div>
                </div>
              )}
            </div>

            <div className="relative z-10 p-space-6 flex-1">
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center space-y-space-4 animate-in fade-in duration-500">
                    <div className="relative w-16 h-16 mx-auto rounded-full bg-white shadow-sm border border-neutral-200 flex items-center justify-center">
                      <Loader2 className="w-7 h-7 text-primary-600 animate-spin" />
                    </div>
                    <p className="text-body-md text-neutral-700 font-medium">Gemini가 현장 위험요소를 분석하고 있습니다.</p>
                    <p className="text-body-sm text-neutral-500">사진 또는 텍스트 기반으로 사고 시나리오 3개를 생성 중입니다.</p>
                  </div>
                </div>
              ) : result ? (
                <div className="space-y-space-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <section className="rounded-radius-md border border-neutral-200 bg-white p-space-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-space-3 mb-space-3">
                      <div>
                        <h3 className="text-heading-4 text-neutral-900">예측 사고 시나리오 카드</h3>
                        <p className="text-body-sm text-neutral-500 mt-1">
                          3개 이미지를 하나로 묶어 게시용 이미지 또는 PDF로 다운로드할 수 있습니다.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleGenerateAllImages()}
                          disabled={isAnyImageLoading || isAllImagesGenerated}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-neutral-300 text-neutral-700 bg-white hover:bg-neutral-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {isAnyImageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                          {isAnyImageLoading ? "전체 생성 중..." : isAllImagesGenerated ? "생성 완료" : "전체 이미지 생성"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownloadScenarioBundlePng()}
                          disabled={isBundleExporting || isAnyImageLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-primary-300 text-primary-700 bg-primary-050 hover:bg-primary-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <Download className="w-4 h-4" />
                          {bundleExportMode === "png" ? "이미지 준비 중..." : "통합 이미지 다운로드"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDownloadScenarioBundlePdf()}
                          disabled={isBundleExporting || isAnyImageLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-warning-300 text-warning-700 bg-warning-050 hover:bg-warning-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <FileDown className="w-4 h-4" />
                          {bundleExportMode === "pdf" ? "PDF 준비 중..." : "PDF 다운로드"}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-space-3">
                      {result.scenarios.map((scenario, index) => {
                        const isSelected = selectedScenarioId === scenario.id;
                        return (
                          <button
                            key={scenario.id}
                            type="button"
                            onClick={() => handleScenarioClick(scenario)}
                            className={`w-full text-left rounded-radius-md border p-space-4 transition-all ${
                              isSelected
                                ? "border-primary-500 bg-primary-050 shadow-sm"
                                : "border-neutral-200 bg-white hover:border-primary-300 hover:bg-primary-050/40"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-space-2">
                              <p className="text-label-md text-neutral-900 font-semibold">시나리오 {index + 1}</p>
                              <span className="text-caption text-neutral-500">클릭해서 상세 보기</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-2 text-body-sm">
                              <p className="text-neutral-700"><span className="font-semibold text-neutral-900">사고 유형:</span> {scenario.accidentType}</p>
                              <p className="text-neutral-700"><span className="font-semibold text-neutral-900">위험 위치:</span> {scenario.riskLocation}</p>
                              <p className="text-neutral-700"><span className="font-semibold text-neutral-900">발생 이유:</span> {scenario.reason}</p>
                              <p className="text-neutral-700"><span className="font-semibold text-neutral-900">즉시 조치:</span> {scenario.immediateAction}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-radius-md border border-neutral-200 bg-white p-space-4 shadow-sm">
                    <h3 className="text-heading-4 text-neutral-900 mb-space-3">선택 시나리오 상세</h3>
                    {!selectedScenario ? (
                      <p className="text-body-sm text-neutral-500">카드를 클릭하면 시각화 이미지와 설명을 표시합니다.</p>
                    ) : (
                      <div className="space-y-space-4">
                        <div className="rounded-radius-md border border-warning-600/30 bg-warning-050 p-space-3">
                          <p className="text-body-sm text-neutral-700">
                            <span className="font-semibold text-neutral-900">설명:</span> {selectedScenario.detail}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-2">
                          <div className="rounded-radius-md border border-danger-200 bg-danger-50 p-space-3">
                            <p className="text-caption text-danger-700 mb-1 font-semibold flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              사고 유형
                            </p>
                            <p className="text-body-sm text-neutral-800">{selectedScenario.accidentType}</p>
                          </div>
                          <div className="rounded-radius-md border border-warning-200 bg-warning-050 p-space-3">
                            <p className="text-caption text-warning-700 mb-1 font-semibold flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5" />
                              위험 지점                            </p>
                            <p className="text-body-sm text-neutral-800">{selectedScenario.riskLocation}</p>
                          </div>
                          <div className="rounded-radius-md border border-primary-200 bg-primary-050 p-space-3">
                            <p className="text-caption text-primary-700 mb-1 font-semibold flex items-center gap-1.5">
                              <Eye className="w-3.5 h-3.5" />
                              사고 직전 상황
                            </p>
                            <p className="text-body-sm text-neutral-800">{selectedScenario.reason}</p>
                          </div>
                        </div>

                        {selectedScenarioImageState.status === "loading" && (
                          <div className="rounded-radius-md border border-neutral-200 bg-neutral-050 p-space-5 text-center">
                            <Loader2 className="w-5 h-5 text-primary-600 animate-spin mx-auto mb-2" />
                            <p className="text-body-sm text-neutral-600">위험 행동, 위험 지점, 작업자 긴장감이 드러나도록 시각화 이미지를 생성하고 있습니다.</p>
                          </div>
                        )}

                        {selectedScenarioImageState.status === "success" && selectedScenarioImageState.imageUrl && (
                          <div className="w-full aspect-[16/10] rounded-radius-md overflow-hidden bg-neutral-900 shadow-inner ring-1 ring-black/20">
                            <img
                              src={selectedScenarioImageState.imageUrl}
                              alt="selected scenario visualization"
                              className="object-cover w-full h-full"
                            />
                          </div>
                        )}

                            {/* 이미지 자체 표현 원칙: 오버레이 텍스트 제거 */}

                        {selectedScenarioImageState.status === "error" && (
                          <div className="rounded-radius-md border border-danger-200 bg-danger-50 p-space-4">
                            <p className="text-body-sm text-danger-700 mb-space-2">
                              {selectedScenarioImageState.errorMessage || "시각화 생성에 실패했습니다."}
                            </p>
                            <button
                              type="button"
                              onClick={() => void fetchScenarioImage(selectedScenario)}
                              className="text-body-sm font-medium px-3 py-1.5 rounded bg-danger-600 text-white hover:bg-danger-700 transition-colors"
                            >
                              다시 시도
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-sm mx-auto">
                    <div className="bg-white p-6 rounded-full inline-flex mb-5 shadow-sm border border-neutral-100 ring-4 ring-neutral-50">
                      <ImageIcon className="w-12 h-12 text-neutral-300" />
                    </div>
                    <h3 className="text-heading-4 text-neutral-700 mb-2">분석 대기 중</h3>
                    <p className="text-body-md text-neutral-500 leading-7">
                      좌측 패널에서 현장 기계·설비명을 검색하거나 상황 사진을 업로드하면 예측 사고 시나리오 카드 3개가 자동 생성됩니다.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}




