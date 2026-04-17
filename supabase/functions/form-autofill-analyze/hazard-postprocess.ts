import { normalizeHazardType } from "../_shared/hazard-taxonomy.ts";

export type HazardConfidence = "high" | "medium" | "low";

export interface RiskAssessmentHazard {
  id: string;
  name: string;
  type: string;
  weight: number;
  confidence: HazardConfidence;
  reason: string;
}

interface PostProcessInput {
  taskName: string;
  taskDescription: string;
  hazards: RiskAssessmentHazard[];
  minCount?: number;
  maxCount?: number;
}

const DEFAULT_MIN_COUNT = 2;
const DEFAULT_MAX_COUNT = 3;
const STRONG_SIMILARITY = 0.84;
const TYPE_SIMILARITY = 0.72;
const ANCHOR_MAX_TOKENS = 3;

const CLAUSE_SPLIT_PATTERN =
  /(?:[.!?]\s*|\n+|;\s*|,\s*(?=[A-Za-z가-힣])|\s+(?:그리고|또한|다만|및|또는|and|while|with|without|during|where|when|then)\s+)/gi;
const SIGNAL_SPLIT_PATTERN =
  /\s+(?=(?:지게차|차량|이동장비|forklift|roller|회전부|blade|cutter|steel|fragment|guard|충돌|끼임|말림|감전|절단|추락|붕괴|질식|화재|폭발|화학|노출))/gi;

const CONTEXT_STOPWORDS = new Set(
  [
    "worker",
    "works",
    "work",
    "during",
    "while",
    "with",
    "without",
    "using",
    "uses",
    "task",
    "작업",
    "작업자",
    "현장",
    "상태",
    "위험",
    "요인",
    "진행",
  ].map((token) => token.toLowerCase()),
);

const TASK_CONTEXT_ELECTRICAL_KEYWORDS = [
  "분전반",
  "배전반",
  "배선",
  "전선",
  "차단기",
  "누전차단기",
  "충전부",
  "전원",
  "절연",
  "통전",
  "누전",
] as const;

const HAZARD_TYPE_HINT_RULES: Array<{ type: string; pattern: RegExp }> = [
  { type: "차량/이동장비 충돌", pattern: /지게차|차량|이동장비|forklift|collision|후진|주행|근접/i },
  { type: "끼임/말림", pattern: /회전부|롤러|끼임|말림|협착|roller|entrapment/i },
  { type: "절단", pattern: /절단|절단기|blade|cutter|cut/i },
  { type: "감전", pattern: /감전|전원|충전부|전선|배선|분전반|배전반|차단기|절연|통전|electric/i },
  { type: "낙하물/비래", pattern: /비래|파편|낙하|fragment|debris/i },
  { type: "화학노출", pattern: /화학|용제|노출|흡입|chemical/i },
  { type: "추락", pattern: /추락|고소|비계|발판|전도|낙상/i },
  { type: "붕괴", pattern: /붕괴|붕락|무너지|매몰/i },
  { type: "질식", pattern: /질식|산소결핍|밀폐공간|환기/i },
  { type: "폭발/화재", pattern: /폭발|화재|발화|점화|인화/i },
];

