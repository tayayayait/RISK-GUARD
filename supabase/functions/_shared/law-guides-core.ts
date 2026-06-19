import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.0";
import { sanitizeText } from "./http.ts";
import {
  LAW_GUIDE_CATEGORIES,
  isLawApiCategory,
  isLawGuideCategory,
  isMediaApiCategory,
} from "./law-categories.ts";
import { buildLawActionItems, extractArticleNumber, type LawActionItem, type LawActionSeed } from "./law-actions.ts";
import {
  generateLawNarratives,
  type NarrativeActionInput,
  type NarrativeLawInput,
} from "./law-narratives.ts";
import { validateLawFitForActions } from "./law-fit-validation.ts";
import { normalizeHazardType, normalizeHazardTypeList } from "./hazard-taxonomy.ts";
import {
  createLawStrictAxisEvaluator,
  rankCandidatesHybrid,
  type MatchCandidate,
  type MatchContext,
  type MatchProfile,
  type ScoredCandidate,
} from "./matching.ts";
import { formatOpenApiServiceError, parseSmartSearchPayload } from "./smart-search-parser.ts";

import { HAZARD_ARTICLE_MAP } from "./hazard-article-map.ts";
import { getRiskControlIntentSearchTerms } from "./risk-control-intent.ts";

const ARTICLE_TITLE_FALLBACKS = new Map<string, string>();
for (const entries of Object.values(HAZARD_ARTICLE_MAP)) {
  for (const entry of entries) {
    ARTICLE_TITLE_FALLBACKS.set(entry.article, entry.title);
  }
}

interface WorkProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: Array<{ name: string; type: string; weight?: number }>;
}

interface SemanticLegalIntent {
  rowIndex: number;
  hazardType: string;
  accidentMechanism: string;
  unsafeCondition: string;
  controlIntent?: string;
  equipment: string[];
  searchTerms: string[];
}

export interface LawGuideRequestBody {
  taskName: string;
  profile: WorkProfile;
  taskDescription?: string;
  analysisScenario?: string;
  semanticIntents?: SemanticLegalIntent[];
}

export type LawGuideMode = "assessment" | "form";
export type LawSourcePolicy = "default" | "api_only" | "storage_db_only";
export type LawGuidesResponseMode = "full" | "evidence_only";

export interface LawGuidesPayloadBuildOptions {
  mode?: LawGuideMode;
  lawSourcePolicy?: LawSourcePolicy;
  responseMode?: LawGuidesResponseMode;
}

interface LawArticleRow {
  id: string;
  law_name: string;
  article_number: string;
  article_title: string;
  summary: string;
  hazard_types: string[];
  remedial_actions: string[];
  compliance_checklist: string[] | null;
  source_url: string | null;
}

interface ParsedStorageArticle {
  sourcePath: string;
  lawName: string;
  articleNumber: string;
  articleTitle: string;
  content: string;
  hazardTypes: string[];
  remedialActions: string[];
  complianceChecklist: string[];
}

interface LawTrackDiagnostics {
  attempted: number;
  succeeded: number;
  failed: number;
  candidateCount: number;
  nonZeroTotalCountResponses?: number;
  nonZeroCategoryCountResponses?: number;
  maxObservedTotalCount?: number;
  maxObservedCategoryCount?: number;
  errors?: string[];
}

interface DbCandidateDiagnostics {
  fetchedRowCount: number;
  candidateCount: number;
  error?: string;
}

interface StorageCandidateDiagnostics {
  listedPathCount: number;
  attemptedPathCount: number;
  downloadedPathCount: number;
  parsedArticleCount: number;
  extractedArticleNumberCount: number;
  articleNumberExtractRate: number;
  candidateCount: number;
  skippedByRulesFilterCount: number;
  errors?: string[];
}

interface LawSelectionDiagnostics {
  rawCandidateCount: number;
  strictCandidateCount: number;
  rankingPoolCount: number;
  rankedCandidateCount: number;
  selectedLawItemCount: number;
  droppedByStrictAxisCount: number;
  droppedByRankingThresholdCount: number;
}

export interface LawGuidesResponse {
  items: MappedLawEvidenceItem[];
  lawItems: MappedLawEvidenceItem[];
  guideItems: MappedLawEvidenceItem[];
  mediaItems: MappedLawEvidenceItem[];
  actionItems: LawActionItem[];
  meta: {
    sourceCounts: {
      api: number;
      db: number;
      storage: number;
    };
    trackCounts: {
      law: number;
      guide: number;
      media: number;
    };
    trackStatus: {
      law: "success" | "empty" | "error";
      guide: "success" | "empty" | "error";
      media: "success" | "empty" | "error";
    };
    trackErrors?: {
      law?: string[];
      guide?: string[];
      media?: string[];
    };
    trackEmptyReason?: {
      law?: "NO_CANDIDATE" | "FILTERED_OUT";
      guide?: "NO_CANDIDATE" | "FILTERED_OUT";
      media?: "NO_CANDIDATE" | "FILTERED_OUT";
    };
    lawDiagnostics?: {
      searchValues?: string[];
      api: Record<LawTrack, LawTrackDiagnostics>;
      db: DbCandidateDiagnostics;
      storage: StorageCandidateDiagnostics;
      selection: LawSelectionDiagnostics;
    };
    guideEmptyReason?: string;
  };
}

const ENDPOINT = "http://apis.data.go.kr/B552468/srch/smartSearch";
const RULES_NAME_PATTERN = /(?:\uC0B0\uC5C5\s*\uC548\uC804\s*\uBCF4\uAC74\s*\uAE30\uC900(?:\uC5D0)?\s*\uAD00\uD55C\s*\uADDC\uCE59|occupational\s*safety\s*and\s*health\s*standards\s*rules)/i;
const DB_MAX_ROWS = 300;
const STORAGE_BUCKET = Deno.env.get("LAW_STORAGE_BUCKET") ?? "laws";
const STORAGE_FILE_LIMIT = 500;
const STORAGE_LIST_PREFIX_LIMIT = 200;
const STORAGE_SOURCE_PATH_LIMIT = 1000;
const STORAGE_CANDIDATE_LIMIT = 5000;
const LAW_EVIDENCE_LIMIT = 15;
const GUIDE_EVIDENCE_LIMIT = 10;
const ACTION_SEED_LIMIT = 120;
const ACTION_STAGE_MIN_ITEMS = 2;
const ACTION_STAGE_MAX_ITEMS = 3;
const LAW_RANK_THRESHOLD = 55;
const LAW_STRICT_FINAL_THRESHOLD = 60;
const LAW_ADAPTIVE_MIN_RESULTS = 6;
const LAW_ADAPTIVE_THRESHOLDS = [LAW_STRICT_FINAL_THRESHOLD, LAW_RANK_THRESHOLD, 50, 45, 40, 35, 30, 25, 20, 15, 10];
const LAW_RELAXED_FALLBACK_THRESHOLDS = [50, 45, 40, 35, 30, 25, 20, 15, 10];
const GUIDE_RANK_THRESHOLD = 55;
const GUIDE_MEDIA_ADAPTIVE_THRESHOLDS = [GUIDE_RANK_THRESHOLD, 50, 45];
const API_FETCH_TIMEOUT_MS = 8000;
const API_FETCH_BUDGET_MS = 45000;
const API_FETCH_RETRY_ATTEMPTS = 2;
const API_FETCH_RETRY_BACKOFF_MS = 180;
const LAW_API_ROWS_PER_REQUEST = 30;
const GUIDE_MEDIA_ROWS_PER_REQUEST = 10;
const EVIDENCE_API_ONLY_MAX_SEARCH_VALUES = 6;
const API_ZERO_RESULT_FALLBACK_LIMIT = 3;
const ARTICLE_HEADING_PATTERN = /(제\s*\d+\s*조(?:의\s*\d+)?)\s*\(([^)]+)\)/;
const FOOTER_PATTERN = /^(?:(?:산업안전보건기준에\s*관한\s*규칙|산업안전보건기준에관한규칙)\s*(?:\[시행[^\]]+\])?\s*\d*)$/;
const ACTION_HINT_PATTERN = /(필요한\s*조치|적절한\s*조치|조치(?:하여야|해야)|설치|점검|차단|정지|격리|신고|교육|환기|보강|관리|착용)/;
const STORAGE_SOURCE_PATTERN = /\.(md|pdf|txt)$/i;
const RULES_STORAGE_FILENAME_PATTERN = /(?:^|\/)kr-industrial-safety-and-health-standards-rules(?:\.[^.]+)?$/i;
const RULES_STORAGE_FALLBACK_PATHS = [
  "kr-industrial-safety-and-health-standards-rules.md",
] as const;
const LAW_ONLY_STANDARDS_RULES = (Deno.env.get("LAW_ONLY_STANDARDS_RULES") ?? "false").toLowerCase() === "true";
const PDF_STREAM_PATTERN = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
const PDF_TEXT_BLOCK_PATTERN = /BT[\s\S]*?ET/g;
const PDF_TEXT_TOKEN_PATTERN = /\((?:\\.|[^\\)])*\)|<(?:[0-9A-Fa-f\s]+)>/g;
const CLAUSE_PREVIEW_MAX_LENGTH = 120;
const LEGAL_REQUIREMENT_MAX_LENGTH = 120;

const HAZARD_RULES: Array<{ type: string; patterns: RegExp[] }> = [
  { type: "추락", patterns: [/추락/, /떨어지/, /고소작업/, /낙상/, /전도/] },
  { type: "붕괴", patterns: [/붕괴/, /무너짐/, /매몰/, /도괴/, /전도/] },
  { type: "질식", patterns: [/질식/, /산소결핍/, /밀폐/, /환기\s*불량/, /가스중독/] },
  { type: "감전", patterns: [/감전/, /충전부/, /누전/, /아크/, /전원/] },
  { type: "끼임/말림", patterns: [/끼임/, /말림/, /협착/, /회전체/, /롤러/] },
  { type: "절단", patterns: [/절단/, /절상/, /베임/, /절단기/, /날부/] },
  { type: "낙하물/비래", patterns: [/낙하물/, /비래/, /비산/, /떨어짐/, /상부/] },
  { type: "차량/이동장비 충돌", patterns: [/차량/, /이동장비/, /충돌/, /지게차/, /신호수/] },
  { type: "화학노출", patterns: [/화학/, /유해물질/, /msds/i, /노출/, /누출/] },
  { type: "소음/분진/반복작업", patterns: [/소음/, /분진/, /진동/, /반복작업/, /근골격/] },
];

function pickString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function stripHtml(text: string) {
  return text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ");
}

