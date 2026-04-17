import { sanitizeText } from "./http.ts";
import {
  buildIncidentAnchorSet,
  evaluateIncidentLawAnchorGate,
  type IncidentAnchorContextInput,
  type IncidentAnchorSet,
} from "./incident-anchor-normalizer.ts";
import type { LawActionItem, LawActionStage, LawFitStatus } from "./law-actions.ts";

interface LawFitValidationProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: Array<{ name: string; type?: string; weight?: number }>;
}

interface ValidateLawFitInput {
  taskName: string;
  taskDescription?: string;
  analysisScenario?: string;
  profile: LawFitValidationProfile;
  actionItems: LawActionItem[];
  geminiApiKey?: string;
  geminiModel?: string;
  timeoutMs?: number;
}

interface LawFitAiRow {
  id?: unknown;
  status?: unknown;
  score?: unknown;
  reason?: unknown;
}

interface LawFitAiResponse {
  results?: LawFitAiRow[];
}

export interface LawFitValidationResult {
  status: LawFitStatus;
  reason: string;
  score: number;
  lawFitGateFailureCode?: "INCIDENT_ANCHOR_MISMATCH";
}

const MAX_REASON_LENGTH = 220;
const SCORE_MIN = 0;
const SCORE_MAX = 100;
const INCIDENT_ANCHOR_MISMATCH = "INCIDENT_ANCHOR_MISMATCH" as const;

const STOPWORDS = new Set([
  "work",
  "action",
  "law",
  "article",
  "safety",
  "site",
  "compliance",
  "작업",
  "조치",
  "법령",
  "현장",
  "확인",
  "관리",
]);

function normalizeSpace(text?: string) {
  return sanitizeText(text ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCompare(text?: string) {
  return normalizeSpace(text).toLowerCase();
}

function withPeriod(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return SCORE_MIN;
  }
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(value)));
}

