import { sanitizeText } from "./http.ts";

export interface NarrativeHazard {
  name: string;
  type?: string;
  weight?: number;
}

export interface NarrativeProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: NarrativeHazard[];
}

export interface NarrativeLawInput {
  id: string;
  title: string;
  legalBasis?: string;
  articleNumber?: string;
  articleTitle?: string;
  clausePreview?: string;
  summaryBullets?: string[];
  applicationPoints?: string[];
}

export interface NarrativeActionInput {
  id: string;
  stage: "immediate" | "same_day" | "pre_resume" | "improvement";
  actionText: string;
  articleNumbers: string[];
  articleTitle?: string;
  legalBasis?: string;
  lawName?: string;
  legalRequirement?: string;
  clausePreview?: string;
}

export interface NarrativeEvidenceFields {
  applicabilityReason?: string;
  keyExcerpt?: string;
  summaryArticle?: string;
}

export interface NarrativeActionFields extends NarrativeEvidenceFields {
  actionNeedReason?: string;
}

export interface GeneratedNarratives {
  evidenceById: Record<string, NarrativeEvidenceFields>;
  actionById: Record<string, NarrativeActionFields>;
  source: "ai" | "fallback";
  model?: string;
}

interface LawNarrativeBatchResponse {
  evidenceNarratives?: Array<{
    id?: unknown;
    applicabilityReason?: unknown;
    keyExcerpt?: unknown;
    summaryArticle?: unknown;
  }>;
  actionNarratives?: Array<{
    id?: unknown;
    actionNeedReason?: unknown;
    applicabilityReason?: unknown;
    keyExcerpt?: unknown;
    summaryArticle?: unknown;
  }>;
}

interface GenerateLawNarrativesInput {
  taskName: string;
  taskDescription?: string;
  analysisScenario?: string;
  profile: NarrativeProfile;
  lawItems: NarrativeLawInput[];
  actionItems: NarrativeActionInput[];
  geminiApiKey?: string;
  geminiModel?: string;
  timeoutMs?: number;
}

interface EvidenceContextAnchors {
  scenarioOrHazard: string[];
  priorityAction: string[];
}

type Stage = NarrativeActionInput["stage"];
type EvidenceRow = NonNullable<LawNarrativeBatchResponse["evidenceNarratives"]>[number];
type ActionRow = NonNullable<LawNarrativeBatchResponse["actionNarratives"]>[number];

const MAX_ACTION_NEED_REASON = 340;
const MAX_APPLICABILITY_REASON = 260;
const MAX_KEY_EXCERPT = 220;
const MAX_SUMMARY_ARTICLE = 260;
const MAX_TOKEN_COUNT = 32;

const ELLIPSIS_PATTERN = /(?:\.\.\.|…|⋯)$/;
const ARTICLE_PATTERN = /제?\s*\d+\s*조(?:의?\s*\d+)?/g;
const LIST_PATTERN = /(?:^|\s)(?:\d+\.\s*|[가-힣A-Za-z]\.\s*|[①-⑳]\s*)/g;
const LEGAL_STYLE_PATTERN = /(?:다음\s*각\s*호|각\s*호|하여야\s*한다|해야\s*한다|아니\s*된다|규정한다)/g;
const AWKWARD_ENDING_PATTERN = /(및|등|여부|또는|으로|하여|하고|같은|수 있는|등의|등을|등으로)$/;

const GENERIC_CONTEXT_STOPWORDS = new Set([
  "작업",
  "상황",
  "현장",
  "법령",
  "조문",
  "기준",
  "적용",
  "위험",
  "조치",
  "확인",
  "차단",
  "이행",
  "관리",
  "필요",
  "의무",
  "금지",
  "수행",
  "요구",
  "관련",
  "현재",
  "즉시",
  "당일",
  "재개",
  "개선",
  "완료",
  "단계",
]);

const REASON_DIVERSITY_STOPWORDS = new Set([
  ...GENERIC_CONTEXT_STOPWORDS,
  "해야",
  "합니다",
  "하도록",
  "위해",
  "있다",
  "있는",
  "기준",
  "의무",
]);

