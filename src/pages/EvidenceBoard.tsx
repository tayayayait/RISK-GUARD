import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAssessment } from "@/contexts/AssessmentContext";
import { EvidenceSummaryService, type EvidenceSummaryResult } from "@/services/evidenceSummaryService";
import type { ApiStatuses, EvidenceAiSummary, EvidenceItem } from "@/types/assessment";

type TabType = "case" | "fatality" | "guide" | "media";

function sourceStatusMessage(status: string) {
  if (status === "loading") return "로딩 중";
  if (status === "partial") return "일부 실패";
  if (status === "error") return "조회 실패";
  if (status === "empty") return "결과 없음";
  if (status === "success") return "완료";
  return "대기";
}

function isKnowledgeTab(tab: TabType) {
  return tab === "guide" || tab === "media";
}

function matchesTab(item: EvidenceItem, tab: TabType) {
  if (tab === "case") return item.type === "case";
  if (tab === "fatality") return item.type === "fatality";
  if (tab === "guide") return item.type === "law" && item.sourceBadge === "Guide";
  if (tab === "media") return item.type === "law" && item.sourceBadge === "미디어";
  return false;
}

function buildDetailContent(item: EvidenceItem) {
  const full = item.fullContent?.trim();
  if (full) {
    return full;
  }

  const clause = item.clausePreview?.trim();
  if (clause) {
    return clause;
  }

  return item.summaryBullets.join("\n").trim();
}

