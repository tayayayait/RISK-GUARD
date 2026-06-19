import { invokeBackend } from "@/services/edgeFunctionClient";
import type { RiskLegalBasisCandidateOption } from "@/services/formService";
import type { RiskLegalSemanticIntent } from "@/types/assessment";
import type { RiskAssessmentRow } from "@/types/formTemplate";
import { isRiskControlIntent } from "@/types/riskControlIntent";

const STRICT_LEGAL_BASIS_PATTERN = /^산업안전보건기준에 관한 규칙 제\d+조\([^)]+\)$/;
const REVIEW_TIMEOUT_MS = 35000;

type FitStatus = "verified" | "review_required" | "unknown";
type ReviewSource = "gemini" | "deterministic_fallback" | "unknown";
type FallbackReason = "missing_secret" | "upstream_error" | "timeout" | "request_error" | "invalid_response";

interface RiskLegalBasisFitResultRow {
  rowIndex?: unknown;
  recommendedLegalBasis?: unknown;
  status?: unknown;
  score?: unknown;
  reason?: unknown;
  evidenceExcerpt?: unknown;
  applicabilityReason?: unknown;
  reviewSource?: unknown;
  fallbackReason?: unknown;
}

interface RiskLegalBasisFitResponse {
  results?: RiskLegalBasisFitResultRow[];
}

interface RiskLegalContextResponseRow {
  rowIndex?: unknown;
  hazardType?: unknown;
  accidentMechanism?: unknown;
  unsafeCondition?: unknown;
  controlIntent?: unknown;
  equipment?: unknown;
  searchTerms?: unknown;
}

interface RiskLegalContextResponse {
  analyses?: RiskLegalContextResponseRow[];
}

interface RiskLegalBasisFitRequestRow {
  rowIndex: number;
  workProcess: string;
  category: string;
  cause: string;
  hazardFactor: string;
  controlIntent?: RiskAssessmentRow["controlIntent"];
  selectedLegalBasis: string;
  candidateLegalBases: string[];
  candidateOptions: Array<{
    legalBasis: string;
    articleNumber: string;
    articleTitle: string;
    clausePreview: string;
    originalText: string;
    rankingScore: number;
    sourceType: RiskLegalBasisCandidateOption["sourceType"];
  }>;
}

interface ReviewRowsInput {
  taskName: string;
  contextText?: string;
  rows: Array<Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor" | "legalBasis" | "controlIntent">>;
  candidateOptionsByRow: RiskLegalBasisCandidateOption[][];
}

interface AnalyzeRowsInput {
  taskName: string;
  contextText?: string;
  rows: Array<Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor" | "controlIntent">>;
}

export interface RiskLegalBasisAiReviewResult {
  rowIndex: number;
  recommendedLegalBasis: string;
  status: FitStatus;
  score: number;
  reason: string;
  evidenceExcerpt?: string;
  applicabilityReason?: string;
  reviewSource: ReviewSource;
  fallbackReason?: FallbackReason;
}

function normalizeSpace(value?: string) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function dedupe(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeStatus(value: unknown): FitStatus {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "verified") return "verified";
  if (normalized === "review_required") return "review_required";
  return "unknown";
}

function normalizeReviewSource(value: unknown): ReviewSource {
  if (value === "gemini" || value === "deterministic_fallback") {
    return value;
  }
  return "unknown";
}

function normalizeFallbackReason(value: unknown): FallbackReason | undefined {
  if (
    value === "missing_secret"
    || value === "upstream_error"
    || value === "timeout"
    || value === "request_error"
    || value === "invalid_response"
  ) {
    return value;
  }
  return undefined;
}

function normalizeScore(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, Math.round(parsed)));
    }
  }

  return 0;
}

function normalizeRankingScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function normalizeReason(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeSpace(value).slice(0, 240);
}

function normalizeEvidenceText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  return normalizeSpace(value).slice(0, maxLength);
}

function normalizeStringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupe(
    value
      .map((item) => (typeof item === "string" ? normalizeSpace(item) : ""))
      .filter(Boolean),
  ).slice(0, limit);
}

function normalizeSemanticIntents(
  payload: RiskLegalContextResponse | null,
  rowCount: number,
): RiskLegalSemanticIntent[] {
  if (!payload || !Array.isArray(payload.analyses)) {
    return [];
  }

  const bestByRow = new Map<number, RiskLegalSemanticIntent>();
  for (const item of payload.analyses) {
    const rowIndex = typeof item.rowIndex === "number" ? Math.trunc(item.rowIndex) : -1;
    if (rowIndex < 0 || rowIndex >= rowCount || bestByRow.has(rowIndex)) {
      continue;
    }

    const hazardType = typeof item.hazardType === "string" ? normalizeSpace(item.hazardType) : "";
    const accidentMechanism = typeof item.accidentMechanism === "string"
      ? normalizeSpace(item.accidentMechanism).slice(0, 240)
      : "";
    const unsafeCondition = typeof item.unsafeCondition === "string"
      ? normalizeSpace(item.unsafeCondition).slice(0, 180)
      : "";
    const searchTerms = normalizeStringList(item.searchTerms, 8);
    if (!hazardType || !accidentMechanism || searchTerms.length === 0) {
      continue;
    }

    bestByRow.set(rowIndex, {
      rowIndex,
      hazardType,
      accidentMechanism,
      unsafeCondition,
      ...(isRiskControlIntent(item.controlIntent) ? { controlIntent: item.controlIntent } : {}),
      equipment: normalizeStringList(item.equipment, 6),
      searchTerms,
    });
  }

  return [...bestByRow.values()].sort((left, right) => left.rowIndex - right.rowIndex);
}

function isStrictLegalBasis(text: string) {
  return STRICT_LEGAL_BASIS_PATTERN.test(normalizeSpace(text));
}

function dedupeReviewedResults(results: RiskLegalBasisAiReviewResult[]) {
  const bestByRow = new Map<number, RiskLegalBasisAiReviewResult>();
  for (const result of results) {
    const previous = bestByRow.get(result.rowIndex);
    if (!previous || previous.score < result.score) {
      bestByRow.set(result.rowIndex, result);
    }
  }

  return [...bestByRow.values()].sort((left, right) => left.rowIndex - right.rowIndex);
}

function toRequestRows(input: ReviewRowsInput): RiskLegalBasisFitRequestRow[] {
  return input.rows.map((row, rowIndex) => {
    const options = input.candidateOptionsByRow[rowIndex] ?? [];
    const selectedLegalBasis = normalizeSpace(row.legalBasis ?? "");
    const seenCandidates = new Set<string>();
    const candidateOptions = options.flatMap((option) => {
      const legalBasis = normalizeSpace(option.legalBasis);
      if (!isStrictLegalBasis(legalBasis) || seenCandidates.has(legalBasis)) {
        return [];
      }
      seenCandidates.add(legalBasis);
      return [{
        legalBasis,
        articleNumber: normalizeSpace(option.articleNumber),
        articleTitle: normalizeSpace(option.articleTitle),
        clausePreview: normalizeEvidenceText(option.clausePreview, 600),
        originalText: normalizeEvidenceText(option.originalText, 3000),
        rankingScore: normalizeRankingScore(option.score),
        sourceType: option.sourceType,
      }];
    });
    const candidateLegalBases = dedupe([
      selectedLegalBasis,
      ...candidateOptions.map((option) => option.legalBasis),
    ]).filter(isStrictLegalBasis);

    return {
      rowIndex,
      workProcess: normalizeSpace(row.workProcess),
      category: normalizeSpace(row.category),
      cause: normalizeSpace(row.cause),
      hazardFactor: normalizeSpace(row.hazardFactor),
      ...(row.controlIntent ? { controlIntent: row.controlIntent } : {}),
      selectedLegalBasis,
      candidateLegalBases,
      candidateOptions,
    };
  });
}

