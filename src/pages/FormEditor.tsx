import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, Download, Loader2, Sparkles } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { analyzeTaskToAssessment } from "@/services/assessmentAnalysisService";
import {
  FormService,
  applyCompanyProfileDefaults,
  buildRiskRowValidationSummary,
  createEmptyRiskAssessmentRow,
  getRiskRowsLegalBasisCandidateOptions,
  getRiskLawContextFromAssessment,
  normalizeRiskAssessmentRows,
  reclassifyRiskAssessmentRows,
  resolveRiskRowsLegalBasis,
  type RiskLawContext,
} from "@/services/formService";
import { CompanyProfileService } from "@/services/companyProfileService";
import { FormLawService } from "@/services/formLawService";
import { RiskLegalBasisFitService } from "@/services/riskLegalBasisFitService";
import { RiskAssessmentTable } from "@/components/forms/RiskAssessmentTable";
import { AccidentReportForm } from "@/components/forms/AccidentReportForm";
import type {
  AccidentReportData,
  RiskAssessmentRow,
  RiskRowValidationEvent,
  RiskRowValidationSummary,
} from "@/types/formTemplate";
import type { AssessmentData, EvidenceItem } from "@/types/assessment";
import type { CompanyProfile, CompanyProfileStorageSource } from "@/types/companyProfile";
import { buildRiskAssessmentDocxBlob } from "@/lib/documentBuilder";
import { buildAccidentReportDocxBlob } from "@/lib/accidentReportDocxBuilder";
import { ACCIDENT_REPORT_EXPORT_ROOT_ID } from "@/lib/exportRootIds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RISK_ASSESSMENT_TEMPLATE_HINT } from "@/lib/riskAssessmentTemplateHint";
import { FormHistoryService } from "@/services/formHistoryService";
import { RiskValidationAuditService } from "@/services/riskValidationAuditService";

type FormType = "risk-assessment" | "accident-report";

function getDefaultTaskName(formType: FormType) {
  return formType === "risk-assessment" ? "위험성평가 기록서 작성 대상 작업" : "산업재해조사표 작성 대상 사고";
}

function deriveAccidentTaskNameFromContext(context: string) {
  const normalized = context.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return getDefaultTaskName("accident-report");
  }

  const firstSentence = (normalized.split(/[.!?\n]/)[0] ?? "").trim();
  const candidate = firstSentence || normalized;
  return candidate.slice(0, 80);
}

const STRICT_LEGAL_BASIS_PATTERN = /^\uC0B0\uC5C5\uC548\uC804\uBCF4\uAC74\uAE30\uC900\uC5D0 \uAD00\uD55C \uADDC\uCE59 \uC81C\d+\uC870\([^)]+\)$/;
const LEGAL_BASIS_ARTICLE_PATTERN = /(\uC81C\s*\d+\s*\uC870(?:\s*\uC81C\s*\d+\s*\uD56D)?)/;
const DUPLICATE_SIMILARITY_STRICT_THRESHOLD = 0.82;
const DUPLICATE_SIMILARITY_SIGNAL_THRESHOLD = 0.75;
const AI_ADD_RISK_MAX_ATTEMPTS = 2;

const RISK_HAZARD_SIGNAL_RULES: Array<{ signal: string; pattern: RegExp }> = [
  { signal: "추락", pattern: /(추락|고소|비계|발판|난간|안전대)/i },
  { signal: "감전", pattern: /(감전|전원(?:\s*(?:차단|격리|공급|케이블|선|상태|투입))|충전부|누전|활선|배전반|전기)/i },
  { signal: "절단", pattern: /(절단|베임|커팅|날|칼날|회전날)/i },
  { signal: "끼임말림", pattern: /(끼임|말림|협착|회전부|롤러|컨베이어)/i },
  { signal: "차량충돌", pattern: /(지게차|차량|이동장비|후진|충돌|치임)/i },
  { signal: "낙하물", pattern: /(낙하물|비래|비산|상부 자재|파편)/i },
  { signal: "화학노출", pattern: /(화학|유해물질|노출|흡입|용제)/i },
  { signal: "화재폭발", pattern: /(화재|폭발|인화|점화|발화)/i },
];

function toRiskRowReviewSignature(row: Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor">) {
  return [
    row.workProcess.trim(),
    row.category.trim(),
    row.cause.trim(),
    row.hazardFactor.trim(),
  ].join("|");
}

function isStrictLegalBasis(value?: string) {
  return STRICT_LEGAL_BASIS_PATTERN.test((value ?? "").trim());
}

function legalBasisDedupKey(value?: string) {
  const normalized = (value ?? "").trim();
  const matched = normalized.match(LEGAL_BASIS_ARTICLE_PATTERN);
  if (matched?.[1]) {
    return matched[1].replace(/\s+/g, "");
  }
  return normalized.replace(/\s+/g, "");
}

interface LegalBasisNormalizationResult {
  rows: RiskAssessmentRow[];
  reviewRequiredByRow: boolean[];
}

function selectRemappedLegalBasis(
  row: Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor">,
  lawContext: RiskLawContext,
  usedLegalBasisKeys: Set<string>,
) {
  const optionGroups = getRiskRowsLegalBasisCandidateOptions([row], lawContext, 5);
  const options = optionGroups[0] ?? [];

  for (const option of options) {
    if (!isStrictLegalBasis(option.legalBasis)) {
      continue;
    }
    const optionKey = legalBasisDedupKey(option.legalBasis);
    if (!optionKey) {
      continue;
    }
    if (!usedLegalBasisKeys.has(optionKey)) {
      return option.legalBasis;
    }
  }

  return "";
}

