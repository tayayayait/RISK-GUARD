import { HAZARD_ARTICLE_MAP } from "./hazard-article-map.ts";
import { normalizeHazardType } from "./hazard-taxonomy.ts";
import type { RiskControlIntent } from "./risk-control-intent.ts";

export type RiskLegalCandidateSource = "storage" | "db" | "api" | "action" | "fallback";

export interface RiskLegalReviewCandidateOption {
  legalBasis: string;
  articleNumber: string;
  articleTitle?: string;
  clausePreview?: string;
  originalText?: string;
  rankingScore: number;
  sourceType: RiskLegalCandidateSource;
}

export interface DeterministicLegalReviewInput {
  rowIndex: number;
  workProcess: string;
  category: string;
  cause: string;
  hazardFactor: string;
  controlIntent?: RiskControlIntent;
  selectedLegalBasis: string;
  candidateLegalBases: string[];
  candidateOptions: RiskLegalReviewCandidateOption[];
}

export interface DeterministicLegalReviewResult {
  rowIndex: number;
  recommendedLegalBasis: string;
  status: "verified" | "review_required" | "unknown";
  score: number;
  reason: string;
  evidenceExcerpt?: string;
  applicabilityReason?: string;
  reviewSource: "deterministic_fallback";
}

const STRICT_LEGAL_BASIS_PATTERN = /^산업안전보건기준에 관한 규칙 제\d+조\([^)]+\)$/;
const STRICT_CLIENT_RANKING_THRESHOLD = 94;
const TRUSTED_SOURCES = new Set<RiskLegalCandidateSource>(["storage", "db", "api", "action"]);

const normalizeSpace = (value?: string) => (value ?? "").trim().replace(/\s+/g, " ");

const compactEvidence = (value?: string) => normalizeSpace(value)
  .toLowerCase()
  .replace(/[\s“”'"`]+/g, "");

export const isEvidenceExcerptFromOriginal = (evidenceExcerpt?: string, originalText?: string) => {
  const compactExcerpt = compactEvidence(evidenceExcerpt);
  const compactOriginal = compactEvidence(originalText);
  return compactExcerpt.length >= 12 && compactOriginal.includes(compactExcerpt);
};

const fallbackEvidenceExcerpt = (candidate?: RiskLegalReviewCandidateOption) => {
  const originalText = normalizeSpace(candidate?.originalText);
  if (!originalText) {
    return "";
  }
  const clausePreview = normalizeSpace(candidate?.clausePreview);
  if (isEvidenceExcerptFromOriginal(clausePreview, originalText)) {
    return clausePreview;
  }
  return originalText.slice(0, 240);
};

const normalizeArticleNumber = (value?: string) => {
  const match = normalizeSpace(value).match(/제\s*\d+\s*조(?:의\s*\d+)?/);
  return match?.[0]?.replace(/\s+/g, "") ?? "";
};

const mappedArticleNumbers = (input: DeterministicLegalReviewInput) => {
  const hazardType = normalizeHazardType(
    `${input.cause} ${input.hazardFactor}`,
    `${input.hazardFactor} ${input.category} ${input.workProcess}`,
  );
  const entries = HAZARD_ARTICLE_MAP[hazardType as keyof typeof HAZARD_ARTICLE_MAP] ?? [];
  return new Set(entries.map((entry) => normalizeArticleNumber(entry.article)).filter(Boolean));
};

export const selectDeterministicLegalReview = (
  input: DeterministicLegalReviewInput,
): DeterministicLegalReviewResult => {
  const selectedLegalBasis = normalizeSpace(input.selectedLegalBasis);
  const selectedCandidate = input.candidateOptions.find((candidate) =>
    normalizeSpace(candidate.legalBasis) === selectedLegalBasis
  );
  const recommendedLegalBasis = selectedCandidate?.legalBasis
    ?? input.candidateLegalBases.find((candidate) => STRICT_LEGAL_BASIS_PATTERN.test(normalizeSpace(candidate)))
    ?? "";

  if (!recommendedLegalBasis) {
    return {
      rowIndex: input.rowIndex,
      recommendedLegalBasis: "",
      status: "unknown",
      score: 0,
      reason: "유효한 법적기준 후보가 없어 자동 검토를 진행할 수 없습니다.",
      reviewSource: "deterministic_fallback",
    };
  }

  const articleNumber = normalizeArticleNumber(selectedCandidate?.articleNumber || recommendedLegalBasis);
  const sourceVerified = Boolean(selectedCandidate && TRUSTED_SOURCES.has(selectedCandidate.sourceType));
  const originalVerified = normalizeSpace(selectedCandidate?.originalText).length >= 12;
  const rankingVerified = (selectedCandidate?.rankingScore ?? 0) >= STRICT_CLIENT_RANKING_THRESHOLD;
  const hazardArticleVerified = mappedArticleNumbers(input).has(articleNumber);
  const verified = Boolean(
    selectedCandidate
    && STRICT_LEGAL_BASIS_PATTERN.test(normalizeSpace(selectedCandidate.legalBasis))
    && sourceVerified
    && originalVerified
    && rankingVerified
    && hazardArticleVerified,
  );

  const evidenceExcerpt = fallbackEvidenceExcerpt(selectedCandidate);
  return {
    rowIndex: input.rowIndex,
    recommendedLegalBasis: normalizeSpace(recommendedLegalBasis),
    status: verified ? "verified" : "review_required",
    score: verified ? 90 : 45,
    reason: verified
      ? `${articleNumber} 후보는 검증된 원문 출처·행 랭킹·위험유형 매핑을 모두 충족합니다.`
      : "검증된 원문 출처·행 랭킹·위험유형 매핑 조건을 모두 충족하지 않아 수동 확인이 필요합니다.",
    ...(evidenceExcerpt ? { evidenceExcerpt } : {}),
    ...(evidenceExcerpt ? { applicabilityReason: "저장된 조문 원문과 위험유형 매핑을 확인했습니다." } : {}),
    reviewSource: "deterministic_fallback",
  };
};