function toSummaryBullets(content: string) {
  const bullets = content
    .split(/\\n|;/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (bullets.length > 0) {
    return bullets;
  }

  if (!content.trim()) {
    return ["요약 가능한 핵심 문장을 찾지 못했습니다."];
  }

  return [content.slice(0, 180)];
}

function truncateSentence(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const safe = lastSpace >= Math.floor(maxLength * 0.6) ? sliced.slice(0, lastSpace) : sliced;
  return safe.replace(/[,\s]+$/g, "").trim();
}

function toSingleSentence(text: string, maxLength: number) {
  const normalized = sanitizeText(text);
  if (!normalized) {
    return "";
  }

  const firstSentence = normalized
    .split(/(?<=[.!?])\s+|;|\n/g)
    .map((part) => sanitizeText(part))
    .find(Boolean) ?? normalized;

  return truncateSentence(firstSentence, maxLength);
}

function toClausePreview(content: string, maxLength = CLAUSE_PREVIEW_MAX_LENGTH) {
  const normalized = toSingleSentence(content, maxLength);
  if (!normalized) {
    return "";
  }

  return normalized;
}

type LawTrack = "law" | "guide" | "media";
type LawCategory = "1" | "2" | "3" | "4";
type EvidenceSourceBadge = "법령" | "Guide" | "미디어";
type TrackStatus = "success" | "empty" | "error";
type TrackEmptyReason = "NO_CANDIDATE" | "FILTERED_OUT";
type ActionStage = "immediate" | "same_day" | "pre_resume" | "improvement";

const ACTION_STAGE_CATEGORY_WAVES: Record<ActionStage, LawCategory[][]> = {
  immediate: [["4"], ["1", "3"], ["2"]],
  same_day: [["4", "3"], ["1"], ["2"]],
  pre_resume: [["4"], ["3"], ["1"], ["2"]],
  improvement: [["1", "2", "3", "4"]],
};
const ACTION_STAGE_SCORE_THRESHOLDS = [LAW_RANK_THRESHOLD, 50, 45, 40, 35];

const STAGE_SEED_SPECS: Array<{
  stage: ActionStage;
  source: LawActionSeed["source"];
  fallbackText: string;
}> = [
  // immediate ×3 — 서로 다른 source로 액션 텍스트 다양성 확보
  {
    stage: "immediate",
    source: "remedial",
    fallbackText: "작업을 즉시 중지하고 위험원을 차단한 뒤 작업자 접근을 통제해야 합니다.",
  },
  {
    stage: "immediate",
    source: "checklist",
    fallbackText: "동력원을 차단하고 잠금·표지(LOTO)를 실시한 뒤 격리 상태를 확인해야 합니다.",
  },
  {
    stage: "immediate",
    source: "content",
    fallbackText: "위험구역 출입을 통제하고 비상 대피 경로를 확보해야 합니다.",
  },
  // same_day ×3
  {
    stage: "same_day",
    source: "checklist",
    fallbackText: "당일 내 보호구 상태와 설비 점검 항목을 확인하고 누락된 조치를 완료해야 합니다.",
  },
  {
    stage: "same_day",
    source: "remedial",
    fallbackText: "점검 결과를 기록하고 미비 사항에 대한 시정 조치를 당일 내 완료해야 합니다.",
  },
  {
    stage: "same_day",
    source: "content",
    fallbackText: "잔류 위험 요인을 확인하고 추가 방호 조치를 실시해야 합니다.",
  },
  // pre_resume ×3
  {
    stage: "pre_resume",
    source: "checklist",
    fallbackText: "안전점검표를 기반으로 방호설비, 전원 차단 상태, 작업허가 조건을 재확인해야 합니다.",
  },
  {
    stage: "pre_resume",
    source: "content",
    fallbackText: "재가동 허용 조건을 충족하는지 관리감독자 승인을 받아야 합니다.",
  },
  {
    stage: "pre_resume",
    source: "remedial",
    fallbackText: "방호장치가 정상 작동하는지 시운전을 통해 확인해야 합니다.",
  },
  // improvement ×3
  {
    stage: "improvement",
    source: "content",
    fallbackText: "반복 사고 방지를 위해 작업 절차를 개선하고 이행해야 합니다.",
  },
  {
    stage: "improvement",
    source: "checklist",
    fallbackText: "안전교육 계획을 수립하고 관련 근로자에게 교육을 실시해야 합니다.",
  },
  {
    stage: "improvement",
    source: "remedial",
    fallbackText: "설비 보완 및 방호장치 추가 설치 계획을 수립하고 이행해야 합니다.",
  },
];

interface MappedLawEvidenceItem extends Record<string, unknown> {
  id: string;
  type: "law";
  sourceBadge: EvidenceSourceBadge;
  title: string;
  relevanceScore: number;
  summaryBullets: string[];
  keywords: string[];
  applicationPoints: string[];
  sourceType: "api" | "db" | "storage";
  legalBasis?: string;
  articleNumber?: string;
  articleTitle?: string;
  clausePreview?: string;
  relevanceReason?: string;
  keyExcerpt?: string;
  applicabilityReason?: string;
  summaryArticle?: string;
}

function normalizeLawCategory(category?: string): LawCategory | undefined {
  const normalized = sanitizeText(category ?? "");
  if (normalized === "1" || normalized === "2" || normalized === "3" || normalized === "4") {
    return normalized;
  }
  return undefined;
}

function deriveLawCategoryFromLawName(text?: string): LawCategory | undefined {
  const normalized = sanitizeText(text ?? "").toLowerCase().replace(/\s+/g, "");
  if (!normalized) {
    return undefined;
  }

  if (
    normalized.includes("산업안전보건기준에관한규칙")
    || normalized.includes("standardsrules")
    || normalized.includes("standards-rules")
  ) {
    return "4";
  }
  if (
    normalized.includes("산업안전보건법시행규칙")
    || normalized.includes("enforcementrule")
    || normalized.includes("enforcement-rule")
  ) {
    return "3";
  }
  if (
    normalized.includes("산업안전보건법시행령")
    || normalized.includes("enforcementdecree")
    || normalized.includes("enforcement-decree")
  ) {
    return "2";
  }
  if (
    normalized.includes("산업안전보건법")
    || normalized.includes("industrialsafetyandhealthact")
    || normalized.includes("safetyandhealthact")
  ) {
    return "1";
  }

  return undefined;
}

function resolveLawCategory(candidate: Pick<MatchCandidate, "location" | "lawName" | "legalBasis" | "title">): LawCategory | undefined {
  return normalizeLawCategory(candidate.location)
    ?? deriveLawCategoryFromLawName(candidate.lawName)
    ?? deriveLawCategoryFromLawName(candidate.legalBasis)
    ?? deriveLawCategoryFromLawName(candidate.title);
}

function resolveLawCategoryForActionCandidate(candidate: Pick<MatchCandidate, "lawCategory" | "location" | "lawName" | "legalBasis" | "title">): LawCategory | undefined {
  return normalizeLawCategory(candidate.lawCategory)
    ?? resolveLawCategory(candidate);
}

function toMatchContext(taskName: string, profile: WorkProfile): MatchContext {
  const normalizedProfile: MatchProfile = {
    industry: sanitizeText(profile.industry),
    workLocation: sanitizeText(profile.workLocation),
    equipment: Array.isArray(profile.equipment) ? profile.equipment.map((item) => sanitizeText(item)).filter(Boolean) : [],
    hazards: Array.isArray(profile.hazards)
      ? profile.hazards
        .map((hazard) => ({
          name: sanitizeText(hazard.name),
          type: sanitizeText(hazard.type),
          weight: hazard.weight ?? 0,
        }))
        .filter((hazard) => hazard.name)
      : [],
  };

  return {
    taskName,
    profile: normalizedProfile,
  };
}

function normalizeKeywords(raw: string) {
  return raw
    .split(/,|\||\//g)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2)
    .slice(0, 8);
}

function buildSearchValues(
  taskName: string,
  profile: WorkProfile,
  options?: {
    taskDescription?: string;
    analysisScenario?: string;
    semanticIntents?: SemanticLegalIntent[];
  },
) {
  const sortedHazards = Array.isArray(profile.hazards)
    ? profile.hazards
      .slice()
      .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
    : [];

  const topHazardNames = sortedHazards
    .map((hazard) => sanitizeText(hazard.name))
    .filter(Boolean)
    .slice(0, 3);
  const topHazardTypes = sortedHazards
    .map((hazard) => normalizeHazardType(sanitizeText(hazard.type), sanitizeText(hazard.name)))
    .filter(Boolean)
    .slice(0, 3);

  const semanticSeeds = (options?.semanticIntents ?? []).flatMap((intent) => {
    const controlTerms = intent.controlIntent
      ? getRiskControlIntentSearchTerms(intent.controlIntent)
      : [];
    const primaryAnchor = sanitizeText(intent.equipment[0] || intent.hazardType);
    return [
      ...controlTerms.map((term) => sanitizeText(`${primaryAnchor} ${term}`)),
      ...controlTerms,
      ...intent.searchTerms,
      intent.accidentMechanism,
      intent.unsafeCondition,
      intent.hazardType,
      ...intent.equipment,
    ];
  }).map((value) => sanitizeText(value)).filter(Boolean);
  const exactSeeds = [
    ...semanticSeeds,
    ...topHazardNames,
    ...topHazardTypes,
    sanitizeText(taskName),
    sanitizeText(profile.workLocation ?? ""),
    ...((profile.equipment ?? []).map((item) => sanitizeText(item)).filter(Boolean).slice(0, 3)),
  ].filter(Boolean);
  const tokenStopwords = new Set([
    "법",
    "조치",
    "작업",
    "안전",
    "기준",
    "규칙",
    "관련",
    "사항",
    "기타",
    "근거",
    "확인",
    "필요",
    "위험",
    "관리",
    "예방",
    "요구",
    "의무",
    "현장",
  ]);
  const contextTokenSeeds = uniqueStrings(
    [
      sanitizeText(options?.taskDescription ?? ""),
      sanitizeText(options?.analysisScenario ?? ""),
    ].flatMap((seed) =>
      seed
        .split(/[,\s/()\-_.:;]+/g)
        .map((token) => sanitizeText(token))
        .filter((token) => token.length >= 2 && !tokenStopwords.has(token)),
    ),
  ).slice(0, 8);
  const contextPairSeeds = uniqueStrings(
    [
      ...topHazardTypes.slice(0, 2).flatMap((hazardType) =>
        contextTokenSeeds.slice(0, 3).map((token) => `${hazardType} ${token}`.trim())
      ),
      ...((profile.equipment ?? [])
        .map((item) => sanitizeText(item))
        .filter(Boolean)
        .slice(0, 2)
        .flatMap((equipment) => contextTokenSeeds.slice(0, 2).map((token) => `${equipment} ${token}`.trim()))),
    ].filter(Boolean),
  ).slice(0, 6);
  const tokenSeeds = uniqueStrings(
    exactSeeds.flatMap((seed) =>
      seed
        .split(/[,\s/()\-_.]+/g)
        .map((token) => sanitizeText(token))
        .filter((token) => token.length >= 2 && !tokenStopwords.has(token)),
    ),
  );

  return uniqueStrings([...exactSeeds, ...contextPairSeeds, ...tokenSeeds, ...contextTokenSeeds]).slice(0, 24);
}

function enrichProfileWithSemanticIntents(
  profile: WorkProfile,
  intents: SemanticLegalIntent[] = [],
): WorkProfile {
  if (intents.length === 0) {
    return profile;
  }

  const semanticEquipment = intents.flatMap((intent) => intent.equipment).map((item) => sanitizeText(item));
  const semanticHazards = intents.map((intent) => ({
    name: sanitizeText(intent.accidentMechanism),
    type: sanitizeText(intent.hazardType),
    weight: 100,
  })).filter((hazard) => hazard.name && hazard.type);

  return {
    ...profile,
    equipment: uniqueStrings([...(profile.equipment ?? []), ...semanticEquipment].filter(Boolean)),
    hazards: [...semanticHazards, ...(profile.hazards ?? [])],
  };
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(value);
  }

  return result;
}

function normalizeHazardTypes(profile: WorkProfile) {
  if (!Array.isArray(profile.hazards)) {
    return [];
  }

  const types = profile.hazards.flatMap((hazard) => {
    const normalized = normalizeHazardType(sanitizeText(hazard.type), sanitizeText(hazard.name));
    return normalized ? [normalized] : [];
  });

  return uniqueStrings(types);
}

function buildApiFallbackSearchValues(profile: WorkProfile, existingSearchValues: string[]) {
  const sortedHazards = Array.isArray(profile.hazards)
    ? profile.hazards
      .slice()
      .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
    : [];
  const topHazardNames = sortedHazards
    .map((hazard) => sanitizeText(hazard.name))
    .filter(Boolean)
    .slice(0, 3);
  const normalizedHazardTypes = normalizeHazardTypes(profile).slice(0, 3);
  const genericFallbackSeeds = [
    "\uCD94\uB77D", // 추락
    "\uAC10\uC804", // 감전
    "\uB099\uD558\uBB3C", // 낙하물
    "\uC791\uC5C5\uC911\uC9C0", // 작업중지
    "\uC791\uC5C5\uC804", // 작업전
    "\uC548\uC804\uC218\uCE59", // 안전수칙
  ];
  const existing = new Set(existingSearchValues.map((value) => value.toLowerCase()));

  return uniqueStrings([
    ...topHazardNames,
    ...normalizedHazardTypes,
    ...genericFallbackSeeds,
  ])
    .filter((value) => !existing.has(value.toLowerCase()))
    .slice(0, API_ZERO_RESULT_FALLBACK_LIMIT);
}

function isStandardsRulesLawName(text?: string) {
  if (!text) {
    return false;
  }

  return RULES_NAME_PATTERN.test(sanitizeText(text));
}

function cleanArticleTitleText(title: string) {
  return sanitizeText(title)
    .replace(/^[\s:()[\]{}"'.,;<>-]+/, "")
    .replace(/[\s:()[\]{}"'.,;<>-]+$/, "")
    .trim();
}

function extractArticleTitleFromSources(articleNumber: string, sources: Array<string | undefined>) {
  const normalizedArticleNumber = sanitizeText(articleNumber);
  if (!normalizedArticleNumber) {
    return "";
  }

  const escapedArticle = normalizedArticleNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
  const articlePattern = new RegExp(escapedArticle, "i");
  const titleParenPattern = new RegExp(`${escapedArticle}\\s*[\\(\\[]\\s*([^\\)\\]]{2,120})\\s*[\\)\\]]`, "i");

  for (const source of sources) {
    const normalized = sanitizeText(source ?? "");
    if (!normalized) {
      continue;
    }

    const parenMatch = normalized.match(titleParenPattern);
    if (parenMatch?.[1]) {
      const cleaned = cleanArticleTitleText(parenMatch[1]);
      if (cleaned) {
        return cleaned;
      }
    }

    const articleMatch = normalized.match(articlePattern);
    if (!articleMatch) {
      continue;
    }

    const articleIndex = normalized.indexOf(articleMatch[0]);
    const afterArticle = sanitizeText(
      normalized.slice(articleIndex + articleMatch[0].length).replace(/^[\s:()[\]{}"'.,;<>-]+/, ""),
    );
    if (!afterArticle) {
      continue;
    }

    const firstChunk = sanitizeText(afterArticle.split(/[.;!?]/)[0] ?? "");
    const cleaned = cleanArticleTitleText(firstChunk);
    if (cleaned && !/\d+\s*조/.test(cleaned)) {
      return cleaned;
    }
  }

  return ARTICLE_TITLE_FALLBACKS.get(normalizedArticleNumber) ?? "";
}

function isStandardsRulesStoragePath(path: string) {
  return RULES_STORAGE_FILENAME_PATTERN.test(path);
}

function shouldIncludeRulesOnlyCandidate(candidate: Pick<MatchCandidate, "title" | "lawName" | "legalBasis">) {
  return isStandardsRulesLawName(candidate.lawName)
    || isStandardsRulesLawName(candidate.legalBasis)
    || isStandardsRulesLawName(candidate.title);
}

function normalizeLawNameFromPath(path: string) {
  const filename = path.split("/").at(-1) ?? path;
  return sanitizeText(filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
}

function findLawName(content: string, sourcePath: string) {
  const headingMatches = Array.from(content.matchAll(/^##\s*(.+)$/gm))
    .map((match) => sanitizeText(decodeHtmlEntities(match[1] ?? "")))
    .filter(Boolean);

  const inlineMatch = content.match(RULES_NAME_PATTERN);
  const inlineLawName = inlineMatch ? sanitizeText(inlineMatch[0] ?? "") : "";

  const preferred = headingMatches.find((heading) => RULES_NAME_PATTERN.test(heading))
    || inlineLawName
    || headingMatches[0];

  if (preferred) {
    return preferred;
  }

  return normalizeLawNameFromPath(sourcePath);
}

function normalizeStorageSourceText(content: string) {
  const normalized = decodeHtmlEntities(content)
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, " ");

  return normalized
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || FOOTER_PATTERN.test(trimmed) || trimmed === "<!-- image -->") {
        return "";
      }
      return line;
    })
    .join("\n");
}

function latin1ToBytes(text: string) {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function bytesToLatin1(bytes: Uint8Array) {
  return new TextDecoder("latin1").decode(bytes);
}

function decodeUtf16Be(bytes: Uint8Array) {
  let text = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
  }
  return text;
}

function decodeUtf16Le(bytes: Uint8Array) {
  let text = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode((bytes[index + 1] << 8) | bytes[index]);
  }
  return text;
}

function decodePdfLiteralToken(payload: string) {
  let decoded = "";

  for (let index = 0; index < payload.length; index += 1) {
    const current = payload[index];
    if (current !== "\\") {
      decoded += current;
      continue;
    }

    const next = payload[index + 1];
    if (next === undefined) {
      break;
    }

    if (/[0-7]/.test(next)) {
      let octal = next;
      let cursor = index + 2;
      while (cursor < payload.length && octal.length < 3 && /[0-7]/.test(payload[cursor])) {
        octal += payload[cursor];
        cursor += 1;
      }
      decoded += String.fromCharCode(Number.parseInt(octal, 8));
      index = cursor - 1;
      continue;
    }

    if (next === "\n" || next === "\r") {
      index += next === "\r" && payload[index + 2] === "\n" ? 2 : 1;
      continue;
    }

    const escaped: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      "\\": "\\",
      "(": "(",
      ")": ")",
    };

    decoded += escaped[next] ?? next;
    index += 1;
  }

  const bytes = latin1ToBytes(decoded);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return sanitizeText(decodeUtf16Be(bytes.subarray(2)));
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return sanitizeText(decodeUtf16Le(bytes.subarray(2)));
  }

  return sanitizeText(decoded);
}

function decodePdfHexToken(payload: string) {
  const compact = payload.replace(/\s+/g, "");
  if (!compact) {
    return "";
  }

  const safeHex = compact.length % 2 === 0 ? compact : compact.slice(0, -1);
  if (!safeHex) {
    return "";
  }

  const bytes = new Uint8Array(safeHex.length / 2);
  for (let index = 0; index < safeHex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(safeHex.slice(index, index + 2), 16);
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return sanitizeText(decodeUtf16Be(bytes.subarray(2)));
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return sanitizeText(decodeUtf16Le(bytes.subarray(2)));
  }

  const evenZeros = bytes.filter((_, index) => index % 2 === 0 && bytes[index] === 0).length;
  const oddZeros = bytes.filter((_, index) => index % 2 === 1 && bytes[index] === 0).length;
  if (evenZeros > bytes.length / 4 && oddZeros < bytes.length / 8) {
    return sanitizeText(decodeUtf16Be(bytes));
  }
  if (oddZeros > bytes.length / 4 && evenZeros < bytes.length / 8) {
    return sanitizeText(decodeUtf16Le(bytes));
  }

  return sanitizeText(bytesToLatin1(bytes));
}

function decodePdfToken(token: string) {
  if (token.startsWith("(") && token.endsWith(")")) {
    return decodePdfLiteralToken(token.slice(1, -1));
  }

  if (token.startsWith("<") && token.endsWith(">")) {
    return decodePdfHexToken(token.slice(1, -1));
  }

  return "";
}

function extractPdfTextFromSegment(content: string) {
  const texts: string[] = [];
  const blocks = content.match(PDF_TEXT_BLOCK_PATTERN) ?? [];

  for (const block of blocks) {
    const tokens = block.match(PDF_TEXT_TOKEN_PATTERN) ?? [];
    for (const token of tokens) {
      const decoded = decodePdfToken(token);
      if (decoded.length >= 2) {
        texts.push(decoded);
      }
    }
  }

  return texts;
}

async function inflateFlatePayload(payload: string): Promise<string | null> {
  const bytes = latin1ToBytes(payload);

  const formats = ["deflate", "deflate-raw"] as const;
  for (const format of formats) {
    try {
      const decompressed = await new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)),
      ).arrayBuffer();
      return bytesToLatin1(new Uint8Array(decompressed));
    } catch {
      continue;
    }
  }

  return null;
}

