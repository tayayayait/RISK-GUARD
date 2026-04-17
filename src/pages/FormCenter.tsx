import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileSpreadsheet,
  FileWarning,
  History,
  Loader2,
  ScrollText,
  Trash2,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { FormCard } from "@/components/forms/FormCard";
import {
  FormHistoryService,
  type FormHistoryFormType,
  type FormHistorySummary,
} from "@/services/formHistoryService";

function formatDateLabel(isoText: string) {
  if (!isoText) return "-";

  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) {
    return isoText;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

type HistoryFilter = "all" | FormHistoryFormType;

function toHistoryFormLabel(formType: FormHistoryFormType) {
  return formType === "risk-assessment" ? "위험성평가 기록서" : "산업재해조사표";
}

function buildHistoryMetaLabel(item: FormHistorySummary) {
  if (item.formType === "accident-report") {
    return `현장: ${item.siteName || "-"} · 작성일: ${item.workDate || "-"}`;
  }
  return `현장: ${item.siteName || "-"} · 작업일: ${item.workDate || "-"} · 행 수: ${item.rowCount}`;
}

export default function FormCenter() {
  const [historyItems, setHistoryItems] = useState<FormHistorySummary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [hasHistoryLoaded, setHasHistoryLoaded] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");

  const loadHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    setHistoryError("");

    try {
      const items = await FormHistoryService.listHistoryRecords();
      setHistoryItems(items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "기록 목록을 불러오지 못했습니다.";
      setHistoryError(message);
      setHistoryItems([]);
    } finally {
      setIsHistoryLoading(false);
      setHasHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isHistoryOpen && !hasHistoryLoaded) {
      void loadHistory();
    }
  }, [hasHistoryLoaded, isHistoryOpen, loadHistory]);

  const toggleHistorySection = useCallback(() => {
    setHistoryError("");
    setIsHistoryOpen((previous) => !previous);
  }, []);

  const handleDeleteHistory = useCallback(async (recordId: string) => {
    setDeletingHistoryId(recordId);
    setHistoryError("");

    try {
      await FormHistoryService.deleteHistoryRecord(recordId);
      setHistoryItems((previous) => previous.filter((item) => item.id !== recordId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "기록 삭제에 실패했습니다.";
      if (message === "FORM_HISTORY_DELETE_BACKEND_UNAVAILABLE") {
        setHistoryError("삭제 API를 찾을 수 없습니다. form-history 함수를 최신 버전으로 재배포해 주세요.");
      } else {
        setHistoryError(message);
      }
    } finally {
      setDeletingHistoryId(null);
    }
  }, []);

  const historyToggleLabel = useMemo(
    () => (isHistoryOpen ? "기록 숨기기" : "기록 보기"),
    [isHistoryOpen],
  );

  const filteredHistoryItems = useMemo(() => {
    if (historyFilter === "all") {
      return historyItems;
    }
    return historyItems.filter((item) => item.formType === historyFilter);
  }, [historyFilter, historyItems]);

  const historyCounts = useMemo(() => ({
    all: historyItems.length,
    risk: historyItems.filter((item) => item.formType === "risk-assessment").length,
    accident: historyItems.filter((item) => item.formType === "accident-report").length,
  }), [historyItems]);

  const emptyHistoryMessage = useMemo(() => {
    if (historyFilter === "risk-assessment") {
      return "최근 30일 내 저장된 위험성평가 기록서가 없습니다.";
    }
    if (historyFilter === "accident-report") {
      return "최근 30일 내 저장된 산업재해조사표가 없습니다.";
    }
    return "최근 30일 내 저장된 서식 기록이 없습니다.";
  }, [historyFilter]);

  return (
    <DashboardShell>
      <div className="max-w-6xl mx-auto">
        <header className="mb-space-8">
          <h1 className="text-heading-1 text-neutral-900 tracking-tight mb-space-2">서식 센터</h1>
          <p className="text-body-lg text-neutral-600">
            RISK-GUARD 분석 데이터를 기반으로 필요한 안전보건 법정/내부 서식을 자동 생성합니다.
          </p>
        </header>

        <section className="mb-space-10">
          <h2 className="text-heading-3 text-neutral-900 mb-space-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-primary-700 rounded-full" />
            즉시 서식 작성
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-4">
            <FormCard
              title="위험성평가 기록서"
              description="공정별 유해위험요인 파악, 위험도 추정 및 감소대책 수립 (KRAS 기준 서식)"
              icon={FileSpreadsheet}
              href="/forms/risk-assessment"
              automationRate={95}
              badgeText="우선 추천"
            />
            <FormCard
              title="산업재해조사표"
              description="사고 발생 경위, 원인 분석 및 재발방지 계획 작성 (산업안전보건법 시행규칙 별지 제30호)"
              icon={FileWarning}
              href="/forms/accident-report"
              automationRate={70}
              badgeText="법정 서식"
            />
          </div>
        </section>

        <section className="mb-space-10">
          <div className="mb-space-4 flex items-center justify-between gap-space-3">
            <h2 className="text-heading-3 text-neutral-900 flex items-center gap-2">
              <span className="w-1 h-5 bg-primary-700 rounded-full" />
              <History className="h-5 w-5 text-primary-700" />
              최근 서식 기록 (30일)
            </h2>
            <button
              type="button"
              data-testid="history-toggle-button"
              aria-expanded={isHistoryOpen}
              className="inline-flex items-center gap-1 rounded-radius-sm border border-primary-200 px-space-3 py-space-2 text-body-sm text-primary-700 hover:bg-primary-050"
              onClick={toggleHistorySection}
            >
              {isHistoryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {historyToggleLabel}
            </button>
          </div>

          {isHistoryOpen && (
            <div data-testid="history-panel" className="rounded-radius-lg border border-border bg-surface p-space-4 space-y-space-3">
              <div className="flex items-center justify-between">
                <p className="text-body-sm text-neutral-600">
                  DOCX 저장 완료 기록만 보관되며, 30일 경과 시 자동 삭제됩니다.
                </p>
                <button
                  type="button"
                  className="text-body-sm text-primary-700 hover:text-primary-900"
                  onClick={() => void loadHistory()}
                  disabled={isHistoryLoading}
                >
                  새로고침
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="history-filter-all"
                  className={`rounded-radius-sm border px-space-3 py-space-1.5 text-body-sm ${
                    historyFilter === "all"
                      ? "border-primary-400 bg-primary-050 text-primary-800"
                      : "border-neutral-200 text-neutral-700 hover:bg-neutral-050"
                  }`}
                  onClick={() => setHistoryFilter("all")}
                >
                  전체 ({historyCounts.all})
                </button>
                <button
                  type="button"
                  data-testid="history-filter-risk"
                  className={`rounded-radius-sm border px-space-3 py-space-1.5 text-body-sm ${
                    historyFilter === "risk-assessment"
                      ? "border-primary-400 bg-primary-050 text-primary-800"
                      : "border-neutral-200 text-neutral-700 hover:bg-neutral-050"
                  }`}
                  onClick={() => setHistoryFilter("risk-assessment")}
                >
                  위험성평가 기록서 ({historyCounts.risk})
                </button>
                <button
                  type="button"
                  data-testid="history-filter-accident"
                  className={`rounded-radius-sm border px-space-3 py-space-1.5 text-body-sm ${
                    historyFilter === "accident-report"
                      ? "border-primary-400 bg-primary-050 text-primary-800"
                      : "border-neutral-200 text-neutral-700 hover:bg-neutral-050"
                  }`}
                  onClick={() => setHistoryFilter("accident-report")}
                >
                  산업재해조사표 ({historyCounts.accident})
                </button>
              </div>

              {isHistoryLoading && (
                <div className="rounded-radius-md border border-neutral-200 bg-neutral-050 p-space-4 text-body-sm text-neutral-600 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  기록 목록을 불러오는 중입니다.
                </div>
              )}

              {!isHistoryLoading && historyError && (
                <div className="rounded-radius-md border border-danger-200 bg-danger-050 p-space-4 text-body-sm text-danger-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {historyError}
                </div>
              )}

              {!isHistoryLoading && !historyError && filteredHistoryItems.length === 0 && (
                <div className="rounded-radius-md border border-neutral-200 bg-neutral-050 p-space-4 text-body-sm text-neutral-600">
                  {emptyHistoryMessage}
                </div>
              )}

              {!isHistoryLoading && !historyError && filteredHistoryItems.length > 0 && (
                <ul className="space-y-space-2">
                  {filteredHistoryItems.map((item) => {
                    const isDeleting = deletingHistoryId === item.id;
                    return (
                      <li key={item.id}>
                        <div className="rounded-radius-md border border-neutral-200 bg-white p-space-3 transition-colors hover:border-primary-400 hover:bg-primary-050/30">
                          <div className="flex items-center justify-between gap-space-3">
                            <Link
                              to={`/forms/${item.formType}?historyId=${encodeURIComponent(item.id)}`}
                              className="min-w-0 flex-1"
                            >
                              <div className="flex items-center gap-2">
                                <p className="text-body-md text-neutral-900 truncate">{item.taskName || "(제목 없음)"}</p>
                                <span className="shrink-0 rounded-full border border-primary-200 bg-primary-050 px-2 py-0.5 text-[11px] text-primary-800">
                                  {toHistoryFormLabel(item.formType)}
                                </span>
                              </div>
                              <p className="text-caption text-neutral-600 mt-1 truncate">
                                {buildHistoryMetaLabel(item)}
                              </p>
                            </Link>
                            <div className="flex items-start gap-space-3 shrink-0">
                              <div className="text-right">
                                <p className="text-caption text-neutral-500">저장 {formatDateLabel(item.createdAt)}</p>
                                <p className="text-caption text-neutral-500">만료 {formatDateLabel(item.expiresAt)}</p>
                              </div>
                              <button
                                type="button"
                                data-testid={`history-delete-${item.id}`}
                                className="inline-flex items-center gap-1 rounded-radius-sm border border-danger-200 px-space-2 py-space-1 text-caption text-danger-700 hover:bg-danger-050 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isDeleting || Boolean(deletingHistoryId)}
                                onClick={() => {
                                  void handleDeleteHistory(item.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {isDeleting ? "삭제 중" : "삭제"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-heading-3 text-neutral-900 mb-space-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-neutral-400 rounded-full" />
            추가 서식 (준비 중)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-4">
            <FormCard
              title="TBM (위험예지활동) 일지"
              description="작업 전 안전점검 및 브리핑 기록"
              icon={Users}
              href="#"
              automationRate={60}
              isAvailable={false}
            />
            <FormCard
              title="일일 안전점검 일지"
              description="현장 작업별 법적 점검 기준 체크리스트"
              icon={ClipboardCheck}
              href="#"
              automationRate={50}
              isAvailable={false}
            />
            <FormCard
              title="안전보건교육 일지"
              description="정기/수시 교육 내용 및 참석자 기록"
              icon={ScrollText}
              href="#"
              automationRate={35}
              isAvailable={false}
            />
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
