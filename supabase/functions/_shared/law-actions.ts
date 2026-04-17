export type LawActionStage = "immediate" | "same_day" | "pre_resume" | "improvement";
export type LawFitStatus = "verified" | "review_required" | "unknown";

export interface LawActionSeed {
  rawText: string;
  stageHint?: LawActionStage;
  articleNumber?: string;
  articleTitle?: string;
  legalBasis?: string;
  lawName?: string;
  lawCategory?: "1" | "2" | "3" | "4";
  clausePreview?: string;
  legalRequirement?: string;
  relevanceReason?: string;
  actionNeedReason?: string;
  applicabilityReason?: string;
  keyExcerpt?: string;
  summaryArticle?: string;
  selectionMode?: "direct" | "derived" | "reused";
  selectionReason?: string;
  source: "remedial" | "checklist" | "content";
  score?: number;
}

export interface LawActionItem {
  id: string;
  stage: LawActionStage;
  actionText: string;
  articleNumbers: string[];
  articleTitle?: string;
  legalBasis?: string;
  lawName?: string;
  lawCategory?: "1" | "2" | "3" | "4";
  clausePreview?: string;
  legalRequirement?: string;
  relevanceReason?: string;
  actionNeedReason?: string;
  applicabilityReason?: string;
  keyExcerpt?: string;
  summaryArticle?: string;
  selectionMode?: "direct" | "derived" | "reused";
  selectionReason?: string;
  generationType?: "direct" | "derived";
  lawFitStatus?: LawFitStatus;
  lawFitReason?: string;
  lawFitScore?: number;
  lawFitGateFailureCode?: "INCIDENT_ANCHOR_MISMATCH";
}

interface InternalLawActionItem extends Omit<LawActionItem, "id"> {
  rankScore: number;
}

const ARTICLE_PATTERN = /제\s*\d+\s*조(?:의\s*\d+)?/;
const MAX_ACTION_LENGTH = 90;
const MAX_CLAUSE_PREVIEW_LENGTH = 120;
const MAX_LEGAL_REQUIREMENT_LENGTH = 120;
const MAX_RELEVANCE_REASON_LENGTH = 160;
const PRIMARY_STAGE_MAX_PER_LAW = 1;

const AMBIGUOUS_PATTERNS = [
  /필요한\s*조치를?\s*(하여야|해야)/,
  /적절한\s*조치를?\s*(하여야|해야)/,
  /필요한\s*사항을?\s*정한/,
  /^다만[, ]/,
  /^이\s*경우/,
  /예외\s*사유/,
  /경우에는\s*제외/,
];

const IMPROVEMENT_PATTERNS = [/재발/, /개선/, /교육/, /훈련/, /점검체계/, /보완/, /관리체계/];
const PRE_RESUME_PATTERNS = [/재개/, /재작업/, /재투입/, /복구/, /승인/, /점검표/, /재개 전/];
const IMMEDIATE_PATTERNS = [/즉시/, /중지/, /정지/, /차단/, /격리/, /비상/, /신고/, /대피/, /구조/];

function normalizeSpace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeCompact(text?: string) {
  return normalizeSpace(text ?? "").toLowerCase().replace(/\s+/g, "");
}

function truncateSentence(text: string, maxLength: number) {
  const normalized = normalizeSpace(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const safe = lastSpace >= Math.floor(maxLength * 0.6) ? sliced.slice(0, lastSpace) : sliced;
  return safe.replace(/[,\s]+$/g, "").trim();
}

function toSingleSentence(text: string, maxLength: number) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }

  const first = normalized
    .split(/(?<=[.!?])\s+|;|\n/g)
    .map((part) => normalizeSpace(part))
    .find(Boolean) ?? normalized;

  return truncateSentence(first, maxLength);
}