async function extractPdfText(pdf: Blob) {
  const bytes = new Uint8Array(await pdf.arrayBuffer());
  const raw = bytesToLatin1(bytes);
  const streamSegments: string[] = [];

  for (const match of raw.matchAll(PDF_STREAM_PATTERN)) {
    const payload = match[1] ?? "";
    if (!payload) {
      continue;
    }

    const streamStart = match.index ?? 0;
    const header = raw.slice(Math.max(0, streamStart - 200), streamStart);
    const hasFlateFilter = /\/Filter\s*(?:\[[^\]]*\/FlateDecode[^\]]*\]|\/FlateDecode)/.test(header);

    if (!hasFlateFilter) {
      streamSegments.push(payload);
      continue;
    }

    const inflated = await inflateFlatePayload(payload);
    if (inflated) {
      streamSegments.push(inflated);
    }
  }

  const extracted = [
    ...extractPdfTextFromSegment(raw),
    ...streamSegments.flatMap((segment) => extractPdfTextFromSegment(segment)),
  ];

  if (extracted.length > 0) {
    return sanitizeText(extracted.join("\n"));
  }
  const plainTextFallback = raw.match(/[가-힣A-Za-z0-9][가-힣A-Za-z0-9\s,.;:()\-_/]{8,}/g) ?? [];
  return sanitizeText(plainTextFallback.join(" "));
}

function extractArticleSections(content: string) {
  const normalized = normalizeStorageSourceText(content)
    .replace(/([^\n])\s*(제\s*\d+\s*조(?:의\s*\d+)?)\s*\(/g, "$1\n$2(");

  const articlePattern = new RegExp(ARTICLE_HEADING_PATTERN.source, "g");
  const matches = Array.from(normalized.matchAll(articlePattern));
  const sections: Array<{ articleNumber: string; articleTitle: string; content: string }> = [];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const segmentStart = (current.index ?? 0) + current[0].length;
    const segmentEnd = next?.index ?? normalized.length;
    const body = sanitizeText(
      normalized
        .slice(segmentStart, segmentEnd)
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/^[-*]\s*/gm, " ")
        .replace(/^\d+\.\s*/gm, " ")
        .replace(/\s+/g, " "),
    );

    if (!body) {
      continue;
    }

    sections.push({
      articleNumber: sanitizeText(current[1] ?? ""),
      articleTitle: sanitizeText(current[2] ?? "") || ARTICLE_TITLE_FALLBACKS.get(sanitizeText(current[1] ?? "")) || "",
      content: body,
    });
  }

  return sections;
}

function detectHazardTypes(text: string) {
  const normalized = sanitizeText(text);
  const matched = HAZARD_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(normalized)))
    .map((rule) => rule.type);

  return normalizeHazardTypeList(uniqueStrings(matched));
}

function extractRemedialActions(content: string) {
  const normalized = sanitizeText(content);
  const chunks = normalized
    .split(/(?<=[.;])\s+|\n+/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const actions: string[] = [];

  for (const chunk of chunks) {
    const cleaned = chunk
      .replace(/^\d+\.\s*/, "")
      .replace(/^\(\d+\)\s*/, "")
      .replace(/^[-*\s]+/, "")
      .trim();

    if (cleaned.length < 8) {
      continue;
    }

    if (!ACTION_HINT_PATTERN.test(cleaned)) {
      continue;
    }

    actions.push(cleaned);
    if (actions.length >= 5) {
      break;
    }
  }

  if (actions.length > 0) {
    return uniqueStrings(actions);
  }

  return [];
}

function buildComplianceChecklist(actions: string[]) {
  return uniqueStrings(
    actions
      .slice(0, 5)
      .map((action) => sanitizeText(action))
      .filter(Boolean)
      .map((action) => `${action} 관련 조치 이행 여부를 확인합니다.`),
  );
}

function parseStorageArticles(content: string, sourcePath: string): ParsedStorageArticle[] {
  const lawName = findLawName(content, sourcePath);
  if (!lawName) {
    return [];
  }

  const parsed: ParsedStorageArticle[] = [];
  for (const section of extractArticleSections(content)) {
    const mergedContent = sanitizeText(section.content);
    if (!mergedContent) {
      continue;
    }

    const hazardTypes = detectHazardTypes(`${section.articleTitle} ${mergedContent}`);
    const remedialActions = extractRemedialActions(mergedContent);
    const complianceChecklist = buildComplianceChecklist(remedialActions);

    parsed.push({
      sourcePath,
      lawName,
      articleNumber: section.articleNumber,
      articleTitle: section.articleTitle,
      content: mergedContent,
      hazardTypes,
      remedialActions,
      complianceChecklist,
    });
  }

  const dedup = new Map<string, ParsedStorageArticle>();
  for (const article of parsed) {
    const key = `${article.lawName}|${article.articleNumber}|${article.articleTitle}`.toLowerCase();
    if (!dedup.has(key)) {
      dedup.set(key, article);
    }
  }

  return Array.from(dedup.values());
}

function resolveTrack(candidate: Pick<MatchCandidate, "location">): LawTrack {
  if (isLawApiCategory(candidate.location)) {
    return "law";
  }

  if (isMediaApiCategory(candidate.location)) {
    return "media";
  }

  return "guide";
}

function hasHazardOverlap(candidate: MatchCandidate, hazardTypes: string[]) {
  if (hazardTypes.length === 0) {
    return false;
  }

  const candidateHazards = normalizeHazardTypeList((candidate.hazardTypes ?? []).filter(Boolean));
  if (candidateHazards.length === 0) {
    return false;
  }

  return candidateHazards.some((hazardType) => hazardTypes.includes(hazardType));
}

function toCandidate(row: Record<string, unknown>, category: string, fallbackId: string): MatchCandidate {
  const title = pickString(row, ["title", "lawNm", "guideNm", "name"]) || fallbackId;
  const content = stripHtml(pickString(row, ["content", "contents", "summary", "highlight_content"]));
  const docId = pickString(row, ["doc_id", "id"]) || fallbackId;
  const keywordText = pickString(row, ["keyword"]);
  const lawName = pickString(row, ["lawNm", "law_name", "lawname"]);
  const articleNumber = extractArticleNumber(`${title} ${pickString(row, ["articleNo", "article_number", "article"])}`);
  const legalBasis = lawName ? `${lawName} ${articleNumber}`.trim() : articleNumber;
  const articleTitle = extractArticleTitleFromSources(articleNumber, [
    title,
    content,
    pickString(row, ["articleTitle", "article_title"]),
    legalBasis,
  ]);

  return {
    id: docId,
    title,
    content,
    articleNumber: articleNumber || undefined,
    articleTitle: articleTitle || undefined,
    lawName,
    legalBasis: legalBasis || undefined,
    keywords: normalizeKeywords(keywordText),
    hazardTypes: detectHazardTypes(`${title} ${content} ${keywordText}`),
    url: pickString(row, ["filepath", "link", "url"]),
    date: pickString(row, ["regDate", "date", "publishDate"]),
    location: category,
    lawCategory: normalizeLawCategory(category),
    sourceType: "api",
    mediaStyle: pickString(row, ["media_style"]),
  };
}

function toDbCandidate(row: LawArticleRow): MatchCandidate {
  const legalBasis = `${row.law_name} ${row.article_number}`.trim();
  const title = sanitizeText(row.article_title) || legalBasis;
  const articleTitle = extractArticleTitleFromSources(sanitizeText(row.article_number), [
    sanitizeText(row.article_title),
    sanitizeText(row.summary),
    legalBasis,
  ]);

  return {
    id: `db-${row.id}`,
    title,
    articleNumber: sanitizeText(row.article_number),
    articleTitle: articleTitle || undefined,
    lawName: row.law_name,
    content: sanitizeText(row.summary),
    keywords: Array.isArray(row.hazard_types) ? normalizeHazardTypeList(row.hazard_types.map((item) => sanitizeText(item)).filter(Boolean)).slice(0, 8) : [],
    hazardTypes: Array.isArray(row.hazard_types) ? normalizeHazardTypeList(row.hazard_types.map((item) => sanitizeText(item)).filter(Boolean)) : [],
    url: row.source_url ?? undefined,
    location: "db",
    lawCategory: deriveLawCategoryFromLawName(row.law_name),
    legalBasis,
    remedialActions: Array.isArray(row.remedial_actions) ? row.remedial_actions.map((item) => sanitizeText(item)).filter(Boolean) : [],
    complianceChecklist: Array.isArray(row.compliance_checklist)
      ? row.compliance_checklist.map((item) => sanitizeText(item)).filter(Boolean)
      : [],
    sourceType: "db",
  };
}

function toStorageCandidate(row: ParsedStorageArticle): MatchCandidate {
  const legalBasis = `${row.lawName} ${row.articleNumber}`.trim();
  const title = `${row.articleNumber} ${row.articleTitle}`.trim();
  const keywordSeed = row.articleTitle
    .split(/[,\s/]+/g)
    .map((item) => sanitizeText(item))
    .filter((item) => item.length >= 2);

  const hazardTypes = normalizeHazardTypeList(row.hazardTypes);
  let isDirectMatch = false;
  for (const hazard of hazardTypes) {
    const entries = HAZARD_ARTICLE_MAP[hazard];
    if (entries && entries.some(e => e.article === row.articleNumber)) {
      isDirectMatch = true;
      break;
    }
  }

  return {
    id: `storage-${row.sourcePath}-${row.articleNumber}`,
    title: title || legalBasis,
    articleNumber: row.articleNumber,
    articleTitle: sanitizeText(row.articleTitle) || undefined,
    lawName: row.lawName,
    content: row.content,
    keywords: uniqueStrings([...normalizeHazardTypeList(row.hazardTypes), ...keywordSeed]).slice(0, 8),
    hazardTypes: normalizeHazardTypeList(row.hazardTypes),
    location: "storage",
    lawCategory: deriveLawCategoryFromLawName(row.lawName),
    legalBasis,
    remedialActions: row.remedialActions,
    complianceChecklist: row.complianceChecklist,
    sourceType: "storage",
  };
}

function splitContentToActions(content: string) {
  const lines = content
    .split(/(?<=[.;])\s+|\n+/g)
    .map((line) =>
      sanitizeText(
        line
          .replace(/^\d+\.\s*/, "")
          .replace(/^\(\d+\)\s*/, "")
      .replace(/^[-*\s]+/, ""),
      ),
    )
    .filter((line) => line.length >= 8 && ACTION_HINT_PATTERN.test(line));

  const dedup = new Set<string>();
  const actions: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (dedup.has(key)) {
      continue;
    }
    dedup.add(key);
    actions.push(line);
    if (actions.length >= 5) {
      break;
    }
  }

  return actions;
}