function enforceUniqueLegalBases(
  rows: RiskAssessmentRow[],
  lawContext: RiskLawContext,
): LegalBasisNormalizationResult {
  const usedLegalBasisKeys = new Set<string>();
  const reviewRequiredByRow = rows.map(() => false);

  const normalizedRows = rows.map((row, index) => {
    if (!isStrictLegalBasis(row.legalBasis)) {
      return row;
    }

    const legalBasisKey = legalBasisDedupKey(row.legalBasis);
    if (!legalBasisKey) {
      return row;
    }

    if (!usedLegalBasisKeys.has(legalBasisKey)) {
      usedLegalBasisKeys.add(legalBasisKey);
      return row;
    }

    const remappedLegalBasis = selectRemappedLegalBasis(row, lawContext, usedLegalBasisKeys);
    if (isStrictLegalBasis(remappedLegalBasis)) {
      const remappedKey = legalBasisDedupKey(remappedLegalBasis);
      if (remappedKey) {
        usedLegalBasisKeys.add(remappedKey);
      }
      return {
        ...row,
        legalBasis: remappedLegalBasis,
      };
    }

    reviewRequiredByRow[index] = true;
    return {
      ...row,
      legalBasis: "",
    };
  });

  return {
    rows: normalizedRows,
    reviewRequiredByRow,
  };
}

function setNestedValue<T extends object>(source: T, fieldPath: string, value: unknown): T {
  const keys = fieldPath.split(".");
  const root = { ...(source as Record<string, unknown>) };
  let cursor: Record<string, unknown> = root;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    const next = cursor[key];
    const cloned =
      next && typeof next === "object" ? { ...(next as Record<string, unknown>) } : {};
    cursor[key] = cloned;
    cursor = cloned;
  }

  cursor[keys[keys.length - 1]] = value;
  return root as T;
}

function filterLawEvidenceItems(items: EvidenceItem[]) {
  return items.filter((item) => item.type === "law" && item.sourceBadge === "법령");
}

function normalizeRiskDuplicateText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRiskDuplicateBigrams(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 2) {
    return new Set<string>(compact ? [compact] : []);
  }

  const grams = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    grams.add(compact.slice(index, index + 2));
  }
  return grams;
}

