import { invokeBackend } from "@/services/edgeFunctionClient";
import type { RiskLegalBasisCandidateOption } from "@/services/formService";
import type { RiskAssessmentRow } from "@/types/formTemplate";

const STRICT_LEGAL_BASIS_PATTERN = /^산업안전보건기준에 관한 규칙 제\d+조\([^)]+\)$/;
const REVIEW_TIMEOUT_MS = 15000;

type FitStatus = "verified" | "review_required" | "unknown";

interface RiskLegalBasisFitResultRow {
  rowIndex?: unknown;
  recommendedLegalBasis?: unknown;
  status?: unknown;
  score?: unknown;
  reason?: unknown;
}

interface RiskLegalBasisFitResponse {
  results?: RiskLegalBasisFitResultRow[];
}

interface RiskLegalBasisFitRequestRow {
  rowIndex: number;
  workProcess: string;
  category: string;
  cause: string;
  hazardFactor: string;
  selectedLegalBasis: string;
  candidateLegalBases: string[];
}

interface ReviewRowsInput {
  taskName: string;
  contextText?: string;
  rows: Array<Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor" | "legalBasis">>;
  candidateOptionsByRow: RiskLegalBasisCandidateOption[][];
}

export interface RiskLegalBasisAiReviewResult {
  rowIndex: number;
  recommendedLegalBasis: string;
  status: FitStatus;
  score: number;
  reason: string;
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

function normalizeReason(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeSpace(value).slice(0, 240);
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
    const candidateLegalBases = dedupe([
      selectedLegalBasis,
      ...options.map((option) => normalizeSpace(option.legalBasis)),
    ]).filter(isStrictLegalBasis);

    return {
      rowIndex,
      workProcess: normalizeSpace(row.workProcess),
      category: normalizeSpace(row.category),
      cause: normalizeSpace(row.cause),
      hazardFactor: normalizeSpace(row.hazardFactor),
      selectedLegalBasis,
      candidateLegalBases,
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

    results.push({
      rowIndex,
      recommendedLegalBasis,
      status: normalizeStatus(row.status),
      score: normalizeScore(row.score),
      reason: normalizeReason(row.reason),
    });
  }

  return dedupeReviewedResults(results);
}

export const RiskLegalBasisFitService = {
  async reviewRows(input: ReviewRowsInput): Promise<RiskLegalBasisAiReviewResult[]> {
    const requestRows = toRequestRows(input)
      .filter((row) => row.selectedLegalBasis && row.candidateLegalBases.length > 0);

    if (requestRows.length === 0) {
      return [];
    }

    const response = await invokeBackend<RiskLegalBasisFitResponse>({
      supabaseFunction: "risk-legal-basis-fit",
      legacyPath: "/risk/legal-basis-fit",
      timeoutMs: REVIEW_TIMEOUT_MS,
      payload: {
        taskName: normalizeSpace(input.taskName),
        contextText: normalizeSpace(input.contextText),
        rows: requestRows,
      },
    });

    return normalizeResults(response, requestRows);
  },
};