function deriveLawName(legalBasis?: string, fallbackLawName?: string) {
  const normalizedFallback = sanitizeText(fallbackLawName ?? "");
  if (normalizedFallback) {
    return normalizedFallback;
  }

  const normalizedBasis = sanitizeText(legalBasis ?? "");
  if (!normalizedBasis) {
    return "";
  }
  const match = normalizedBasis.match(/^(.+?)\s*(제\s*\d+\s*조(?:의\s*\d+)?)$/);
  if (match?.[1]) {
    return sanitizeText(match[1]);
  }

  return normalizedBasis;
}

function normalizeLawArticleKey(candidate: Pick<MatchCandidate, "lawName" | "legalBasis" | "title"> & { articleNumber?: string }) {
  const legalBasis = sanitizeText(candidate.legalBasis ?? "");
  const articleNumber = sanitizeText(candidate.articleNumber ?? "") || extractArticleNumber(legalBasis || candidate.title);
  const lawName = deriveLawName(legalBasis, sanitizeText(candidate.lawName ?? "")) || sanitizeText(candidate.title ?? "");
  const normalizedLaw = lawName.toLowerCase().replace(/\s+/g, "");
  const normalizedArticle = articleNumber.toLowerCase().replace(/\s+/g, "");

  if (normalizedLaw && normalizedArticle) {
    return `${normalizedLaw}|${normalizedArticle}`;
  }

  return `${normalizedLaw}|${sanitizeText(candidate.title).toLowerCase().replace(/\s+/g, "")}`;
}

function normalizeLawKey(candidate: Pick<MatchCandidate, "lawName" | "legalBasis" | "title"> & { articleNumber?: string }) {
  const legalBasis = sanitizeText(candidate.legalBasis ?? "");
  const lawName = deriveLawName(legalBasis, sanitizeText(candidate.lawName ?? "")) || sanitizeText(candidate.title ?? "");
  return lawName.toLowerCase().replace(/\s+/g, "");
}

function normalizeArticleKey(candidate: Pick<MatchCandidate, "legalBasis" | "title"> & { articleNumber?: string }) {
  const legalBasis = sanitizeText(candidate.legalBasis ?? "");
  const articleNumber = sanitizeText(candidate.articleNumber ?? "") || extractArticleNumber(legalBasis || candidate.title);
  return articleNumber.toLowerCase().replace(/\s+/g, "");
}

function resolveLawCandidateSourcePriority(candidate: { sourceType?: unknown; location?: unknown }) {
  const sourceType = typeof candidate.sourceType === "string" ? candidate.sourceType.trim().toLowerCase() : "";
  const location = typeof candidate.location === "string" ? candidate.location.trim().toLowerCase() : "";

  if (sourceType === "storage" || location === "storage") {
    return 3;
  }
  if (sourceType === "db" || location === "db") {
    return 2;
  }
  return 1;
}

function dedupeLawCandidatesByArticle<
  T extends Pick<MatchCandidate, "lawName" | "legalBasis" | "title"> & { articleNumber?: string; sourceType?: string; location?: string },
>(candidates: T[]) {
  const dedup = new Map<string, T>();

  for (const candidate of candidates) {
    const key = normalizeLawArticleKey(candidate);
    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, candidate);
      continue;
    }

    if (resolveLawCandidateSourcePriority(candidate) > resolveLawCandidateSourcePriority(existing)) {
      dedup.set(key, candidate);
    }
  }

  return Array.from(dedup.values());
}

function stageRestrictionText(stage?: ActionStage) {
  if (stage === "immediate") {
    return "위험원이 남은 상태로 작업을 계속하면 안 됩니다.";
  }
  if (stage === "same_day") {
    return "당일 점검 누락 상태로 작업을 이어가면 안 됩니다.";
  }
  if (stage === "pre_resume") {
    return "재개 승인 확인 없이 설비를 재가동하면 안 됩니다.";
  }
  if (stage === "improvement") {
    return "개선 완료 전 동일 작업을 반복하면 안 됩니다.";
  }
  return "안전 확인 없이 작업을 진행하면 안 됩니다.";
}

function looksLikeHeadingOnlyRequirement(text: string) {
  const normalized = sanitizeText(text);
  if (!normalized) {
    return true;
  }
  if (/^제\s*\d+\s*(조|절|관|항)/.test(normalized) && normalized.length <= 40) {
    return true;
  }
  return !/(확인|점검|차단|격리|중지|통제|환기|정비|설치|유지|측정|교육|기록|허가|개선|보완|금지|신고)/.test(normalized);
}

function deriveLegalRequirement(content: string, actionText?: string, stage?: ActionStage, _maxLength = 180) {
  const normalized = sanitizeText(content);
  const normalizedAction = sanitizeText(actionText ?? "");

  const sentence = normalized
    .split(/(?<=[.!?])\s+|;|\n/g)
    .map((part) => sanitizeText(part))
    .find((part) => part.length >= 8) ?? normalized;

  const base = (looksLikeHeadingOnlyRequirement(sentence) ? normalizedAction : sentence)
    || normalizedAction
    || "필수 안전조치 이행";
  const compactBase = truncateSentence(base.replace(/[.!?]+$/g, "").trim(), Math.max(20, LEGAL_REQUIREMENT_MAX_LENGTH - 28));
  const prefixed = compactBase.includes("확인")
    ? compactBase
    : `${compactBase} 여부를 확인하고`;
  const actionable = `${prefixed} ${stageRestrictionText(stage)}`;

  return truncateSentence(actionable, LEGAL_REQUIREMENT_MAX_LENGTH);
}

function createSupabaseServerClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        "x-client-info": "risk-guard-kosha-law-guides",
      },
    },
  });
}

async function fetchDbCandidates(_profile: WorkProfile): Promise<{ candidates: MatchCandidate[]; fetchedRowCount: number }> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { candidates: [], fetchedRowCount: 0 };
  }

  const { data, error } = await supabase
    .from("law_articles")
    .select("id, law_name, article_number, article_title, summary, hazard_types, remedial_actions, compliance_checklist, source_url")
    .limit(DB_MAX_ROWS);

  if (error) {
    throw new Error(`DB_QUERY_FAILED:${error.message}`);
  }

  const rows = (data ?? []) as LawArticleRow[];
  return {
    candidates: rows.map((row) => toDbCandidate(row)),
    fetchedRowCount: rows.length,
  };
}

async function readStorageSourceText(sourceBlob: Blob, sourcePath: string) {
  if (/\.pdf$/i.test(sourcePath)) {
    return extractPdfText(sourceBlob);
  }

  return sourceBlob.text();
}

function isStorageDirectoryEntry(entry: { name?: unknown; id?: unknown; metadata?: unknown }) {
  const name = typeof entry.name === "string" ? entry.name : "";
  if (!name) {
    return false;
  }

  if (STORAGE_SOURCE_PATTERN.test(name)) {
    return false;
  }

  // Supabase list() responses often omit `id` for directories.
  return !(typeof entry.id === "string" && entry.id.trim().length > 0);
}

async function listStorageSourcePaths(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
): Promise<string[]> {
  const queue: string[] = [""];
  const visitedPrefixes = new Set<string>();
  const collectedPaths: string[] = [];

  while (
    queue.length > 0
    && visitedPrefixes.size < STORAGE_LIST_PREFIX_LIMIT
    && collectedPaths.length < STORAGE_SOURCE_PATH_LIMIT
  ) {
    const prefix = queue.shift() ?? "";
    if (visitedPrefixes.has(prefix)) {
      continue;
    }
    visitedPrefixes.add(prefix);

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(prefix, { limit: STORAGE_FILE_LIMIT, sortBy: { column: "name", order: "asc" } });

    if (error || !Array.isArray(data)) {
      continue;
    }

    for (const rawEntry of data) {
      const name = typeof (rawEntry as { name?: unknown }).name === "string"
        ? String((rawEntry as { name: string }).name).trim()
        : "";
      if (!name || name === "." || name === "..") {
        continue;
      }

      const fullPath = prefix ? `${prefix}/${name}` : name;

      if (STORAGE_SOURCE_PATTERN.test(name)) {
        collectedPaths.push(fullPath);
        if (collectedPaths.length >= STORAGE_SOURCE_PATH_LIMIT) {
          break;
        }
        continue;
      }

      if (isStorageDirectoryEntry(rawEntry as { name?: unknown; id?: unknown; metadata?: unknown })) {
        queue.push(fullPath);
      }
    }
  }

  return uniqueStrings(collectedPaths);
}

function createStorageCandidateDiagnostics(): StorageCandidateDiagnostics {
  return {
    listedPathCount: 0,
    attemptedPathCount: 0,
    downloadedPathCount: 0,
    parsedArticleCount: 0,
    extractedArticleNumberCount: 0,
    articleNumberExtractRate: 0,
    candidateCount: 0,
    skippedByRulesFilterCount: 0,
  };
}

function appendStorageDiagnosticError(diagnostics: StorageCandidateDiagnostics, message: string) {
  const normalized = sanitizeText(message);
  if (!normalized) {
    return;
  }

  const prev = diagnostics.errors ?? [];
  if (prev.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) {
    return;
  }

  diagnostics.errors = [...prev, normalized].slice(0, 20);
}

function finalizeStorageCandidateDiagnostics(
  diagnostics: StorageCandidateDiagnostics,
  candidateCount: number,
): StorageCandidateDiagnostics {
  const articleNumberExtractRate = diagnostics.parsedArticleCount > 0
    ? Math.round((diagnostics.extractedArticleNumberCount / diagnostics.parsedArticleCount) * 1000) / 1000
    : 0;

  return {
    ...diagnostics,
    articleNumberExtractRate,
    candidateCount,
  };
}