function riskDuplicateSimilarity(left: string, right: string) {
  const leftSet = buildRiskDuplicateBigrams(normalizeRiskDuplicateText(left));
  const rightSet = buildRiskDuplicateBigrams(normalizeRiskDuplicateText(right));

  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function tokenizeRiskKeywords(value: string) {
  return normalizeRiskDuplicateText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function countSharedRiskKeywords(left: string[], right: string[]) {
  const rightSet = new Set(right);
  let count = 0;
  for (const keyword of left) {
    if (rightSet.has(keyword)) {
      count += 1;
    }
  }
  return count;
}

function detectRiskHazardSignal(value: string) {
  const normalized = normalizeRiskDuplicateText(value);
  for (const rule of RISK_HAZARD_SIGNAL_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.signal;
    }
  }
  return "";
}

function isMostlyEmptyRiskRow(row?: RiskAssessmentRow) {
  if (!row) {
    return false;
  }

  return [
    row.cause,
    row.hazardFactor,
    row.currentMeasure,
    row.reductionMeasure,
    row.legalBasis,
    row.improvementDate ?? "",
    row.completionDate ?? "",
    row.responsiblePerson ?? "",
  ].every((value) => value.trim().length === 0);
}

function buildLegalBasisReviewRequiredByRows(rows: RiskAssessmentRow[]) {
  return rows.map((row) => !row.legalBasis.trim() && !isMostlyEmptyRiskRow(row));
}

function normalizeRiskGuidanceText(value?: string) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function summarizeRiskRowForGuidance(row: Pick<RiskAssessmentRow, "cause" | "hazardFactor">) {
  const cause = normalizeRiskGuidanceText(row.cause).slice(0, 64);
  const hazard = normalizeRiskGuidanceText(row.hazardFactor).slice(0, 64);
  return `cause=${cause || "(empty)"}; hazard=${hazard || "(empty)"}`;
}

function buildAiRiskAddTemplateHint(
  existingRows: RiskAssessmentRow[],
  previousCandidateSummaries: string[],
  attempt: number,
) {
  const existingRowGuidance = existingRows
    .filter((row) => !isMostlyEmptyRiskRow(row))
    .slice(0, 6)
    .map((row, index) => `- existing-${index + 1}: ${summarizeRiskRowForGuidance(row)}`);

  const previousCandidateGuidance = previousCandidateSummaries
    .slice(0, 4)
    .map((summary, index) => `- previous-${index + 1}: ${summary}`);

  return [
    RISK_ASSESSMENT_TEMPLATE_HINT,
    "",
    "[AI add risk guidance]",
    "Goal: generate at least one risk row that is not semantically duplicate of existing rows.",
    "Rule: avoid overlap in accident mechanism, cause, and hazard factor against existing rows.",
    "Rule: if current context includes electrical work keywords, prioritize electric-shock/arc/fire related mechanisms before repeating fall-risk.",
    existingRowGuidance.length > 0 ? "[Existing rows: do not duplicate]" : "",
    ...existingRowGuidance,
    previousCandidateGuidance.length > 0 ? "[Previous duplicate candidates: avoid repeating]" : "",
    ...previousCandidateGuidance,
    attempt > 0 ? "[retry-novelty] Previous candidates overlapped existing rows. Generate a more distinct mechanism." : "",
  ].filter(Boolean).join("\n");
}

function isDuplicateRiskRow(candidate: RiskAssessmentRow, existingRows: RiskAssessmentRow[]) {
  const candidateText = `${candidate.cause} ${candidate.hazardFactor}`.trim();
  const normalizedCandidateText = normalizeRiskDuplicateText(candidateText);
  const candidateKeywords = tokenizeRiskKeywords(candidateText);
  const candidateSignal = detectRiskHazardSignal(candidateText);
  if (normalizedCandidateText.length === 0) {
    return true;
  }

  return existingRows.some((row) => {
    if (isMostlyEmptyRiskRow(row)) {
      return false;
    }

    const existingText = `${row.cause} ${row.hazardFactor}`.trim();
    const normalizedExistingText = normalizeRiskDuplicateText(existingText);
    if (normalizedExistingText.length === 0) {
      return false;
    }
    if (normalizedCandidateText === normalizedExistingText) {
      return true;
    }

    const similarity = riskDuplicateSimilarity(candidateText, existingText);
    const sharedKeywords = countSharedRiskKeywords(candidateKeywords, tokenizeRiskKeywords(existingText));
    const existingSignal = detectRiskHazardSignal(existingText);
    const sameSignal = candidateSignal.length > 0 && existingSignal === candidateSignal;
    const isDistinctSignal =
      candidateSignal.length > 0 && existingSignal.length > 0 && candidateSignal !== existingSignal;

    if (isDistinctSignal) {
      // Different accident mechanisms should remain addable unless the narrative is almost identical.
      return similarity >= 0.9 && sharedKeywords >= 3;
    }
    if (sameSignal && similarity >= DUPLICATE_SIMILARITY_SIGNAL_THRESHOLD && sharedKeywords >= 1) {
      return true;
    }
    if (similarity >= DUPLICATE_SIMILARITY_STRICT_THRESHOLD) {
      return true;
    }
    return false;
  });
}

export default function FormEditor() {
  const { formType } = useParams<{ formType: FormType }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const activeFormType: FormType = formType === "accident-report" ? "accident-report" : "risk-assessment";

  const [riskData, setRiskData] = useState<RiskAssessmentRow[]>([]);
  const [accidentData, setAccidentData] = useState<AccidentReportData | null>(null);
  const [analysisAssessment, setAnalysisAssessment] = useState<AssessmentData | null>(null);

  const [taskName, setTaskName] = useState(getDefaultTaskName(activeFormType));
  const [contextText, setContextText] = useState("");
  const [siteName, setSiteName] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAddingRiskWithAi, setIsAddingRiskWithAi] = useState(false);
  const [isMatchingLegalBasis, setIsMatchingLegalBasis] = useState(false);
  const [legalBasisReviewRequiredByRow, setLegalBasisReviewRequiredByRow] = useState<boolean[]>([]);
  const [riskValidationSummary, setRiskValidationSummary] = useState<RiskRowValidationSummary | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState("");
  const [isHistoryView, setIsHistoryView] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [companyProfileSource, setCompanyProfileSource] = useState<CompanyProfileStorageSource>("none");
  const [companyProfileError, setCompanyProfileError] = useState("");
  const [isCompanyProfileLoading, setIsCompanyProfileLoading] = useState(false);
  const lastRiskValidationEventsRef = useRef<RiskRowValidationEvent[]>([]);
  const contextTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historyId = (searchParams.get("historyId") ?? "").trim();
  const shouldLoadHistory = historyId.length > 0;

  useEffect(() => {
    if (shouldLoadHistory) {
      return;
    }

    setTaskName(getDefaultTaskName(activeFormType));
    setContextText("");
    setSiteName("");
    setWorkDate("");
    setAnalysisError("");
    setIsAddingRiskWithAi(false);
    setIsMatchingLegalBasis(false);
    setRiskData([]);
    setLegalBasisReviewRequiredByRow([]);
    setRiskValidationSummary(null);
    lastRiskValidationEventsRef.current = [];
    setAccidentData(null);
    setAnalysisAssessment(null);
    setIsHistoryView(false);
    setIsHistoryLoading(false);
    setHistoryLoadError("");
    setCompanyProfile(null);
    setCompanyProfileSource("none");
    setCompanyProfileError("");
    setIsCompanyProfileLoading(false);
  }, [activeFormType, shouldLoadHistory]);

  useEffect(() => {
    if (!shouldLoadHistory) {
      return;
    }

    let cancelled = false;
    setIsHistoryLoading(true);
    setHistoryLoadError("");

    (async () => {
      try {
        const record = await FormHistoryService.getHistoryRecord(historyId);
        if (cancelled) {
          return;
        }

        if (record.formType !== activeFormType) {
          setHistoryLoadError(
            `Selected history is available only for ${record.formType === "risk-assessment" ? "risk assessment" : "accident report"}.`,
          );
          setIsHistoryView(false);
          setRiskData([]);
          setLegalBasisReviewRequiredByRow([]);
          setRiskValidationSummary(null);
          lastRiskValidationEventsRef.current = [];
          setAccidentData(null);
          return;
        }

        setTaskName(record.taskName || getDefaultTaskName(activeFormType));
        setContextText(record.contextText || "");
        setSiteName(record.siteName || "");
        setWorkDate(record.workDate || "");
        if (record.formType === "risk-assessment") {
          const normalizedRows = normalizeRiskAssessmentRows(record.riskRows || []);
          setRiskData(normalizedRows);
          setLegalBasisReviewRequiredByRow(normalizedRows.map(() => false));
          setRiskValidationSummary(record.validationSummary ?? buildRiskRowValidationSummary(normalizedRows));
          lastRiskValidationEventsRef.current = record.validationEvents ?? [];
          setAccidentData(null);
        } else {
          setRiskData([]);
          setLegalBasisReviewRequiredByRow([]);
          setRiskValidationSummary(null);
          lastRiskValidationEventsRef.current = [];
          if (!record.accidentData) {
            throw new Error("저장된 산업재해조사표 데이터를 불러오지 못했습니다.");
          }
          setAccidentData(record.accidentData);
        }
        setAnalysisAssessment(null);
        setIsHistoryView(true);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "기록을 불러오지 못했습니다.";
        setHistoryLoadError(message);
        setIsHistoryView(false);
        setRiskData([]);
        setLegalBasisReviewRequiredByRow([]);
        setRiskValidationSummary(null);
        lastRiskValidationEventsRef.current = [];
        setAccidentData(null);
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeFormType, historyId, shouldLoadHistory]);

  useEffect(() => {
    if (activeFormType !== "accident-report") {
      return;
    }

    let cancelled = false;
    setIsCompanyProfileLoading(true);
    setCompanyProfileError("");

    (async () => {
      try {
        const result = await CompanyProfileService.getLatestProfile();
        if (cancelled) {
          return;
        }

        setCompanyProfile(result.item);
        setCompanyProfileSource(result.source);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : "회사 정보를 불러오지 못했습니다.";
        setCompanyProfileError(message);
        setCompanyProfile(null);
        setCompanyProfileSource("none");
      } finally {
        if (!cancelled) {
          setIsCompanyProfileLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeFormType]);

  useEffect(() => {
    if (activeFormType !== "accident-report" || !companyProfile || isHistoryView) {
      return;
    }

    setAccidentData((prev) => (prev ? applyCompanyProfileDefaults(prev, companyProfile) : prev));
  }, [activeFormType, companyProfile, isHistoryView]);

  useEffect(() => {
    const textarea = contextTextareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 144)}px`;
  }, [contextText]);

  const formTitle = activeFormType === "risk-assessment" ? "\uC704\uD5D8\uC131\uD3C9\uAC00 \uAE30\uB85D\uC11C" : "\uC0B0\uC5C5\uC7AC\uD574\uC870\uC0AC\uD45C";

  const riskLawContext = useMemo(() => (
    analysisAssessment ? getRiskLawContextFromAssessment(analysisAssessment) : null
  ), [analysisAssessment]);

  const applyRiskRowsValidation = useCallback(
    (
      rows: RiskAssessmentRow[],
      options: { rewriteInvalidFields?: boolean; clearUnresolvedFields?: boolean; includeEvents?: boolean } = {},
    ) => {
      const validationResult = options.rewriteInvalidFields
        ? FormService.validateRiskAssessmentRows(rows, riskLawContext ?? {}, {
          rewriteInvalidFields: true,
          clearUnresolvedFields: options.clearUnresolvedFields === true,
          assessment: analysisAssessment ?? undefined,
          siteName: siteName.trim(),
        })
        : FormService.revalidateRiskAssessmentRows(rows, riskLawContext ?? {}, {
          assessment: analysisAssessment ?? undefined,
          siteName: siteName.trim(),
        });

      setRiskValidationSummary(validationResult.validationSummary);
      if (options.includeEvents !== false) {
        lastRiskValidationEventsRef.current = validationResult.validationEvents;
      }

      return validationResult;
    },
    [analysisAssessment, riskLawContext, siteName],
  );

  const inputValid = useMemo(() => {
    if (isHistoryView) {
      return false;
    }

    const hasEnoughContext = contextText.trim().length >= 20;
    if (!hasEnoughContext) {
      return false;
    }

    if (activeFormType === "accident-report") {
      return true;
    }

    return taskName.trim().length >= 2;
  }, [activeFormType, contextText, isHistoryView, taskName]);

  const canAddRiskWithAi = useMemo(() => {
    if (activeFormType !== "risk-assessment") {
      return false;
    }
    if (isHistoryView || isHistoryLoading || isAnalyzing || isAddingRiskWithAi || isMatchingLegalBasis) {
      return false;
    }
    if (contextText.trim().length < 20) {
      return false;
    }
    return riskData.length > 0;
  }, [
    activeFormType,
    contextText,
    isAddingRiskWithAi,
    isAnalyzing,
    isMatchingLegalBasis,
    isHistoryLoading,
    isHistoryView,
    riskData.length,
  ]);

  const canMatchLegalBasisWithAi = useMemo(() => {
    if (activeFormType !== "risk-assessment") {
      return false;
    }
    if (isHistoryView || isHistoryLoading || isAnalyzing || isAddingRiskWithAi || isMatchingLegalBasis) {
      return false;
    }
    if (riskData.length === 0) {
      return false;
    }
    return Boolean(analysisAssessment);
  }, [
    activeFormType,
    analysisAssessment,
    isAddingRiskWithAi,
    isAnalyzing,
    isHistoryLoading,
    isHistoryView,
    isMatchingLegalBasis,
    riskData.length,
  ]);

  const handleRiskRowChange = useCallback((index: number, field: keyof RiskAssessmentRow, value: string | number) => {
    if (isHistoryView) {
      return;
    }

    let validatedRowsSnapshot: RiskAssessmentRow[] | null = null;
    setRiskData((prev) => {
      const next = [...prev];
      const currentRow = next[index];
      if (!currentRow) {
        return prev;
      }

      const updatedRow: RiskAssessmentRow = { ...currentRow, [field]: value };
      const needsLegalBasisRefresh =
        field === "workProcess" || field === "category" || field === "cause" || field === "hazardFactor";
      if (needsLegalBasisRefresh) {
        next[index] = {
          ...updatedRow,
          legalBasis: "",
        };
      } else {
        next[index] = updatedRow;
      }

      const validationResult = applyRiskRowsValidation(next, {
        rewriteInvalidFields: false,
      });
      validatedRowsSnapshot = validationResult.rows;
      return validationResult.rows;
    });
    if (validatedRowsSnapshot) {
      setLegalBasisReviewRequiredByRow(buildLegalBasisReviewRequiredByRows(validatedRowsSnapshot));
    }
  }, [applyRiskRowsValidation, isHistoryView]);

  const handleReclassifyCategories = useCallback(() => {
    if (isHistoryView || isHistoryLoading) {
      return;
    }

    let validatedRowsSnapshot: RiskAssessmentRow[] | null = null;
    setRiskData((prev) => {
      const reclassifiedRows = reclassifyRiskAssessmentRows(prev);
      const nextRows = reclassifiedRows.map((row) => ({
        ...row,
        legalBasis: "",
      }));
      const validationResult = applyRiskRowsValidation(nextRows, {
        rewriteInvalidFields: false,
      });
      validatedRowsSnapshot = validationResult.rows;
      return validationResult.rows;
    });
    if (validatedRowsSnapshot) {
      setLegalBasisReviewRequiredByRow(buildLegalBasisReviewRequiredByRows(validatedRowsSnapshot));
    }

    toast({
      title: "분류 체계 적용 완료",
      description: "현재 입력된 유해위험요인 기준으로 분류를 재정리했습니다.",
    });
  }, [applyRiskRowsValidation, isHistoryView, isHistoryLoading]);

  const handleAddRiskRow = useCallback(() => {
    if (isHistoryView) {
      return;
    }

    let validatedRowsSnapshot: RiskAssessmentRow[] | null = null;
    setRiskData((prev) => {
      const lastRow = prev[prev.length - 1];
      const newRow = createEmptyRiskAssessmentRow({
        workProcess: lastRow?.workProcess || taskName.trim() || "작업 공정 입력",
      });
      const nextRows = [...prev, newRow];
      const validationResult = applyRiskRowsValidation(nextRows, {
        rewriteInvalidFields: false,
      });
      validatedRowsSnapshot = validationResult.rows;
      return validationResult.rows;
    });
    if (validatedRowsSnapshot) {
      setLegalBasisReviewRequiredByRow(buildLegalBasisReviewRequiredByRows(validatedRowsSnapshot));
    }
  }, [applyRiskRowsValidation, isHistoryView, taskName]);

  const handleAddRiskByAi = useCallback(async () => {
    if (
      activeFormType !== "risk-assessment"
      || isHistoryView
      || isHistoryLoading
      || isAddingRiskWithAi
      || isMatchingLegalBasis
    ) {
      return;
    }

    const fullDescription = contextText.trim();
    if (fullDescription.length < 20) {
      toast({
        title: "현재 작업 상황 입력 필요",
        description: "AI 위험요소 추가를 위해 현재 작업 상황을 20자 이상 입력해 주세요.",
      });
      return;
    }

    const resolvedTaskName = taskName.trim() || getDefaultTaskName(activeFormType);
    setAnalysisError("");
    setIsAddingRiskWithAi(true);

    try {
      let selectedCandidate: RiskAssessmentRow | null = null;
      let previousCandidateSummaries: string[] = [];

      for (let attempt = 0; attempt < AI_ADD_RISK_MAX_ATTEMPTS; attempt += 1) {
        const nextAssessment = await analyzeTaskToAssessment({
          taskName: resolvedTaskName,
          taskDescription: fullDescription,
          siteName: siteName.trim(),
          workDate: workDate || undefined,
          formType: activeFormType,
          formTemplateHint: buildAiRiskAddTemplateHint(riskData, previousCandidateSummaries, attempt),
        });

        const candidateRows = FormService.mapAssessmentToRiskForm(nextAssessment).map((row) => ({
          ...row,
          legalBasis: "",
        }));
        const candidate = candidateRows.find((row) => !isDuplicateRiskRow(row, riskData));

        if (candidate) {
          selectedCandidate = candidate;
          break;
        }

        previousCandidateSummaries = candidateRows
          .map((row) => summarizeRiskRowForGuidance(row))
          .filter((summary) => !summary.includes("cause=(empty); hazard=(empty)"));
      }

      if (!selectedCandidate) {
        toast({
          title: "추가할 신규 위험요소 없음",
          description: "현재 작업 상황 기반 AI 후보가 기존 행과 중복되어 행을 추가하지 않았습니다.",
        });
        return;
      }

      let validatedRowsSnapshot: RiskAssessmentRow[] | null = null;
      setRiskData((prev) => {
        const normalizedCandidate = createEmptyRiskAssessmentRow({
          ...selectedCandidate,
          legalBasis: "",
          workProcess: selectedCandidate.workProcess || prev[prev.length - 1]?.workProcess || resolvedTaskName,
        });
        const trailingEmptyIndex = prev.length - 1;
        const nextRows =
          trailingEmptyIndex >= 0 && isMostlyEmptyRiskRow(prev[trailingEmptyIndex])
            ? prev.map((row, index) => (index === trailingEmptyIndex ? normalizedCandidate : row))
            : [...prev, normalizedCandidate];
        const validationResult = applyRiskRowsValidation(nextRows, {
          rewriteInvalidFields: false,
        });
        validatedRowsSnapshot = validationResult.rows;
        return validationResult.rows;
      });
      if (validatedRowsSnapshot) {
        setLegalBasisReviewRequiredByRow(buildLegalBasisReviewRequiredByRows(validatedRowsSnapshot));
      }

      toast({
        title: "AI 위험요소 추가 완료",
        description: "기존 행과 중복되지 않는 위험요소 1건을 반영했습니다.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 위험요소 추가 중 오류가 발생했습니다.";
      setAnalysisError(message);
      toast({
        title: "AI 위험요소 추가 실패",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsAddingRiskWithAi(false);
    }
  }, [
    activeFormType,
    contextText,
    isAddingRiskWithAi,
    isHistoryLoading,
    isHistoryView,
    isMatchingLegalBasis,
    riskData,
    siteName,
    taskName,
    workDate,
    applyRiskRowsValidation,
  ]);

  const handleMatchLegalBasisWithAi = useCallback(async () => {
    if (
      activeFormType !== "risk-assessment"
      || isHistoryView
      || isHistoryLoading
      || isMatchingLegalBasis
      || isAnalyzing
      || isAddingRiskWithAi
      || riskData.length === 0
    ) {
      return;
    }

    if (!analysisAssessment) {
      toast({
        title: "법적기준 매칭 불가",
        description: "먼저 AI 분석 및 서식 자동작성을 실행해 주세요.",
        variant: "destructive",
      });
      return;
    }

    const snapshotRows = riskData.map((row) => ({ ...row }));
    const snapshotSignatures = snapshotRows.map((row) => toRiskRowReviewSignature(row));
    const resolvedTaskName = analysisAssessment.taskName.trim()
      || taskName.trim()
      || getDefaultTaskName(activeFormType);
    setAnalysisError("");
    setIsMatchingLegalBasis(true);

    try {
      const lawResult = await FormLawService.searchLaws(
        resolvedTaskName,
        analysisAssessment.profile,
        {
          taskDescription: analysisAssessment.taskDescription,
          analysisScenario: analysisAssessment.analysis.scenario,
        },
      );

      const fetchedLawItems = filterLawEvidenceItems(lawResult.lawItems ?? lawResult.items ?? []);
      const fetchedLawActionItems = (lawResult.lawActionItems ?? []).filter((item) =>
        item.articleNumbers.some((articleNumber) => articleNumber.trim().length > 0),
      );

      const defaultLawContext = getRiskLawContextFromAssessment(analysisAssessment);
      const resolvedLawContext: RiskLawContext = {
        ...defaultLawContext,
        lawItems: fetchedLawItems.length > 0 ? fetchedLawItems : defaultLawContext.lawItems,
        lawActionItems: fetchedLawActionItems.length > 0 ? fetchedLawActionItems : defaultLawContext.lawActionItems,
      };

      const rowInputs = snapshotRows.map((row) => ({
        workProcess: row.workProcess,
        category: row.category,
        cause: row.cause,
        hazardFactor: row.hazardFactor,
      }));

      const firstPassLegalBases = resolveRiskRowsLegalBasis(rowInputs, resolvedLawContext);
      const firstPassRows = snapshotRows.map((row, rowIndex) => ({
        ...row,
        legalBasis: firstPassLegalBases[rowIndex] ?? "",
      }));
      const normalizedFirstPass = enforceUniqueLegalBases(firstPassRows, resolvedLawContext);

      const reviewed = await RiskLegalBasisFitService.reviewRows({
        taskName: resolvedTaskName,
        contextText: contextText.trim(),
        rows: normalizedFirstPass.rows.map((row) => ({
          workProcess: row.workProcess,
          category: row.category,
          cause: row.cause,
          hazardFactor: row.hazardFactor,
          legalBasis: row.legalBasis,
        })),
        candidateOptionsByRow: getRiskRowsLegalBasisCandidateOptions(rowInputs, resolvedLawContext, 3),
      });
      const reviewedByIndex = new Map(reviewed.map((item) => [item.rowIndex, item]));

      const resolvedByIndex = new Map<number, string>();
      const usedLegalBasisKeys = new Set<string>();
      normalizedFirstPass.rows.forEach((row, rowIndex) => {
        const reviewedRow = reviewedByIndex.get(rowIndex);
        const selectedLegalBasis =
          reviewedRow && isStrictLegalBasis(reviewedRow.recommendedLegalBasis)
            ? reviewedRow.recommendedLegalBasis
            : row.legalBasis;
        if (!isStrictLegalBasis(selectedLegalBasis)) {
          resolvedByIndex.set(rowIndex, "");
          return;
        }
        const dedupKey = legalBasisDedupKey(selectedLegalBasis);
        if (!dedupKey || usedLegalBasisKeys.has(dedupKey)) {
          resolvedByIndex.set(rowIndex, "");
          return;
        }
        usedLegalBasisKeys.add(dedupKey);
        resolvedByIndex.set(rowIndex, selectedLegalBasis);
      });

      let skippedRows = 0;
      let matchedRows = 0;
      let nextReviewRequiredByRow: boolean[] = [];
      setRiskData((prev) => {
        const nextRows = prev.map((row, rowIndex) => {
          if (toRiskRowReviewSignature(row) !== snapshotSignatures[rowIndex]) {
            skippedRows += 1;
            return row;
          }

          const legalBasis = resolvedByIndex.get(rowIndex) ?? "";
          if (isStrictLegalBasis(legalBasis)) {
            matchedRows += 1;
          }
          return {
            ...row,
            legalBasis,
          };
        });

        const validationResult = applyRiskRowsValidation(nextRows, {
          rewriteInvalidFields: false,
        });
        nextReviewRequiredByRow = buildLegalBasisReviewRequiredByRows(validationResult.rows);
        return validationResult.rows;
      });
      if (nextReviewRequiredByRow.length > 0) {
        setLegalBasisReviewRequiredByRow(nextReviewRequiredByRow);
      }

      toast({
        title: "법적기준 매칭 완료",
        description: skippedRows > 0
          ? `법적기준 ${matchedRows}건을 반영했습니다. 수정된 ${skippedRows}개 행은 반영하지 않았습니다.`
          : `법적기준 ${matchedRows}건을 반영했습니다.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "법적기준 매칭 중 오류가 발생했습니다.";
      setAnalysisError(message);
      setLegalBasisReviewRequiredByRow(buildLegalBasisReviewRequiredByRows(snapshotRows));
      toast({
        title: "법적기준 매칭 실패",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsMatchingLegalBasis(false);
    }
  }, [
    activeFormType,
    analysisAssessment,
    contextText,
    isAddingRiskWithAi,
    isAnalyzing,
    isHistoryLoading,
    isHistoryView,
    isMatchingLegalBasis,
    riskData,
    taskName,
    applyRiskRowsValidation,
  ]);

  const handleAccidentFieldChange = useCallback((fieldPath: string, value: unknown) => {
    setAccidentData((prev) => (prev ? setNestedValue(prev, fieldPath, value) : prev));
  }, []);

  const handleAnalyzeAndFill = async () => {
    if (!inputValid || isHistoryView || isHistoryLoading) {
      return;
    }

    setAnalysisError("");
    setIsAnalyzing(true);

    const fullDescription = contextText.trim();
    const resolvedTaskName = activeFormType === "accident-report" && taskName.trim().length < 2
      ? deriveAccidentTaskNameFromContext(fullDescription)
      : taskName.trim();
    const previousRiskRows = activeFormType === "risk-assessment" ? riskData : null;
    const previousLegalBasisReviewByRow = activeFormType === "risk-assessment" ? legalBasisReviewRequiredByRow : null;
    const previousValidationSummary = activeFormType === "risk-assessment" ? riskValidationSummary : null;
    const previousValidationEvents = activeFormType === "risk-assessment"
      ? [...lastRiskValidationEventsRef.current]
      : [];

    try {
      const nextAssessment = await analyzeTaskToAssessment({
        taskName: resolvedTaskName,
        taskDescription: fullDescription,
        siteName: siteName.trim(),
        workDate: workDate || undefined,
        formType: activeFormType,
        formTemplateHint: activeFormType === "risk-assessment" ? RISK_ASSESSMENT_TEMPLATE_HINT : undefined,
      });
      setAnalysisAssessment(nextAssessment);

      if (activeFormType === "risk-assessment") {
        const mappedResult = FormService.mapAssessmentToRiskFormDetailed(nextAssessment);
        const mappedRows = mappedResult.rows.map((row) => ({
          ...row,
          legalBasis: "",
        }));
        const validationResult = applyRiskRowsValidation(mappedRows, {
          rewriteInvalidFields: false,
          includeEvents: false,
        });
        setRiskData(validationResult.rows);
        setLegalBasisReviewRequiredByRow(buildLegalBasisReviewRequiredByRows(validationResult.rows));
        lastRiskValidationEventsRef.current = mappedResult.validationEvents;
        void RiskValidationAuditService.writeEvents(
          mappedResult.validationEvents,
          {
            trigger: "analyze_and_fill",
            taskName: resolvedTaskName,
          },
        ).catch((error) => {
          console.warn("[FormEditor] Failed to write risk validation audit events.", error);
        });
        setAccidentData(null);
      } else {
        setTaskName(resolvedTaskName);
        setAccidentData(FormService.mapAssessmentToAccidentReport(nextAssessment, companyProfile));
        setRiskData([]);
        setLegalBasisReviewRequiredByRow([]);
        setRiskValidationSummary(null);
        lastRiskValidationEventsRef.current = [];
      }

      toast({
        title: "AI 분석 완료",
        description: `${formTitle} 자동생성 초안을 생성했습니다.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 분석 중 오류가 발생했습니다.";
      if (activeFormType === "risk-assessment" && previousRiskRows) {
        setRiskData(previousRiskRows);
        if (previousLegalBasisReviewByRow) {
          setLegalBasisReviewRequiredByRow(previousLegalBasisReviewByRow);
        }
        setRiskValidationSummary(previousValidationSummary);
        lastRiskValidationEventsRef.current = previousValidationEvents;
      }
      setAnalysisError(message);
      toast({
        title: "AI 분석 실패",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const exportRiskReport = async () => {
    if (activeFormType !== "risk-assessment" || riskData.length === 0 || isHistoryLoading) return;

    try {
      const rows = riskData.map((row) => ({
        workProcess: row.workProcess,
        category: row.category,
        cause: row.cause,
        hazardFactor: row.hazardFactor,
        legalBasis: row.legalBasis,
        currentMeasure: row.currentMeasure,
        frequency: row.frequency.toString(),
        severity: row.severity.toString(),
        riskLevel: row.riskLevel,
        reductionMeasure: row.reductionMeasure,
        improvementDate: row.improvementDate || "",
        completionDate: row.completionDate || "",
        responsiblePerson: row.responsiblePerson || "",
        note: "",
      }));

      const blob = buildRiskAssessmentDocxBlob(rows, {
        processName: taskName.trim(),
        evaluatedAt: workDate || "",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `risk-assessment-${taskName.trim() || "draft"}.docx`;
      a.click();
      URL.revokeObjectURL(url);

      if (!isHistoryView) {
        try {
          await FormHistoryService.createRiskHistoryRecord({
            taskName: taskName.trim() || getDefaultTaskName(activeFormType),
            siteName: siteName.trim(),
            workDate: workDate || undefined,
            contextText: contextText.trim(),
            riskRows: riskData,
            validationSummary: riskValidationSummary ?? buildRiskRowValidationSummary(riskData),
            validationEvents: lastRiskValidationEventsRef.current,
          });
        } catch (error) {
          console.error("[FormEditor] Failed to persist risk history after DOCX export.", error);
          toast({
            title: "기록 저장 실패",
            description: "DOCX는 다운로드되었지만 기록 보관에 실패했습니다.",
            variant: "destructive",
          });
        }
      }

      toast({ title: "다운로드 완료", description: "DOCX 문서를 생성했습니다." });
    } catch {
      toast({ title: "다운로드 실패", description: "문서 생성 중 오류가 발생했습니다.", variant: "destructive" });
    }
  };

  const exportAccidentReportDocx = async () => {
    if (activeFormType !== "accident-report" || !accidentData || isHistoryLoading) {
      return;
    }

    try {
      const blob = await buildAccidentReportDocxBlob(accidentData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `accident-report-${taskName.trim() || "draft"}.docx`;
      a.click();
      URL.revokeObjectURL(url);

      if (!isHistoryView) {
        try {
          await FormHistoryService.createAccidentHistoryRecord({
            taskName: taskName.trim() || getDefaultTaskName(activeFormType),
            siteName: siteName.trim(),
            workDate: workDate || undefined,
            contextText: contextText.trim(),
            accidentData,
          });
        } catch (error) {
          console.error("[FormEditor] Failed to persist accident history after DOCX export.", error);
          toast({
            title: "기록 저장 실패",
            description: "DOCX는 다운로드되었지만 기록 보관에 실패했습니다.",
            variant: "destructive",
          });
        }
      }

      toast({ title: "다운로드 완료", description: "산업재해조사표 DOCX 문서를 생성했습니다." });
    } catch (error) {
      console.error("[FormEditor] Failed to export accident report DOCX.", error);
      toast({
        title: "다운로드 실패",
        description: "DOCX 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    }
  };

  const hasGeneratedDraft = activeFormType === "risk-assessment"
    ? riskData.length > 0
    : Boolean(accidentData);

  return (
    <DashboardShell>
      <div
        className={cn(
          "mx-auto space-y-space-6",
          activeFormType === "risk-assessment" ? "max-w-[1880px]" : "max-w-7xl",
        )}
      >
        <header className="flex items-center justify-between pb-space-4 border-b border-border">
          <div className="flex items-center gap-space-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/forms")}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-heading-2 text-neutral-900">{formTitle} 자동생성</h1>
              <p className="text-body-sm text-neutral-500">
                작업/사고 내용을 입력하면 AI가 서식 초안을 자동으로 생성합니다.
              </p>
            </div>
          </div>
          <div className="flex gap-space-3">
            <Button
              className="bg-primary-700 hover:bg-primary-900 text-white"
              onClick={
                activeFormType === "risk-assessment"
                  ? () => void exportRiskReport()
                  : () => void exportAccidentReportDocx()
              }
              disabled={isHistoryLoading || (activeFormType === "accident-report" && !accidentData)}
            >
              <Download className="h-4 w-4 mr-2" />
              법정서식(DOCX) 다운로드
            </Button>
          </div>
        </header>

        <section className="bg-surface rounded-radius-lg border border-border p-space-6 space-y-space-5">
          <div className="space-y-space-2">
            <h2 className="text-heading-3 text-neutral-900">1) 상황 입력</h2>
            <p className="text-body-sm text-neutral-600">
              {activeFormType === "risk-assessment"
                ? "현재 작업 상황을 먼저 입력하세요."
                : "현재 작업 상황 또는 사고 발생 내용을 먼저 입력하세요."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-4">
            <div>
              <label htmlFor="form-task-name" className="text-label-sm text-neutral-700 block mb-1">
                {activeFormType === "accident-report" ? "작업/사고 제목 (선택)" : "작업 제목 (필수)"}
              </label>
              <Input
                id="form-task-name"
                value={taskName}
                maxLength={80}
                disabled={isHistoryView || isHistoryLoading}
                onChange={(event) => setTaskName(event.target.value)}
                placeholder={
                  activeFormType === "risk-assessment"
                    ? "예: 천장 배관 절단 작업"
                    : "예: 차량 정비 작업 중 지게차 충돌 사고"
                }
              />
            </div>
            <div className="flex items-end pb-1.5">
              <p className="text-caption text-neutral-500">
                텍스트는 20자 이상 입력해야 AI 분석이 시작됩니다.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="form-context-text" className="text-label-sm text-neutral-700 block mb-1">
              {activeFormType === "risk-assessment"
                ? "현재 작업 상황 (필수)"
                : "현재 작업 상황 / 사고 발생 내용 (필수)"}
            </label>
            <Textarea
              ref={contextTextareaRef}
              id="form-context-text"
              value={contextText}
              maxLength={2000}
              className="min-h-[144px] resize-none overflow-hidden"
              disabled={isHistoryView || isHistoryLoading}
              onChange={(event) => setContextText(event.target.value)}
                placeholder={
                  activeFormType === "risk-assessment"
                    ? "작업 내용, 사용 장비, 인원, 작업 일정, 위험요인, 현재 통제상태 등을 구체적으로 작성해 주세요."
                    : "작업 내용, 사용 장비, 인원, 사고 경위, 직접 조건, 추정 원인, 즉시 조치 상황 등을 구체적으로 작성해 주세요."
                }
              />
            <div className="flex justify-end mt-space-1">
              <span className="text-caption text-neutral-500">{contextText.length}/2000</span>
            </div>
          </div>

          {analysisError && (
            <div className="rounded-radius-md border border-danger-200 bg-danger-050 p-space-3 flex items-start gap-space-2">
              <AlertTriangle className="h-4 w-4 text-danger-600 mt-0.5" />
              <p className="text-body-sm text-danger-700">{analysisError}</p>
            </div>
          )}

          {historyLoadError && (
            <div className="rounded-radius-md border border-danger-200 bg-danger-050 p-space-3 flex items-start gap-space-2">
              <AlertTriangle className="h-4 w-4 text-danger-600 mt-0.5" />
              <p className="text-body-sm text-danger-700">{historyLoadError}</p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              className="bg-primary-700 hover:bg-primary-900 text-white min-w-[220px]"
              disabled={!inputValid || isAnalyzing || isHistoryView || isHistoryLoading}
              onClick={handleAnalyzeAndFill}
            >
              {isAnalyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              AI 분석 및 서식 자동작성
            </Button>
          </div>
        </section>

        {isHistoryLoading ? (
          <div className="bg-warning-050 border border-warning-200 text-warning-800 p-space-6 rounded-radius-md flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin" />
            <div>
              <h3 className="font-semibold text-body-lg">저장된 기록을 불러오는 중입니다.</h3>
              <p className="text-body-sm mt-1">잠시만 기다려 주세요.</p>
            </div>
          </div>
        ) : !hasGeneratedDraft ? (
          <div className="bg-warning-050 border border-warning-200 text-warning-800 p-space-6 rounded-radius-md flex items-center gap-3">
            <AlertTriangle className="h-6 w-6" />
            <div>
              <h3 className="font-semibold text-body-lg">자동생성 초안이 아직 없습니다.</h3>
              <p className="text-body-sm mt-1">상단 입력 영역을 채운 뒤 AI 분석 버튼을 누르면 서식 작성 영역이 자동으로 채워집니다.</p>
            </div>
          </div>
        ) : (
          <div className="bg-white">
            <div className="mb-space-4 flex gap-2">
              <span className="inline-block w-3 h-3 bg-success-050/30 border border-success-200 rounded-sm mt-1" />
              <span className="text-caption text-neutral-600">
                {isHistoryView ? "저장된 완료 기록을 읽기 전용으로 불러온 상태입니다." : "아래 문서를 레이아웃 기준에 맞춰 각 항목별로 수정할 수 있습니다."}
              </span>
            </div>

            {activeFormType === "accident-report" && (
              <>
                {isCompanyProfileLoading && (
                  <div className="mb-space-3 rounded-radius-md border border-neutral-200 bg-neutral-050 p-space-3 text-body-sm text-neutral-700 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    회사 고정정보를 불러오는 중입니다.
                  </div>
                )}

                {!isCompanyProfileLoading && !companyProfile && (
                  <div className="mb-space-3 rounded-radius-md border border-warning-200 bg-warning-050 p-space-3 text-body-sm text-warning-800">
                    <p className="font-medium">회사 정보가 등록되지 않아 사업장 고정값 자동입력을 적용하지 못했습니다.</p>
                    <p className="mt-1">
                      <Link className="underline underline-offset-2" to="/settings">
                        설정 페이지
                      </Link>
                      에서 회사 정보를 입력한 뒤 다시 분석을 실행해 주세요.
                    </p>
                  </div>
                )}

                {companyProfileError && (
                  <div className="mb-space-3 rounded-radius-md border border-danger-200 bg-danger-050 p-space-3 text-body-sm text-danger-700">
                    회사 정보 조회 실패: {companyProfileError}
                  </div>
                )}

                {companyProfile && (
                  <div className="mb-space-3 rounded-radius-md border border-success-200 bg-success-050/40 p-space-3 text-body-sm text-success-700">
                    회사 고정값 자동입력 적용됨 ({companyProfileSource === "server" ? "서버" : "로컬 임시값"})
                  </div>
                )}
              </>
            )}

            {activeFormType === "risk-assessment" && (
              <RiskAssessmentTable
                data={riskData}
                onChange={handleRiskRowChange}
                onAddRow={isHistoryView ? undefined : handleAddRiskRow}
                onReclassifyCategories={isHistoryView ? undefined : handleReclassifyCategories}
                onAddRiskWithAi={isHistoryView ? undefined : () => void handleAddRiskByAi()}
                isAddingRiskWithAi={isAddingRiskWithAi}
                disableAddRiskWithAi={!canAddRiskWithAi}
                onMatchLegalBasisWithAi={isHistoryView ? undefined : () => void handleMatchLegalBasisWithAi()}
                isMatchingLegalBasis={isMatchingLegalBasis}
                disableMatchLegalBasis={!canMatchLegalBasisWithAi}
                legalBasisReviewRequiredByRow={legalBasisReviewRequiredByRow}
                readOnly={isHistoryView || isHistoryLoading}
              />
            )}

            {activeFormType === "accident-report" && accidentData && (
              <AccidentReportForm
                containerId={ACCIDENT_REPORT_EXPORT_ROOT_ID}
                data={accidentData}
                onChange={handleAccidentFieldChange}
                assessment={analysisAssessment}
              />
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

