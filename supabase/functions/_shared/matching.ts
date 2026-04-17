import { buildCsvEnhancementTokens } from "./csv-catalog.ts";
import { normalizeHazardType, normalizeHazardTypeList } from "./hazard-taxonomy.ts";

export interface MatchHazard {
  name: string;
  type?: string;
  weight?: number;
}

export interface MatchProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: MatchHazard[];
}

export interface MatchContext {
  taskName: string;
  profile: MatchProfile;
}

export interface MatchCandidate {
  id: string;
  title: string;
  content: string;
  articleNumber?: string;
  articleTitle?: string;
  keywords?: string[];
  hazardTypes?: string[];
  url?: string;
  date?: string;
  location?: string;
  lawName?: string;
  legalBasis?: string;
  lawCategory?: "1" | "2" | "3" | "4";
  remedialActions?: string[];
  complianceChecklist?: string[];
  sourceType?: "db" | "api" | "storage";
  mediaStyle?: string;
  isDirectMatch?: boolean;
}

export interface ScoredCandidate extends MatchCandidate {
  matchedKeywords: string[];
  ruleScore: number;
  semanticScore?: number;
  semanticReason?: string;
  finalScore: number;
  matchReason: string;
}

export interface RankCandidatesOptions {
  threshold?: number;
  maxResults?: number;
  semanticTopK?: number;
  semanticTimeoutMs?: number;
  semanticEnabled?: boolean;
  csvEnhancementEnabled?: boolean;
  hazardTypeFilter?: "required" | "none";
  semanticWeight?: number;
  geminiApiKey?: string;
  geminiModel?: string;
}

interface TokenGroups {
  topHazardTypes: string[];
  hazardTokens: string[];
  directEquipmentTokens: string[];
  expandedEquipmentTokens: string[];
  directContextTokens: string[];
  expandedContextTokens: string[];
}

export interface LawStrictAxisEvaluation {
  accidentTypeMatched: boolean;
  hazardFactorMatched: boolean;
  workTypeMatched: boolean;
  equipmentMatched: boolean;
  workOrEquipmentMatched: boolean;
  matchedHazardTypes: string[];
  matchedHazardTokens: string[];
  matchedWorkTokens: string[];
  matchedEquipmentTokens: string[];
  passed: boolean;
}