async function fetchStorageCandidates(
  _profile: WorkProfile,
): Promise<{ candidates: MatchCandidate[]; diagnostics: StorageCandidateDiagnostics }> {
  const supabase = createSupabaseServerClient();
  const diagnostics = createStorageCandidateDiagnostics();
  if (!supabase) {
    return { candidates: [], diagnostics };
  }

  const listedStoragePaths = await listStorageSourcePaths(supabase);
  diagnostics.listedPathCount = listedStoragePaths.length;

  // Even when list() fails or returns empty, directly attempt the known standards-rules files.
  const storagePaths = LAW_ONLY_STANDARDS_RULES
    ? uniqueStrings([
      ...listedStoragePaths.filter((path) => isStandardsRulesStoragePath(path)),
      ...RULES_STORAGE_FALLBACK_PATHS,
    ])
    : uniqueStrings([
      ...listedStoragePaths,
      ...RULES_STORAGE_FALLBACK_PATHS,
    ]);
  diagnostics.attemptedPathCount = storagePaths.length;

  if (storagePaths.length === 0) {
    return { candidates: [], diagnostics };
  }

  const matched: MatchCandidate[] = [];

  for (const path of storagePaths) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
    if (error || !data) {
      if (error?.message) {
        appendStorageDiagnosticError(diagnostics, `STORAGE_DOWNLOAD_FAILED:${error.message}`);
      }
      continue;
    }
    diagnostics.downloadedPathCount += 1;

    let sourceText = "";
    try {
      sourceText = await readStorageSourceText(data, path);
    } catch (readError) {
      appendStorageDiagnosticError(diagnostics, `STORAGE_READ_FAILED:${normalizeTrackError(readError)}`);
      continue;
    }

    if (!sourceText.trim()) {
      continue;
    }

    const articles = parseStorageArticles(sourceText, path);
    diagnostics.parsedArticleCount += articles.length;
    diagnostics.extractedArticleNumberCount += articles.filter((article) => sanitizeText(article.articleNumber).length > 0).length;

    for (const article of articles) {
      if (LAW_ONLY_STANDARDS_RULES && !shouldIncludeRulesOnlyCandidate({
        title: article.articleTitle,
        lawName: article.lawName,
        legalBasis: `${article.lawName} ${article.articleNumber}`.trim(),
      })) {
        diagnostics.skippedByRulesFilterCount += 1;
        continue;
      }

      const candidate = toStorageCandidate(article);
      matched.push(candidate);
    }

    if (matched.length >= STORAGE_CANDIDATE_LIMIT) {
      break;
    }
  }

  const candidates = matched.slice(0, STORAGE_CANDIDATE_LIMIT);
  return {
    candidates,
    diagnostics: finalizeStorageCandidateDiagnostics(diagnostics, candidates.length),
  };
}

interface ApiTrackStats {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
  nonZeroTotalCountResponses: number;
  nonZeroCategoryCountResponses: number;
  maxObservedTotalCount: number;
  maxObservedCategoryCount: number;
}

interface ApiFetchDiagnostics {
  trackStats: Record<LawTrack, ApiTrackStats>;
}

function createTrackStats(): ApiTrackStats {
  return {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
    nonZeroTotalCountResponses: 0,
    nonZeroCategoryCountResponses: 0,
    maxObservedTotalCount: 0,
    maxObservedCategoryCount: 0,
  };
}

function createApiFetchDiagnostics(): ApiFetchDiagnostics {
  return {
    trackStats: {
      law: createTrackStats(),
      guide: createTrackStats(),
      media: createTrackStats(),
    },
  };
}

function resolveTrackFromCategory(category: string): LawTrack {
  if (isLawApiCategory(category)) {
    return "law";
  }
  if (isMediaApiCategory(category)) {
    return "media";
  }
  return "guide";
}

function normalizeTrackError(error: unknown) {
  if (error instanceof Error) {
    return sanitizeText(error.message).slice(0, 240) || "UNKNOWN_ERROR";
  }
  if (typeof error === "string") {
    return sanitizeText(error).slice(0, 240) || "UNKNOWN_ERROR";
  }
  return "UNKNOWN_ERROR";
}

function appendTrackError(stats: ApiTrackStats, error: unknown) {
  const normalized = normalizeTrackError(error);
  const duplicated = stats.errors.some((item) => item.toLowerCase() === normalized.toLowerCase());
  if (!duplicated) {
    stats.errors.push(normalized);
  }
}

function isTrackHardError(stats: ApiTrackStats) {
  return stats.attempted > 0 && stats.succeeded === 0 && stats.failed > 0;
}

function createGlobalApiFailureDiagnostics(error: unknown) {
  const diagnostics = createApiFetchDiagnostics();
  const normalized = normalizeTrackError(error);
  for (const track of ["law", "guide", "media"] as const) {
    diagnostics.trackStats[track].attempted = 1;
    diagnostics.trackStats[track].failed = 1;
    appendTrackError(diagnostics.trackStats[track], normalized);
  }
  return diagnostics;
}