function ensurePeriod(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function trimClausePreview(text?: string) {
  const normalized = toSingleSentence(text ?? "", MAX_CLAUSE_PREVIEW_LENGTH);
  return normalized || undefined;
}

function trimLegalRequirement(text?: string) {
  const normalized = toSingleSentence(text ?? "", MAX_LEGAL_REQUIREMENT_LENGTH);
  return normalized || undefined;
}

function trimRelevanceReason(text?: string, maxLength = MAX_RELEVANCE_REASON_LENGTH) {
  const normalized = toSingleSentence(text ?? "", maxLength);
  return normalized || undefined;
}

function trimNarrativeText(text?: string, maxLength = 260) {
  const normalized = truncateSentence(text ?? "", maxLength);
  return normalized || undefined;
}

function trimLawName(name?: string) {
  const normalized = normalizeSpace(name ?? "");
  return normalized || undefined;
}

function trimArticleTitle(title?: string) {
  const normalized = normalizeSpace(title ?? "");
  return normalized || undefined;
}

function normalizeLawCategory(category?: string): "1" | "2" | "3" | "4" | undefined {
  const normalized = normalizeSpace(category ?? "");
  if (normalized === "1" || normalized === "2" || normalized === "3" || normalized === "4") {
    return normalized;
  }
  return undefined;
}

function deriveLawCategoryFromText(text?: string): "1" | "2" | "3" | "4" | undefined {
  const normalized = normalizeCompact(text);
  if (!normalized) {
    return undefined;
  }

  if (normalized.includes("산업안전보건기준에관한규칙") || normalized.includes("occupationalsafetyandhealthstandardsrules")) {
    return "4";
  }
  if (normalized.includes("산업안전보건법시행규칙")) {
    return "3";
  }
  if (normalized.includes("산업안전보건법시행령")) {
    return "2";
  }
  if (normalized.includes("산업안전보건법")) {
    return "1";
  }
  return undefined;
}

function resolveLawCategory(seed: LawActionSeed): "1" | "2" | "3" | "4" | undefined {
  return normalizeLawCategory(seed.lawCategory)
    ?? deriveLawCategoryFromText(seed.lawName)
    ?? deriveLawCategoryFromText(seed.legalBasis);
}

export function extractArticleNumber(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }
  const match = normalized.match(ARTICLE_PATTERN);
  return match?.[0] ?? "";
}

export function isAmbiguousClause(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return true;
  }
  return AMBIGUOUS_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizeClauseForAction(text: string) {
  return normalizeSpace(text)
    .replace(/^[\d)\].\s]+/, "")
    .replace(/^(사업주|근로자|작업자|관리감독자|관계자)(는|은)?\s*/u, "")
    .replace(/^(해당|당해)\s*/u, "");
}

export function toActionSentence(text: string) {
  const normalized = normalizeClauseForAction(text);
  if (!normalized) {
    return "";
  }

  let base = normalized
    .replace(/\s*(하여야\s*한다|해야\s*한다|하여야\s*하며|하여야\s*한다)\.?$/u, "")
    .replace(/\s*(하여서는\s*안\s*된다|해서는\s*안\s*된다)\.?$/u, "")
    .replace(/\s*(한다)\.?$/u, "");

  base = normalizeSpace(base);
  if (!base) {
    return "";
  }

  const isRestriction = /금지|하지\s*말|안\s*된다|하면\s*안/u.test(normalized);
  if (isRestriction) {
    const restriction = base
      .replace(/\s*금지$/u, "")
      .replace(/\s*해서는\s*안\s*된다$/u, "")
      .replace(/\s*하여서는\s*안\s*된다$/u, "")
      .trim();
    return truncateSentence(ensurePeriod(`${restriction}해서는 안 됩니다`), MAX_ACTION_LENGTH);
  }

  if (!/(해야\s*합니다|하십시오|해\s*주십시오|하여야\s*합니다)/u.test(base)) {
    base = `${base}해야 합니다`;
  }

  return truncateSentence(ensurePeriod(base), MAX_ACTION_LENGTH);
}

function deriveLegalRequirement(clausePreview?: string) {
  if (!clausePreview) {
    return undefined;
  }

  const first = toSingleSentence(clausePreview, MAX_LEGAL_REQUIREMENT_LENGTH);
  if (!first) {
    return undefined;
  }

  return first;
}