const STAGE_META: Record<Stage, { label: string; goal: string; priority: string; risk: string; hint: string[] }> = {
  immediate: {
    label: "즉시",
    goal: "사고 확산을 즉시 차단해야 하는 단계",
    priority: "작업 중지와 위험원 차단을 먼저 완료해야 합니다",
    risk: "위험원을 즉시 차단하지 않으면 인명피해와 설비 피해가 빠르게 확대될 수 있습니다",
    hint: ["즉시", "차단", "중지", "확산"],
  },
  same_day: {
    label: "당일",
    goal: "당일 내 잔류 위험을 정리해야 하는 단계",
    priority: "당일 점검과 보완 조치를 완료해야 합니다",
    risk: "당일 점검을 미루면 같은 작업 구간에서 2차 사고가 발생할 수 있습니다",
    hint: ["당일", "완료", "점검", "보완"],
  },
  pre_resume: {
    label: "재개 전",
    goal: "작업 재개 허용 조건을 확인해야 하는 단계",
    priority: "재개 승인 전에 허용 조건과 확인 기록을 검증해야 합니다",
    risk: "재개 조건 확인 없이 작업을 시작하면 동일 위험이 즉시 재현될 수 있습니다",
    hint: ["재개", "허용", "승인", "조건", "확인"],
  },
  improvement: {
    label: "재발 방지",
    goal: "재발 원인을 구조적으로 제거해야 하는 단계",
    priority: "절차 개선과 교육, 설비 보완을 계획대로 이행해야 합니다",
    risk: "개선을 미루면 동일 원인이 반복되어 유사 사고가 재발할 수 있습니다",
    hint: ["재발", "개선", "교육", "보완", "절차"],
  },
};

function normalizeSentence(text: string, _maxLength?: number) {
  const normalized = sanitizeText(text).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized;
}

function normalizeShort(text: string, maxChars = 120) {
  const normalized = normalizeSentence(text);
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, maxChars).replace(/[,\s]+$/, "");
}

function pickScenario(taskName: string, taskDescription?: string, analysisScenario?: string) {
  const scenario = normalizeSentence(analysisScenario ?? "", 260);
  if (scenario) {
    return scenario;
  }

  const description = normalizeSentence(taskDescription ?? "", 220);
  if (description) {
    return description;
  }

  const task = normalizeSentence(taskName, 80);
  return task ? `${task} 작업 중 발생 가능한 사고 상황` : "현재 작업 중 발생 가능한 사고 상황";
}

function pickHazardText(profile: NarrativeProfile) {
  const hazards = (profile.hazards ?? [])
    .slice()
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
    .map((hazard) => normalizeSentence(hazard.name, 40))
    .filter(Boolean)
    .slice(0, 2);

  return hazards.join(" 및 ") || "중대 위험요인";
}

function pickEquipmentText(profile: NarrativeProfile) {
  return (profile.equipment ?? [])
    .map((item) => normalizeSentence(item, 30))
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
}

function ensurePeriod(text: string) {
  if (!text) return "";
  if (/[.!?。]$/.test(text)) {
    return text;
  }
  return `${text}.`;
}

function stripTerminalPunctuation(text?: string) {
  return normalizeSentence(text ?? "").replace(/[.!?。]+$/g, "").trim();
}

function hasAwkwardEnding(text?: string) {
  const bare = stripTerminalPunctuation(text);
  if (!bare) {
    return true;
  }

  if (/[,:;]$/.test(bare)) {
    return true;
  }

  return AWKWARD_ENDING_PATTERN.test(bare);
}

function isCompleteSentence(text?: string) {
  const normalized = normalizeSentence(text ?? "");
  if (!normalized) {
    return false;
  }
  if (ELLIPSIS_PATTERN.test(normalized)) {
    return false;
  }
  if (!/[.!?。]$/.test(normalized)) {
    return false;
  }
  return !hasAwkwardEnding(normalized);
}

function toCompletedSentence(text: string, fallback: string, maxLength: number) {
  const primary = normalizeSentence(text, maxLength);
  if (primary && !hasAwkwardEnding(primary)) {
    return ensurePeriod(primary);
  }

  const fallbackText = normalizeSentence(fallback, maxLength);
  if (!fallbackText) {
    return "";
  }
  return ensurePeriod(stripTerminalPunctuation(fallbackText));
}

function normalizeArticleKey(raw?: string) {
  return normalizeSentence(raw ?? "").replace(/\s+/g, "");
}

function buildLawRef(item: { legalBasis?: string; lawName?: string; title?: string; articleNumber?: string }) {
  const legalBasis = normalizeSentence(item.legalBasis ?? "", 120);
  if (legalBasis) {
    return legalBasis;
  }

  const joined = normalizeSentence([item.lawName, item.title, item.articleNumber].filter(Boolean).join(" "), 120);
  return joined || "해당 조문";
}

function buildArticleLabel(item: { articleNumber?: string; articleTitle?: string }) {
  const article = normalizeSentence(item.articleNumber ?? "", 30);
  const articleTitle = normalizeSentence(item.articleTitle ?? "", 40);
  if (article && articleTitle) {
    return `${article}(${articleTitle})`;
  }
  return article || articleTitle || "해당 조문";
}

function pickLawPointText(item: NarrativeLawInput) {
  const fromPoints = (item.applicationPoints ?? [])
    .map((point) => normalizeShort(point, 32))
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
  if (fromPoints) {
    return fromPoints;
  }

  const fromPreview = normalizeShort(item.clausePreview ?? "", 60);
  if (fromPreview) {
    return fromPreview;
  }

  const fromSummary = (item.summaryBullets ?? [])
    .map((point) => normalizeShort(point, 28))
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
  if (fromSummary) {
    return fromSummary;
  }

  return "위험원 차단과 작업 조건 확인";
}