function waitMs(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function isRetryableSmartSearchError(error: unknown) {
  const message = normalizeTrackError(error).toUpperCase();
  if (!message) {
    return false;
  }

  if (message.includes("ABORT")) {
    return true;
  }

  if (message.startsWith("UPSTREAM_429") || message.startsWith("UPSTREAM_5")) {
    return true;
  }

  return message.includes("TIMEOUT") || message.includes("TIMED_OUT") || message.includes("CONNECTION");
}

async function fetchSmartSearchCategory(
  serviceKey: string,
  searchValue: string,
  category: string,
) {
  const rowsPerRequest = isLawApiCategory(category) ? LAW_API_ROWS_PER_REQUEST : GUIDE_MEDIA_ROWS_PER_REQUEST;
  let lastError: unknown;

  for (let attempt = 1; attempt <= API_FETCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const params = new URLSearchParams({
        serviceKey,
        pageNo: "1",
        numOfRows: String(rowsPerRequest),
        searchValue,
        category,
        _type: "json",
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(`${ENDPOINT}?${params.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const text = await response.text();
        const openApiError = formatOpenApiServiceError(text);
        if (openApiError) {
          throw new Error(openApiError);
        }
        throw new Error(`UPSTREAM_${response.status}:${sanitizeText(text).slice(0, 120)}`);
      }

      const responseText = await response.text();
      let data: unknown = null;
      try {
        data = JSON.parse(responseText);
      } catch {
        const openApiError = formatOpenApiServiceError(responseText);
        if (openApiError) {
          throw new Error(openApiError);
        }
        throw new Error(`UPSTREAM_INVALID_JSON:${sanitizeText(responseText).slice(0, 120)}`);
      }

      const parsed = parseSmartSearchPayload(data);

      if (!parsed.hasContractShape) {
        throw new Error(`UPSTREAM_SCHEMA_MISMATCH:${sanitizeText(responseText).slice(0, 120)}`);
      }

      if (parsed.headerCode && parsed.headerCode !== "00") {
        const message = sanitizeText(parsed.headerMessage).replace(/\s+/g, "_");
        throw new Error(message ? `UPSTREAM_CODE_${parsed.headerCode}:${message}` : `UPSTREAM_CODE_${parsed.headerCode}`);
      }

      const mergedRows = [
        ...parsed.media.map((row) => ({ ...row, __category: category })),
        ...parsed.items.map((row) => ({ ...row, __category: category })),
      ];

      if (parsed.totalCount > 0 && mergedRows.length === 0) {
        throw new Error(`UPSTREAM_EMPTY_WITH_TOTAL:${parsed.totalCount}`);
      }

      const mapped = mergedRows
        .filter((row) => isLawGuideCategory(String(row.__category ?? row.category ?? category)))
        .map((row, index) => toCandidate(row, String(row.__category ?? row.category ?? category), `law-${category}-${index + 1}`));

      const categoryCount = Number(parsed.categoryCount[String(category)] ?? 0);
      return { category, candidates: mapped, totalCount: parsed.totalCount, categoryCount };
    } catch (error) {
      lastError = error;
      if (attempt < API_FETCH_RETRY_ATTEMPTS && isRetryableSmartSearchError(error)) {
        await waitMs(API_FETCH_RETRY_BACKOFF_MS * attempt);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error("UPSTREAM_RETRY_EXHAUSTED");
}

async function fetchApiCandidates(
  serviceKey: string,
  searchValues: string[],
  fallbackSearchValues: string[] = [],
): Promise<{ candidates: MatchCandidate[]; diagnostics: ApiFetchDiagnostics }> {
  const dedup = new Map<string, MatchCandidate>();
  const diagnostics = createApiFetchDiagnostics();
  const startedAt = Date.now();
  const attemptedSearchValues = new Set<string>();

  const applySettledResults = (
    settled: PromiseSettledResult<{
      category: string;
      candidates: MatchCandidate[];
      totalCount: number;
      categoryCount: number;
    }>[],
  ) => {
    settled.forEach((settledResult, requestIndex) => {
      if (settledResult.status === "fulfilled") {
        const track = resolveTrackFromCategory(String(settledResult.value.category));
        diagnostics.trackStats[track].attempted += 1;
        diagnostics.trackStats[track].succeeded += 1;
        if (settledResult.value.totalCount > 0) {
          diagnostics.trackStats[track].nonZeroTotalCountResponses += 1;
        }
        if (settledResult.value.categoryCount > 0) {
          diagnostics.trackStats[track].nonZeroCategoryCountResponses += 1;
        }
        diagnostics.trackStats[track].maxObservedTotalCount = Math.max(
          diagnostics.trackStats[track].maxObservedTotalCount,
          settledResult.value.totalCount,
        );
        diagnostics.trackStats[track].maxObservedCategoryCount = Math.max(
          diagnostics.trackStats[track].maxObservedCategoryCount,
          settledResult.value.categoryCount,
        );

        for (const candidate of settledResult.value.candidates) {
          const key = `${sanitizeText(candidate.title)}|${sanitizeText(candidate.content)}|${candidate.url ?? ""}`;
          if (!dedup.has(key)) {
            dedup.set(key, candidate);
          }
        }
        return;
      }

      const category = LAW_GUIDE_CATEGORIES[requestIndex];
      const track = resolveTrackFromCategory(String(category));
      diagnostics.trackStats[track].attempted += 1;
      diagnostics.trackStats[track].failed += 1;
      appendTrackError(diagnostics.trackStats[track], settledResult.reason);
    });
  };

  const runSearchValue = async (searchValue: string) => {
    const normalizedSearchValue = sanitizeText(searchValue);
    if (!normalizedSearchValue) {
      return;
    }

    const dedupKey = normalizedSearchValue.toLowerCase();
    if (attemptedSearchValues.has(dedupKey)) {
      return;
    }
    attemptedSearchValues.add(dedupKey);

    const requests = LAW_GUIDE_CATEGORIES.map((category) =>
      fetchSmartSearchCategory(serviceKey, normalizedSearchValue, category)
    );
    const settled = await Promise.allSettled(requests);
    applySettledResults(settled);
  };

  for (const searchValue of searchValues) {
    if (Date.now() - startedAt > API_FETCH_BUDGET_MS) {
      break;
    }
    await runSearchValue(searchValue);
  }

  if (dedup.size === 0 && fallbackSearchValues.length > 0) {
    for (const fallbackSearchValue of fallbackSearchValues) {
      if (Date.now() - startedAt > API_FETCH_BUDGET_MS) {
        break;
      }
      await runSearchValue(fallbackSearchValue);
    }
  }

  return { candidates: Array.from(dedup.values()), diagnostics };
}

async function rankWithAdaptiveThresholds(
  context: MatchContext,
  candidates: MatchCandidate[],
  options: Omit<Parameters<typeof rankCandidatesHybrid>[2], "threshold">,
  thresholds: number[],
  minimumResults = 1,
): Promise<{ ranked: ScoredCandidate[]; appliedThreshold: number }> {
  const normalizedThresholds = uniqueStrings(thresholds.map((value) => String(value)))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const thresholdPlan = normalizedThresholds.length > 0 ? normalizedThresholds : [GUIDE_RANK_THRESHOLD];
  const normalizedMinimumResults = Number.isFinite(minimumResults)
    ? Math.max(1, Math.floor(minimumResults))
    : 1;

  const lowestThreshold = Math.min(...thresholdPlan);
  const rankedAtLowestThreshold = await rankCandidatesHybrid(context, candidates, {
    ...options,
    threshold: lowestThreshold,
  });

  for (const threshold of thresholdPlan) {
    const ranked = rankedAtLowestThreshold.filter((candidate) => candidate.finalScore >= threshold);
    if (ranked.length >= normalizedMinimumResults) {
      return { ranked, appliedThreshold: threshold };
    }
  }

  return { ranked: rankedAtLowestThreshold, appliedThreshold: lowestThreshold };
}

function deriveTrackEmptyReason(rawCount: number, rankedCount: number): TrackEmptyReason | undefined {
  if (rankedCount > 0) {
    return undefined;
  }
  if (rawCount === 0) {
    return "NO_CANDIDATE";
  }
  return "FILTERED_OUT";
}

function actionCandidatePriority(candidate: ScoredCandidate) {
  const category = resolveLawCategoryForActionCandidate(candidate);
  if (category === "4") return 0;
  if (category === "1") return 1;
  if (category === "3") return 2;
  if (category === "2") return 3;
  return 9;
}

function isCandidateInCategoryWave(candidate: ScoredCandidate, wave: LawCategory[]) {
  const category = resolveLawCategoryForActionCandidate(candidate);
  if (!category) {
    return false;
  }
  return wave.includes(category);
}

function stageLabel(stage: ActionStage) {
  if (stage === "immediate") return "즉시 조치";
  if (stage === "same_day") return "당일 조치";
  if (stage === "pre_resume") return "재개 전 점검";
  return "개선 계획 조치";
}

type StageSelection = {
  candidate: ScoredCandidate;
  selectionMode: "direct" | "reused";
  selectionReason?: string;
};

function selectActionCandidateForStage(
  stage: ActionStage,
  candidates: ScoredCandidate[],
  usedLawArticleKeys: Set<string>,
  usedLawKeys: Set<string>,
  usedArticleKeys: Set<string>,
): StageSelection | null {
  if (candidates.length === 0) {
    return null;
  }

  const withThresholdReason = (reason: string, threshold: number) =>
    threshold < LAW_RANK_THRESHOLD
      ? `${reason} (임계값 ${threshold} 기준)`
      : reason;

  const categoryWaves = ACTION_STAGE_CATEGORY_WAVES[stage];
  for (const threshold of ACTION_STAGE_SCORE_THRESHOLDS) {
    const candidatesByWave = categoryWaves.map((wave) =>
      candidates.filter((candidate) =>
        (candidate.finalScore ?? 0) >= threshold && isCandidateInCategoryWave(candidate, wave)
      )
    );

    const thresholdCandidates = candidatesByWave.flat();
    if (thresholdCandidates.length === 0) {
      continue;
    }

    for (const waveCandidates of candidatesByWave) {
      const unseenLawAndArticle = waveCandidates.find((candidate) => {
        const lawKey = normalizeLawKey(candidate);
        const articleKey = normalizeArticleKey(candidate);
        const lawArticleKey = normalizeLawArticleKey(candidate);
        return Boolean(lawKey)
          && Boolean(articleKey)
          && !usedLawKeys.has(lawKey)
          && !usedArticleKeys.has(articleKey)
          && !usedLawArticleKeys.has(lawArticleKey);
      });
      if (!unseenLawAndArticle) {
        continue;
      }
      return {
        candidate: unseenLawAndArticle,
        selectionMode: "direct",
        selectionReason: threshold < LAW_RANK_THRESHOLD
          ? `${stageLabel(stage)} 단계 후보가 부족해 임계값을 ${threshold}로 완화했습니다.`
          : undefined,
      };
    }

    for (const waveCandidates of candidatesByWave) {
      const sameLawUnseenArticle = waveCandidates.find((candidate) => {
        const lawKey = normalizeLawKey(candidate);
        const articleKey = normalizeArticleKey(candidate);
        const lawArticleKey = normalizeLawArticleKey(candidate);
        return Boolean(lawKey)
          && Boolean(articleKey)
          && usedLawKeys.has(lawKey)
          && !usedArticleKeys.has(articleKey)
          && !usedLawArticleKeys.has(lawArticleKey);
      });
      if (!sameLawUnseenArticle) {
        continue;
      }
      return {
        candidate: sameLawUnseenArticle,
        selectionMode: "direct",
        selectionReason: threshold < LAW_RANK_THRESHOLD
          ? `${stageLabel(stage)} 단계 후보가 부족해 임계값을 ${threshold}로 완화했습니다.`
          : undefined,
      };
    }

    for (const waveCandidates of candidatesByWave) {
      const reusedArticle = waveCandidates.find((candidate) => {
        const articleKey = normalizeArticleKey(candidate);
        const lawArticleKey = normalizeLawArticleKey(candidate);
        return Boolean(articleKey)
          && usedArticleKeys.has(articleKey)
          && !usedLawArticleKeys.has(lawArticleKey);
      });
      if (!reusedArticle) {
        continue;
      }
      return {
        candidate: reusedArticle,
        selectionMode: "reused",
        selectionReason: withThresholdReason(
          `${stageLabel(stage)} 단계에서 신규 조문 후보가 부족해 기존 조문을 최후 예외로 재사용했습니다.`,
          threshold,
        ),
      };
    }

    for (const waveCandidates of candidatesByWave) {
      const unseenLawArticle = waveCandidates.find((candidate) => !usedLawArticleKeys.has(normalizeLawArticleKey(candidate)));
      if (!unseenLawArticle) {
        continue;
      }
      return {
        candidate: unseenLawArticle,
        selectionMode: "reused",
        selectionReason: withThresholdReason(`${stageLabel(stage)} 단계에서 신규 조문 후보가 부족해 기존 조문을 최후 예외로 재사용했습니다.`, threshold),
      };
    }

    const bestReused = candidatesByWave.find((waveCandidates) => waveCandidates.length > 0)?.[0];
    if (bestReused) {
      return {
        candidate: bestReused,
        selectionMode: "reused",
        selectionReason: withThresholdReason(`${stageLabel(stage)} 단계에서 신규 조문 후보가 부족해 기존 조문을 최후 예외로 재사용했습니다.`, threshold),
      };
    }
  }

  return null;
}

function buildSeedFromCandidate(
  candidate: ScoredCandidate,
  rawText: string,
  source: LawActionSeed["source"],
  options?: {
    stageHint?: ActionStage;
    selectionMode?: "direct" | "reused";
    selectionReason?: string;
  },
): LawActionSeed {
  const articleNumber = sanitizeText(candidate.articleNumber ?? "") || extractArticleNumber(candidate.legalBasis || candidate.title);
  const articleTitle = sanitizeText(candidate.articleTitle ?? "") || extractArticleTitleFromSources(articleNumber, [
    candidate.title,
    candidate.content,
    candidate.legalBasis,
  ]);
  const legalBasis = sanitizeText(candidate.legalBasis ?? "");
  const lawName = deriveLawName(legalBasis, candidate.lawName);
  const clausePreview = sanitizeText(candidate.content);
  const legalRequirement = deriveLegalRequirement(clausePreview, rawText, options?.stageHint);
  const relevanceReason = sanitizeText(candidate.matchReason);

  return {
    rawText: sanitizeText(rawText),
    ...(options?.stageHint ? { stageHint: options.stageHint } : {}),
    articleNumber,
    articleTitle: articleTitle || undefined,
    legalBasis: legalBasis || undefined,
    lawName: lawName || undefined,
    lawCategory: resolveLawCategoryForActionCandidate(candidate),
    clausePreview,
    legalRequirement: legalRequirement || undefined,
    relevanceReason,
    ...(options?.selectionMode ? { selectionMode: options.selectionMode } : {}),
    ...(options?.selectionReason ? { selectionReason: options.selectionReason } : {}),
    source,
    score: candidate.finalScore,
  };
}

const IMMEDIATE_TEXT_PATTERNS = [/즉시/, /중지/, /정지/, /차단/, /격리/, /비상/, /신고/];
const SAME_DAY_TEXT_PATTERNS = [/당일/, /점검/, /확인/, /조치/, /완료/, /보강/];
const PRE_RESUME_TEXT_PATTERNS = [/재개/, /재가동/, /작업\s*재개\s*전/, /허가/, /승인/, /재투입/, /재시작/];
const IMPROVEMENT_TEXT_PATTERNS = [/개선/, /재발/, /교육/, /훈련/, /절차/, /예방/, /체계/, /관리/];

function toActionSeedToken(text: string) {
  return sanitizeText(text).replace(/\s+/g, "").toLowerCase();
}

function pickStageActionText(
  candidate: ScoredCandidate,
  stage: ActionStage,
  preferredSource?: LawActionSeed["source"],
) {
  const remedial = (candidate.remedialActions ?? []).map((line) => sanitizeText(line)).filter(Boolean);
  const checklist = (candidate.complianceChecklist ?? []).map((line) => sanitizeText(line)).filter(Boolean);
  const content = splitContentToActions(candidate.content);
  const bySource: Record<LawActionSeed["source"], string[]> = {
    remedial,
    checklist,
    content,
  };

  const sourcePriority: Record<ActionStage, LawActionSeed["source"][]> = {
    immediate: ["remedial", "checklist", "content"],
    same_day: ["checklist", "remedial", "content"],
    pre_resume: ["checklist", "content", "remedial"],
    improvement: ["content", "checklist", "remedial"],
  };
  const patternByStage: Record<ActionStage, RegExp[]> = {
    immediate: IMMEDIATE_TEXT_PATTERNS,
    same_day: SAME_DAY_TEXT_PATTERNS,
    pre_resume: PRE_RESUME_TEXT_PATTERNS,
    improvement: IMPROVEMENT_TEXT_PATTERNS,
  };
  const orderedSources = preferredSource
    ? [preferredSource, ...sourcePriority[stage].filter((source) => source !== preferredSource)]
    : sourcePriority[stage];

  for (const source of orderedSources) {
    const matched = bySource[source].find((line) => patternByStage[stage].some((pattern) => pattern.test(line)));
    if (matched) {
      return matched;
    }
  }

  for (const source of orderedSources) {
    const first = bySource[source][0];
    if (first) {
      return first;
    }
  }

  return STAGE_SEED_SPECS.find((spec) => spec.stage === stage)?.fallbackText ?? "";
}

function createActionSeedsFromRanked(ranked: ScoredCandidate[]): LawActionSeed[] {
  const dedupedRanked = dedupeLawCandidatesByArticle(prioritizeLawCandidatesForActions(ranked));
  if (dedupedRanked.length === 0) {
    return [];
  }

  const seeds: LawActionSeed[] = [];
  const seenSeedKeys = new Set<string>();
  const usedLawArticleKeys = new Set<string>();
  const usedLawKeys = new Set<string>();
  const usedArticleKeys = new Set<string>();
  const seenActionTokensByStage: Record<ActionStage, Set<string>> = {
    immediate: new Set<string>(),
    same_day: new Set<string>(),
    pre_resume: new Set<string>(),
    improvement: new Set<string>(),
  };

  const pushSeed = (seed: LawActionSeed) => {
    if (!seed.rawText) {
      return;
    }

    const stageToken = seed.stageHint ?? "none";
    const articleToken = sanitizeText(seed.articleNumber ?? "").replace(/\s+/g, "").toLowerCase();
    const lawToken = sanitizeText(seed.lawName ?? seed.legalBasis ?? "").replace(/\s+/g, "").toLowerCase();
    const actionToken = sanitizeText(seed.rawText).replace(/\s+/g, "").toLowerCase();
    const dedupeKey = `${stageToken}|${lawToken}|${articleToken}|${actionToken}`;
    if (seenSeedKeys.has(dedupeKey)) {
      return;
    }

    seenSeedKeys.add(dedupeKey);
    seeds.push(seed);
  };

  for (const spec of STAGE_SEED_SPECS) {
    if (seeds.length >= ACTION_SEED_LIMIT) {
      break;
    }

    const selection = selectActionCandidateForStage(
      spec.stage,
      dedupedRanked,
      usedLawArticleKeys,
      usedLawKeys,
      usedArticleKeys,
    );
    if (!selection) {
      continue;
    }

    const lawArticleKey = normalizeLawArticleKey(selection.candidate);
    const lawKey = normalizeLawKey(selection.candidate);
    const articleKey = normalizeArticleKey(selection.candidate);
    if (lawArticleKey) {
      usedLawArticleKeys.add(lawArticleKey);
    }
    if (lawKey) {
      usedLawKeys.add(lawKey);
    }
    if (articleKey) {
      usedArticleKeys.add(articleKey);
    }

    const preferredText = pickStageActionText(selection.candidate, spec.stage, spec.source) || spec.fallbackText;
    const preferredToken = toActionSeedToken(preferredText);
    const fallbackToken = toActionSeedToken(spec.fallbackText);
    const stageTokens = seenActionTokensByStage[spec.stage];
    const rawText = preferredToken && !stageTokens.has(preferredToken)
      ? preferredText
      : spec.fallbackText;
    const rawToken = toActionSeedToken(rawText);
    if (rawToken) {
      stageTokens.add(rawToken);
    } else if (fallbackToken) {
      stageTokens.add(fallbackToken);
    }

    pushSeed(
      buildSeedFromCandidate(selection.candidate, rawText, spec.source, {
        stageHint: spec.stage,
        selectionMode: selection.selectionMode,
        selectionReason: selection.selectionReason,
      }),
    );
  }

  return seeds.slice(0, ACTION_SEED_LIMIT);
}
function prioritizeLawCandidatesForActions(rankedLaw: ScoredCandidate[]) {
  return rankedLaw
    .slice()
    .sort((left, right) => {
      const categoryPriorityDiff = actionCandidatePriority(left) - actionCandidatePriority(right);
      if (categoryPriorityDiff !== 0) {
        return categoryPriorityDiff;
      }
      return (right.finalScore ?? 0) - (left.finalScore ?? 0);
    });
}

function mapEvidenceItems(ranked: ScoredCandidate[], track: LawTrack): MappedLawEvidenceItem[] {
  const limit = track === "law" ? LAW_EVIDENCE_LIMIT : GUIDE_EVIDENCE_LIMIT;
  const source = track === "law" ? dedupeLawCandidatesByArticle(ranked) : ranked;

  return source.slice(0, limit).map((item, index) => {
    const articleNumber = sanitizeText(item.articleNumber ?? "") || extractArticleNumber(item.legalBasis || item.title);
    const articleTitle = sanitizeText(item.articleTitle ?? "") || extractArticleTitleFromSources(articleNumber, [
      item.title,
      item.content,
      item.legalBasis,
    ]);
    const lawCategory = track === "law" ? resolveLawCategory(item) : undefined;
    const clausePreview = toClausePreview(item.content);
    const relevanceReason = sanitizeText(track === "law" ? (item.semanticReason ?? item.matchReason) : item.matchReason);
    const fullContent = sanitizeText(item.content);

    return {
      id: `${track}-${index + 1}`,
      type: "law",
      sourceBadge: track === "guide" ? "Guide" : track === "media" ? "미디어" : "법령",
      title: item.title,
      relevanceScore: Math.round(item.finalScore),
      summaryBullets: toSummaryBullets(item.content),
      keywords: (item.keywords ?? []).slice(0, 8),
      matchedKeywords: item.matchedKeywords,
      ruleScore: item.ruleScore,
      semanticScore: item.semanticScore,
      matchReason: item.matchReason,
      documentType: track === "guide" ? "Guide" : track === "media" ? "미디어" : "법령",
      applicationPoints: item.matchedKeywords.slice(0, 2),
      riskIfOmitted: track === "guide"
        ? "Guide 근거를 반영하지 않으면 작업 절차의 누락으로 점검·보강 항목이 빠질 수 있습니다."
        : track === "media"
          ? "미디어 근거를 반영하지 않으면 시각적 위험 신호를 놓쳐 작업자 인지가 저하될 수 있습니다."
          : "법령 근거를 반영하지 않으면 법적 필수 조치가 누락되어 중대사고 위험이 증가할 수 있습니다.",
      url: item.url,
      excluded: false,
      sourceType: item.sourceType ?? "api",
      ...(lawCategory ? { lawCategory } : {}),
      ...(item.legalBasis ? { legalBasis: item.legalBasis } : {}),
      ...(articleNumber ? { articleNumber } : {}),
      ...(articleTitle ? { articleTitle } : {}),
      ...(clausePreview ? { clausePreview } : {}),
      ...(relevanceReason ? { relevanceReason } : {}),
      ...(fullContent ? { fullContent } : {}),
      ...(item.mediaStyle ? { mediaStyle: item.mediaStyle } : {}),
    };
  });
}

function toNarrativeLawInputs(items: MappedLawEvidenceItem[]): NarrativeLawInput[] {
  return items
    .filter((item) => item.sourceBadge === "법령")
    .map((item) => ({
      id: item.id,
      title: sanitizeText(item.title),
      legalBasis: sanitizeText(item.legalBasis ?? "") || undefined,
      articleNumber: sanitizeText(item.articleNumber ?? "") || undefined,
      clausePreview: sanitizeText(item.clausePreview ?? "") || undefined,
      summaryBullets: (item.summaryBullets ?? []).map((line) => sanitizeText(line)).filter(Boolean).slice(0, 3),
      applicationPoints: (item.applicationPoints ?? []).map((line) => sanitizeText(line)).filter(Boolean).slice(0, 2),
    }));
}

function toNarrativeActionInputs(items: LawActionItem[]): NarrativeActionInput[] {
  return items
    .filter((item) =>
      item.stage === "immediate"
      || item.stage === "same_day"
      || item.stage === "pre_resume"
      || item.stage === "improvement")
    .map((item) => ({
      id: item.id,
      stage: item.stage,
      actionText: sanitizeText(item.actionText),
      articleNumbers: (item.articleNumbers ?? []).map((value) => sanitizeText(value)).filter(Boolean),
      legalBasis: sanitizeText(item.legalBasis ?? "") || undefined,
      lawName: sanitizeText(item.lawName ?? "") || undefined,
      legalRequirement: sanitizeText(item.legalRequirement ?? "") || undefined,
      clausePreview: sanitizeText(item.clausePreview ?? "") || undefined,
    }));
}

function mergeEvidenceNarratives(items: MappedLawEvidenceItem[], narratives: Record<string, NarrativeLawInput>) {
  return items.map((item) => {
    const narrative = narratives[item.id] as unknown as {
      applicabilityReason?: string;
      keyExcerpt?: string;
      summaryArticle?: string;
    } | undefined;

    if (!narrative) {
      return item;
    }

    return {
      ...item,
      ...(narrative.applicabilityReason ? { applicabilityReason: sanitizeText(narrative.applicabilityReason) } : {}),
      ...(narrative.keyExcerpt ? { keyExcerpt: sanitizeText(narrative.keyExcerpt) } : {}),
      ...(narrative.summaryArticle ? { summaryArticle: sanitizeText(narrative.summaryArticle) } : {}),
    };
  });
}

function mergeActionNarratives(items: LawActionItem[], narratives: Record<string, NarrativeActionInput>) {
  return items.map((item) => {
    const narrative = narratives[item.id] as unknown as {
      actionNeedReason?: string;
      applicabilityReason?: string;
      keyExcerpt?: string;
      summaryArticle?: string;
    } | undefined;

    if (!narrative) {
      return item;
    }

    return {
      ...item,
      ...(narrative.actionNeedReason ? { actionNeedReason: sanitizeText(narrative.actionNeedReason) } : {}),
      ...(narrative.applicabilityReason ? { applicabilityReason: sanitizeText(narrative.applicabilityReason) } : {}),
      ...(narrative.keyExcerpt ? { keyExcerpt: sanitizeText(narrative.keyExcerpt) } : {}),
      ...(narrative.summaryArticle ? { summaryArticle: sanitizeText(narrative.summaryArticle) } : {}),
    };
  });
}

function mergeLawFitResults(
  items: LawActionItem[],
  fitById: Record<string, {
    status: "verified" | "review_required" | "unknown";
    reason: string;
    score: number;
    lawFitGateFailureCode?: "INCIDENT_ANCHOR_MISMATCH";
  }>,
) {
  return items.map((item) => {
    const fit = fitById[item.id];
    if (!fit) {
      return item;
    }

    const reason = sanitizeText(fit.reason);
    return {
      ...item,
      lawFitStatus: fit.status,
      lawFitReason: reason || item.lawFitReason,
      lawFitScore: Number.isFinite(fit.score) ? Math.max(0, Math.min(100, Math.round(fit.score))) : item.lawFitScore,
      lawFitGateFailureCode: fit.lawFitGateFailureCode ?? item.lawFitGateFailureCode,
    };
  });
}

function resolveServiceKey() {
  return Deno.env.get("DATA_GO_KR_API_KEY")
    ?? Deno.env.get("DATA_GO_API_KEY")
    ?? Deno.env.get("PUBLIC_DATA_API_KEY")
    ?? "";
}

function validateRequestBody(body: LawGuideRequestBody) {
  if (!body || typeof body !== "object") {
    throw new Error("VALIDATION_ERROR:요청 본문이 비어 있습니다.");
  }
  if (!sanitizeText(body.taskName ?? "")) {
    throw new Error("VALIDATION_ERROR:taskName은 필수입니다.");
  }
  if (!body.profile || typeof body.profile !== "object") {
    throw new Error("VALIDATION_ERROR:profile은 필수입니다.");
  }
}

function buildTrackStatus(
  rawCount: number,
  rankedCount: number,
  hardError: boolean,
): TrackStatus {
  if (rankedCount > 0) {
    return "success";
  }
  if (hardError && rawCount === 0) {
    return "error";
  }
  return "empty";
}

export async function buildLawGuidesPayload(
  body: LawGuideRequestBody,
  options: LawGuidesPayloadBuildOptions = {},
): Promise<LawGuidesResponse> {
  validateRequestBody(body);

  const mode = options.mode ?? "assessment";
  const lawSourcePolicy = options.lawSourcePolicy ?? "default";
  const responseMode = options.responseMode ?? "full";
  const isEvidenceOnly = responseMode === "evidence_only";
  const isApiOnlyLawSource = lawSourcePolicy === "api_only";
  const isApiOnlyEvidenceMode = isEvidenceOnly && isApiOnlyLawSource;
  const isStorageDbOnlyLawSource = lawSourcePolicy === "storage_db_only";
  const matchingProfile = enrichProfileWithSemanticIntents(body.profile, body.semanticIntents);
  const context = toMatchContext(sanitizeText(body.taskName), matchingProfile);
  const searchValues = buildSearchValues(context.taskName, matchingProfile, {
    taskDescription: body.taskDescription,
    analysisScenario: body.analysisScenario,
    semanticIntents: body.semanticIntents,
  });
  const effectiveSearchValues = isApiOnlyEvidenceMode
    ? searchValues.slice(0, EVIDENCE_API_ONLY_MAX_SEARCH_VALUES)
    : searchValues;
  const apiFallbackSearchValues = isApiOnlyEvidenceMode
    ? buildApiFallbackSearchValues(matchingProfile, effectiveSearchValues)
    : [];
  const serviceKey = resolveServiceKey();

  let apiCandidates: MatchCandidate[] = [];
  let apiDiagnostics = createApiFetchDiagnostics();
  if (isStorageDbOnlyLawSource) {
    // Form strict mode can disable external API usage and use only storage/db candidates.
  } else if (!serviceKey) {
    for (const track of ["law", "guide", "media"] as const) {
      apiDiagnostics.trackStats[track].attempted = 1;
      apiDiagnostics.trackStats[track].failed = 1;
      appendTrackError(apiDiagnostics.trackStats[track], "MISSING_SECRET:DATA_GO_KR_API_KEY");
    }
  } else {
    try {
      const result = await fetchApiCandidates(serviceKey, effectiveSearchValues, apiFallbackSearchValues);
      apiCandidates = result.candidates;
      apiDiagnostics = result.diagnostics;
    } catch (error) {
      apiDiagnostics = createGlobalApiFailureDiagnostics(error);
    }
  }

  let dbCandidates: MatchCandidate[] = [];
  let dbError = "";
  let dbFetchedRowCount = 0;
  if (!isApiOnlyLawSource) {
    try {
      const dbResult = await fetchDbCandidates(matchingProfile);
      dbCandidates = dbResult.candidates;
      dbFetchedRowCount = dbResult.fetchedRowCount;
    } catch (error) {
      dbError = normalizeTrackError(error);
    }
  }

  let storageCandidates: MatchCandidate[] = [];
  let storageError = "";
  let storageDiagnostics = createStorageCandidateDiagnostics();
  if (!isApiOnlyLawSource) {
    try {
      const storageResult = await fetchStorageCandidates(matchingProfile);
      storageCandidates = storageResult.candidates;
      storageDiagnostics = storageResult.diagnostics;
    } catch (error) {
      storageError = normalizeTrackError(error);
      appendStorageDiagnosticError(storageDiagnostics, storageError);
    }
  }

  const apiLawCandidates = apiCandidates.filter((candidate) => resolveTrack(candidate) === "law");
  const guideCandidates = apiCandidates.filter((candidate) => resolveTrack(candidate) === "guide");
  const mediaCandidates = apiCandidates.filter((candidate) => resolveTrack(candidate) === "media");
  const lawCandidates = dedupeLawCandidatesByArticle(
    isApiOnlyLawSource
      ? [...apiLawCandidates]
      : isStorageDbOnlyLawSource
        ? [...storageCandidates, ...dbCandidates]
        : [...storageCandidates, ...dbCandidates, ...apiLawCandidates],
  );

  const rankBaseOptions = {
    maxResults: LAW_EVIDENCE_LIMIT,
    semanticTopK: 20,
    semanticTimeoutMs: 5000,
    semanticEnabled: !isApiOnlyEvidenceMode,
    csvEnhancementEnabled: true,
    hazardTypeFilter: "required" as const,
    semanticWeight: 0.2,
    geminiApiKey: Deno.env.get("GEMINI_API_KEY") ?? undefined,
    geminiModel: Deno.env.get("GEMINI_MODEL") ?? undefined,
  };

  const evaluateStrictAxes = createLawStrictAxisEvaluator(context);
  const strictLawCandidates = lawCandidates.filter((candidate) => evaluateStrictAxes(candidate).passed);
  const strictOnly = (Deno.env.get("LAW_STRICT_ONLY") ?? "false").toLowerCase() === "true";

  const rankLawCandidates = async (
    candidates: MatchCandidate[],
    hazardTypeFilter: "required" | "none",
    thresholds: number[] = LAW_ADAPTIVE_THRESHOLDS,
  ) => {
    const result = await rankWithAdaptiveThresholds(
      context,
      candidates,
      {
        ...rankBaseOptions,
        maxResults: LAW_EVIDENCE_LIMIT,
        hazardTypeFilter,
      },
      thresholds,
      LAW_ADAPTIVE_MIN_RESULTS,
    );
    return result.ranked;
  };

  const strictRankedLaw = await rankLawCandidates(strictLawCandidates, "none");
  let rankedLaw = strictRankedLaw;
  let rankingPoolCount = strictLawCandidates.length;
  if (!strictOnly && rankedLaw.length < LAW_ADAPTIVE_MIN_RESULTS) {
    rankedLaw = await rankLawCandidates(lawCandidates, "required");
    rankingPoolCount = lawCandidates.length;
    if (rankedLaw.length < LAW_ADAPTIVE_MIN_RESULTS) {
      const relaxedLaw = await rankLawCandidates(
        lawCandidates,
        "none",
        LAW_RELAXED_FALLBACK_THRESHOLDS,
      );
      if (relaxedLaw.length > rankedLaw.length) {
        rankedLaw = relaxedLaw;
      }
    }
  }

  if (isApiOnlyEvidenceMode && rankedLaw.length === 0 && apiLawCandidates.length > 0) {
    rankedLaw = await rankCandidatesHybrid(context, apiLawCandidates, {
      ...rankBaseOptions,
      maxResults: LAW_EVIDENCE_LIMIT,
      threshold: 0,
      hazardTypeFilter: "none",
      semanticEnabled: false,
    });
    rankingPoolCount = apiLawCandidates.length;
  }

  const [guideRankResult, mediaRankResult] = await Promise.all([
    guideCandidates.length > 0
      ? rankWithAdaptiveThresholds(
        context,
        guideCandidates,
        { ...rankBaseOptions, maxResults: GUIDE_EVIDENCE_LIMIT },
        GUIDE_MEDIA_ADAPTIVE_THRESHOLDS,
      )
      : Promise.resolve({ ranked: [] as ScoredCandidate[], appliedThreshold: GUIDE_MEDIA_ADAPTIVE_THRESHOLDS[0] }),
    mediaCandidates.length > 0
      ? rankWithAdaptiveThresholds(
        context,
        mediaCandidates,
        { ...rankBaseOptions, maxResults: GUIDE_EVIDENCE_LIMIT },
        GUIDE_MEDIA_ADAPTIVE_THRESHOLDS,
      )
      : Promise.resolve({ ranked: [] as ScoredCandidate[], appliedThreshold: GUIDE_MEDIA_ADAPTIVE_THRESHOLDS[0] }),
  ]);

  let rankedGuide = guideRankResult.ranked;
  if (isApiOnlyEvidenceMode && rankedGuide.length === 0 && guideCandidates.length > 0) {
    rankedGuide = await rankCandidatesHybrid(context, guideCandidates, {
      ...rankBaseOptions,
      maxResults: GUIDE_EVIDENCE_LIMIT,
      threshold: 0,
      hazardTypeFilter: "none",
      semanticEnabled: false,
    });
  }

  let rankedMedia = mediaRankResult.ranked;
  if (isApiOnlyEvidenceMode && rankedMedia.length === 0 && mediaCandidates.length > 0) {
    rankedMedia = await rankCandidatesHybrid(context, mediaCandidates, {
      ...rankBaseOptions,
      maxResults: GUIDE_EVIDENCE_LIMIT,
      threshold: 0,
      hazardTypeFilter: "none",
      semanticEnabled: false,
    });
  }

  let lawItems = mapEvidenceItems(rankedLaw, "law");
  const guideItems = mapEvidenceItems(rankedGuide, "guide");
  const mediaItems = mapEvidenceItems(rankedMedia, "media");

  let actionItems: LawActionItem[] = [];
  if (!isEvidenceOnly) {
    const actionSeeds = createActionSeedsFromRanked(rankedLaw);
    actionItems = buildLawActionItems(
      actionSeeds,
      ACTION_STAGE_MAX_ITEMS,
      0.8,
      ACTION_STAGE_MIN_ITEMS,
    );

    try {
      const narratives = await generateLawNarratives({
        taskName: sanitizeText(body.taskName),
        taskDescription: sanitizeText(body.taskDescription ?? "") || undefined,
        analysisScenario: sanitizeText(body.analysisScenario ?? "") || undefined,
        profile: {
          industry: sanitizeText(matchingProfile.industry ?? ""),
          workLocation: sanitizeText(matchingProfile.workLocation ?? ""),
          equipment: (matchingProfile.equipment ?? []).map((item) => sanitizeText(item)).filter(Boolean),
          hazards: (matchingProfile.hazards ?? []).map((hazard) => ({
            name: sanitizeText(hazard.name ?? ""),
            type: sanitizeText(hazard.type ?? "") || undefined,
            weight: hazard.weight ?? 0,
          })),
        },
        lawItems: toNarrativeLawInputs(lawItems),
        actionItems: toNarrativeActionInputs(actionItems),
        geminiApiKey: Deno.env.get("GEMINI_API_KEY") ?? undefined,
        geminiModel: Deno.env.get("GEMINI_MODEL") ?? undefined,
      });

      lawItems = mergeEvidenceNarratives(lawItems, narratives.evidenceById as Record<string, NarrativeLawInput>);
      actionItems = mergeActionNarratives(actionItems, narratives.actionById as Record<string, NarrativeActionInput>);
    } catch (error) {
      console.warn("[law-guides-core] narrative generation failed:", normalizeTrackError(error));
    }

    try {
      const lawFitById = await validateLawFitForActions({
        taskName: sanitizeText(body.taskName),
        taskDescription: sanitizeText(body.taskDescription ?? "") || undefined,
        analysisScenario: sanitizeText(body.analysisScenario ?? "") || undefined,
        profile: {
          industry: sanitizeText(matchingProfile.industry ?? ""),
          workLocation: sanitizeText(matchingProfile.workLocation ?? ""),
          equipment: (matchingProfile.equipment ?? []).map((item) => sanitizeText(item)).filter(Boolean),
          hazards: (matchingProfile.hazards ?? []).map((hazard) => ({
            name: sanitizeText(hazard.name ?? ""),
            type: sanitizeText(hazard.type ?? "") || undefined,
            weight: hazard.weight ?? 0,
          })),
        },
        actionItems,
        geminiApiKey: Deno.env.get("GEMINI_API_KEY") ?? undefined,
        geminiModel: Deno.env.get("GEMINI_MODEL") ?? undefined,
        timeoutMs: 9000,
      });
      actionItems = mergeLawFitResults(actionItems, lawFitById);
    } catch (error) {
      console.warn("[law-guides-core] law-fit validation failed:", normalizeTrackError(error));
    }

    if (mode === "form") {
      actionItems = actionItems.filter((item) => item.stage !== "improvement");
    }
  }

  const items = [...lawItems, ...guideItems, ...mediaItems];
  const sourceCounts = items.reduce(
    (acc, item) => {
      const sourceType = item.sourceType ?? "api";
      if (sourceType === "db" || sourceType === "storage" || sourceType === "api") {
        acc[sourceType] += 1;
      }
      return acc;
    },
    { api: 0, db: 0, storage: 0 },
  );

  const lawErrors = [
    ...apiDiagnostics.trackStats.law.errors,
    ...(!isApiOnlyLawSource && dbError ? [dbError] : []),
    ...(!isApiOnlyLawSource && storageError ? [storageError] : []),
  ];

  const trackStatus = {
    law: buildTrackStatus(lawCandidates.length, lawItems.length, lawErrors.length > 0),
    guide: buildTrackStatus(
      guideCandidates.length,
      guideItems.length,
      isTrackHardError(apiDiagnostics.trackStats.guide),
    ),
    media: buildTrackStatus(
      mediaCandidates.length,
      mediaItems.length,
      isTrackHardError(apiDiagnostics.trackStats.media),
    ),
  } satisfies LawGuidesResponse["meta"]["trackStatus"];

  const trackErrors: LawGuidesResponse["meta"]["trackErrors"] = {};
  if (lawErrors.length > 0) trackErrors.law = uniqueStrings(lawErrors);
  if (apiDiagnostics.trackStats.guide.errors.length > 0) {
    trackErrors.guide = uniqueStrings(apiDiagnostics.trackStats.guide.errors);
  }
  if (apiDiagnostics.trackStats.media.errors.length > 0) {
    trackErrors.media = uniqueStrings(apiDiagnostics.trackStats.media.errors);
  }

  const trackEmptyReason: LawGuidesResponse["meta"]["trackEmptyReason"] = {};
  const lawEmptyReason = deriveTrackEmptyReason(lawCandidates.length, lawItems.length);
  const guideEmptyReason = deriveTrackEmptyReason(guideCandidates.length, guideItems.length);
  const mediaEmptyReason = deriveTrackEmptyReason(mediaCandidates.length, mediaItems.length);
  if (lawEmptyReason) trackEmptyReason.law = lawEmptyReason;
  if (guideEmptyReason) trackEmptyReason.guide = guideEmptyReason;
  if (mediaEmptyReason) trackEmptyReason.media = mediaEmptyReason;

  const apiTrackDiagnostics: Record<LawTrack, LawTrackDiagnostics> = {
    law: {
      attempted: apiDiagnostics.trackStats.law.attempted,
      succeeded: apiDiagnostics.trackStats.law.succeeded,
      failed: apiDiagnostics.trackStats.law.failed,
      candidateCount: apiLawCandidates.length,
      nonZeroTotalCountResponses: apiDiagnostics.trackStats.law.nonZeroTotalCountResponses,
      nonZeroCategoryCountResponses: apiDiagnostics.trackStats.law.nonZeroCategoryCountResponses,
      maxObservedTotalCount: apiDiagnostics.trackStats.law.maxObservedTotalCount,
      maxObservedCategoryCount: apiDiagnostics.trackStats.law.maxObservedCategoryCount,
      ...(apiDiagnostics.trackStats.law.errors.length > 0 ? { errors: uniqueStrings(apiDiagnostics.trackStats.law.errors) } : {}),
    },
    guide: {
      attempted: apiDiagnostics.trackStats.guide.attempted,
      succeeded: apiDiagnostics.trackStats.guide.succeeded,
      failed: apiDiagnostics.trackStats.guide.failed,
      candidateCount: guideCandidates.length,
      nonZeroTotalCountResponses: apiDiagnostics.trackStats.guide.nonZeroTotalCountResponses,
      nonZeroCategoryCountResponses: apiDiagnostics.trackStats.guide.nonZeroCategoryCountResponses,
      maxObservedTotalCount: apiDiagnostics.trackStats.guide.maxObservedTotalCount,
      maxObservedCategoryCount: apiDiagnostics.trackStats.guide.maxObservedCategoryCount,
      ...(apiDiagnostics.trackStats.guide.errors.length > 0 ? { errors: uniqueStrings(apiDiagnostics.trackStats.guide.errors) } : {}),
    },
    media: {
      attempted: apiDiagnostics.trackStats.media.attempted,
      succeeded: apiDiagnostics.trackStats.media.succeeded,
      failed: apiDiagnostics.trackStats.media.failed,
      candidateCount: mediaCandidates.length,
      nonZeroTotalCountResponses: apiDiagnostics.trackStats.media.nonZeroTotalCountResponses,
      nonZeroCategoryCountResponses: apiDiagnostics.trackStats.media.nonZeroCategoryCountResponses,
      maxObservedTotalCount: apiDiagnostics.trackStats.media.maxObservedTotalCount,
      maxObservedCategoryCount: apiDiagnostics.trackStats.media.maxObservedCategoryCount,
      ...(apiDiagnostics.trackStats.media.errors.length > 0 ? { errors: uniqueStrings(apiDiagnostics.trackStats.media.errors) } : {}),
    },
  };

  const lawDiagnostics = {
    searchValues: effectiveSearchValues,
    api: apiTrackDiagnostics,
    db: {
      fetchedRowCount: dbFetchedRowCount,
      candidateCount: dbCandidates.length,
      ...(dbError ? { error: dbError } : {}),
    },
    storage: {
      ...storageDiagnostics,
      ...(storageError ? { errors: uniqueStrings([...(storageDiagnostics.errors ?? []), storageError]) } : {}),
    },
    selection: {
      rawCandidateCount: lawCandidates.length,
      strictCandidateCount: strictLawCandidates.length,
      rankingPoolCount,
      rankedCandidateCount: rankedLaw.length,
      selectedLawItemCount: lawItems.length,
      droppedByStrictAxisCount: Math.max(0, lawCandidates.length - strictLawCandidates.length),
      droppedByRankingThresholdCount: Math.max(0, rankingPoolCount - rankedLaw.length),
    },
  } satisfies NonNullable<LawGuidesResponse["meta"]["lawDiagnostics"]>;

  return {
    items,
    lawItems,
    guideItems,
    mediaItems,
    actionItems,
    meta: {
      sourceCounts,
      trackCounts: {
        law: lawItems.length,
        guide: guideItems.length,
        media: mediaItems.length,
      },
      trackStatus,
      ...(Object.keys(trackErrors).length > 0 ? { trackErrors } : {}),
      ...(Object.keys(trackEmptyReason).length > 0 ? { trackEmptyReason } : {}),
      lawDiagnostics,
      ...(guideItems.length === 0 && mediaItems.length === 0
        ? {
          guideEmptyReason: serviceKey
            ? "KOSHA Guide/미디어 근거를 찾지 못했습니다."
            : "DATA_GO_KR_API_KEY가 설정되지 않아 Guide/미디어 검색이 제한되었습니다.",
        }
        : {}),
    },
  };
}