function uniqueArticleNumbers(articleNumbers: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of articleNumbers) {
    const normalized = normalizeSpace(value);
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function buildLawArticleIdentity(item: Pick<InternalLawActionItem, "lawName" | "legalBasis" | "articleNumbers">) {
  const lawToken = normalizeCompact(item.lawName ?? item.legalBasis ?? "");
  const articleToken = normalizeCompact(item.articleNumbers[0] ?? "");
  if (!lawToken || !articleToken) {
    return "";
  }
  return `${lawToken}|${articleToken}`;
}

function shouldMergeActionItem(
  existing: InternalLawActionItem,
  stage: LawActionStage,
  actionText: string,
  candidateLawName?: string,
  candidateLegalBasis?: string,
  candidateArticleNumber?: string,
): boolean {
  if (existing.stage !== stage) {
    return false;
  }

  const existingActionToken = normalizeCompact(existing.actionText);
  const candidateActionToken = normalizeCompact(actionText);
  if (!existingActionToken || !candidateActionToken || existingActionToken !== candidateActionToken) {
    return false;
  }

  const existingIdentity = buildLawArticleIdentity(existing);
  const candidateIdentity = buildLawArticleIdentity({
    lawName: candidateLawName,
    legalBasis: candidateLegalBasis,
    articleNumbers: candidateArticleNumber ? [candidateArticleNumber] : [],
  });

  if (!existingIdentity || !candidateIdentity) {
    return false;
  }

  return existingIdentity === candidateIdentity;
}

function toSingleArticleNumbers(item: Pick<InternalLawActionItem, "articleNumbers" | "legalBasis" | "lawName">) {
  const deduped = uniqueArticleNumbers(item.articleNumbers).slice(0, 1);
  if (deduped.length > 0) {
    return deduped;
  }

  const inferred = extractArticleNumber(`${item.legalBasis ?? ""} ${item.lawName ?? ""}`);
  return inferred ? [inferred] : [];
}

function stageKey(stage: LawActionStage) {
  if (stage === "immediate") return 0;
  if (stage === "same_day") return 1;
  if (stage === "pre_resume") return 2;
  return 3;
}

function stageDefaultReason(stage: LawActionStage, actionText: string) {
  if (stage === "immediate") {
    return ensurePeriod(`즉시 단계에서는 위험 확산을 막아야 하므로 ${actionText} 조치를 지연하면 안 됩니다`);
  }
  if (stage === "same_day") {
    return ensurePeriod(`당일 단계에서는 잔류 위험을 제거해야 하므로 ${actionText} 조치를 당일 내 완료해야 합니다`);
  }
  if (stage === "pre_resume") {
    return ensurePeriod(`작업 재개 전 단계에서는 재개 조건을 확인해야 하므로 ${actionText} 조치 확인 전에는 재개하면 안 됩니다`);
  }
  return ensurePeriod(`재발 방지 단계에서는 절차 개선, 교육 강화, 장비 보완을 통해 ${actionText} 조치를 구조화해야 합니다`);
}

export function classifyLawActionStage(
  actionText: string,
  source: LawActionSeed["source"],
  stageHint?: LawActionStage,
): LawActionStage {
  if (stageHint) {
    return stageHint;
  }

  const normalized = normalizeSpace(actionText);
  if (IMPROVEMENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "improvement";
  }
  if (PRE_RESUME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "pre_resume";
  }
  if (IMMEDIATE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "immediate";
  }

  if (source === "remedial") {
    return "immediate";
  }
  if (source === "checklist") {
    return "same_day";
  }
  return "same_day";
}

function buildLawArticleKey(item: Pick<InternalLawActionItem, "lawName" | "legalBasis" | "articleNumbers">) {
  const lawToken = normalizeCompact(item.lawName ?? item.legalBasis ?? "");
  const articleToken = normalizeCompact(item.articleNumbers[0] ?? "");
  if (!lawToken && !articleToken) {
    return "";
  }
  return `${lawToken}|${articleToken}`;
}

function buildLawKey(item: Pick<InternalLawActionItem, "lawName" | "legalBasis">) {
  return normalizeCompact(item.lawName ?? item.legalBasis ?? "");
}

function pickStageItemsWithLawSpread(
  stageItems: InternalLawActionItem[],
  maxPerStage: number,
  usedLawArticleKeys: Set<string>,
) {
  if (stageItems.length === 0 || maxPerStage <= 0) {
    return [];
  }

  const sorted = stageItems
    .slice()
    .sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0));

  const selected: InternalLawActionItem[] = [];
  const selectedLocalKeys = new Set<string>();
  const selectedLawCounts = new Map<string, number>();

  const canSelectByLawCap = (item: InternalLawActionItem) => {
    const lawKey = buildLawKey(item);
    if (!lawKey) {
      return true;
    }
    return (selectedLawCounts.get(lawKey) ?? 0) < PRIMARY_STAGE_MAX_PER_LAW;
  };

  const markSelectedLaw = (item: InternalLawActionItem) => {
    const lawKey = buildLawKey(item);
    if (!lawKey) {
      return;
    }
    selectedLawCounts.set(lawKey, (selectedLawCounts.get(lawKey) ?? 0) + 1);
  };

  for (const item of sorted) {
    if (selected.length >= maxPerStage) {
      break;
    }
    const key = buildLawArticleKey(item);
    if (key && (selectedLocalKeys.has(key) || usedLawArticleKeys.has(key))) {
      continue;
    }
    if (!canSelectByLawCap(item)) {
      continue;
    }
    if (key) {
      selectedLocalKeys.add(key);
    }
    selected.push(item);
    markSelectedLaw(item);
  }

  for (const item of sorted) {
    if (selected.length >= maxPerStage) {
      break;
    }
    if (selected.includes(item)) {
      continue;
    }
    const key = buildLawArticleKey(item);
    if (key && selectedLocalKeys.has(key)) {
      continue;
    }
    if (!canSelectByLawCap(item)) {
      continue;
    }
    if (key) {
      selectedLocalKeys.add(key);
    }
    selected.push(item);
    markSelectedLaw(item);
  }

  for (const item of sorted) {
    if (selected.length >= maxPerStage) {
      break;
    }
    if (selected.includes(item)) {
      continue;
    }
    const key = buildLawArticleKey(item);
    if (key && selectedLocalKeys.has(key)) {
      continue;
    }
    if (key) {
      selectedLocalKeys.add(key);
    }
    selected.push(item);
  }

  return selected.map((item) => {
    const key = buildLawArticleKey(item);
    const wasUsed = key ? usedLawArticleKeys.has(key) : false;
    if (key) {
      usedLawArticleKeys.add(key);
    }

    if (!wasUsed || item.selectionMode) {
      return item;
    }

    return {
      ...item,
      selectionMode: "reused" as const,
      selectionReason: item.selectionReason ?? "대체 후보가 부족해 동일 조문을 제한적으로 재사용했습니다.",
    };
  });
}

