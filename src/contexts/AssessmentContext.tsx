import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createMockAssessment } from "@/data/mockData";
import { buildDefaultChecklistItems, buildReportSectionsFromAssessment } from "@/lib/reportBuilder";
import type { AnalyzeTaskInput } from "@/services/geminiService";
import { ActionPlanService } from "@/services/actionPlanService";
import { GeminiService } from "@/services/geminiService";
import { applyGeminiAnalysis, buildAnalyzingAssessment, buildAnalysisFailedAssessment } from "@/services/assessmentAnalysisService";
import { KoshaService } from "@/services/koshaService";
import { AssessmentLawService } from "@/services/assessmentLawService";
import { ReportService } from "@/services/reportService";
import {
  calculateRiskScore,
  DEFAULT_API_STATUSES,
  DEFAULT_EXPORT_STATE,
  DEFAULT_SAVE_STATE,
  getStepIndex,
  normalizeHazards,
  resolveStepRoute,
  type AssessmentData,
  type AssessmentStep,
  type ApiStatuses,
  type EvidenceItem,
  type ExportFormat,
  type LawActionItem,
  type MaterialItem,
  type MaterialSearchFilters,
  type ReportProfile,
  type WorkProfile,
} from "@/types/assessment";

interface AssessmentContextType {
  assessment: AssessmentData | null;
  setAssessment: (data: AssessmentData) => void;
  updateField: <K extends keyof AssessmentData>(key: K, value: AssessmentData[K]) => void;
  currentStep: AssessmentStep;
  setCurrentStep: (step: AssessmentStep) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  loadMockData: () => void;
  startAnalysis: (input: AnalyzeTaskInput) => Promise<AssessmentData>;
  confirmProfile: (profile: WorkProfile) => Promise<void>;
  prefetchLawGuidesForAnalysis: (options?: {
    taskName?: string;
    profile?: WorkProfile;
    force?: boolean;
  }) => Promise<void>;
  loadEvidence: (force?: boolean) => Promise<void>;
  reloadMaterials: (filters?: MaterialSearchFilters) => Promise<void>;
  toggleEvidenceExcluded: (evidenceId: string) => void;
  selectCitation: (evidenceId: string, selected: boolean) => void;
  selectMaterial: (materialId: string, mode: "select" | "exclude" | "briefing") => void;
  generateReport: () => void;
  updateReportSection: (sectionId: string, content: string) => void;
  updateChecklist: (items: string[]) => void;
  updateBriefing: (text: string) => void;
  exportReport: (format: ExportFormat, profile: ReportProfile) => Promise<{ ok: boolean; message: string }>;
  canAccessStep: (step: AssessmentStep) => boolean;
  getStepRoute: (step: AssessmentStep) => string;
}

const AssessmentContext = createContext<AssessmentContextType | null>(null);

function parseCasualtyScale(value?: string) {
  if (!value) {
    return { deaths: 0, injuries: 0 };
  }
  const deathMatch = value.match(/사망\s*(\d+)명/);
  const injuryMatch = value.match(/부상\s*(\d+)명/);
  return {
    deaths: deathMatch ? Number(deathMatch[1]) : 0,
    injuries: injuryMatch ? Number(injuryMatch[1]) : 0,
  };
}

function toFatalityCase(evidence: EvidenceItem) {
  const casualty = parseCasualtyScale(evidence.casualtyScale);
  return {
    id: evidence.id,
    date: evidence.incidentDate ?? "",
    location: evidence.place ?? "",
    summary: evidence.summaryBullets.join(" "),
    deaths: casualty.deaths,
    injuries: casualty.injuries,
    accidentType: evidence.standardAccidentType ?? "기타",
    similarity: evidence.similarity ?? 0.5,
  };
}

function hasValidArticleNumbers(item: LawActionItem) {
  return item.articleNumbers.some((articleNumber) => articleNumber.trim().length > 0);
}