function normalizeSpace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function compact(text: string) {
  return normalizeSpace(text)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function tokenize(text: string) {
  return normalizeSpace(text)
    .split(/[^0-9A-Za-z가-힣]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function splitIncidentSignals(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return [];
  }

  const primary = normalized
    .split(CLAUSE_SPLIT_PATTERN)
    .map((clause) => normalizeSpace(clause))
    .filter((clause) => clause.length >= 10);

  const expanded = primary.flatMap((clause) =>
    clause
      .split(SIGNAL_SPLIT_PATTERN)
      .map((item) => normalizeSpace(item))
      .filter((item) => item.length >= 10)
  );

  return unique([...primary, ...expanded]);
}

function jaccardSimilarity(left: string, right: string) {
  const leftTokens = new Set(tokenize(left).map((token) => compact(token)));
  const rightTokens = new Set(tokenize(right).map((token) => compact(token)));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }
  const union = leftTokens.size + rightTokens.size - intersection;
  if (union <= 0) {
    return 0;
  }
  return intersection / union;
}

function areNearDuplicate(left: RiskAssessmentHazard, right: RiskAssessmentHazard) {
  const leftText = `${left.name} ${left.reason}`;
  const rightText = `${right.name} ${right.reason}`;
  const similarity = jaccardSimilarity(leftText, rightText);
  if (similarity >= STRONG_SIMILARITY) {
    return true;
  }

  const leftType = normalizeHazardType(left.type, leftText);
  const rightType = normalizeHazardType(right.type, rightText);
  return Boolean(leftType && leftType === rightType && similarity >= TYPE_SIMILARITY);
}

function clampWeight(weight: number) {
  if (!Number.isFinite(weight)) {
    return 20;
  }
  return Math.max(1, Math.min(40, Math.round(weight)));
}

function truncateByWords(text: string, maxLength: number) {
  const normalized = normalizeSpace(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const words = normalized.split(" ");
  const picked: string[] = [];
  for (const word of words) {
    const merged = normalizeSpace([...picked, word].join(" "));
    if (merged.length > maxLength) {
      break;
    }
    picked.push(word);
  }
  return normalizeSpace(picked.join(" "));
}

function ensureReasonSentence(text: string, hazardType: string) {
  const normalized = normalizeSpace(text).replace(/[.!?]+$/g, "");
  if (!normalized) {
    return `작업조건 통제 미흡으로 ${hazardType} 사고가 발생할 수 있음`;
  }

  if (/(위험|발생|가능|우려)/.test(normalized)) {
    return normalized;
  }
  return `${normalized}로 인해 ${hazardType} 사고 위험이 증가할 수 있음`;
}

function hasTaskKeywordHit(text: string, keywords: readonly string[]) {
  const compactText = compact(text);
  if (!compactText) {
    return false;
  }

  return keywords.some((keyword) => {
    const compactKeyword = compact(keyword);
    return compactKeyword.length >= 2 && compactText.includes(compactKeyword);
  });
}

function normalizeHazardTypeList(values: string[]) {
  return unique(
    values
      .map((value) => normalizeHazardType(value, value))
      .filter(Boolean),
  );
}

function inferTaskHazardScope(input: PostProcessInput) {
  const sourceText = normalizeSpace(`${input.taskName} ${input.taskDescription}`);
  const explicitHazardTypes = normalizeHazardTypeList((input.hazards ?? []).map((hazard) => hazard.type ?? ""));
  const inferredByRules = HAZARD_TYPE_HINT_RULES
    .filter((rule) => rule.pattern.test(sourceText))
    .map((rule) => normalizeHazardType(rule.type, sourceText))
    .filter(Boolean);
  const inferredByClauses = splitIncidentSignals(sourceText)
    .map((clause) => normalizeHazardType(clause, clause))
    .filter(Boolean);
  const directInferred = normalizeHazardType(sourceText, sourceText);
  const hasElectricalKeyword = hasTaskKeywordHit(sourceText, TASK_CONTEXT_ELECTRICAL_KEYWORDS);

  const contextDrivenTypes = normalizeHazardTypeList([
    ...inferredByRules,
    ...inferredByClauses,
    directInferred,
    hasElectricalKeyword ? "감전" : "",
  ]);
  const scopedExplicitTypes = contextDrivenTypes.length > 0
    ? explicitHazardTypes.filter((type) => contextDrivenTypes.includes(type))
    : explicitHazardTypes;
  const allowedHazardTypes = unique([
    ...contextDrivenTypes,
    ...scopedExplicitTypes,
  ]);
  const fallbackType = allowedHazardTypes[0]
    || explicitHazardTypes[0]
    || directInferred
    || "추락";

  return {
    allowedHazardTypes: allowedHazardTypes.length > 0 ? allowedHazardTypes : [fallbackType],
    fallbackType,
  };
}

function collectAnchorTokens(taskName: string, taskDescription: string) {
  return unique(
    [...tokenize(taskName), ...tokenize(taskDescription)]
      .map((token) => token.toLowerCase())
      .filter((token) => !CONTEXT_STOPWORDS.has(token)),
  );
}

function pickAnchorPhrase(tokens: string[], index: number) {
  if (tokens.length === 0) {
    return "작업 조건";
  }
  const start = (index * ANCHOR_MAX_TOKENS) % tokens.length;
  const selected = [
    tokens[start],
    tokens[(start + 1) % tokens.length],
    tokens[(start + 2) % tokens.length],
  ].filter(Boolean);
  return normalizeSpace(selected.join(" "));
}

function buildAnchoredHazardName(anchor: string, hazardType: string) {
  const normalizedAnchor = normalizeSpace(anchor);
  const base = normalizedAnchor || "작업 조건";
  const candidate = `${base} 상태로 인한 ${hazardType} 위험 증가`;
  return truncateByWords(candidate, 36);
}

function toPostProcessTarget(taskDescription: string, clauses: string[], minCount: number, maxCount: number) {
  const normalized = normalizeSpace(taskDescription);
  const target = normalized.length >= 110 || clauses.length >= 3 ? maxCount : minCount;
  return Math.max(minCount, Math.min(maxCount, target));
}

function isHazardTypeAllowed(type: string, allowedHazardTypes: string[]) {
  const normalized = normalizeHazardType(type, type);
  if (!normalized) {
    return false;
  }
  if (allowedHazardTypes.length === 0) {
    return true;
  }
  return allowedHazardTypes.includes(normalized);
}

function normalizeInputHazards(
  hazards: RiskAssessmentHazard[],
  fallbackType: string,
  allowedHazardTypes: string[],
) {
  return hazards
    .map((hazard, index) => {
      const type = normalizeHazardType(hazard.type, `${hazard.name} ${hazard.reason}`) || fallbackType;
      const name = normalizeSpace(hazard.name) || buildAnchoredHazardName("작업 조건", type);
      const reason = ensureReasonSentence(normalizeSpace(hazard.reason), type);
      return {
        id: normalizeSpace(hazard.id) || `H${index + 1}`,
        name,
        type,
        weight: clampWeight(hazard.weight),
        confidence: hazard.confidence === "high" || hazard.confidence === "medium" ? hazard.confidence : "low",
        reason,
      } satisfies RiskAssessmentHazard;
    })
    .filter((hazard) => hazard.name && hazard.reason)
    .filter((hazard) => isHazardTypeAllowed(hazard.type, allowedHazardTypes));
}

function buildClauseHazards(
  clauses: string[],
  fallbackType: string,
  allowedHazardTypes: string[],
) {
  return clauses
    .map((clause, index) => {
      const type = normalizeHazardType(clause, clause) || fallbackType;
      const anchor = truncateByWords(clause, 24);
      return {
        id: `derived-${index + 1}`,
        name: buildAnchoredHazardName(anchor, type),
        type,
        weight: clampWeight(20 + Math.floor(tokenize(clause).length / 2)),
        confidence: "medium" as const,
        reason: ensureReasonSentence(clause, type),
      } satisfies RiskAssessmentHazard;
    })
    .filter((hazard) => isHazardTypeAllowed(hazard.type, allowedHazardTypes));
}

function buildContextFallbackHazard(anchorPhrase: string, hazardType: string, index: number) {
  const reasonSeed = `${anchorPhrase} 조건`;
  return {
    id: `fallback-${index + 1}`,
    name: buildAnchoredHazardName(anchorPhrase, hazardType),
    type: hazardType,
    weight: 22,
    confidence: "low" as const,
    reason: ensureReasonSentence(`${reasonSeed} 통제 미흡`, hazardType),
  } satisfies RiskAssessmentHazard;
}

function scoreHazardContextAlignment(hazard: RiskAssessmentHazard, anchorTokens: string[], allowedHazardTypes: string[]) {
  const text = normalizeSpace(`${hazard.name} ${hazard.reason}`);
  const tokenMatches = anchorTokens.filter((token) => compact(text).includes(compact(token))).length;
  const typeMatched = isHazardTypeAllowed(hazard.type, allowedHazardTypes);
  return (typeMatched ? 20 : -40) + Math.min(4, tokenMatches) * 6;
}

export function postProcessRiskAssessmentHazards(input: PostProcessInput) {
  const taskName = normalizeSpace(input.taskName);
  const taskDescription = normalizeSpace(input.taskDescription);
  const minCount = Math.max(1, Math.trunc(input.minCount ?? DEFAULT_MIN_COUNT));
  const maxCount = Math.max(minCount, Math.trunc(input.maxCount ?? DEFAULT_MAX_COUNT));

  const hazardScope = inferTaskHazardScope(input);
  const allowedHazardTypes = hazardScope.allowedHazardTypes;
  const fallbackType = hazardScope.fallbackType;

  const clauses = splitIncidentSignals(`${taskDescription} ${taskName}`);
  const targetCount = toPostProcessTarget(taskDescription, clauses, minCount, maxCount);
  const anchorTokens = collectAnchorTokens(taskName, taskDescription);

  const normalizedHazards = normalizeInputHazards(input.hazards, fallbackType, allowedHazardTypes);
  const derivedHazards = buildClauseHazards(clauses, fallbackType, allowedHazardTypes);

  const scoredCandidates = [...normalizedHazards, ...derivedHazards]
    .map((hazard) => ({
      hazard,
      score: hazard.weight + scoreHazardContextAlignment(hazard, anchorTokens, allowedHazardTypes),
    }))
    .sort((left, right) => right.score - left.score);

  const selected: RiskAssessmentHazard[] = [];
  const tryPush = (candidate: RiskAssessmentHazard) => {
    if (!isHazardTypeAllowed(candidate.type, allowedHazardTypes)) {
      return false;
    }
    if (selected.some((item) => areNearDuplicate(item, candidate))) {
      return false;
    }
    selected.push(candidate);
    return true;
  };

  for (const { hazard } of scoredCandidates) {
    if (selected.length >= targetCount) {
      break;
    }
    tryPush(hazard);
  }

  const fallbackTypes = allowedHazardTypes.length > 0 ? allowedHazardTypes : [fallbackType];
  let fallbackIndex = 0;
  let safety = 0;
  while (selected.length < targetCount && safety < 24) {
    const hazardType = fallbackTypes[fallbackIndex % fallbackTypes.length] || fallbackType;
    const anchorPhrase = pickAnchorPhrase(anchorTokens, fallbackIndex);
    fallbackIndex += 1;
    safety += 1;
    tryPush(buildContextFallbackHazard(anchorPhrase, hazardType, fallbackIndex));
  }

  if (selected.length === 0) {
    selected.push(
      buildContextFallbackHazard(
        pickAnchorPhrase(anchorTokens, 0),
        fallbackType,
        1,
      ),
    );
  }

  return selected.slice(0, targetCount).map((hazard, index) => ({
    ...hazard,
    id: hazard.id || `H${index + 1}`,
  }));
}