function stagePhrase(stage: Stage) {
  return `${STAGE_META[stage].label} 단계`;
}

function ensureStageMention(stage: Stage, text?: string) {
  const normalized = normalizeSentence(text ?? "");
  if (!normalized) {
    return "";
  }

  const phrase = stagePhrase(stage);
  if (normalized.includes(phrase)) {
    return normalized;
  }

  const bare = stripTerminalPunctuation(normalized);
  if (!bare) {
    return phrase;
  }

  return `${phrase}에서 ${bare}`;
}

function buildFallbackEvidenceNarrative(
  context: { scenario: string; hazardText: string; equipmentText: string },
  item: NarrativeLawInput,
): NarrativeEvidenceFields {
  const lawRef = buildLawRef(item);
  const articleLabel = buildArticleLabel(item);
  const pointText = pickLawPointText(item);
  const equipmentClause = context.equipmentText || "현재 장비";

  const keyExcerpt = toCompletedSentence(
    "",
    `${lawRef}은 ${pointText} 조치를 통해 ${context.hazardText} 위험 구간에서 금지·요구·확인 기준을 명확히 하여 통제 전 작업 지속을 막도록 요구합니다`,
    MAX_KEY_EXCERPT,
  );

  const applicabilityReason = toCompletedSentence(
    "",
    `${context.scenario} 사고는 ${context.hazardText} 위험이 ${equipmentClause} 작업 방식과 결합된 상황이므로 ${lawRef}의 통제 기준이 현장 원인 분석과 직접 연결됩니다`,
    MAX_APPLICABILITY_REASON,
  );

  const summaryArticle = toCompletedSentence(
    "",
    `${articleLabel} 현장 점검은 위험구역 통제 확인, 보호조치 정상 상태 확인, 기준 이탈 시 즉시 중지·보고 순서로 실행해야 합니다`,
    MAX_SUMMARY_ARTICLE,
  );

  return {
    applicabilityReason,
    keyExcerpt,
    summaryArticle,
  };
}

function buildFallbackActionNarrativeByStage(
  context: { scenario: string; hazardText: string },
  item: NarrativeActionInput,
  relatedEvidence?: NarrativeEvidenceFields,
): NarrativeActionFields {
  const lawRef = buildLawRef(item);
  const legalRequirement = normalizeShort(
    item.legalRequirement || item.clausePreview || relatedEvidence?.keyExcerpt || "법령상 안전 의무 이행",
    150,
  );
  const actionText = normalizeShort(item.actionText, 120) || "필수 안전조치 이행";
  const meta = STAGE_META[item.stage];
  const phrase = stagePhrase(item.stage);
  const relatedHint = normalizeShort(relatedEvidence?.applicabilityReason ?? "", 70);

  const fallbackActionNeedReason =
    `${phrase}에서는 ${context.scenario} 사고와 연결된 ${context.hazardText} 위험을 확산 전에 차단해야 하므로 ${lawRef}의 ${legalRequirement} 기준에 따라 ${actionText} 조치를 우선 완료해야 합니다. ${meta.risk}`;

  const fallbackApplicability =
    `${phrase}에서 ${lawRef}은 ${meta.goal}에 필요한 최소 통제 기준을 규정하며, ${context.scenario} 사고 원인과 작업방식을 기준으로 ${actionText} 조치의 필요 근거를 명확히 제공합니다${relatedHint ? `(${relatedHint})` : ""}`;

  const fallbackKeyExcerpt =
    `${phrase} 기준으로 ${lawRef}은 ${legalRequirement} 이행을 요구하고, 통제 확인 전 장비 운전 및 동일 작업 지속을 금지하도록 명시합니다`;

  const fallbackSummary =
    `${phrase} 현장 점검은 ${actionText} 실행 확인, ${legalRequirement} 준수 확인, 기준 이탈 시 즉시 중지·보완·재확인 순서로 관리해야 합니다`;

  return {
    actionNeedReason: toCompletedSentence("", ensureStageMention(item.stage, fallbackActionNeedReason), MAX_ACTION_NEED_REASON),
    applicabilityReason: toCompletedSentence(
      "",
      ensureStageMention(item.stage, fallbackApplicability),
      MAX_APPLICABILITY_REASON,
    ),
    keyExcerpt: toCompletedSentence("", ensureStageMention(item.stage, fallbackKeyExcerpt), MAX_KEY_EXCERPT),
    summaryArticle: toCompletedSentence("", ensureStageMention(item.stage, fallbackSummary), MAX_SUMMARY_ARTICLE),
  };
}