function resolvePreferredLawActions(
  lawActionsFromLawResult: LawActionItem[] | undefined,
  actionPlanItems: LawActionItem[],
) {
  const validLawResultActions = (lawActionsFromLawResult ?? []).filter(hasValidArticleNumbers);
  if (validLawResultActions.length > 0) {
    return validLawResultActions;
  }

  const validActionPlanItems = actionPlanItems.filter(hasValidArticleNumbers);
  if (validActionPlanItems.length > 0) {
    return validActionPlanItems;
  }

  return actionPlanItems.length > 0
    ? actionPlanItems
    : (lawActionsFromLawResult ?? []);
}

function markSaving(data: AssessmentData) {
  return {
    ...data,
    saveState: {
      ...data.saveState,
      status: "saving" as const,
      dirty: true,
    },
    updatedAt: new Date().toISOString(),
  };
}

function evidenceApiStatuses(apiStatuses: ApiStatuses) {
  return [
    apiStatuses.disasterCase,
    apiStatuses.fatalityCase,
    apiStatuses.lawGuide,
    apiStatuses.materials,
  ];
}

function hasEvidenceFetchStarted(apiStatuses: ApiStatuses) {
  return evidenceApiStatuses(apiStatuses).some((status) => status !== "idle");
}

function isEvidenceFetchInProgress(apiStatuses: ApiStatuses) {
  return evidenceApiStatuses(apiStatuses).some((status) => status === "loading");
}

function hasEvidenceFetchSettled(apiStatuses: ApiStatuses) {
  if (!hasEvidenceFetchStarted(apiStatuses)) {
    return false;
  }

  const statuses = evidenceApiStatuses(apiStatuses);
  const allSourcesStarted = statuses.every((status) => status !== "idle");
  return allSourcesStarted && !isEvidenceFetchInProgress(apiStatuses);
}

function mapFetchStatus(status: "success" | "partial" | "empty" | "error"): ApiStatuses[keyof ApiStatuses] {
  if (status === "success") return "success";
  if (status === "partial") return "partial";
  if (status === "empty") return "empty";
  return "error";
}

function canReusePrefetchedLawData(apiStatuses: ApiStatuses) {
  return apiStatuses.lawGuide === "success"
    || apiStatuses.lawGuide === "partial"
    || apiStatuses.lawGuide === "empty";
}

function resolveProgressStep(current: AssessmentStep, next: AssessmentStep): AssessmentStep {
  return getStepIndex(next) > getStepIndex(current) ? next : current;
}

function normalizeMaterialMatchKey(item: Pick<MaterialItem, "title" | "url">) {
  const title = item.title.trim().toLowerCase();
  const url = item.url.trim().toLowerCase();
  return `${url}|${title}`;
}

function mergeMaterialsPreservingSelection(previous: MaterialItem[], next: MaterialItem[]) {
  const byId = new Map(previous.map((item) => [item.id, item]));
  const byKey = new Map(previous.map((item) => [normalizeMaterialMatchKey(item), item]));

  return next.map((item) => {
    const matched = byId.get(item.id) ?? byKey.get(normalizeMaterialMatchKey(item));
    if (!matched) {
      return item;
    }
    return {
      ...item,
      selected: Boolean(matched.selected && !matched.excluded),
      excluded: Boolean(matched.excluded),
    };
  });
}

