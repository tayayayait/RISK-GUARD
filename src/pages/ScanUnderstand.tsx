import React, { useState, useRef } from "react";
import { Camera, Upload, Type, Search, AlertCircle, RefreshCw, Check } from "lucide-react";
import { scanAndAnalyzeMsds, ScanResponse } from "@/services/msdsScanService";
import { ScanResultCard } from "@/components/ScanResultCard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { FeatureHistoryPanel } from "@/components/history/FeatureHistoryPanel";
import {
  UserWorkHistoryService,
  type UserWorkRecordDetail,
} from "@/services/userWorkHistoryService";

interface ScanHistoryInput {
  mode: "image" | "text";
  text: string;
  productHint: string;
  imageIncluded: boolean;
}

type ScanHistoryRecord = UserWorkRecordDetail<ScanHistoryInput, ScanResponse>;

export default function ScanUnderstand() {
  const [tab, setTab] = useState<"image" | "text">("text");
  const [textInput, setTextInput] = useState("");
  const [productHint, setProductHint] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [historyItems, setHistoryItems] = useState<ScanHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [openingHistoryId, setOpeningHistoryId] = useState<string>();
  const [deletingHistoryId, setDeletingHistoryId] = useState<string>();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const items = await UserWorkHistoryService.list("chemical-scan");
      setHistoryItems(items as unknown as ScanHistoryRecord[]);
    } catch {
      setHistoryError("화학물질 스캔 기록을 불러오지 못했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  };

  React.useEffect(() => {
    void loadHistory();
  }, []);

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일(JPG, PNG 등)만 업로드 가능합니다.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setImagePreview(b64);
      setImageBase64(b64.replace(/^data:image\/[a-zA-Z]+;base64,/, ""));
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async (selectedChemId?: string) => {
    setError(null);
    setLoading(true);

    try {
      let data: ScanResponse;
      if (tab === "image") {
        if (!imageBase64) {
          setError("스캔할 이미지를 업로드하거나 촬영해 주세요.");
          setLoading(false);
          return;
        }

        data = await scanAndAnalyzeMsds({
          mode: "image",
          image: imageBase64,
          hint: productHint ? { productName: productHint } : undefined,
          selectedChemId,
        });
      } else {
        if (!textInput.trim() && !selectedChemId) {
          setError("화학물질명 또는 CAS 번호를 입력해 주세요.");
          setLoading(false);
          return;
        }

        data = await scanAndAnalyzeMsds({
          mode: "text",
          text: textInput.trim(),
          hint: productHint ? { productName: productHint } : undefined,
          selectedChemId,
        });
      }

      setResult(data);
      if (!data.needsUserSelection) {
        try {
          const input: ScanHistoryInput = {
            mode: tab,
            text: tab === "text" ? textInput.trim() : "",
            productHint: productHint.trim(),
            imageIncluded: tab === "image" && Boolean(imageBase64),
          };
          const titleSource = data.substance?.chemNameKor || productHint.trim() || textInput.trim() || "미확인 물질";
          const saved = await UserWorkHistoryService.create({
            feature: "chemical-scan",
            title: `${titleSource} 화학물질 스캔`,
            subtitle: data.substance?.casNo ? `CAS ${data.substance.casNo}` : `${tab === "image" ? "사진" : "텍스트"} 분석`,
            input,
            result: data,
          });
          setHistoryItems((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
        } catch {
          setHistoryError("분석 결과를 계정 기록에 저장하지 못했습니다.");
        }
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "화학물질 분석 중 오류가 발생했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOpenHistory = async (item: ScanHistoryRecord) => {
    setOpeningHistoryId(item.id);
    setHistoryError("");
    try {
      const record = await UserWorkHistoryService.get<ScanHistoryInput, ScanResponse>(
        item.id,
        "chemical-scan",
      );
      setTab(record.input.mode === "image" ? "image" : "text");
      setTextInput(record.input.text ?? "");
      setProductHint(record.input.productHint ?? "");
      setImageBase64(null);
      setImagePreview(null);
      setResult(record.result);
      setError(null);
    } catch {
      setHistoryError("선택한 화학물질 스캔 기록을 다시 열지 못했습니다.");
    } finally {
      setOpeningHistoryId(undefined);
    }
  };

  const handleDeleteHistory = async (item: ScanHistoryRecord) => {
    setDeletingHistoryId(item.id);
    setHistoryError("");
    try {
      await UserWorkHistoryService.remove(item.id, "chemical-scan");
      setHistoryItems((previous) => previous.filter((record) => record.id !== item.id));
    } catch {
      setHistoryError("화학물질 스캔 기록을 삭제하지 못했습니다.");
    } finally {
      setDeletingHistoryId(undefined);
    }
  };

  return (
    <DashboardShell>
      <div className="max-w-4xl mx-auto space-y-6 py-8 px-4 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-neutral-900 tracking-tight">
              🔍 화학물질 안전 스캔·이해 (M1)
            </h1>
            <p className="text-sm text-neutral-600 mt-1">
              GHS 라벨·MSDS·작업지시서를 촬영하거나 입력하면, 공단 공식 안전자료를 조회해 필요 보호구와 응급조치를 안내합니다.
            </p>
          </div>

        </div>

        <FeatureHistoryPanel
          items={historyItems}
          onOpen={(item) => void handleOpenHistory(item)}
          onDelete={(item) => void handleDeleteHistory(item)}
          onRefresh={() => void loadHistory()}
          heading="내 화학물질 스캔 기록"
          description="검색 조건과 분석 결과를 계정별로 저장합니다. 업로드한 원본 이미지는 기록에 보관하지 않습니다."
          loading={historyLoading}
          error={historyError}
          openingId={openingHistoryId}
          deletingId={deletingHistoryId}
        />

        {/* 탭 네비게이션 */}
        <div className="flex border-b border-neutral-200 gap-2">
          <button
            onClick={() => {
              setTab("text");
              setError(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              tab === "text"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
            data-testid="tab-text"
          >
            <Type className="w-4 h-4" />
            텍스트 / 물질명 검색
          </button>
          <button
            onClick={() => {
              setTab("image");
              setError(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
              tab === "image"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
            data-testid="tab-image"
          >
            <Camera className="w-4 h-4" />
            라벨 / MSDS 사진 스캔
          </button>
        </div>

        {/* 입력 카드 */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
          {tab === "text" ? (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-neutral-700 uppercase tracking-wider">
                화학물질명 / CAS 번호 / UN 번호
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  placeholder="예: 톨루엔, 108-88-3, UN1294, 아세톤"
                  className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm text-neutral-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-hidden"
                  data-testid="text-search-input"
                />
                <button
                  onClick={() => handleScan()}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  data-testid="search-button"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  조회
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-neutral-300 hover:border-indigo-500 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-neutral-50/50"
                data-testid="image-dropzone"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
                  className="hidden"
                  data-testid="image-file-input"
                />
                {imagePreview ? (
                  <div className="space-y-3 flex flex-col items-center">
                    <img
                      src={imagePreview}
                      alt="라벨 미리보기"
                      className="max-h-48 rounded-lg object-contain border"
                    />
                    <span className="text-xs text-indigo-600 font-semibold">다른 사진으로 변경하려면 클릭</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-neutral-500">
                    <Upload className="w-8 h-8 text-neutral-400" />
                    <span className="text-sm font-semibold text-neutral-700">현장 라벨 / MSDS 사진을 업로드하거나 촬영하세요</span>
                    <span className="text-xs text-neutral-400">JPG, PNG (최대 4MB)</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={productHint}
                  onChange={(e) => setProductHint(e.target.value)}
                  placeholder="보조 힌트 (선택사항: 제품명 또는 물질명)"
                  className="flex-1 rounded-lg border border-neutral-300 px-3.5 py-2 text-xs text-neutral-900 focus:border-indigo-500 outline-hidden"
                />
                <button
                  onClick={() => handleScan()}
                  disabled={loading || !imageBase64}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  data-testid="scan-image-button"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  AI 비전 스캔 시작
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 flex items-center gap-2" data-testid="scan-error">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* 다중 매칭 후보 선택 UI */}
        {result?.needsUserSelection && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm space-y-3" data-testid="user-selection-modal">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-amber-900 text-sm md:text-base">
                  일치하는 물질이 여러 개 검색되었습니다
                </h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  정확한 보호구 및 응급조치 안내를 위해 올바른 물질을 선택해 주세요.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2" data-testid="candidates-list">
              {result.needsUserSelection.candidates.map((cand) => (
                <button
                  key={cand.chemId}
                  onClick={() => handleScan(cand.chemId)}
                  disabled={loading}
                  className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-white hover:bg-amber-100/70 text-left transition-colors"
                  data-testid={`candidate-button-${cand.chemId}`}
                >
                  <div>
                    <div className="font-bold text-sm text-neutral-900">{cand.chemNameKor}</div>
                    <div className="text-xs text-neutral-500">
                      {cand.casNo ? `CAS: ${cand.casNo}` : `ID: ${cand.chemId}`}
                    </div>
                  </div>
                  <Check className="w-4 h-4 text-amber-600" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 물질 미특정 UI */}
        {result && !result.substance && !result.needsUserSelection && (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm text-center space-y-3" data-testid="unresolved-view">
            <AlertCircle className="w-10 h-10 text-neutral-400 mx-auto" />
            <h3 className="text-base font-bold text-neutral-800">
              물질을 특정하지 못했습니다
            </h3>
            <p className="text-xs text-neutral-600 max-w-md mx-auto">
              입력하신 내용 또는 이미지에서 유효한 CAS 번호나 물질명을 찾지 못했습니다. 정확한 물질명이나 CAS 번호로 직접 검색해 보시기 바랍니다.
            </p>
            {result.extraction?.rawText && (
              <div className="text-left bg-neutral-50 p-3 rounded-md text-xs text-neutral-600 max-w-lg mx-auto">
                <span className="font-bold block mb-1">인식된 원문:</span>
                {result.extraction.rawText}
              </div>
            )}
          </div>
        )}

        {/* 결과 카드 */}
        {result?.substance && (
          <ScanResultCard data={result} />
        )}
      </div>
    </DashboardShell>
  );
}
