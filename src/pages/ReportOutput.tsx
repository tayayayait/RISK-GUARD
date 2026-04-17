import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Download, Copy, Check, Plus, X, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { RiskBadge } from "@/components/shared/RiskBadge";
import { useAssessment } from "@/contexts/AssessmentContext";
import { toast } from "@/hooks/use-toast";
import { getReportExportSections, getReportProfileLabel } from "@/lib/reportExportContent";
import type { AssessmentData, ReportProfile } from "@/types/assessment";

export default function ReportOutput() {
  const navigate = useNavigate();
  const {
    assessment,
    setCurrentStep,
    generateReport,
    updateReportSection,
    updateChecklist,
    updateBriefing,
    exportReport,
  } = useAssessment();

  const [selectedProfile, setSelectedProfile] = useState<ReportProfile>("submission");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["overview", "hazards", "risk-level"]));
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [newCheckItem, setNewCheckItem] = useState("");
  const [briefingText, setBriefingText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!assessment) {
      return;
    }
    setCurrentStep("report");
    generateReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment?.id]);

  useEffect(() => {
    if (!assessment) {
      return;
    }
    setChecklistItems(assessment.checklistItems);
    setBriefingText(assessment.briefingText);
    const initial: Record<string, string> = {};
    assessment.reportSections.forEach((section) => {
      initial[section.id] = section.content;
    });
    setEditedSections(initial);
  }, [assessment?.id, assessment?.updatedAt]);

  const previewAssessment = useMemo<AssessmentData | null>(() => {
    if (!assessment) {
      return null;
    }

    return {
      ...assessment,
      reportSections: assessment.reportSections.map((section) => ({
        ...section,
        content: editedSections[section.id] ?? section.content,
      })),
      checklistItems,
      briefingText,
    };
  }, [assessment, editedSections, checklistItems, briefingText]);

  const previewSections = useMemo(
    () => (previewAssessment ? getReportExportSections(previewAssessment, selectedProfile) : []),
    [previewAssessment, selectedProfile],
  );

  const profileLabel = getReportProfileLabel(selectedProfile);

  if (!assessment) {
    return null;
  }

  const canExport = Boolean(
    assessment.taskName &&
      assessment.profile.industry &&
      assessment.profile.hazards.length > 0 &&
      assessment.analysis.level,
  );

  const hasPartialEvidence = useMemo(
    () =>
      [assessment.apiStatuses.disasterCase, assessment.apiStatuses.fatalityCase, assessment.apiStatuses.lawGuide].some(
        (status) => status === "partial" || status === "error" || status === "empty",
      ),
    [assessment.apiStatuses],
  );

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSectionEdit = (id: string, value: string) => {
    setEditedSections((prev) => ({ ...prev, [id]: value }));
    updateReportSection(id, value);
  };

  const addChecklistItem = () => {
    if (!newCheckItem.trim() || checklistItems.length >= 10) {
      return;
    }
    const next = [...checklistItems, newCheckItem.trim()];
    setChecklistItems(next);
    setNewCheckItem("");
    updateChecklist(next);
  };

  const removeChecklistItem = (index: number) => {
    const next = checklistItems.filter((_, itemIndex) => itemIndex !== index);
    setChecklistItems(next);
    updateChecklist(next);
  };

  const handleBriefingChange = (value: string) => {
    const next = value.slice(0, 300);
    setBriefingText(next);
    updateBriefing(next);
  };

  const handleExport = async (format: "pdf" | "docx" | "clipboard") => {
    const result = await exportReport(format, selectedProfile);
    if (result.ok) {
      if (format === "clipboard") {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
      toast({ title: "내보내기 완료", description: result.message });
      return;
    }
    toast({ title: "내보내기 실패", description: result.message, variant: "destructive" });
  };

  const rightPanel = (
    <div className="sticky top-0 space-y-space-4">
      <div className="bg-surface rounded-radius-lg border border-border overflow-hidden">
        <div className="bg-primary-900 text-white p-space-5">
          <div className="flex items-center gap-space-2 mb-space-2">
            <FileText className="h-5 w-5" />
            <span className="text-label-md">미리보기</span>
          </div>
          <h3 className="text-heading-3">RISK-GUARD 위험성평가</h3>
          <p className="mt-space-1 text-caption text-white/80" data-testid="report-preview-profile-label">
            현재 프로필: {profileLabel}
          </p>
        </div>
        <div className="p-space-5 max-h-[calc(100vh-280px)] overflow-y-auto">
          <div className="space-y-space-4 text-body-sm text-neutral-700">
            <div>
              <h4 className="text-label-md text-neutral-900 mb-1">작업명</h4>
              <p>{assessment.taskName}</p>
            </div>
            <div>
              <h4 className="text-label-md text-neutral-900 mb-1">위험등급</h4>
              <RiskBadge level={assessment.analysis.level} size="sm" />
              <span className="ml-2 font-mono-num text-caption">{assessment.analysis.score}점</span>
            </div>
            {previewSections.map((section, index) => (
              <div key={section.id}>
                {section.group === "appendix" && index > 0 && previewSections[index - 1].group !== "appendix" && (
                  <h4 className="text-label-md text-neutral-900 mb-2">부록</h4>
                )}
                <h4 className="text-label-md text-neutral-900 mb-1">{section.title}</h4>
                <p className="whitespace-pre-line text-caption leading-relaxed">{section.content}</p>
              </div>
            ))}
            {checklistItems.length > 0 && (
              <div>
                <h4 className="text-label-md text-neutral-900 mb-1">체크리스트</h4>
                {checklistItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-1 text-caption">
                    <span className="text-neutral-500">{index + 1}.</span> {item}
                  </div>
                ))}
              </div>
            )}
            {briefingText && (
              <div>
                <h4 className="text-label-md text-neutral-900 mb-1">브리핑 문안</h4>
                <p className="whitespace-pre-line text-caption leading-relaxed">{briefingText}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardShell currentStep="report" rightPanel={rightPanel}>
      {assessment.citations.length === 0 && (
        <div className="mb-space-4 rounded-radius-md border border-warning-600/30 bg-warning-050 p-space-3 flex items-center gap-space-2">
          <AlertTriangle className="h-4 w-4 text-warning-600" />
          <span className="text-body-sm text-warning-700">
            근거가 선택되지 않았습니다. 제출은 가능하지만 보고서 신뢰도는 낮아질 수 있습니다.
          </span>
        </div>
      )}

      {hasPartialEvidence && (
        <div className="mb-space-4 rounded-radius-md border border-neutral-300 bg-neutral-100 p-space-3 text-body-sm text-neutral-700">
          일부 근거 데이터가 누락되었습니다. 누락된 구간은 미선택/수집 실패 문구로 표시됩니다.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-space-3 mb-space-6">
        <h1 className="text-heading-1 text-neutral-900">위험성평가 보고서 작성</h1>
        <div className="flex items-center gap-space-2">
          <Button
            type="button"
            variant={selectedProfile === "submission" ? "default" : "outline"}
            className="h-10 rounded-radius-md"
            data-testid="report-profile-submission"
            onClick={() => setSelectedProfile("submission")}
          >
            제출용
          </Button>
          <Button
            type="button"
            variant={selectedProfile === "review" ? "default" : "outline"}
            className="h-10 rounded-radius-md"
            data-testid="report-profile-review"
            onClick={() => setSelectedProfile("review")}
          >
            검토용
          </Button>
        </div>
        <div className="flex gap-space-3">
          <Button variant="outline" onClick={() => void handleExport("clipboard")} className="h-10 rounded-radius-md" disabled={!canExport}>
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? "복사됨" : "내용 복사"}
          </Button>
          <Button variant="outline" className="h-10 rounded-radius-md" onClick={() => void handleExport("docx")} disabled={!canExport}>
            <Download className="h-4 w-4 mr-1" />
            DOCX 다운로드
          </Button>
          <Button className="h-10 rounded-radius-md bg-primary-700 hover:bg-primary-900 text-white" onClick={() => void handleExport("pdf")} disabled={!canExport}>
            <Download className="h-4 w-4 mr-1" />
            PDF 다운로드
          </Button>
        </div>
      </div>

      {!canExport && (
        <div className="mb-space-4 text-body-sm text-danger-600">
          taskName, industry, hazards, riskLevel 필수값이 없어 내보내기가 비활성화되었습니다.
        </div>
      )}

      <div className="space-y-space-3">
        {assessment.reportSections.map((section) => {
          if (section.id === "checklist" || section.id === "briefing") return null;
          const isExpanded = expandedSections.has(section.id);

          return (
            <div key={section.id} className="bg-surface rounded-radius-lg border border-border overflow-hidden">
              <button onClick={() => toggleSection(section.id)} className="w-full flex items-center justify-between p-space-5 text-left hover:bg-neutral-050 transition-colors">
                <h3 className="text-heading-3 text-neutral-900">{section.title}</h3>
                {isExpanded ? <ChevronUp className="h-5 w-5 text-neutral-500" /> : <ChevronDown className="h-5 w-5 text-neutral-500" />}
              </button>
              {isExpanded && (
                <div className="px-space-5 pb-space-5 border-t border-neutral-100">
                  {section.editable ? (
                    <Textarea
                      value={editedSections[section.id] || section.content}
                      onChange={(event) => handleSectionEdit(section.id, event.target.value)}
                      className="min-h-[100px] mt-space-3 rounded-radius-md resize-y text-body-md"
                    />
                  ) : (
                    <p className="text-body-md text-neutral-700 mt-space-3 whitespace-pre-line">{section.content}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="bg-surface rounded-radius-lg border border-border p-space-5">
          <h3 className="text-heading-3 text-neutral-900 mb-space-4">작업 전 체크리스트</h3>
          <div className="space-y-space-2 mb-space-4">
            {checklistItems.map((item, index) => (
              <div key={index} className="flex items-center gap-space-3 group p-space-2 rounded-radius-sm hover:bg-neutral-050">
                <div className="h-5 w-5 rounded border-2 border-neutral-300 shrink-0" />
                <span className="text-body-md text-neutral-700 flex-1">{item}</span>
                <button onClick={() => removeChecklistItem(index)} className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500 hover:text-danger-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {checklistItems.length < 10 && (
            <div className="flex gap-space-2">
              <Input
                value={newCheckItem}
                onChange={(event) => setNewCheckItem(event.target.value)}
                placeholder="체크리스트 항목 추가"
                className="h-10 rounded-radius-md"
                onKeyDown={(event) => event.key === "Enter" && addChecklistItem()}
              />
              <Button variant="outline" onClick={addChecklistItem} className="h-10 rounded-radius-md shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
          <p className="text-caption text-neutral-500 mt-space-2">{checklistItems.length}/10개</p>
        </div>

        <div className="bg-surface rounded-radius-lg border border-border p-space-5">
          <h3 className="text-heading-3 text-neutral-900 mb-space-3">작업 전 안전 브리핑 문안</h3>
          <Textarea
            value={briefingText}
            onChange={(event) => handleBriefingChange(event.target.value)}
            placeholder="작업 전 공유할 안전 브리핑 문안을 작성하세요."
            className="min-h-[120px] rounded-radius-md resize-y text-body-md"
          />
          <p className="text-caption text-neutral-500 mt-space-2">{briefingText.length}/300자</p>
        </div>
      </div>

      <div className="flex justify-between mt-space-6">
        <Button variant="outline" onClick={() => navigate(`/assessments/${assessment.id}/materials`)}>
          교육 자료 화면으로 이동
        </Button>
      </div>
    </DashboardShell>
  );
}