function normalizeResults(
  payload: RiskLegalBasisFitResponse | null,
  requestRows: RiskLegalBasisFitRequestRow[],
) {
  if (!payload || !Array.isArray(payload.results)) {
    return [] as RiskLegalBasisAiReviewResult[];
  }

  const requestByRowIndex = new Map(requestRows.map((row) => [row.rowIndex, row]));
  const results: RiskLegalBasisAiReviewResult[] = [];
  for (const row of payload.results) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const rowIndex = typeof row.rowIndex === "number" ? Math.trunc(row.rowIndex) : -1;
    const requestRow = requestByRowIndex.get(rowIndex);
    if (!requestRow) {
      continue;
    }

    const allowedSet = new Set(requestRow.candidateLegalBases);
    const recommendedLegalBasis = normalizeSpace(
      typeof row.recommendedLegalBasis === "string" ? row.recommendedLegalBasis : "",
    );
    if (!allowedSet.has(recommendedLegalBasis) || !isStrictLegalBasis(recommendedLegalBasis)) {
      continue;
    }

    const fallbackReason = normalizeFallbackReason(row.fallbackReason);
    const evidenceExcerpt = normalizeEvidenceText(row.evidenceExcerpt, 600);
    const applicabilityReason = normalizeEvidenceText(row.applicabilityReason, 400);
    results.push({
      rowIndex,
      recommendedLegalBasis,
      status: normalizeStatus(row.status),
      score: normalizeScore(row.score),
      reason: normalizeReason(row.reason),
      ...(evidenceExcerpt ? { evidenceExcerpt } : {}),
      ...(applicabilityReason ? { applicabilityReason } : {}),
      reviewSource: normalizeReviewSource(row.reviewSource),
      ...(fallbackReason ? { fallbackReason } : {}),
    });
  }

  return dedupeReviewedResults(results);
}

export const RiskLegalBasisFitService = {
  async analyzeRows(input: AnalyzeRowsInput): Promise<RiskLegalSemanticIntent[]> {
    if (input.rows.length === 0) {
      return [];
    }

    const rows = input.rows.map((row, rowIndex) => ({
      rowIndex,
      workProcess: normalizeSpace(row.workProcess),
      category: normalizeSpace(row.category),
      cause: normalizeSpace(row.cause),
      hazardFactor: normalizeSpace(row.hazardFactor),
      ...(row.controlIntent ? { controlIntent: row.controlIntent } : {}),
    }));
    const response = await invokeBackend<RiskLegalContextResponse>({
      supabaseFunction: "risk-legal-basis-fit",
      legacyPath: "/risk/legal-basis-fit",
      timeoutMs: REVIEW_TIMEOUT_MS,
      payload: {
        mode: "analyze_context",
        taskName: normalizeSpace(input.taskName),
        contextText: normalizeSpace(input.contextText),
        rows,
      },
    });

    return normalizeSemanticIntents(response, rows.length);
  },

  async reviewRows(input: ReviewRowsInput): Promise<RiskLegalBasisAiReviewResult[]> {
    const requestRows = toRequestRows(input)
      .filter((row) => row.candidateLegalBases.length > 0);

    if (requestRows.length === 0) {
      return [];
    }

    const response = await invokeBackend<RiskLegalBasisFitResponse>({
      supabaseFunction: "risk-legal-basis-fit",
      legacyPath: "/risk/legal-basis-fit",
      timeoutMs: REVIEW_TIMEOUT_MS,
      payload: {
        mode: "review_candidates",
        taskName: normalizeSpace(input.taskName),
        contextText: normalizeSpace(input.contextText),
        rows: requestRows,
      },
    });

    return normalizeResults(response, requestRows);
  },
};