function buildCardPreview(item: EvidenceItem) {
  const candidate = item.summaryBullets[0]?.trim() || item.clausePreview?.trim() || buildDetailContent(item);
  const normalized = candidate.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 179)}…`;
}

function evidenceFetchStatuses(apiStatuses: ApiStatuses) {
  return [
    apiStatuses.disasterCase,
    apiStatuses.fatalityCase,
    apiStatuses.lawGuide,
    apiStatuses.materials,
  ];
}

function shouldShowEvidenceWaitingScreen(apiStatuses: ApiStatuses, status: string) {
  const statuses = evidenceFetchStatuses(apiStatuses);
  const hasStarted = statuses.some((value) => value !== "idle");
  const hasLoading = statuses.some((value) => value === "loading");

  if (status === "evidence_loading" || hasLoading) {
    return true;
  }

  return status === "analysis_ready" && !hasStarted;
}

export default function EvidenceBoard() {
  const navigate = useNavigate();
  const { assessment, loadEvidence, selectCitation, toggleEvidenceExcluded, setCurrentStep, updateField } = useAssessment();

  const [activeTab, setActiveTab] = useState<TabType>("case");
  const [keyword, setKeyword] = useState("");
  const [hideExcluded, setHideExcluded] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryResult, setSummaryResult] = useState<EvidenceSummaryResult | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    if (!assessment) return;
    const hasLawEvidence = assessment.evidenceItems.some((item) => item.type === "law");
    const shouldForceReloadLawEvidence = !hasLawEvidence
      && (assessment.apiStatuses.lawGuide === "empty" || assessment.apiStatuses.lawGuide === "partial");
    void loadEvidence(shouldForceReloadLawEvidence);
    if (assessment.analysis.level === "high" || assessment.analysis.level === "critical") {
      setActiveTab("fatality");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment?.id]);

  const isWaitingScreen = useMemo(() => {
    if (!assessment) {
      return false;
    }
    return shouldShowEvidenceWaitingScreen(assessment.apiStatuses, assessment.status);
  }, [assessment]);

  const citationIds = useMemo(
    () => new Set((assessment?.citations ?? []).map((citation) => citation.evidenceId)),
    [assessment?.citations],
  );

  const evidenceItems = useMemo(() => assessment?.evidenceItems ?? [], [assessment?.evidenceItems]);
  const lawGuideMeta = assessment?.lawGuideMeta ?? null;
  const lawGuideTrackStatus = useMemo(
    () => ({
      guide: lawGuideMeta?.trackStatus?.guide ?? ((lawGuideMeta?.trackCounts.guide ?? 0) > 0 ? "success" : "empty"),
      media: lawGuideMeta?.trackStatus?.media ?? ((lawGuideMeta?.trackCounts.media ?? 0) > 0 ? "success" : "empty"),
    }),
    [lawGuideMeta],
  );

  const activeLawGuideItems = useMemo(
    () => evidenceItems.filter((item) => matchesTab(item, activeTab)),
    [evidenceItems, activeTab],
  );

  const activeApiCount = useMemo(
    () => activeLawGuideItems.filter((item) => !item.sourceType || item.sourceType === "api").length,
    [activeLawGuideItems],
  );

  const lowerKeyword = keyword.trim().toLowerCase();
  const filteredItems = evidenceItems.filter((item) => {
    if (!matchesTab(item, activeTab)) return false;
    if (hideExcluded && item.excluded) return false;
    if (!lowerKeyword) return true;
    const target = `${item.title} ${item.summaryBullets.join(" ")} ${item.keywords.join(" ")} ${item.legalBasis ?? ""} ${item.fullContent ?? ""} ${item.clausePreview ?? ""}`.toLowerCase();
    return target.includes(lowerKeyword);
  });

  if (!assessment) return null;

  if (isWaitingScreen) {
    const waitingRightPanel = (
      <div className="space-y-space-4">
        <div className="bg-surface rounded-radius-lg border border-border p-space-5">
          <h3 className="text-heading-3 text-neutral-900 mb-space-3">API 상태</h3>
          <div className="space-y-space-2 text-body-sm text-neutral-700">
            <div>재해사례: {sourceStatusMessage(assessment.apiStatuses.disasterCase)}</div>
            <div>사망사고: {sourceStatusMessage(assessment.apiStatuses.fatalityCase)}</div>
            <div>Guide/미디어(집계): {sourceStatusMessage(assessment.apiStatuses.lawGuide)}</div>
            <div>교육자료: {sourceStatusMessage(assessment.apiStatuses.materials)}</div>
          </div>
        </div>
      </div>
    );

    return (
      <DashboardShell currentStep="evidence" rightPanel={waitingRightPanel}>
        <div className="rounded-radius-lg border border-border bg-surface p-space-6">
          <div className="flex items-center gap-space-2 text-primary-700 mb-space-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <h1 className="text-heading-2 text-neutral-900">근거 자료 생성 중</h1>
          </div>
          <p className="text-body-md text-neutral-600 mb-space-4">
            내부 자료를 모두 생성하는 중입니다. 완료되면 근거 화면이 자동으로 열립니다.
          </p>
          <div className="rounded-radius-md border border-neutral-200 bg-neutral-50 p-space-4 text-body-sm text-neutral-700 space-y-space-2">
            <div>유사 재해사례 수집: {sourceStatusMessage(assessment.apiStatuses.disasterCase)}</div>
            <div>사고사망 사례 수집: {sourceStatusMessage(assessment.apiStatuses.fatalityCase)}</div>
            <div>Guide/미디어 수집: {sourceStatusMessage(assessment.apiStatuses.lawGuide)}</div>
            <div>교육 자료 추천: {sourceStatusMessage(assessment.apiStatuses.materials)}</div>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const activeTrackCount = activeTab === "guide"
    ? (lawGuideMeta?.trackCounts.guide ?? activeLawGuideItems.length)
    : activeTab === "media"
      ? (lawGuideMeta?.trackCounts.media ?? activeLawGuideItems.length)
      : 0;

  const guideEmptyReasonMessage = (() => {
    if (lawGuideTrackStatus.guide === "error") return "Guide 트랙 조회 실패";
    if (lawGuideMeta?.guideEmptyReason === "NO_GUIDE_CANDIDATE") return "Guide 후보가 없어 결과가 비어 있습니다.";
    if (lawGuideMeta?.guideEmptyReason === "NO_GUIDE_MATCH_AFTER_RANKING") return "Guide 후보는 있었지만 점수 기준을 넘기지 못했습니다.";
    return null;
  })();

  const activeTrackErrors = (() => {
    if (activeTab === "guide") return lawGuideMeta?.trackErrors?.guide ?? [];
    if (activeTab === "media") return lawGuideMeta?.trackErrors?.media ?? [];
    return [];
  })();

  const openEvidenceDetail = (item: EvidenceItem) => {
    setSelectedEvidence(item);
    setSummaryResult(item.aiSummary ?? null);
    setSummaryError(null);
  };

  const closeEvidenceDetail = () => {
    setSelectedEvidence(null);
    setSummaryLoading(false);
    setSummaryResult(null);
    setSummaryError(null);
  };

  const summarizeSelectedEvidence = async () => {
    if (!selectedEvidence) {
      return;
    }
    if (selectedEvidence.sourceBadge === "미디어") {
      return;
    }

    const fullContent = buildDetailContent(selectedEvidence);
    if (!fullContent) {
      setSummaryError("요약할 원문 내용이 없습니다.");
      return;
    }

    setSummaryLoading(true);
    setSummaryResult(null);
    setSummaryError(null);

    try {
      const result = await EvidenceSummaryService.summarizeEvidence({
        taskName: assessment.taskName,
        taskDescription: assessment.taskDescription,
        profile: assessment.profile,
        evidence: {
          title: selectedEvidence.title,
          sourceBadge: selectedEvidence.sourceBadge,
          fullContent,
          keywords: selectedEvidence.keywords,
          url: selectedEvidence.url,
        },
      });
      const aiSummary: EvidenceAiSummary = {
        incidentRelevance: result.incidentRelevance,
        applicabilityReason: result.applicabilityReason,
        practicalActions: [...result.practicalActions],
      };

      setSummaryResult(aiSummary);
      setSelectedEvidence((previous) =>
        previous && previous.id === selectedEvidence.id ? { ...previous, aiSummary } : previous,
      );

      const nextEvidenceItems = assessment.evidenceItems.map((item) =>
        item.id === selectedEvidence.id ? { ...item, aiSummary } : item,
      );
      updateField("evidenceItems", nextEvidenceItems);

      if (assessment.citations.some((citation) => citation.evidenceId === selectedEvidence.id)) {
        const nextCitations = assessment.citations.map((citation) =>
          citation.evidenceId === selectedEvidence.id ? { ...citation, aiSummary } : citation,
        );
        updateField("citations", nextCitations);
      }
    } catch {
      setSummaryError("AI 요약 생성에 실패했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setSummaryLoading(false);
    }
  };

  const rightPanel = (
    <div className="space-y-space-4">
      <div className="bg-surface rounded-radius-lg border border-border p-space-5">
        <h3 className="text-heading-3 text-neutral-900 mb-space-3">API 상태</h3>
        <div className="space-y-space-2 text-body-sm text-neutral-700">
          <div>재해사례: {sourceStatusMessage(assessment.apiStatuses.disasterCase)}</div>
          <div>사망사고: {sourceStatusMessage(assessment.apiStatuses.fatalityCase)}</div>
          <div>Guide/미디어(집계): {sourceStatusMessage(assessment.apiStatuses.lawGuide)}</div>
          <div>Guide 트랙: {sourceStatusMessage(lawGuideTrackStatus.guide)}</div>
          <div>미디어 트랙: {sourceStatusMessage(lawGuideTrackStatus.media)}</div>
        </div>
      </div>

      <div className="bg-surface rounded-radius-lg border border-border p-space-5">
        <h3 className="text-heading-3 text-neutral-900 mb-space-3">인용 목록 ({assessment.citations.length}/12)</h3>
        {assessment.citations.length === 0 ? (
          <p className="text-body-sm text-neutral-500">선택된 인용 근거가 없습니다.</p>
        ) : (
          <div className="space-y-space-2">
            {assessment.citations.map((citation) => (
              <div key={citation.id} className="rounded-radius-md border border-neutral-200 p-space-2">
                <div className="text-caption text-neutral-500 mb-1">
                  {citation.order}. {citation.sourceBadge}
                </div>
                <div className="text-body-sm text-neutral-800">{citation.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <DashboardShell currentStep="evidence" rightPanel={rightPanel}>
        <div className="bg-surface rounded-radius-lg border border-border p-space-6 mb-space-5">
          <h1 className="text-heading-1 text-neutral-900 mb-space-2">근거 화면</h1>
          <p className="text-body-md text-neutral-500">재해 근거를 검토하고 필요한 항목을 인용 목록에 추가하세요.</p>
        </div>

        {(assessment.apiStatuses.disasterCase === "error" ||
          assessment.apiStatuses.fatalityCase === "partial" ||
          assessment.apiStatuses.lawGuide === "error" ||
          assessment.apiStatuses.lawGuide === "partial") && (
          <div className="mb-space-4 rounded-radius-md border border-warning-600/40 bg-warning-050 p-space-3 flex items-center gap-space-2">
            <AlertCircle className="h-4 w-4 text-warning-600" />
            <span className="text-body-sm text-warning-600">
              일부 근거 조회가 실패했습니다. 실패한 카테고리는 상태에 반영되고, 나머지 결과는 표시됩니다.
            </span>
          </div>
        )}

        <div className="bg-surface rounded-radius-lg border border-border p-space-4 mb-space-4">
          <div className="flex flex-wrap gap-space-2 mb-space-3">
            <Button variant={activeTab === "case" ? "default" : "outline"} onClick={() => setActiveTab("case")} className="h-9">
              유사 재해사례
            </Button>
            <Button variant={activeTab === "fatality" ? "default" : "outline"} onClick={() => setActiveTab("fatality")} className="h-9">
              사고사망 사례
            </Button>
            <Button variant={activeTab === "guide" ? "default" : "outline"} onClick={() => setActiveTab("guide")} className="h-9">
              KOSHA Guide
            </Button>
            <Button variant={activeTab === "media" ? "default" : "outline"} onClick={() => setActiveTab("media")} className="h-9">
              미디어
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-2">
            <Input
              placeholder="검색 키워드"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="h-10 rounded-radius-md md:col-span-2"
            />
            <Button variant={hideExcluded ? "default" : "outline"} onClick={() => setHideExcluded((prev) => !prev)} className="h-10">
              제외된 결과 숨기기
            </Button>
          </div>

          {isKnowledgeTab(activeTab) && (
            <div className="mt-space-3 rounded-radius-md border border-neutral-200 bg-neutral-50 px-space-3 py-space-2 text-caption text-neutral-700 space-y-1">
              <div>트랙 건수: Guide {lawGuideMeta?.trackCounts.guide ?? 0}건 · 미디어 {lawGuideMeta?.trackCounts.media ?? 0}건</div>
              <div>출처 집계({activeTab === "guide" ? "Guide" : "미디어"}): API {activeApiCount}</div>
              {activeTab === "guide" && activeTrackCount === 0 && guideEmptyReasonMessage && <div>Guide 상태: {guideEmptyReasonMessage}</div>}
              {isKnowledgeTab(activeTab) && activeTrackErrors.length > 0 && (
                <div>트랙 오류: {activeTrackErrors.join(" | ")}</div>
              )}
            </div>
          )}
        </div>

        {filteredItems.length === 0 ? (
          activeTab === "guide" && guideEmptyReasonMessage ? (
            <div className="rounded-radius-lg border border-border bg-surface p-space-6 text-center text-body-md text-neutral-600">
              Guide 결과가 없습니다. {guideEmptyReasonMessage}
            </div>
          ) : (
            <div className="rounded-radius-lg border border-border bg-surface p-space-6 text-center text-body-md text-neutral-600">
              검색 결과가 없습니다. 키워드를 조정해 다시 검색하세요.
            </div>
          )
        ) : (
          <div className="space-y-space-3">
            {filteredItems.map((item) => {
              const selected = citationIds.has(item.id);
              const knowledgeItem = item.type === "law";

              return (
                <div key={item.id} className="rounded-radius-lg border border-border bg-surface p-space-5">
                  <div className="flex items-start justify-between gap-space-3 mb-space-2">
                    <div>
                      <div className="text-caption text-neutral-500 mb-1 flex items-center gap-space-2">
                        <span>
                          {item.sourceBadge} · 관련도 {item.relevanceScore}
                        </span>
                        {knowledgeItem && item.sourceType && (
                          <span className="inline-flex items-center rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-700">
                            {item.sourceType}
                          </span>
                        )}
                        {item.sourceBadge === "미디어" && item.mediaStyle && (
                          <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-050 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                            {item.mediaStyle}
                          </span>
                        )}
                      </div>
                      <h3 className="text-heading-3 text-neutral-900">{item.title}</h3>
                    </div>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-body-sm text-primary-700 inline-flex items-center gap-space-1"
                      >
                        원문 보기
                        <ExternalLink className="h-4 w-4" />
                        <span className="sr-only">새 창 열림</span>
                      </a>
                    )}
                  </div>

                  {knowledgeItem ? (
                    <p className="text-body-sm text-neutral-700 mb-space-3 leading-relaxed">{buildCardPreview(item)}</p>
                  ) : (
                    <ul className="list-disc pl-space-5 text-body-sm text-neutral-700 mb-space-3">
                      {item.summaryBullets.map((bullet, index) => (
                        <li key={index}>{bullet}</li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap gap-space-2 mb-space-3">
                    {item.keywords.slice(0, 4).map((keywordItem, index) => (
                      <span key={`${item.id}-keyword-${index}-${keywordItem}`} className="text-caption bg-neutral-100 text-neutral-700 px-space-2 py-1 rounded-radius-sm">
                        {keywordItem}
                      </span>
                    ))}
                  </div>

                  {item.type === "fatality" && (
                    <div className="text-caption text-neutral-600 mb-space-3">
                      {item.incidentDate} · {item.place} · {item.casualtyScale}
                    </div>
                  )}

                  {knowledgeItem && item.applicationPoints && item.applicationPoints.length > 0 && (
                    <div className="text-caption text-neutral-600 mb-space-3">
                      적용 포인트: {item.applicationPoints.join(", ")}
                    </div>
                  )}

                  {item.type === "law" && item.legalBasis && (
                    <div className="text-caption text-primary-700 mb-space-3">법적 근거: {item.legalBasis}</div>
                  )}

                  {item.type === "law" && item.sourceBadge === "법령" && (
                    <div className="rounded-radius-md border border-primary-200 bg-primary-050 p-space-2 mb-space-3">
                      <div className="text-caption text-primary-800">
                        AI 관련성 점수: {item.semanticScore !== undefined ? Math.round(item.semanticScore) : "미제공"}
                      </div>
                      <div className="text-caption text-neutral-700 mt-1">
                        AI 관련성 근거: {item.relevanceReason?.trim() ? item.relevanceReason : "관련성 근거 없음"}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-space-2">
                    {knowledgeItem && (
                      <Button className="h-9" variant="outline" onClick={() => openEvidenceDetail(item)}>
                        상세 보기
                      </Button>
                    )}
                    <Button className="h-9" variant={selected ? "secondary" : "default"} onClick={() => selectCitation(item.id, !selected)}>
                      {selected ? "인용 해제" : "보고서에 인용"}
                    </Button>
                    <Button className="h-9" variant="outline" onClick={() => toggleEvidenceExcluded(item.id)}>
                      {item.excluded ? "제외 해제" : "제외"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end mt-space-6">
          <Button
            onClick={() => {
              setCurrentStep("materials");
              navigate(`/assessments/${assessment.id}/materials`);
            }}
            className="h-11 bg-primary-700 hover:bg-primary-900 text-white"
          >
            교육 자료 보기
            <ArrowRight className="h-4 w-4 ml-space-1" />
          </Button>
        </div>
      </DashboardShell>

      <Dialog open={Boolean(selectedEvidence)} onOpenChange={(open) => { if (!open) closeEvidenceDetail(); }}>
        <DialogContent className="max-w-4xl w-[95vw]">
          {selectedEvidence && (
            <div className="max-h-[80vh] overflow-y-auto pr-1">
              <DialogHeader>
                <DialogTitle>{selectedEvidence.title}</DialogTitle>
                <DialogDescription>
                  {selectedEvidence.sourceBadge}
                  {selectedEvidence.legalBasis ? ` · ${selectedEvidence.legalBasis}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-space-4 space-y-space-4">
                <div className="rounded-radius-md border border-neutral-200 bg-neutral-50 p-space-3">
                  <div className="text-caption text-neutral-600 mb-1">전체 내용</div>
                  <p className="text-body-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">{buildDetailContent(selectedEvidence) || "원문 정보 없음"}</p>
                </div>

                {selectedEvidence.url && (
                  <a href={selectedEvidence.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-space-1 text-body-sm text-primary-700">
                    원문 링크 열기
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}

                {selectedEvidence.sourceBadge !== "미디어" && (
                  <div className="rounded-radius-md border border-primary-200 bg-primary-050 p-space-3">
                    <div className="flex flex-wrap items-center justify-between gap-space-2 mb-space-2">
                      <div className="text-label-md text-primary-900">AI 요약</div>
                      <Button type="button" size="sm" className="h-8" onClick={() => void summarizeSelectedEvidence()} disabled={summaryLoading}>
                        {summaryLoading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            요약 생성 중
                          </>
                        ) : (
                          "AI 요약"
                        )}
                      </Button>
                    </div>

                    {summaryError && <p className="text-caption text-warning-700">{summaryError}</p>}

                    {summaryResult && (
                      <div className="space-y-space-3">
                        <div>
                          <div className="text-caption text-neutral-600 mb-1">우리 회사 사고와의 관련성</div>
                          <p className="text-body-sm text-neutral-800 leading-relaxed">{summaryResult.incidentRelevance}</p>
                        </div>

                        <div>
                          <div className="text-caption text-neutral-600 mb-1">적용 이유</div>
                          <p className="text-body-sm text-neutral-800 leading-relaxed">{summaryResult.applicabilityReason}</p>
                        </div>

                        <div>
                          <div className="text-caption text-neutral-600 mb-1">실제 조치</div>
                          {summaryResult.practicalActions.length === 0 ? (
                            <p className="text-caption text-neutral-500">실행 조치 항목 없음</p>
                          ) : (
                            <ul className="list-disc pl-space-5 text-body-sm text-neutral-800">
                              {summaryResult.practicalActions.map((action, index) => (
                                <li key={`practical-action-${index}`}>{action}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