export function buildFallbackNarratives(
  input: Pick<
    GenerateLawNarrativesInput,
    "taskName" | "taskDescription" | "analysisScenario" | "profile" | "lawItems" | "actionItems"
  >,
): GeneratedNarratives {
  const scenario = pickScenario(input.taskName, input.taskDescription, input.analysisScenario);
  const hazardText = pickHazardText(input.profile);
  const equipmentText = pickEquipmentText(input.profile);

  const evidenceById = Object.fromEntries(
    (input.lawItems ?? []).map((item) => [item.id, buildFallbackEvidenceNarrative({ scenario, hazardText, equipmentText }, item)]),
  );

  const evidenceByArticle = new Map<string, NarrativeEvidenceFields>();
  for (const lawItem of input.lawItems ?? []) {
    const key = normalizeArticleKey(lawItem.articleNumber);
    if (key && evidenceById[lawItem.id]) {
      evidenceByArticle.set(key, evidenceById[lawItem.id]);
    }
  }

  const actionById = Object.fromEntries(
    (input.actionItems ?? []).map((item) => {
      const matchedEvidence = (item.articleNumbers ?? [])
        .map((article) => evidenceByArticle.get(normalizeArticleKey(article)))
        .find(Boolean);

      return [item.id, buildFallbackActionNarrativeByStage({ scenario, hazardText }, item, matchedEvidence)];
    }),
  );

  return {
    evidenceById,
    actionById,
    source: "fallback",
  };
}