const DEFAULT_THRESHOLD = 70;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_SEMANTIC_TOP_K = 15;
const DEFAULT_SEMANTIC_TIMEOUT_MS = 1500;
const DEFAULT_CSV_ENHANCEMENT_ENABLED = true;
const DEFAULT_HAZARD_TYPE_FILTER: "required" | "none" = "required";
const DEFAULT_SEMANTIC_WEIGHT = 0.2;
const STOPWORDS = new Set([
  "작업",
  "공정",
  "공사",
  "사고",
  "현장",
  "work",
  "task",
  "process",
  "case",
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function unique(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(item);
  }

  return result;
}

function mergePrioritized(primary: string[], secondary: string[], limit: number) {
  return unique([...primary, ...secondary]).slice(0, limit);
}

function pickTopHazards(profile: MatchProfile) {
  return profile.hazards
    .slice()
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
    .slice(0, 3)
    .map((hazard) => hazard.name)
    .filter(Boolean);
}

function pickTopHazardTypes(profile: MatchProfile, limit = 2) {
  const normalized = profile.hazards
    .slice()
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
    .map((hazard) => normalizeHazardType(hazard.type, hazard.name))
    .filter(Boolean);

  return unique(normalized).slice(0, limit);
}

function buildTokenGroups(context: MatchContext, csvEnhancementEnabled = DEFAULT_CSV_ENHANCEMENT_ENABLED): TokenGroups {
  const topHazards = pickTopHazards(context.profile);
  const topHazardTypes = pickTopHazardTypes(context.profile);
  const hazardTokens = unique(topHazards.flatMap((name) => tokenize(name))).slice(0, 6);

  const csvEnhancement = csvEnhancementEnabled
    ? buildCsvEnhancementTokens({
      taskName: context.taskName,
      profile: {
        industry: context.profile.industry,
        workLocation: context.profile.workLocation,
        equipment: context.profile.equipment,
        hazards: context.profile.hazards,
      },
    })
    : {
      processTokens: [],
      equipmentTokens: [],
      industryHintTokens: [],
      processReasons: [],
      equipmentReasons: [],
    };

  const directEquipmentTokens = unique(
    context.profile.equipment.flatMap((item) => tokenize(item)),
  ).slice(0, 8);
  const expandedEquipmentTokens = mergePrioritized(directEquipmentTokens, csvEnhancement.equipmentTokens, 10);

  const directContextTokens = unique([
    ...tokenize(context.profile.industry),
    ...tokenize(context.profile.workLocation).slice(0, 4),
  ]).slice(0, 6);
  const expandedContextTokens = mergePrioritized(
    directContextTokens,
    [...csvEnhancement.processTokens, ...csvEnhancement.industryHintTokens],
    8,
  );

  return {
    topHazardTypes,
    hazardTokens,
    directEquipmentTokens,
    expandedEquipmentTokens,
    directContextTokens,
    expandedContextTokens,
  };
}

function inferCandidateHazardTypes(candidate: MatchCandidate) {
  const explicit = normalizeHazardTypeList(candidate.hazardTypes ?? []);
  const fromKeywords = normalizeHazardTypeList(candidate.keywords ?? []);
  const fromTitle = normalizeHazardType(candidate.title, candidate.title);
  const fromContent = normalizeHazardType(candidate.content, candidate.content);

  return unique([
    ...explicit,
    ...fromKeywords,
    ...(fromTitle ? [fromTitle] : []),
    ...(fromContent ? [fromContent] : []),
  ]);
}

function matchTokens(corpusTokens: Set<string>, targetTokens: string[]) {
  const corpusList = Array.from(corpusTokens);

  return targetTokens.filter((targetToken) =>
    corpusList.some((corpusToken) => {
      if (corpusToken === targetToken) {
        return true;
      }

      // Allow compact phrase-token match such as "기초파일천공" <-> "천공".
      return corpusToken.includes(targetToken) || targetToken.includes(corpusToken);
    }),
  );
}

function evaluateLawStrictAxesFromTokenGroups(
  tokenGroups: TokenGroups,
  candidate: MatchCandidate,
): LawStrictAxisEvaluation {
  const corpus = [
    candidate.title,
    candidate.content,
    candidate.location ?? "",
    candidate.lawName ?? "",
    candidate.legalBasis ?? "",
    ...(candidate.keywords ?? []),
  ].join(" ");
  const corpusTokens = new Set(tokenize(corpus));
  const candidateHazardTypes = inferCandidateHazardTypes(candidate);

  const matchedHazardTypes = tokenGroups.topHazardTypes.filter((type) => candidateHazardTypes.includes(type));
  const matchedHazardTokens = matchTokens(corpusTokens, tokenGroups.hazardTokens);
  const matchedWorkTokens = matchTokens(corpusTokens, tokenGroups.expandedContextTokens);
  const matchedEquipmentTokens = matchTokens(corpusTokens, tokenGroups.expandedEquipmentTokens);

  const accidentTypeMatched = tokenGroups.topHazardTypes.length > 0
    ? matchedHazardTypes.length > 0
    : matchedHazardTokens.length > 0;
  const hazardFactorMatched = matchedHazardTokens.length > 0;
  const workTypeMatched = matchedWorkTokens.length > 0;
  const equipmentMatched = matchedEquipmentTokens.length > 0;
  const workOrEquipmentMatched = workTypeMatched || equipmentMatched;
  const passed = accidentTypeMatched && hazardFactorMatched && workOrEquipmentMatched;

  return {
    accidentTypeMatched,
    hazardFactorMatched,
    workTypeMatched,
    equipmentMatched,
    workOrEquipmentMatched,
    matchedHazardTypes,
    matchedHazardTokens,
    matchedWorkTokens,
    matchedEquipmentTokens,
    passed,
  };
}

export function evaluateLawStrictAxes(
  context: MatchContext,
  candidate: MatchCandidate,
  csvEnhancementEnabled = DEFAULT_CSV_ENHANCEMENT_ENABLED,
) {
  const tokenGroups = buildTokenGroups(context, csvEnhancementEnabled);
  return evaluateLawStrictAxesFromTokenGroups(tokenGroups, candidate);
}

export function createLawStrictAxisEvaluator(
  context: MatchContext,
  csvEnhancementEnabled = DEFAULT_CSV_ENHANCEMENT_ENABLED,
) {
  const tokenGroups = buildTokenGroups(context, csvEnhancementEnabled);
  return (candidate: MatchCandidate) => evaluateLawStrictAxesFromTokenGroups(tokenGroups, candidate);
}

function parseDateMs(date?: string) {
  if (!date) {
    return null;
  }

  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return timestamp;
}

function recencyScore(date?: string) {
  const timestamp = parseDateMs(date);
  if (timestamp === null) {
    return 0;
  }

  const ageDays = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60 * 24));

  if (ageDays <= 180) return 6;
  if (ageDays <= 365) return 4;
  if (ageDays <= 730) return 2;
  return 1;
}