export function AssessmentProvider({ children }: { children: React.ReactNode }) {
  const [assessment, setAssessmentState] = useState<AssessmentData | null>(null);
  const [currentStep, setCurrentStepState] = useState<AssessmentStep>("input");
  const [isLoading, setIsLoading] = useState(false);
  const evidenceLoadPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!assessment) {
      return;
    }

    if (assessment.saveState.status !== "saving") {
      return;
    }

    const timer = window.setTimeout(() => {
      setAssessmentState((prev) =>
        prev
          ? {
              ...prev,
              saveState: {
                status: "saved",
                dirty: false,
                lastSavedAt: new Date().toISOString(),
              },
            }
          : prev,
      );
    }, 300);

    return () => window.clearTimeout(timer);
  }, [assessment?.saveState.status, assessment]);

  const setAssessment = (data: AssessmentData) => {
    setAssessmentState(data);
    setCurrentStepState(data.currentStep);
  };

  const setCurrentStep = (step: AssessmentStep) => {
    setCurrentStepState((prev) => resolveProgressStep(prev, step));
    setAssessmentState((prev) => {
      if (!prev) {
        return prev;
      }
      const progressStep = resolveProgressStep(prev.currentStep, step);
      if (progressStep === prev.currentStep) {
        return prev;
      }
      return { ...prev, currentStep: progressStep };
    });
  };

  const updateField = <K extends keyof AssessmentData>(key: K, value: AssessmentData[K]) => {
    setAssessmentState((prev) => (prev ? markSaving({ ...prev, [key]: value }) : prev));
  };

  const canAccessStep = (step: AssessmentStep) => {
    if (step === "input") {
      return true;
    }
    if (!assessment) {
      return false;
    }
    if (step === "evidence") {
      if (getStepIndex(currentStep) >= getStepIndex("evidence")) {
        return true;
      }

      return currentStep === "analysis"
        && (assessment.status === "analysis_ready" || assessment.status === "evidence_loading");
    }
    return getStepIndex(step) <= getStepIndex(currentStep);
  };

  const getStepRoute = (step: AssessmentStep) => {
    if (step === "input" || !assessment) {
      return "/assessments/new";
    }
    return resolveStepRoute(step, assessment.id);
  };

  const startAnalysis = async (input: AnalyzeTaskInput) => {
    setIsLoading(true);

    const initial = buildAnalyzingAssessment(input);
    setAssessment(initial);

    try {
      const result = await GeminiService.analyzeTask(input);
      const next = applyGeminiAnalysis(initial, result);
      setAssessment(next);
      return next;
    } catch (error) {
      const failed = buildAnalysisFailedAssessment(initial);
      setAssessment(failed);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const confirmProfile = async (profile: WorkProfile) => {
    const normalizedProfile: WorkProfile = {
      ...profile,
      hazards: normalizeHazards(profile.hazards),
    };

    setAssessmentState((prev) => {
      if (!prev) {
        return prev;
      }
      const similarity = prev.analysis.fatalityCases.reduce((max, item) => Math.max(max, item.similarity), 0);
      const score = calculateRiskScore(normalizedProfile.hazards, normalizedProfile.equipment, similarity);
      const progressStep = resolveProgressStep(prev.currentStep, "analysis");
      return markSaving({
        ...prev,
        profile: normalizedProfile,
        analysis: {
          ...prev.analysis,
          score: score.score,
          level: score.level,
        },
        status: "analysis_ready",
        currentStep: progressStep,
      });
    });

    setCurrentStep("analysis");
  };

  const prefetchLawGuidesForAnalysis = async (options?: {
    taskName?: string;
    profile?: WorkProfile;
    force?: boolean;
  }) => {
    if (!assessment) {
      return;
    }

    const force = options?.force ?? false;
    const taskName = options?.taskName?.trim() || assessment.taskName;
    const profile = options?.profile
      ? {
          ...options.profile,
          hazards: normalizeHazards(options.profile.hazards),
        }
      : assessment.profile;

    if (!taskName) {
      return;
    }

    const hasLawEvidence = assessment.evidenceItems.some((item) => item.type === "law");
    const hasLawActionItems = assessment.lawActionItems.length > 0;
    const hasLawGuideMeta = Boolean(assessment.lawGuideMeta);
    const hasPrefetchedLawData = hasLawEvidence || hasLawActionItems || hasLawGuideMeta;
    if (!force && hasPrefetchedLawData && assessment.apiStatuses.lawGuide !== "error") {
      return;
    }

    setAssessmentState((prev) =>
      prev
        ? {
            ...prev,
            apiStatuses: {
              ...prev.apiStatuses,
              lawGuide: "loading",
            },
          }
        : prev,
    );

      const [lawResult, actionPlanResult] = await Promise.all([
      AssessmentLawService.searchLaws(taskName, profile, {
        taskDescription: assessment.taskDescription,
        analysisScenario: assessment.analysis.scenario,
      }),
      ActionPlanService.generateLawActions(taskName, profile, {
        taskDescription: assessment.taskDescription,
        analysisScenario: assessment.analysis.scenario,
      }),
    ]);

    setAssessmentState((prev) => {
      if (!prev) {
        return prev;
      }

      const lawEvidence = lawResult.items;
      const nonLawEvidence = prev.evidenceItems.filter((item) => item.type !== "law");

      return {
        ...prev,
        profile,
        lawActionItems: resolvePreferredLawActions(lawResult.lawActionItems, actionPlanResult.items),
        lawGuideMeta: lawResult.lawGuideMeta ?? null,
        evidenceItems: [...nonLawEvidence, ...lawEvidence],
        apiStatuses: {
          ...prev.apiStatuses,
          lawGuide: mapFetchStatus(lawResult.status),
        },
      };
    });
  };

  const loadEvidence = async (force = false) => {
    if (!assessment) {
      return;
    }

    if (evidenceLoadPromiseRef.current) {
      await evidenceLoadPromiseRef.current;
      if (!force) {
        return;
      }
    }

    if (!force && hasEvidenceFetchSettled(assessment.apiStatuses)) {
      setCurrentStep("evidence");
      return;
    }

    const task = (async () => {
      const reusePrefetchedLawData = !force && canReusePrefetchedLawData(assessment.apiStatuses);

      setAssessmentState((prev) =>
        prev
          ? {
              ...prev,
              status: "evidence_loading",
              apiStatuses: {
                ...prev.apiStatuses,
                disasterCase: "loading",
                fatalityCase: "loading",
                lawGuide: reusePrefetchedLawData ? prev.apiStatuses.lawGuide : "loading",
                materials: "loading",
              },
            }
          : prev,
      );

      const [disasterResult, fatalityResult, lawResult, actionPlanResult, materialResult] = await Promise.all([
        KoshaService.searchDisasterCases(assessment.taskName, assessment.profile),
        KoshaService.queryFatalities(assessment.taskName, assessment.profile),
        reusePrefetchedLawData
          ? Promise.resolve(null)
          : AssessmentLawService.searchLaws(assessment.taskName, assessment.profile, {
            taskDescription: assessment.taskDescription,
            analysisScenario: assessment.analysis.scenario,
          }),
        reusePrefetchedLawData
          ? Promise.resolve(null)
          : ActionPlanService.generateLawActions(assessment.taskName, assessment.profile, {
            taskDescription: assessment.taskDescription,
            analysisScenario: assessment.analysis.scenario,
          }),
        KoshaService.recommendMaterials(assessment.taskName, assessment.profile),
      ]);

      setAssessmentState((prev) => {
        if (!prev) {
          return prev;
        }

        const disaster = disasterResult.items;
        const fatality = fatalityResult.items;
        const existingLawEvidence = prev.evidenceItems.filter((item) => item.type === "law");
        const laws = lawResult?.items ?? existingLawEvidence;
        const materials = mergeMaterialsPreservingSelection(prev.materials, materialResult.items);

        const evidenceItems = [...disaster, ...fatality, ...laws];
        const fatalityCases = fatality.map((item) => toFatalityCase(item));
        const similarity = fatalityCases.reduce((max, item) => Math.max(max, item.similarity), 0);
        const score = calculateRiskScore(prev.profile.hazards, prev.profile.equipment, similarity);

        const apiStatuses: ApiStatuses = {
          ...prev.apiStatuses,
          disasterCase: mapFetchStatus(disasterResult.status),
          fatalityCase: mapFetchStatus(fatalityResult.status),
          lawGuide: lawResult ? mapFetchStatus(lawResult.status) : prev.apiStatuses.lawGuide,
          materials: mapFetchStatus(materialResult.status),
        };

        const hasApiError = Object.values(apiStatuses).some((value) => value === "error");
        const selectedMaterials = materials
          .filter((material) => material.selected && !material.excluded)
          .map((material) => material.id);
        const progressStep = resolveProgressStep(prev.currentStep, "evidence");

        return {
          ...prev,
          lawActionItems: lawResult && actionPlanResult
            ? resolvePreferredLawActions(lawResult.lawActionItems, actionPlanResult.items)
            : prev.lawActionItems,
          lawGuideMeta: lawResult ? (lawResult.lawGuideMeta ?? null) : prev.lawGuideMeta,
          analysis: {
            ...prev.analysis,
            score: score.score,
            level: score.level,
            fatalityCases,
          },
          evidenceItems,
          materials,
          selectedMaterials,
          apiStatuses,
          status: hasApiError ? "analysis_ready" : "ready_for_report",
          currentStep: progressStep,
        };
      });
      setCurrentStep("evidence");
    })();

    evidenceLoadPromiseRef.current = task;
    try {
      await task;
    } finally {
      if (evidenceLoadPromiseRef.current === task) {
        evidenceLoadPromiseRef.current = null;
      }
    }
  };

  const reloadMaterials = async (filters?: MaterialSearchFilters) => {
    if (!assessment) {
      return;
    }

    setAssessmentState((prev) =>
      prev
        ? {
            ...prev,
            apiStatuses: {
              ...prev.apiStatuses,
              materials: "loading",
            },
          }
        : prev,
    );

    const materialResult = await KoshaService.recommendMaterials(assessment.taskName, assessment.profile, filters);

    setAssessmentState((prev) => {
      if (!prev) {
        return prev;
      }

      const merged = mergeMaterialsPreservingSelection(prev.materials, materialResult.items);
      const selectedMaterials = merged
        .filter((material) => material.selected && !material.excluded)
        .map((material) => material.id);

      return {
        ...prev,
        materials: merged,
        selectedMaterials,
        apiStatuses: {
          ...prev.apiStatuses,
          materials: mapFetchStatus(materialResult.status),
        },
      };
    });
  };

  const toggleEvidenceExcluded = (evidenceId: string) => {
    setAssessmentState((prev) => {
      if (!prev) {
        return prev;
      }
      return markSaving({
        ...prev,
        evidenceItems: prev.evidenceItems.map((item) =>
          item.id === evidenceId ? { ...item, excluded: !item.excluded } : item,
        ),
        citations: prev.citations.filter((citation) => citation.evidenceId !== evidenceId),
      });
    });
  };

  const selectCitation = (evidenceId: string, selected: boolean) => {
    setAssessmentState((prev) => {
      if (!prev) {
        return prev;
      }

      const evidence = prev.evidenceItems.find((item) => item.id === evidenceId);
      if (!evidence || evidence.excluded) {
        return prev;
      }

      const alreadyExists = prev.citations.some((citation) => citation.evidenceId === evidenceId);

      if (selected) {
        if (alreadyExists || prev.citations.length >= 12) {
          return prev;
        }

        return markSaving({
          ...prev,
          citations: [
            ...prev.citations,
            {
              id: `${evidence.id}-${Date.now()}`,
              evidenceId: evidence.id,
              title: evidence.title,
              sourceBadge: evidence.sourceBadge,
              summary: evidence.summaryBullets.join(" "),
              order: prev.citations.length + 1,
              addedAt: new Date().toISOString(),
              aiSummary: evidence.aiSummary,
            },
          ],
        });
      }

      return markSaving({
        ...prev,
        citations: prev.citations
          .filter((citation) => citation.evidenceId !== evidenceId)
          .map((citation, index) => ({ ...citation, order: index + 1 })),
      });
    });
  };

  const selectMaterial = (materialId: string, mode: "select" | "exclude" | "briefing") => {
    setAssessmentState((prev) => {
      if (!prev) {
        return prev;
      }

      const materials = prev.materials.map((material) => {
        if (material.id !== materialId) {
          return material;
        }
        if (mode === "exclude") {
          return { ...material, excluded: !material.excluded, selected: false };
        }
        const nextSelected = mode === "select" ? !material.selected : true;
        return { ...material, selected: nextSelected, excluded: false };
      });

      const selectedMaterials = materials.filter((material) => material.selected && !material.excluded).map((material) => material.id);

      return markSaving({
        ...prev,
        materials,
        selectedMaterials,
      });
    });
  };

  const generateReport = () => {
    setAssessmentState((prev) => {
      if (!prev) {
        return prev;
      }

      const autoChecklistItems = buildDefaultChecklistItems(prev);
      const reportBase = {
        ...prev,
        checklistItems: autoChecklistItems,
      };
      const progressStep = resolveProgressStep(prev.currentStep, "report");

      const next = {
        ...reportBase,
        reportSections: buildReportSectionsFromAssessment(reportBase),
        currentStep: progressStep,
        status: "ready_for_report" as const,
      };
      return markSaving(next);
    });
    setCurrentStep("report");
  };

  const updateReportSection = (sectionId: string, content: string) => {
    setAssessmentState((prev) => {
      if (!prev) {
        return prev;
      }
      return markSaving({
        ...prev,
        reportSections: prev.reportSections.map((section) =>
          section.id === sectionId && section.editable ? { ...section, content } : section,
        ),
      });
    });
  };

  const updateChecklist = (items: string[]) => {
    setAssessmentState((prev) => (prev ? markSaving({ ...prev, checklistItems: items.slice(0, 10) }) : prev));
  };

  const updateBriefing = (text: string) => {
    setAssessmentState((prev) => (prev ? markSaving({ ...prev, briefingText: text.slice(0, 300) }) : prev));
  };

  const exportReport = async (format: ExportFormat, profile: ReportProfile) => {
    if (!assessment) {
      return { ok: false, message: "평가 데이터가 없습니다." };
    }

    if (!assessment.taskName || !assessment.profile.industry || assessment.profile.hazards.length === 0 || !assessment.analysis.level) {
      return { ok: false, message: "필수 항목이 부족하여 내보내기를 진행할 수 없습니다." };
    }

    setAssessmentState((prev) =>
      prev
        ? {
            ...prev,
            reportExportState: {
              ...prev.reportExportState,
              [format]: "loading",
            },
            status: "exporting",
          }
        : prev,
    );

    try {
      await ReportService.exportByFormat(format, assessment, profile);
      setAssessmentState((prev) =>
        prev
          ? {
              ...prev,
              reportExportState: {
                ...prev.reportExportState,
                [format]: "success",
                lastExportAt: new Date().toISOString(),
                lastError: undefined,
              },
              status: "completed",
            }
          : prev,
      );

      const warning = assessment.citations.length === 0 ? " (근거 0건 경고)" : "";
      return { ok: true, message: `${format.toUpperCase()} 내보내기 완료${warning}` };
    } catch (error) {
      setAssessmentState((prev) =>
        prev
          ? {
              ...prev,
              reportExportState: {
                ...prev.reportExportState,
                [format]: "error",
                lastError: error instanceof Error ? error.message : "내보내기 오류",
              },
              status: "error",
            }
          : prev,
      );
      return { ok: false, message: "내보내기 실패. 재시도하세요." };
    }
  };

  const loadMockData = () => {
    const mock = createMockAssessment();
    const withNewFields: AssessmentData = {
      ...mock,
      profileConfidence: {
        industry: "medium",
        workLocation: "medium",
        equipment: "medium",
        hazards: "medium",
      },
      evidenceItems: [],
      lawActionItems: [],
      lawGuideMeta: null,
      materials: [],
      citations: [],
      selectedMaterials: [],
      apiStatuses: { ...DEFAULT_API_STATUSES },
      saveState: { ...DEFAULT_SAVE_STATE },
      reportExportState: { ...DEFAULT_EXPORT_STATE },
    };
    setAssessment(withNewFields);
  };

  const value = useMemo<AssessmentContextType>(
    () => ({
      assessment,
      setAssessment,
      updateField,
      currentStep,
      setCurrentStep,
      isLoading,
      setIsLoading,
      loadMockData,
      startAnalysis,
      confirmProfile,
      prefetchLawGuidesForAnalysis,
      loadEvidence,
      reloadMaterials,
      toggleEvidenceExcluded,
      selectCitation,
      selectMaterial,
      generateReport,
      updateReportSection,
      updateChecklist,
      updateBriefing,
      exportReport,
      canAccessStep,
      getStepRoute,
    }),
    [assessment, currentStep, isLoading],
  );

  return <AssessmentContext.Provider value={value}>{children}</AssessmentContext.Provider>;
}

export function useAssessment() {
  const ctx = useContext(AssessmentContext);
  if (!ctx) {
    throw new Error("useAssessment must be used within AssessmentProvider");
  }
  return ctx;
}

export function useOptionalAssessment() {
  return useContext(AssessmentContext);
}