export function buildLawActionItems(
  seeds: LawActionSeed[],
  maxPerStage = 5,
  similarityThreshold = 0.8,
  minPerStage = 1,
): LawActionItem[] {
  void similarityThreshold;
  const merged: InternalLawActionItem[] = [];

  for (const seed of seeds) {
    const actionSeed = normalizeSpace(seed.rawText || seed.clausePreview || "");
    if (!actionSeed) {
      continue;
    }

    if (isAmbiguousClause(actionSeed)) {
      continue;
    }

    const actionText = toActionSentence(actionSeed);
    if (!actionText) {
      continue;
    }

    const stage = classifyLawActionStage(actionText, seed.source, seed.stageHint);
    const articleNumber = extractArticleNumber(seed.articleNumber || seed.legalBasis || actionSeed);
    const legalBasis = seed.legalBasis?.trim() || undefined;
    const lawName = trimLawName(seed.lawName);
    const articleTitle = trimArticleTitle(seed.articleTitle);
    const lawCategory = resolveLawCategory(seed);
    const clausePreview = trimClausePreview(seed.clausePreview);
    const legalRequirement = trimLegalRequirement(seed.legalRequirement) ?? deriveLegalRequirement(seed.clausePreview);
    const relevanceReason = trimRelevanceReason(seed.relevanceReason) ?? trimRelevanceReason(seed.clausePreview, 120);
    const actionNeedReason = trimNarrativeText(seed.actionNeedReason, 340) ?? stageDefaultReason(stage, actionText);
    const applicabilityReason = trimNarrativeText(seed.applicabilityReason, 260);
    const keyExcerpt = trimNarrativeText(seed.keyExcerpt, 220);
    const summaryArticle = trimNarrativeText(seed.summaryArticle, 260);
    const rankScore = Number.isFinite(seed.score) ? Number(seed.score) : 0;

    const similarIndex = merged.findIndex((existing) =>
      shouldMergeActionItem(existing, stage, actionText, lawName, legalBasis, articleNumber)
    );

    if (similarIndex >= 0) {
      const existing = merged[similarIndex];
      merged[similarIndex] = {
        ...existing,
        articleNumbers: existing.articleNumbers.length > 0
          ? existing.articleNumbers
          : (articleNumber ? [articleNumber] : []),
        legalBasis: existing.legalBasis ?? legalBasis,
        lawName: existing.lawName ?? lawName,
        articleTitle: existing.articleTitle ?? articleTitle,
        lawCategory: existing.lawCategory ?? lawCategory,
        clausePreview: existing.clausePreview ?? clausePreview,
        legalRequirement: existing.legalRequirement ?? legalRequirement,
        relevanceReason: existing.relevanceReason ?? relevanceReason,
        actionNeedReason: existing.actionNeedReason ?? actionNeedReason,
        applicabilityReason: existing.applicabilityReason ?? applicabilityReason,
        keyExcerpt: existing.keyExcerpt ?? keyExcerpt,
        summaryArticle: existing.summaryArticle ?? summaryArticle,
        selectionMode: existing.selectionMode ?? seed.selectionMode,
        selectionReason: existing.selectionReason ?? seed.selectionReason,
        generationType: existing.generationType ?? (seed.source === "content" ? "derived" : "direct"),
        rankScore: Math.max(existing.rankScore, rankScore),
      };
      continue;
    }

    merged.push({
      stage,
      actionText,
      articleNumbers: articleNumber ? [articleNumber] : [],
      legalBasis,
      lawName,
      articleTitle,
      lawCategory,
      clausePreview,
      legalRequirement,
      relevanceReason,
      actionNeedReason,
      applicabilityReason,
      keyExcerpt,
      summaryArticle,
      selectionMode: seed.selectionMode,
      selectionReason: seed.selectionReason,
      generationType: seed.source === "content" ? "derived" : "direct",
      rankScore,
    });
  }

  const groupedByStage: Record<LawActionStage, InternalLawActionItem[]> = {
    immediate: [],
    same_day: [],
    pre_resume: [],
    improvement: [],
  };
  for (const item of merged) {
    groupedByStage[item.stage].push(item);
  }

  const usedLawArticleKeys = new Set<string>();
  const limitedRanked: InternalLawActionItem[] = [];
  const stageOrder: LawActionStage[] = ["immediate", "same_day", "pre_resume", "improvement"];

  for (const stage of stageOrder) {
    const selected = pickStageItemsWithLawSpread(groupedByStage[stage], maxPerStage, usedLawArticleKeys);
    if (selected.length < minPerStage) {
      const sorted = groupedByStage[stage]
        .slice()
        .sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0));
      for (const candidate of sorted) {
        if (selected.length >= minPerStage || selected.length >= maxPerStage) {
          break;
        }
        if (selected.includes(candidate)) {
          continue;
        }
        selected.push({
          ...candidate,
          selectionMode: (candidate.selectionMode ?? "reused") as InternalLawActionItem["selectionMode"],
          selectionReason: candidate.selectionReason ?? "대체 후보가 부족해 동일 조문을 제한적으로 재사용했습니다.",
        });
      }
    }
    selected.sort((left, right) => stageKey(left.stage) - stageKey(right.stage));
    limitedRanked.push(...selected);
  }

  const limited: Array<Omit<LawActionItem, "id">> = limitedRanked.map(({ rankScore: _rankScore, ...item }) => item);
  return limited.map((item, index) => ({
    id: `law-action-${index + 1}`,
    stage: item.stage,
    actionText: item.actionText,
    articleNumbers: toSingleArticleNumbers(item),
    legalBasis: item.legalBasis,
    lawName: item.lawName,
    articleTitle: item.articleTitle,
    lawCategory: item.lawCategory,
    clausePreview: item.clausePreview,
    legalRequirement: item.legalRequirement,
    relevanceReason: item.relevanceReason,
    actionNeedReason: item.actionNeedReason,
    applicabilityReason: item.applicabilityReason,
    keyExcerpt: item.keyExcerpt,
    summaryArticle: item.summaryArticle,
    selectionMode: item.selectionMode,
    selectionReason: item.selectionReason,
    generationType: item.generationType,
    lawFitStatus: item.lawFitStatus,
    lawFitReason: item.lawFitReason,
    lawFitScore: item.lawFitScore,
    lawFitGateFailureCode: item.lawFitGateFailureCode,
  }));
}