function evaluateRuleScore(
  candidate: MatchCandidate,
  tokenGroups: TokenGroups,
  hazardTypeFilter: "required" | "none",
): Omit<ScoredCandidate, "semanticScore" | "finalScore"> | null {
  const corpus = [candidate.title, candidate.content, candidate.location ?? "", ...(candidate.keywords ?? [])].join(" ");
  const corpusTokens = new Set(tokenize(corpus));
  const candidateHazardTypes = inferCandidateHazardTypes(candidate);
  const hazardTypeMatches = tokenGroups.topHazardTypes.filter((type) => candidateHazardTypes.includes(type));

  if (hazardTypeFilter === "required" && tokenGroups.topHazardTypes.length > 0 && hazardTypeMatches.length === 0) {
    return null;
  }

  const hazardMatches = matchTokens(corpusTokens, tokenGroups.hazardTokens);
  if (hazardTypeFilter === "required" && tokenGroups.topHazardTypes.length === 0 && hazardMatches.length === 0) {
    return null;
  }

  const directEquipmentMatches = matchTokens(corpusTokens, tokenGroups.directEquipmentTokens);
  const expandedEquipmentMatches = matchTokens(corpusTokens, tokenGroups.expandedEquipmentTokens);
  const directContextMatches = matchTokens(corpusTokens, tokenGroups.directContextTokens);
  const expandedContextMatches = matchTokens(corpusTokens, tokenGroups.expandedContextTokens);

  const hazardTypeScore = hazardTypeMatches.length > 0 ? 45 : 0;
  const hazardTokenScore = hazardMatches.length > 0 ? 15 : 0;
  const equipmentDirectScore = directEquipmentMatches.length > 0 ? 18 : 0;
  const equipmentExpandedScore = directEquipmentMatches.length === 0 && expandedEquipmentMatches.length > 0 ? 6 : 0;
  const contextDirectScore = directContextMatches.length > 0 ? 8 : 0;
  const contextExpandedScore = directContextMatches.length === 0 && expandedContextMatches.length > 0 ? 4 : 0;
  const freshnessScore = recencyScore(candidate.date);
  const sourceScore = candidate.location === "db" || candidate.sourceType === "storage" ? 20 : 0;
  const directMatchScore = candidate.isDirectMatch ? 30 : 0;

  const ruleScore = clamp(
    hazardTypeScore +
      hazardTokenScore +
      equipmentDirectScore +
      equipmentExpandedScore +
      contextDirectScore +
      contextExpandedScore +
      freshnessScore +
      sourceScore +
      directMatchScore,
    0,
    100,
  );

  const matchedKeywords = unique([
    ...hazardMatches,
    ...directEquipmentMatches,
    ...directContextMatches,
  ]).slice(0, 8);

  const reasonParts: string[] = [];
  if (candidate.isDirectMatch) {
    reasonParts.push(`위험요인에 직접 대응되는 핵심 안전보건 조문입니다`);
  }
  if (hazardTypeScore > 0) {
    const types = hazardTypeMatches.join(", ");
    reasonParts.push(`위험유형(${types})이 현재 작업의 위험요인과 일치합니다`);
  }
  if (hazardTokenScore > 0) {
    reasonParts.push(`위험 키워드(${hazardMatches.slice(0, 2).join(", ")})가 해당 조문에 포함되어 있습니다`);
  }
  if (equipmentDirectScore > 0) {
    reasonParts.push(`사용 장비(${directEquipmentMatches.slice(0, 2).join(", ")})가 직접 관련됩니다`);
  } else if (equipmentExpandedScore > 0) {
    reasonParts.push(`유사 장비·공정과 간접적으로 관련됩니다`);
  }
  if (contextDirectScore > 0) {
    reasonParts.push(`작업 환경(${directContextMatches.slice(0, 2).join(", ")})이 해당 법령의 적용 범위에 해당합니다`);
  } else if (contextExpandedScore > 0) {
    reasonParts.push(`업종·작업장 특성이 간접적으로 관련됩니다`);
  }
  if (sourceScore > 0) {
    reasonParts.push(`사전 구축된 법령 DB에서 확인된 조문입니다`);
  }

  const matchReason = reasonParts.length > 0
    ? `${reasonParts.join(". ")}.`
    : "일반적으로 해당 작업 유형에 적용되는 법령입니다.";

  return {
    ...candidate,
    matchedKeywords,
    ruleScore,
    matchReason,
  };
}