function tokenize(text?: string) {
  return normalizeCompare(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function hasAnyAnchor(text: string, anchors: string[]) {
  if (!anchors.length) {
    return false;
  }
  return anchors.some((anchor) => text.includes(anchor));
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function stageAligned(stage: LawActionStage, text: string) {
  if (!text) {
    return false;
  }

  const normalized = normalizeCompare(text);
  if (stage === "immediate") {
    return containsAny(normalized, ["immediate", "urgent", "right away", "즉시", "긴급", "초기"])
      && containsAny(normalized, ["stop", "block", "isolate", "cut", "shutdown", "차단", "통제", "중지", "격리"]);
  }
  if (stage === "same_day") {
    return containsAny(normalized, ["same day", "same-day", "today", "당일", "금일"])
      && containsAny(normalized, ["check", "inspect", "verify", "record", "log", "확인", "점검", "기록", "보완"]);
  }
  if (stage === "pre_resume") {
    return containsAny(normalized, ["before resume", "before restart", "pre-resume", "재개 전", "작업 전"])
      && containsAny(normalized, ["condition", "verify", "confirm", "inspection", "test", "확인", "점검", "검증"]);
  }
  return containsAny(normalized, ["improve", "improvement", "training", "education", "management", "개선", "교육", "보완", "관리"]);
}

function summarizeGateMatches(
  gateResult: ReturnType<typeof evaluateIncidentLawAnchorGate>,
) {
  const matched = [
    ...gateResult.matched.accident_type,
    ...gateResult.matched.hazard_factor,
    ...gateResult.matched.work_action,
    ...gateResult.matched.equipment,
    ...gateResult.matched.place,
  ];
  if (matched.length === 0) {
    return "";
  }
  return matched
    .slice(0, 3)
    .map((token) => token.replace(/^[^:]+:/, ""))
    .join(", ");
}

function toIncidentAnchorContext(input: ValidateLawFitInput): IncidentAnchorContextInput {
  return {
    taskName: input.taskName,
    taskDescription: input.taskDescription,
    analysisScenario: input.analysisScenario,
    profile: input.profile,
  };
}

function fallbackForAction(
  item: LawActionItem,
  incidentContext: IncidentAnchorContextInput,
  incidentAnchors: IncidentAnchorSet,
): LawFitValidationResult {
  const article = normalizeSpace(item.articleNumbers?.[0]);
  const actionText = normalizeSpace(item.actionText);
  const requirementText = normalizeSpace(item.legalRequirement ?? item.clausePreview);
  const narrativeText = normalizeSpace(`${item.actionNeedReason ?? ""} ${item.applicabilityReason ?? ""}`);
  const joined = normalizeCompare(`${actionText} ${requirementText} ${narrativeText}`);

  if (!article) {
    return {
      status: "unknown",
      score: 0,
      reason: "조문 번호가 없어 법령 적합성 자동 검증을 확정할 수 없습니다.",
    };
  }

  const actionAnchors = dedupe([...tokenize(actionText), ...tokenize(requirementText)]).slice(0, 8);
  const requirementAnchors = dedupe(tokenize(requirementText)).slice(0, 6);
  const gateResult = evaluateIncidentLawAnchorGate(
    incidentContext,
    item,
    incidentAnchors,
  );

  const hasStageAlignment = stageAligned(item.stage, joined);
  const hasActionAnchor = hasAnyAnchor(joined, actionAnchors);
  const hasRequirementLink = requirementAnchors.length > 0
    ? hasAnyAnchor(normalizeCompare(actionText), requirementAnchors)
    : hasActionAnchor;
  const hasIncidentHazardMatch = gateResult.hasAccidentHazardMatch;
  const hasOperationalMatch = gateResult.hasOperationalMatch;
  const incidentHasAccidentHazardAnchors = gateResult.incidentAnchors.accident_type.size > 0
    || gateResult.incidentAnchors.hazard_factor.size > 0;
  const incidentHasOperationalAnchors = gateResult.incidentAnchors.work_action.size > 0
    || gateResult.incidentAnchors.equipment.size > 0
    || gateResult.incidentAnchors.place.size > 0;
  const requireIncidentHazardMatch = incidentHasAccidentHazardAnchors;
  const requireOperationalMatch = incidentHasOperationalAnchors;
  const hasLawName = Boolean(normalizeSpace(item.lawName ?? item.legalBasis));

  let score = 20;
  if (hasStageAlignment) score += 25;
  if (hasActionAnchor) score += 20;
  if (hasRequirementLink) score += 20;
  if (hasIncidentHazardMatch) score += 10;
  if (hasOperationalMatch) score += 10;
  if (hasLawName) score += 5;
  const clamped = clampScore(score);
  const gateFailed = (requireIncidentHazardMatch && !hasIncidentHazardMatch)
    || (requireOperationalMatch && !hasOperationalMatch);

  if (gateFailed) {
    const gateGaps: string[] = [];
    if (requireIncidentHazardMatch && !hasIncidentHazardMatch) gateGaps.push("incident-hazard anchor mismatch");
    if (requireOperationalMatch && !hasOperationalMatch) gateGaps.push("work-action/equipment/place anchor mismatch");
    const matched = summarizeGateMatches(gateResult);

    return {
      status: "review_required",
      score: Math.min(clamped, 54),
      reason: withPeriod(
        `${article} failed the incident-law anchor gate. Missing: ${gateGaps.join(", ")}${matched ? ` (matched anchors: ${matched})` : ""}`,
      ),
      lawFitGateFailureCode: INCIDENT_ANCHOR_MISMATCH,
    };
  }

  if (clamped >= 65) {
    return {
      status: "verified",
      score: clamped,
      reason: withPeriod(`${article} requirement and ${item.stage} stage action are aligned`),
    };
  }

  const gaps: string[] = [];
  if (!hasStageAlignment) gaps.push("stage alignment");
  if (!hasActionAnchor) gaps.push("action anchor");
  if (!hasRequirementLink) gaps.push("legal requirement link");
  if (requireIncidentHazardMatch && !hasIncidentHazardMatch) gaps.push("incident-hazard link");
  if (requireOperationalMatch && !hasOperationalMatch) gaps.push("work-action/equipment/place link");

  return {
    status: "review_required",
    score: clamped,
    reason: withPeriod(
      `${article} auto-check score is ${clamped}. Manual review required. Missing: ${gaps.join(", ") || "add clear legal rationale"}`,
    ),
  };
}

function buildFallbackResults(input: ValidateLawFitInput) {
  const byId: Record<string, LawFitValidationResult> = {};
  const incidentContext = toIncidentAnchorContext(input);
  const incidentAnchors = buildIncidentAnchorSet(incidentContext);
  for (const item of input.actionItems) {
    byId[item.id] = fallbackForAction(item, incidentContext, incidentAnchors);
  }
  return byId;
}

function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }

  const parts = candidates[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("\n").trim();
}

function stripCodeFence(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractFirstObject(text: string) {
  const raw = stripCodeFence(text);
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
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseAiResponse(text: string): LawFitAiResponse | null {
  const candidates = [stripCodeFence(text), extractFirstObject(text)].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as LawFitAiResponse;
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function normalizeStatus(status: unknown): LawFitStatus | null {
  if (typeof status !== "string") {
    return null;
  }
  const normalized = status.trim().toLowerCase();
  if (normalized === "verified") return "verified";
  if (normalized === "review_required") return "review_required";
  if (normalized === "unknown") return "unknown";
  return null;
}

function normalizeReason(reason: unknown) {
  if (typeof reason !== "string") {
    return "";
  }
  const normalized = normalizeSpace(reason).slice(0, MAX_REASON_LENGTH);
  return withPeriod(normalized);
}

function normalizeScore(score: unknown) {
  if (typeof score === "number") {
    return clampScore(score);
  }
  if (typeof score === "string" && score.trim()) {
    return clampScore(Number.parseFloat(score));
  }
  return 0;
}

function buildPrompt(input: ValidateLawFitInput) {
  const scenario = normalizeSpace(input.analysisScenario)
    || normalizeSpace(input.taskDescription)
    || normalizeSpace(input.taskName);
  const hazardText = (input.profile.hazards ?? [])
    .slice()
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
    .slice(0, 3)
    .map((hazard) => normalizeSpace(`${hazard.name} ${hazard.type ?? ""}`))
    .filter(Boolean)
    .join(", ");

  const actions = input.actionItems.map((item) => ({
    id: item.id,
    stage: item.stage,
    actionText: normalizeSpace(item.actionText),
    articleNumber: normalizeSpace(item.articleNumbers?.[0]),
    articleTitle: normalizeSpace(item.articleTitle),
    lawName: normalizeSpace(item.lawName),
    legalBasis: normalizeSpace(item.legalBasis),
    legalRequirement: normalizeSpace(item.legalRequirement),
    clausePreview: normalizeSpace(item.clausePreview),
    actionNeedReason: normalizeSpace(item.actionNeedReason),
    applicabilityReason: normalizeSpace(item.applicabilityReason),
  }));

  return [
    "당신은 산업안전보건 법령-조치 적합성 검증기입니다.",
    "반드시 JSON 객체 하나만 반환하세요.",
    "출력 스키마:",
    "{",
    '  "results": [',
    '    { "id": "string", "status": "verified|review_required|unknown", "score": 0-100, "reason": "string" }',
    "  ]",
    "}",
    "",
    "검증 규칙:",
    "- 단계 목적 정합성(immediate/same_day/pre_resume/improvement)을 확인합니다.",
    "- actionText와 legalRequirement(또는 clausePreview)의 연결성을 확인합니다.",
    "- 사고 시나리오 및 위험요인과의 연결성을 확인합니다.",
    "- 근거가 부족하면 review_required 또는 unknown을 반환합니다.",
    "- reason은 1~2문장으로 작성하고, 구체적 결함 또는 적합 근거를 포함합니다.",
    "",
    `taskName: ${normalizeSpace(input.taskName)}`,
    `analysisScenario: ${scenario || "정보 없음"}`,
    `hazards: ${hazardText || "정보 없음"}`,
    `actions: ${JSON.stringify(actions)}`,
  ].join("\n");
}

function mergeWithFallback(
  fallback: Record<string, LawFitValidationResult>,
  parsed: LawFitAiResponse | null,
) {
  if (!parsed || !Array.isArray(parsed.results)) {
    return fallback;
  }

  const next = { ...fallback };
  for (const row of parsed.results) {
    if (!row || typeof row.id !== "string" || !next[row.id]) {
      continue;
    }
    const fallbackResult = fallback[row.id];

    if (fallbackResult.lawFitGateFailureCode === INCIDENT_ANCHOR_MISMATCH) {
      continue;
    }

    const status = normalizeStatus(row.status);
    const score = normalizeScore(row.score);
    const reason = normalizeReason(row.reason);
    if (!status || !reason) {
      continue;
    }

    // 점수가 너무 낮으면 verified로 승격하지 않음
    if (status === "verified" && score < 55) {
      continue;
    }

    // fallback이 이미 판정한 경우 unknown으로 덮어쓰지 않음
    if (status === "unknown" && fallbackResult.status !== "unknown") {
      continue;
    }

    next[row.id] = { status, score, reason };
  }

  return next;
}

export async function validateLawFitForActions(
  input: ValidateLawFitInput,
): Promise<Record<string, LawFitValidationResult>> {
  if (!Array.isArray(input.actionItems) || input.actionItems.length === 0) {
    return {};
  }

  const fallback = buildFallbackResults(input);
  const geminiApiKey = normalizeSpace(input.geminiApiKey);
  if (!geminiApiKey) {
    return fallback;
  }

  const model = normalizeSpace(input.geminiModel) || "gemini-3.1-pro-preview";
  const timeoutMs = Number.isFinite(input.timeoutMs) ? Math.max(2000, Math.trunc(input.timeoutMs ?? 9000)) : 9000;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
  const prompt = buildPrompt(input);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = await response.json();
    const parsed = parseAiResponse(extractGeminiText(payload));
    return mergeWithFallback(fallback, parsed);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}