function stripCodeFence(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, "").replace(/\s*```$/, "").trim();
}

function extractFirstJsonObject(raw: string) {
  const start = raw.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function parseNarrativeResponse(raw: string): LawNarrativeBatchResponse | null {
  const stripped = stripCodeFence(raw);
  const candidate = extractFirstJsonObject(stripped) ?? stripped;

  try {
    const parsed = JSON.parse(candidate) as LawNarrativeBatchResponse;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown[] }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";

  const content = candidates[0] as {
    content?: {
      parts?: Array<{ text?: string }>;
    };
  };

  const parts = content.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("\n");
}

function buildPrompt(input: GenerateLawNarrativesInput) {
  const scenario = pickScenario(input.taskName, input.taskDescription, input.analysisScenario);
  const hazardText = pickHazardText(input.profile);
  const equipmentText = pickEquipmentText(input.profile);

  const laws = input.lawItems.map((item) => ({
    id: item.id,
    lawRef: buildLawRef(item),
    articleNumber: item.articleNumber ?? "",
    articleTitle: item.articleTitle ?? "",
    clausePreview: item.clausePreview ?? "",
    applicationPoints: item.applicationPoints ?? [],
  }));

  const actions = input.actionItems.map((item) => ({
    id: item.id,
    stage: item.stage,
    actionText: item.actionText,
    lawRef: buildLawRef(item),
    articleNumbers: item.articleNumbers ?? [],
    legalRequirement: item.legalRequirement ?? item.clausePreview ?? "",
  }));

  return [
    "너는 산업안전 조치용 내러티브 작성기다. 반드시 JSON만 출력한다.",
    "",
    "[출력 스키마]",
    "{",
    '  "evidenceNarratives": [',
    '    { "id": "string", "applicabilityReason": "string", "keyExcerpt": "string", "summaryArticle": "string" }',
    "  ],",
    '  "actionNarratives": [',
    '    { "id": "string", "actionNeedReason": "string", "applicabilityReason": "string", "keyExcerpt": "string", "summaryArticle": "string" }',
    "  ]",
    "}",
    "",
    "[품질 규칙]",
    "- 모든 필드는 완결된 한 문장으로 작성하고 문장 끝은 마침표로 끝낸다.",
    "- 다음 어미로 끝내지 않는다: 및, 등, 여부, 또는, 으로, 하여, 하고, 같은, 수 있는.",
    "- 조문마다 조문명/핵심 요구사항/사고 맥락을 반영해 문장을 차별화한다.",
    "- 서로 다른 조문에서 keyExcerpt/applicabilityReason/summaryArticle를 동일 문장으로 재사용하지 않는다.",
    "- 핵심 의미(keyExcerpt): 조문이 현장에서 금지·요구·확인하도록 하는 통제 기준을 설명한다.",
    "- 적용 배경(applicabilityReason): 사고 원인·작업방식·위험요인과 조문의 연결 이유를 설명한다.",
    "- 현장 기준 요약(summaryArticle): 현장에서 바로 점검 가능한 확인 항목과 실행 순서를 짧게 정리한다.",
    "- evidenceNarratives의 세 필드는 서로 다른 역할 문장으로 작성하고, 같은 표현을 반복하지 않는다.",
    "- actionNeedReason은 단계 목적(즉시/당일/재개 전/재발 방지)과 액션 문구를 모두 포함한다.",
    "- actionNarratives의 applicabilityReason/keyExcerpt/summaryArticle는 모두 단계명을 명시한다(예: 즉시 단계, 당일 단계, 재개 전 단계, 재발 방지 단계).",
    "- actionNarratives의 세 필드도 서로 다른 역할로 작성하며, 동일 어휘 반복을 피한다.",
    "- keyExcerpt에 법조문 원문 나열(각 호/숫자 목록)을 복사하지 않는다.",
    "",
    "[사고 맥락]",
    `- taskName: ${input.taskName}`,
    `- scenario: ${scenario}`,
    `- hazard: ${hazardText}`,
    `- equipment: ${equipmentText || "해당 장비"}`,
    "",
    "[법령 항목]",
    JSON.stringify(laws, null, 2),
    "",
    "[조치 항목]",
    JSON.stringify(actions, null, 2),
  ].join("\n");
}

function normalizeCompareText(text?: string) {
  return normalizeSentence(text ?? "")
    .toLowerCase()
    .replace(ARTICLE_PATTERN, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeContextAnchors(text: string) {
  return normalizeCompareText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !GENERIC_CONTEXT_STOPWORDS.has(token))
    .slice(0, MAX_TOKEN_COUNT);
}

function dedupeAnchors(tokens: string[]) {
  return [...new Set(tokens)].slice(0, MAX_TOKEN_COUNT);
}

function hasAnyContextAnchor(joinedText: string, anchors: string[]) {
  const normalized = normalizeCompareText(joinedText);
  if (!normalized) return false;
  return anchors.some((anchor) => normalized.includes(anchor));
}

function buildEvidenceContextAnchors(input: GenerateLawNarrativesInput) {
  const scenario = pickScenario(input.taskName, input.taskDescription, input.analysisScenario);
  const hazardText = pickHazardText(input.profile);

  const actionByArticle = new Map<string, string[]>();
  for (const action of input.actionItems ?? []) {
    const tokens = [
      normalizeSentence(action.actionText),
      normalizeSentence(action.legalRequirement ?? ""),
      normalizeSentence(action.clausePreview ?? ""),
    ].filter(Boolean);

    for (const article of action.articleNumbers ?? []) {
      const key = normalizeArticleKey(article);
      if (!key) continue;
      actionByArticle.set(key, [...(actionByArticle.get(key) ?? []), ...tokens]);
    }
  }

  const byLawId: Record<string, EvidenceContextAnchors> = {};
  for (const lawItem of input.lawItems ?? []) {
    const articleKey = normalizeArticleKey(lawItem.articleNumber);
    const lawSpecific = [
      normalizeSentence(lawItem.clausePreview ?? ""),
      ...(lawItem.applicationPoints ?? []).map((point) => normalizeSentence(point)),
    ].filter(Boolean);

    byLawId[lawItem.id] = {
      scenarioOrHazard: dedupeAnchors(tokenizeContextAnchors(`${scenario} ${hazardText}`)),
      priorityAction: dedupeAnchors(
        tokenizeContextAnchors([
          ...lawSpecific,
          ...(articleKey ? (actionByArticle.get(articleKey) ?? []) : []),
        ].join(" ")),
      ),
    };
  }

  return byLawId;
}

function countMatches(text: string, pattern: RegExp) {
  return (text.match(pattern) ?? []).length;
}

function hasMechanicalReason(text?: string) {
  const normalized = normalizeSentence(text ?? "");
  if (!normalized) return true;
  if (normalized.length < 18) return true;
  if (ELLIPSIS_PATTERN.test(normalized)) return true;
  if (/위험요인\s*\d+점/.test(normalized)) return true;
  if (/장비\/작업어/.test(normalized)) return true;
  return false;
}

function isRawLawStyle(text?: string) {
  const normalized = normalizeSentence(text ?? "");
  if (!normalized) return true;
  if (countMatches(normalized, LIST_PATTERN) >= 2) return true;
  if (countMatches(normalized, LEGAL_STYLE_PATTERN) >= 2 && normalized.length < 140) return true;
  return false;
}

function hasEvidencePillars(content: NarrativeEvidenceFields) {
  const applicabilityReason = content.applicabilityReason?.trim() ?? "";
  const keyExcerpt = content.keyExcerpt?.trim() ?? "";
  const summaryArticle = content.summaryArticle?.trim() ?? "";
  return Boolean(applicabilityReason && keyExcerpt && summaryArticle);
}

function hasIncompleteNarrativeField(content: NarrativeEvidenceFields) {
  const fields = [
    content.applicabilityReason,
    content.keyExcerpt,
    content.summaryArticle,
  ];
  return fields.some((field) => !isCompleteSentence(field));
}

function normalizeNarrativeBundle(content: NarrativeEvidenceFields) {
  return normalizeCompareText(
    `${content.applicabilityReason ?? ""} ${content.keyExcerpt ?? ""} ${content.summaryArticle ?? ""}`,
  );
}

function tokenizeReasonForDiversity(text?: string) {
  return normalizeCompareText(text ?? "")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !REASON_DIVERSITY_STOPWORDS.has(token))
    .slice(0, MAX_TOKEN_COUNT);
}

function reasonTokenSimilarity(left: string[], right: string[]) {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  const intersection = left.filter((token) => rightSet.has(token)).length;
  const union = new Set([...left, ...right]).size;
  if (!union) return 0;
  return intersection / union;
}

function isNearDuplicateReason(left?: string, right?: string) {
  const leftTokens = tokenizeReasonForDiversity(left);
  const rightTokens = tokenizeReasonForDiversity(right);
  if (leftTokens.length < 3 || rightTokens.length < 3) {
    return false;
  }
  return reasonTokenSimilarity(leftTokens, rightTokens) >= 0.82;
}

function hasNearDuplicateNarrativeFields(content: NarrativeEvidenceFields) {
  const applicabilityReason = content.applicabilityReason ?? "";
  const keyExcerpt = content.keyExcerpt ?? "";
  const summaryArticle = content.summaryArticle ?? "";

  return isNearDuplicateReason(applicabilityReason, keyExcerpt)
    || isNearDuplicateReason(applicabilityReason, summaryArticle)
    || isNearDuplicateReason(keyExcerpt, summaryArticle);
}

function hasEvidenceRoleAlignment(content: NarrativeEvidenceFields) {
  const applicabilityReason = normalizeSentence(content.applicabilityReason ?? "");
  const keyExcerpt = normalizeSentence(content.keyExcerpt ?? "");
  const summaryArticle = normalizeSentence(content.summaryArticle ?? "");

  if (!applicabilityReason || !keyExcerpt || !summaryArticle) {
    return false;
  }

  const hasBackground = /(사고|원인|작업|상황|위험|요인|맥락|연결)/.test(applicabilityReason);
  const hasControl = /(금지|요구|의무|확인|통제|차단|설치|유지|중지)/.test(keyExcerpt);
  const hasChecklist = /(점검|확인|기록|절차|순서|승인|보완|중지|보고)/.test(summaryArticle);
  return hasBackground && hasControl && hasChecklist;
}

function isLowQualityEvidenceNarrative(
  content: NarrativeEvidenceFields,
  fallback: NarrativeEvidenceFields,
  anchors: EvidenceContextAnchors,
) {
  if (!hasEvidencePillars(content)) {
    return true;
  }

  if (hasIncompleteNarrativeField(content)) {
    return true;
  }

  if (isRawLawStyle(content.keyExcerpt) || isRawLawStyle(content.summaryArticle)) {
    return true;
  }

  if (hasMechanicalReason(content.applicabilityReason)) {
    return true;
  }

  if (!hasEvidenceRoleAlignment(content)) {
    return true;
  }

  const joined = normalizeNarrativeBundle(content);
  if (!joined) {
    return true;
  }

  const hasContext = hasAnyContextAnchor(joined, anchors.scenarioOrHazard)
    || hasAnyContextAnchor(joined, anchors.priorityAction);
  if (!hasContext) {
    return true;
  }

  if (hasNearDuplicateNarrativeFields(content)) {
    return true;
  }

  if (isNearDuplicateReason(joined, normalizeNarrativeBundle(fallback))) {
    return false;
  }

  return false;
}

function coerceEvidenceRowMap(rows: EvidenceRow[] | undefined) {
  const byId = new Map<string, EvidenceRow>();
  for (const row of rows ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    byId.set(id, row);
  }
  return byId;
}

function coerceActionRowMap(rows: ActionRow[] | undefined) {
  const byId = new Map<string, ActionRow>();
  for (const row of rows ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    byId.set(id, row);
  }
  return byId;
}

function enforceEvidenceNarrativeQuality(
  input: GenerateLawNarrativesInput,
  aiRows: EvidenceRow[] | undefined,
  fallbackById: Record<string, NarrativeEvidenceFields>,
) {
  const aiById = coerceEvidenceRowMap(aiRows);
  const anchorsByLawId = buildEvidenceContextAnchors(input);

  const byId: Record<string, NarrativeEvidenceFields> = {};
  const seenBundleByArticle = new Map<string, string>();

  for (const lawItem of input.lawItems ?? []) {
    const fallback = fallbackById[lawItem.id] ?? buildFallbackEvidenceNarrative({
      scenario: pickScenario(input.taskName, input.taskDescription, input.analysisScenario),
      hazardText: pickHazardText(input.profile),
      equipmentText: pickEquipmentText(input.profile),
    }, lawItem);

    const row = aiById.get(lawItem.id);
    const candidate: NarrativeEvidenceFields = {
      applicabilityReason: toCompletedSentence(
        typeof row?.applicabilityReason === "string" ? row.applicabilityReason : "",
        fallback.applicabilityReason ?? "",
        MAX_APPLICABILITY_REASON,
      ),
      keyExcerpt: toCompletedSentence(
        typeof row?.keyExcerpt === "string" ? row.keyExcerpt : "",
        fallback.keyExcerpt ?? "",
        MAX_KEY_EXCERPT,
      ),
      summaryArticle: toCompletedSentence(
        typeof row?.summaryArticle === "string" ? row.summaryArticle : "",
        fallback.summaryArticle ?? "",
        MAX_SUMMARY_ARTICLE,
      ),
    };

    const anchors = anchorsByLawId[lawItem.id] ?? { scenarioOrHazard: [], priorityAction: [] };
    let finalized = candidate;
    if (isLowQualityEvidenceNarrative(candidate, fallback, anchors)) {
      finalized = fallback;
    }

    const articleKey = normalizeArticleKey(lawItem.articleNumber || lawItem.legalBasis || lawItem.title);
    const joined = normalizeNarrativeBundle(finalized);
    let shouldFallbackForDuplicate = false;
    for (const [seenArticleKey, seenBundle] of seenBundleByArticle.entries()) {
      if (seenArticleKey !== articleKey && isNearDuplicateReason(joined, seenBundle)) {
        shouldFallbackForDuplicate = true;
        break;
      }
    }
    if (shouldFallbackForDuplicate) {
      finalized = fallback;
    }

    const stable = {
      applicabilityReason: ensurePeriod(finalized.applicabilityReason?.trim() ?? fallback.applicabilityReason ?? ""),
      keyExcerpt: ensurePeriod(finalized.keyExcerpt?.trim() ?? fallback.keyExcerpt ?? ""),
      summaryArticle: ensurePeriod(finalized.summaryArticle?.trim() ?? fallback.summaryArticle ?? ""),
    };

    byId[lawItem.id] = stable;
    seenBundleByArticle.set(articleKey, normalizeNarrativeBundle(stable));
  }

  return byId;
}

function hasActionAnchor(item: NarrativeActionInput, text?: string) {
  const target = normalizeCompareText(text ?? "");
  if (!target) return false;

  const anchors = dedupeAnchors(
    tokenizeContextAnchors([
      item.actionText,
      item.legalRequirement ?? "",
      item.clausePreview ?? "",
      ...(item.articleNumbers ?? []),
    ].join(" ")),
  );

  if (anchors.length === 0) {
    return true;
  }

  return anchors.some((anchor) => target.includes(anchor));
}

function isStageReasonAligned(stage: Stage, text?: string) {
  const normalized = normalizeSentence(text ?? "");
  if (!normalized) return false;

  return STAGE_META[stage].hint.some((keyword) => normalized.includes(keyword));
}

function hasExplicitStagePhrase(stage: Stage, text?: string) {
  const normalized = normalizeSentence(text ?? "");
  if (!normalized) return false;
  return normalized.includes(stagePhrase(stage));
}

function isLowQualityActionNarrative(
  item: NarrativeActionInput,
  content: NarrativeActionFields,
  fallback: NarrativeActionFields,
  scenarioHazardAnchors: string[],
) {
  if (!content.actionNeedReason || !content.applicabilityReason || !content.keyExcerpt || !content.summaryArticle) {
    return true;
  }

  if (
    !isCompleteSentence(content.actionNeedReason)
    || !isCompleteSentence(content.applicabilityReason)
    || !isCompleteSentence(content.keyExcerpt)
    || !isCompleteSentence(content.summaryArticle)
  ) {
    return true;
  }

  if (
    isRawLawStyle(content.applicabilityReason)
    || isRawLawStyle(content.keyExcerpt)
    || isRawLawStyle(content.summaryArticle)
  ) {
    return true;
  }

  if (
    hasMechanicalReason(content.actionNeedReason)
    || hasMechanicalReason(content.applicabilityReason)
  ) {
    return true;
  }

  if (
    !hasExplicitStagePhrase(item.stage, content.actionNeedReason)
    || !hasExplicitStagePhrase(item.stage, content.applicabilityReason)
    || !hasExplicitStagePhrase(item.stage, content.keyExcerpt)
    || !hasExplicitStagePhrase(item.stage, content.summaryArticle)
  ) {
    return true;
  }

  if (
    !isStageReasonAligned(item.stage, content.actionNeedReason)
    || !isStageReasonAligned(item.stage, content.applicabilityReason)
    || !isStageReasonAligned(item.stage, content.keyExcerpt)
    || !isStageReasonAligned(item.stage, content.summaryArticle)
  ) {
    return true;
  }

  if (
    !hasActionAnchor(item, content.actionNeedReason)
    || !hasActionAnchor(item, content.applicabilityReason)
    || !hasActionAnchor(item, content.keyExcerpt)
    || !hasActionAnchor(item, content.summaryArticle)
  ) {
    return true;
  }

  const joined = normalizeNarrativeBundle(content);
  if (!joined) {
    return true;
  }

  if (!hasAnyContextAnchor(joined, scenarioHazardAnchors)) {
    return true;
  }

  if (!hasEvidenceRoleAlignment(content) || hasNearDuplicateNarrativeFields(content)) {
    return true;
  }

  if (isNearDuplicateReason(joined, normalizeNarrativeBundle(fallback))) {
    return false;
  }

  return false;
}

function enforceActionNarrativeQuality(
  input: GenerateLawNarrativesInput,
  aiRows: ActionRow[] | undefined,
  fallbackById: Record<string, NarrativeActionFields>,
) {
  const aiById = coerceActionRowMap(aiRows);
  const byId: Record<string, NarrativeActionFields> = {};
  const priorReasons: Array<{ id: string; stage: Stage; reason: string }> = [];
  const priorBundles: Array<{ id: string; bundle: string }> = [];
  const scenarioHazardAnchors = dedupeAnchors(
    tokenizeContextAnchors(`${pickScenario(input.taskName, input.taskDescription, input.analysisScenario)} ${pickHazardText(input.profile)}`),
  );

  for (const actionItem of input.actionItems ?? []) {
    const fallback = fallbackById[actionItem.id] ?? buildFallbackActionNarrativeByStage(
      { scenario: pickScenario(input.taskName, input.taskDescription, input.analysisScenario), hazardText: pickHazardText(input.profile) },
      actionItem,
    );
    const row = aiById.get(actionItem.id);

    const aiActionNeed = typeof row?.actionNeedReason === "string" ? row.actionNeedReason : "";
    let actionNeedReason = toCompletedSentence(aiActionNeed, fallback.actionNeedReason ?? "", MAX_ACTION_NEED_REASON);
    actionNeedReason = ensurePeriod(ensureStageMention(actionItem.stage, actionNeedReason));

    if (
      hasMechanicalReason(actionNeedReason)
      || !isCompleteSentence(actionNeedReason)
      || !hasActionAnchor(actionItem, actionNeedReason)
      || !isStageReasonAligned(actionItem.stage, actionNeedReason)
    ) {
      actionNeedReason = fallback.actionNeedReason ?? actionNeedReason;
    }

    for (const prior of priorReasons) {
      if (prior.id !== actionItem.id && isNearDuplicateReason(prior.reason, actionNeedReason)) {
        actionNeedReason = fallback.actionNeedReason ?? actionNeedReason;
        break;
      }
    }

    const applicabilityReason = toCompletedSentence(
      typeof row?.applicabilityReason === "string" ? row.applicabilityReason : "",
      fallback.applicabilityReason ?? "",
      MAX_APPLICABILITY_REASON,
    );

    const keyExcerpt = toCompletedSentence(
      typeof row?.keyExcerpt === "string" ? row.keyExcerpt : "",
      fallback.keyExcerpt ?? "",
      MAX_KEY_EXCERPT,
    );

    let summaryArticle = toCompletedSentence(
      typeof row?.summaryArticle === "string" ? row.summaryArticle : "",
      fallback.summaryArticle ?? "",
      MAX_SUMMARY_ARTICLE,
    );

    const candidate: NarrativeActionFields = {
      actionNeedReason: ensurePeriod(ensureStageMention(actionItem.stage, actionNeedReason)),
      applicabilityReason: ensurePeriod(ensureStageMention(actionItem.stage, applicabilityReason)),
      keyExcerpt: ensurePeriod(ensureStageMention(actionItem.stage, keyExcerpt)),
      summaryArticle: ensurePeriod(ensureStageMention(actionItem.stage, summaryArticle)),
    };

    let finalized = candidate;
    if (isLowQualityActionNarrative(actionItem, candidate, fallback, scenarioHazardAnchors)) {
      finalized = fallback;
    }

    const finalizedBundle = normalizeNarrativeBundle(finalized);
    for (const prior of priorBundles) {
      if (prior.id !== actionItem.id && isNearDuplicateReason(prior.bundle, finalizedBundle)) {
        finalized = fallback;
        break;
      }
    }

    byId[actionItem.id] = finalized;
    priorReasons.push({ id: actionItem.id, stage: actionItem.stage, reason: finalized.actionNeedReason ?? "" });
    priorBundles.push({ id: actionItem.id, bundle: normalizeNarrativeBundle(finalized) });
  }

  return byId;
}

export async function generateLawNarratives(input: GenerateLawNarrativesInput): Promise<GeneratedNarratives> {
  const fallback = buildFallbackNarratives(input);
  const apiKey = normalizeSentence(input.geminiApiKey ?? "");
  if (!apiKey) {
    return fallback;
  }

  if ((input.lawItems?.length ?? 0) === 0 && (input.actionItems?.length ?? 0) === 0) {
    return fallback;
  }

  const model = normalizeSentence(input.geminiModel ?? "") || "gemini-2.0-flash";
  const timeoutMs = Number.isFinite(input.timeoutMs) ? Math.max(2000, input.timeoutMs as number) : 9000;
  const prompt = buildPrompt(input);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = await response.json();
    const text = extractGeminiText(payload);
    if (!text) {
      return fallback;
    }

    const parsed = parseNarrativeResponse(text);
    if (!parsed) {
      return fallback;
    }

    const evidenceById = enforceEvidenceNarrativeQuality(input, parsed.evidenceNarratives, fallback.evidenceById);
    const actionById = enforceActionNarrativeQuality(input, parsed.actionNarratives, fallback.actionById);

    return {
      evidenceById,
      actionById,
      source: "ai",
      model,
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