export function deduplicateCandidates<T extends MatchCandidate>(candidates: T[]) {
  const seen = new Set<string>();
  const deduplicated: T[] = [];

  for (const candidate of candidates) {
    const key = `${normalizeText(candidate.title)}|${candidate.date ?? ""}|${candidate.url ?? ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(candidate);
  }

  return deduplicated;
}

export function buildSearchKeywords(
  context: MatchContext,
  maxQueries = 6,
  csvEnhancementEnabled = DEFAULT_CSV_ENHANCEMENT_ENABLED,
) {
  const topHazards = pickTopHazards(context.profile);
  const primaryEquipment = context.profile.equipment.slice(0, 2);
  const taskTokens = tokenize(context.taskName).slice(0, 2);

  const csvEnhancement = csvEnhancementEnabled
    ? buildCsvEnhancementTokens({
      taskName: context.taskName,
      profile: {
        industry: context.profile.industry,
        workLocation: context.profile.workLocation,
        equipment: context.profile.equipment,
        hazards: context.profile.hazards,
      },
    })
    : {
      processTokens: [],
      equipmentTokens: [],
      industryHintTokens: [],
      processReasons: [],
      equipmentReasons: [],
    };

  const candidates = unique([
    ...topHazards.map((hazard) => `${context.profile.industry} ${hazard}`.trim()),
    ...topHazards.flatMap((hazard) => primaryEquipment.map((equipment) => `${hazard} ${equipment}`.trim())),
    ...taskTokens.flatMap((taskToken) => topHazards.map((hazard) => `${taskToken} ${hazard}`.trim())),
    `${context.profile.workLocation} ${topHazards[0] ?? ""}`.trim(),
    `${context.taskName} ${primaryEquipment[0] ?? ""}`.trim(),
    `${context.profile.industry} ${csvEnhancement.processTokens[0] ?? ""}`.trim(),
    `${context.taskName} ${csvEnhancement.equipmentTokens[0] ?? ""}`.trim(),
  ]);

  return candidates.filter(Boolean).slice(0, maxQueries);
}

function extractGeminiText(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const parts = candidates[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("\n").trim();
}

function safeJsonParse<T>(raw: string): T | null {
  if (!raw) return null;

  const cleaned = raw
    .replace(/^```json/gi, "")
    .replace(/^```/gi, "")
    .replace(/```$/gi, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

interface SemanticScoreItem {
  score: number;
  reason?: string;
}

async function requestSemanticScores(
  context: MatchContext,
  candidates: Array<Omit<ScoredCandidate, "semanticScore" | "finalScore">>,
  options: RankCandidatesOptions,
): Promise<Map<string, SemanticScoreItem> | null> {
  const geminiApiKey = options.geminiApiKey;
  if (!geminiApiKey) {
    return null;
  }

  const model = options.geminiModel ?? "gemini-3-flash-preview";
  const timeoutMs = options.semanticTimeoutMs ?? DEFAULT_SEMANTIC_TIMEOUT_MS;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

  const prompt = [
    "You are a safety evidence matching reviewer.",
    "Score direct relevance between work context and each candidate on a 0-100 scale.",
    "Return JSON only.",
    "Schema: {\"scores\":[{\"id\":\"string\",\"score\":number,\"reason\":\"string\"}]}",
    "",
    `taskName: ${context.taskName}`,
    `industry: ${context.profile.industry}`,
    `workLocation: ${context.profile.workLocation}`,
    `equipment: ${context.profile.equipment.join(", ")}`,
    `hazards: ${context.profile.hazards.map((hazard) => hazard.name).join(", ")}`,
    "",
    "candidates:",
    ...candidates.map((candidate) =>
      JSON.stringify({
        id: candidate.id,
        title: candidate.title,
        content: candidate.content.slice(0, 300),
        keywords: candidate.keywords ?? [],
        date: candidate.date ?? "",
        ruleScore: candidate.ruleScore,
      }),
    ),
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const text = extractGeminiText(data);
    const parsed = safeJsonParse<{ scores?: Array<{ id?: string; score?: number; reason?: string }> }>(text);

    if (!parsed || !Array.isArray(parsed.scores)) {
      return null;
    }

    const map = new Map<string, SemanticScoreItem>();

    for (const item of parsed.scores) {
      if (!item || typeof item.id !== "string" || typeof item.score !== "number") {
        continue;
      }
      map.set(item.id, {
        score: clamp(item.score, 0, 100),
        reason: typeof item.reason === "string" && item.reason.trim() ? item.reason.trim() : undefined,
      });
    }

    return map;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function rankCandidatesHybrid(
  context: MatchContext,
  rawCandidates: MatchCandidate[],
  options: RankCandidatesOptions = {},
): Promise<ScoredCandidate[]> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const semanticTopK = options.semanticTopK ?? DEFAULT_SEMANTIC_TOP_K;
  const semanticEnabled = options.semanticEnabled ?? true;
  const csvEnhancementEnabled = options.csvEnhancementEnabled ?? DEFAULT_CSV_ENHANCEMENT_ENABLED;
  const hazardTypeFilter = options.hazardTypeFilter ?? DEFAULT_HAZARD_TYPE_FILTER;
  const semanticWeight = clamp(options.semanticWeight ?? DEFAULT_SEMANTIC_WEIGHT, 0, 1);
  const ruleWeight = 1 - semanticWeight;

  const tokenGroups = buildTokenGroups(context, csvEnhancementEnabled);
  const deduplicated = deduplicateCandidates(rawCandidates);

  const ruled = deduplicated
    .map((candidate) => evaluateRuleScore(candidate, tokenGroups, hazardTypeFilter))
    .filter((candidate): candidate is Omit<ScoredCandidate, "semanticScore" | "finalScore"> => Boolean(candidate))
    .sort((left, right) => right.ruleScore - left.ruleScore);

  let semanticScores: Map<string, SemanticScoreItem> | null = null;
  if (semanticEnabled && ruled.length > 0) {
    semanticScores = await requestSemanticScores(context, ruled.slice(0, semanticTopK), options);
  }

  const ranked = ruled
    .map((candidate) => {
      const semanticDetail = semanticScores?.get(candidate.id);
      const semanticScore = semanticDetail?.score;
      const finalScore = semanticScore === undefined
        ? candidate.ruleScore
        : Math.round((candidate.ruleScore * ruleWeight + semanticScore * semanticWeight) * 10) / 10;

      return {
        ...candidate,
        semanticScore,
        semanticReason: semanticDetail?.reason,
        finalScore,
      } satisfies ScoredCandidate;
    })
    .filter((candidate) => candidate.finalScore >= threshold)
    .sort((left, right) => {
      if (right.finalScore !== left.finalScore) {
        return right.finalScore - left.finalScore;
      }
      if (right.ruleScore !== left.ruleScore) {
        return right.ruleScore - left.ruleScore;
      }

      const leftDate = parseDateMs(left.date) ?? 0;
      const rightDate = parseDateMs(right.date) ?? 0;
      return rightDate - leftDate;
    })
    .slice(0, maxResults);

  return ranked;
}
