import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { normalizeHazardType, resolveLegalContextHazardType } from "../_shared/hazard-taxonomy.ts";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText } from "../_shared/http.ts";
import {
  getRiskControlIntentSearchTerms,
  isRiskControlIntent,
  resolveRiskControlIntent,
  type RiskControlIntent,
} from "../_shared/risk-control-intent.ts";
import {
  isEvidenceExcerptFromOriginal,
  selectDeterministicLegalReview,
  type DeterministicLegalReviewInput,
  type RiskLegalCandidateSource,
  type RiskLegalReviewCandidateOption,
} from "../_shared/risk-legal-review-policy.ts";

type FitStatus = "verified" | "review_required" | "unknown";

type LegalBasisFitRequestRow = DeterministicLegalReviewInput;

interface LegalBasisFitRequest {
  mode?: "analyze_context" | "review_candidates";
  taskName: string;
  contextText?: string;
  rows: unknown[];
}

interface LegalContextRequestRow {
  rowIndex: number;
  workProcess: string;
  category: string;
  cause: string;
  hazardFactor: string;
  controlIntent: RiskControlIntent;
}

interface LegalContextAnalysisRow {
  rowIndex?: unknown;
  hazardType?: unknown;
  accidentMechanism?: unknown;
  unsafeCondition?: unknown;
  controlIntent?: unknown;
  equipment?: unknown;
  searchTerms?: unknown;
}

interface LegalContextAnalysisResponse {
  analyses?: LegalContextAnalysisRow[];
}

interface LegalBasisFitResultRow {
  rowIndex: number;
  recommendedLegalBasis: string;
  status: FitStatus;
  score: number;
  reason: string;
  evidenceExcerpt?: string;
  applicabilityReason?: string;
  reviewSource: "gemini" | "deterministic_fallback";
  fallbackReason?: "missing_secret" | "upstream_error" | "timeout" | "request_error" | "invalid_response";
}

interface AiResultRow {
  rowIndex?: unknown;
  recommendedLegalBasis?: unknown;
  status?: unknown;
  score?: unknown;
  reason?: unknown;
  evidenceExcerpt?: unknown;
  applicabilityReason?: unknown;
}

interface AiResponseShape {
  results?: AiResultRow[];
}

const STRICT_LEGAL_BASIS_PATTERN = /^산업안전보건기준에 관한 규칙 제\d+조\([^)]+\)$/;
const MAX_ROWS = 20;
const MAX_CANDIDATES_PER_ROW = 5;
const CONTEXT_ANALYSIS_TIMEOUT_MS = 18000;
const REVIEW_TIMEOUT_MS = 20000;
const SCORE_MIN = 0;
const SCORE_MAX = 100;
const CONTEXT_TEXT_LIMIT = 240;
const ORIGINAL_TEXT_LIMIT = 3000;
const EVIDENCE_EXCERPT_LIMIT = 600;
const CONTEXT_ANALYSIS_VERSION = "phase2-control-intent-2026-06-19";

const STOPWORDS = new Set([
  "작업",
  "위험",
  "요인",
  "상태",
  "점검",
  "관리",
  "조치",
  "기준",
  "현장",
  "설비",
  "관련",
  "법적",
  "근거",
]);

function normalizeSpace(value?: string | null) {
  return sanitizeText(value ?? "").replace(/\s+/g, " ").trim();
}

function isStrictLegalBasis(value: string) {
  return STRICT_LEGAL_BASIS_PATTERN.test(normalizeSpace(value));
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(value)));
}

function withPeriod(value: string) {
  const normalized = normalizeSpace(value);
  if (!normalized) {
    return "";
  }
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function dedupe(values: string[]) {
  return [...new Set(values.map((value) => normalizeSpace(value)).filter(Boolean))];
}

function normalizeStringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupe(
    value
      .map((item) => normalizeSpace(typeof item === "string" ? item : ""))
      .filter(Boolean),
  ).slice(0, limit);
}

function normalizeContextRows(rows: unknown): LegalContextRequestRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row): LegalContextRequestRow | null => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const source = row as Partial<LegalContextRequestRow>;
      const rowIndex = Number.isFinite(source.rowIndex) ? Math.trunc(Number(source.rowIndex)) : -1;
      const cause = normalizeSpace(source.cause);
      const hazardFactor = normalizeSpace(source.hazardFactor);
      if (rowIndex < 0 || (!cause && !hazardFactor)) {
        return null;
      }

      return {
        rowIndex,
        workProcess: normalizeSpace(source.workProcess),
        category: normalizeSpace(source.category),
        cause,
        hazardFactor,
        controlIntent: isRiskControlIntent(source.controlIntent)
          ? source.controlIntent
          : resolveRiskControlIntent(`${cause} ${hazardFactor}`, normalizeSpace(source.category)),
      };
    })
    .filter((row): row is LegalContextRequestRow => Boolean(row))
    .slice(0, MAX_ROWS);
}

function buildContextAnalysisPrompt(taskName: string, contextText: string, rows: LegalContextRequestRow[]) {
  return [
    "당신은 산업안전 위험상황을 법령 검색 의도로 변환하는 분석기입니다.",
    "단순 단어 추출이 아니라 각 행의 원인과 유해위험요인이 만드는 사고 메커니즘을 해석하세요.",
    "법령 조문을 직접 생성하지 말고, 법령 원문 검색에 사용할 의미 기반 검색 의도만 반환하세요.",
    "출력은 JSON 객체 하나만 반환하세요.",
    "출력 스키마:",
    "{",
    '  "analyses": [',
    '    { "rowIndex": 0, "hazardType": "추락", "accidentMechanism": "사고 발생 경로", "unsafeCondition": "통제 실패 상태", "controlIntent": "equipment_guard", "equipment": ["설비"], "searchTerms": ["법령 검색 구문"] }',
    "  ]",
    "}",
    "규칙:",
    "- 입력 행마다 정확히 1개 결과 반환",
    "- hazardType은 추락, 붕괴, 질식, 감전, 끼임/말림, 절단, 폭발/화재, 낙하물/비래, 차량/이동장비 충돌, 화학노출, 소음/분진/반복작업 중 선택",
    "- controlIntent는 access_control, supervision, traffic_operation, operating_procedure, equipment_guard, energy_isolation, inspection_maintenance, ventilation_detection, ppe, structural_support, emergency_response, general_control 중 선택",
    "- searchTerms는 장비·행위·통제실패·사고유형을 결합한 3~8개 구문",
    "- 원인과 유해위험요인에 없는 사실은 추가하지 않음",
    `taskName: ${taskName}`,
    `contextText: ${contextText || "정보 없음"}`,
    `rows: ${JSON.stringify(rows)}`,
  ].join("\n");
}

function normalizeContextAnalyses(
  parsed: LegalContextAnalysisResponse | null,
  rows: LegalContextRequestRow[],
) {
  if (!parsed || !Array.isArray(parsed.analyses)) {
    return [];
  }

  const allowedIndexes = new Set(rows.map((row) => row.rowIndex));
  const normalized = new Map<number, {
    rowIndex: number;
    hazardType: string;
    accidentMechanism: string;
    unsafeCondition: string;
    controlIntent: RiskControlIntent;
    equipment: string[];
    searchTerms: string[];
  }>();

  for (const item of parsed.analyses) {
    const rowIndex = typeof item.rowIndex === "number" ? Math.trunc(item.rowIndex) : -1;
    if (!allowedIndexes.has(rowIndex) || normalized.has(rowIndex)) {
      continue;
    }

    const accidentMechanism = normalizeSpace(
      typeof item.accidentMechanism === "string" ? item.accidentMechanism : "",
    ).slice(0, CONTEXT_TEXT_LIMIT);
    const unsafeCondition = normalizeSpace(
      typeof item.unsafeCondition === "string" ? item.unsafeCondition : "",
    ).slice(0, CONTEXT_TEXT_LIMIT);
    const sourceRow = rows.find((row) => row.rowIndex === rowIndex);
    const rawHazardType = normalizeSpace(typeof item.hazardType === "string" ? item.hazardType : "");
    const sourceText = sourceRow
      ? `${sourceRow.workProcess} ${sourceRow.cause} ${sourceRow.hazardFactor}`
      : "";
    const resolvedHazardType = resolveLegalContextHazardType(
      sourceText,
      rawHazardType,
      `${accidentMechanism} ${unsafeCondition}`,
    );
    const hasVehicleSourceSignals = /(지게차|차량|이동장비|운반기계|구내운반차)/.test(sourceText)
      && /(충돌|접촉|후진|주행|운반|이송|유도자|신호수)/.test(sourceText);
    const hazardType = hasVehicleSourceSignals ? "차량/이동장비 충돌" : resolvedHazardType;
    const controlIntent = isRiskControlIntent(item.controlIntent)
      ? item.controlIntent
      : (sourceRow?.controlIntent || resolveRiskControlIntent(`${accidentMechanism} ${unsafeCondition}`, hazardType));
    const searchTerms = normalizeStringList(item.searchTerms, 8);
    if (!hazardType || !accidentMechanism || searchTerms.length === 0) {
      continue;
    }

    normalized.set(rowIndex, {
      rowIndex,
      hazardType,
      accidentMechanism,
      unsafeCondition,
      controlIntent,
      equipment: normalizeStringList(item.equipment, 6),
      searchTerms,
    });
  }

  return [...normalized.values()].sort((left, right) => left.rowIndex - right.rowIndex);
}

function buildLocalContextFallback(rows: LegalContextRequestRow[]) {
  const results: Array<{
    rowIndex: number;
    hazardType: string;
    accidentMechanism: string;
    unsafeCondition: string;
    controlIntent: RiskControlIntent;
    equipment: string[];
    searchTerms: string[];
  }> = [];

  for (const row of rows) {
    const combinedText = `${row.cause} ${row.hazardFactor} ${row.category} ${row.workProcess}`;
    const hazardType = resolveLegalContextHazardType(combinedText, "", combinedText)
      || normalizeHazardType(row.hazardFactor, combinedText);
    if (!hazardType) {
      continue;
    }

    const tokens = dedupe(
      combinedText
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !STOPWORDS.has(token)),
    );
    const searchTerms = dedupe([
      ...getRiskControlIntentSearchTerms(row.controlIntent),
      ...tokens,
    ]).slice(0, 8);

    results.push({
      rowIndex: row.rowIndex,
      hazardType,
      accidentMechanism: normalizeSpace(row.cause).slice(0, CONTEXT_TEXT_LIMIT) || hazardType,
      unsafeCondition: normalizeSpace(row.hazardFactor).slice(0, CONTEXT_TEXT_LIMIT),
      controlIntent: row.controlIntent,
      equipment: dedupe(
        normalizeSpace(row.workProcess)
          .split(/\s+/)
          .filter((token) => token.length >= 2 && !STOPWORDS.has(token)),
      ).slice(0, 6),
      searchTerms,
    });
  }

  return results.sort((left, right) => left.rowIndex - right.rowIndex);
}

function buildFallback(rows: LegalBasisFitRequestRow[]) {
  const map = new Map<number, LegalBasisFitResultRow>();
  for (const row of rows) {
    map.set(row.rowIndex, selectDeterministicLegalReview(row));
  }
  return map;
}

type FallbackReason = NonNullable<LegalBasisFitResultRow["fallbackReason"]>;

function buildFallbackPayload(
  fallbackMap: Map<number, LegalBasisFitResultRow>,
  fallbackReason: FallbackReason,
) {
  return {
    reviewSource: "deterministic_fallback" as const,
    fallbackReason,
    results: [...fallbackMap.values()].map((result) => ({ ...result, fallbackReason })),
  };
}

function stripCodeFence(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractFirstJsonObject(text: string) {
  const raw = stripCodeFence(text);
  const start = raw.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];
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
        return raw.slice(start, i + 1);
      }
    }
  }
  return null;
}

function parseAiResponse<T extends object = AiResponseShape>(text: string): T | null {
  const candidates = [stripCodeFence(text), extractFirstJsonObject(text)].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as T;
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }
  const parts = candidates[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("\n").trim();
}

function normalizeStatus(value: unknown): FitStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "verified") return "verified";
  if (normalized === "review_required") return "review_required";
  if (normalized === "unknown") return "unknown";
  return null;
}

function normalizeScore(value: unknown) {
  if (typeof value === "number") {
    return clampScore(value);
  }
  if (typeof value === "string" && value.trim()) {
    return clampScore(Number.parseFloat(value));
  }
  return 0;
}

function buildPrompt(taskName: string, contextText: string, rows: LegalBasisFitRequestRow[]) {
  const compactRows = rows.map((row) => ({
    rowIndex: row.rowIndex,
    workProcess: normalizeSpace(row.workProcess),
    category: normalizeSpace(row.category),
    cause: normalizeSpace(row.cause),
    hazardFactor: normalizeSpace(row.hazardFactor),
    controlIntent: row.controlIntent,
    selectedLegalBasis: normalizeSpace(row.selectedLegalBasis),
    candidateLegalBases: row.candidateLegalBases,
    candidateEvidence: row.candidateOptions.map((candidate) => ({
      legalBasis: candidate.legalBasis,
      articleNumber: candidate.articleNumber,
      articleTitle: candidate.articleTitle,
      clausePreview: candidate.clausePreview,
      originalText: candidate.originalText,
      sourceType: candidate.sourceType,
    })),
  }));

  return [
    "당신은 위험성평가표 법적기준 적합성 검토기입니다.",
    "출력은 반드시 JSON 객체 하나만 반환하세요.",
    "출력 스키마:",
    "{",
    '  "results": [',
    '    { "rowIndex": 0, "recommendedLegalBasis": "산업안전보건기준에 관한 규칙 제N조(조문명)", "status": "verified|review_required|unknown", "score": 0-100, "reason": "string", "evidenceExcerpt": "선택 조문 원문의 직접 인용", "applicabilityReason": "원문 적용 조건과 행 위험의 연결 설명" }',
    "  ]",
    "}",
    "",
    "판정 기준:",
    "- 각 행의 원인/유해위험요인에 가장 적합한 후보를 candidateEvidence에서 1개 선택",
    "- verified는 originalText에서 직접 인용한 evidenceExcerpt가 있고 적용 대상·장비·위험·의무가 행과 일치할 때만 허용",
    "- evidenceExcerpt는 originalText에 실제로 존재하는 연속 문구를 그대로 복사",
    "- 조문 제목만 맞고 원문의 적용 조건이 다르면 review_required로 판정",
    "- controlIntent가 다른 행은 후보가 존재하는 한 서로 다른 조문을 선택",
    "- 동일 조문 중복은 고유 후보가 없는 경우에만 허용하고 reason에 후보 부족을 명시",
    "- 후보 외의 법적기준은 절대 생성 금지",
    "- 근거가 약하면 review_required 또는 unknown으로 판정",
    "- reason은 1~2문장, 한국어",
    "",
    `taskName: ${taskName || "정보 없음"}`,
    `contextText: ${contextText || "정보 없음"}`,
    `rows: ${JSON.stringify(compactRows)}`,
  ].join("\n");
}

function mergeAiResults(
  fallbackMap: Map<number, LegalBasisFitResultRow>,
  rowsByIndex: Map<number, LegalBasisFitRequestRow>,
  parsed: AiResponseShape | null,
) {
  if (!parsed || !Array.isArray(parsed.results)) {
    return fallbackMap;
  }

  const merged = new Map(fallbackMap);
  for (const row of parsed.results) {
    if (!row || typeof row.rowIndex !== "number") {
      continue;
    }

    const rowIndex = Math.trunc(row.rowIndex);
    const input = rowsByIndex.get(rowIndex);
    const fallback = fallbackMap.get(rowIndex);
    if (!input || !fallback) {
      continue;
    }

    const recommendation = normalizeSpace(
      typeof row.recommendedLegalBasis === "string" ? row.recommendedLegalBasis : "",
    );
    if (!recommendation || !input.candidateLegalBases.includes(recommendation) || !isStrictLegalBasis(recommendation)) {
      continue;
    }

    const status = normalizeStatus(row.status);
    const score = normalizeScore(row.score);
    const reason = withPeriod(normalizeSpace(typeof row.reason === "string" ? row.reason : "").slice(0, 220));
    const evidenceExcerpt = normalizeSpace(
      typeof row.evidenceExcerpt === "string" ? row.evidenceExcerpt : "",
    ).slice(0, EVIDENCE_EXCERPT_LIMIT);
    const applicabilityReason = withPeriod(
      normalizeSpace(typeof row.applicabilityReason === "string" ? row.applicabilityReason : "").slice(0, 320),
    );
    if (!status || !reason) {
      continue;
    }

    if (status === "verified" && score < 55) {
      continue;
    }
    if (status === "unknown" && fallback.status !== "unknown") {
      continue;
    }

    const selectedCandidate = input.candidateOptions.find((candidate) => candidate.legalBasis === recommendation);
    const evidenceVerified = isEvidenceExcerptFromOriginal(
      evidenceExcerpt,
      selectedCandidate?.originalText,
    );
    const resolvedStatus = status === "verified" && !evidenceVerified
      ? "review_required"
      : status;
    const resolvedScore = resolvedStatus === "review_required" && status === "verified"
      ? Math.min(score, 45)
      : score;
    const resolvedReason = status === "verified" && !evidenceVerified
      ? "선택 조문의 원문 인용을 검증하지 못해 수동 확인이 필요합니다."
      : reason;

    merged.set(rowIndex, {
      rowIndex,
      recommendedLegalBasis: recommendation,
      status: resolvedStatus,
      score: resolvedScore,
      reason: resolvedReason,
      ...(evidenceVerified ? { evidenceExcerpt } : {}),
      ...(applicabilityReason ? { applicabilityReason } : {}),
      reviewSource: "gemini",
    });
  }

  return merged;
}

function normalizeRows(rows: unknown) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row): LegalBasisFitRequestRow | null => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const source = row as Partial<LegalBasisFitRequestRow>;
      const rowIndex = Number.isFinite(source.rowIndex) ? Math.trunc(Number(source.rowIndex)) : -1;
      if (rowIndex < 0) {
        return null;
      }

      const candidateLegalBases = dedupe(
        Array.isArray(source.candidateLegalBases) ? source.candidateLegalBases.map((item) => normalizeSpace(String(item))) : [],
      )
        .filter(isStrictLegalBasis)
        .slice(0, MAX_CANDIDATES_PER_ROW);
      const candidateOptions = (Array.isArray(source.candidateOptions) ? source.candidateOptions : [])
        .flatMap((candidate): RiskLegalReviewCandidateOption[] => {
          if (!candidate || typeof candidate !== "object") {
            return [];
          }
          const raw = candidate as Partial<RiskLegalReviewCandidateOption>;
          const legalBasis = normalizeSpace(raw.legalBasis);
          const sourceType = normalizeSpace(raw.sourceType) as RiskLegalCandidateSource;
          if (
            !isStrictLegalBasis(legalBasis)
            || !["storage", "db", "api", "action", "fallback"].includes(sourceType)
          ) {
            return [];
          }
          const rankingScore = typeof raw.rankingScore === "number" && Number.isFinite(raw.rankingScore)
            ? Math.max(0, Math.round(raw.rankingScore))
            : 0;
          return [{
            legalBasis,
            articleNumber: normalizeSpace(raw.articleNumber),
            articleTitle: normalizeSpace(raw.articleTitle),
            clausePreview: normalizeSpace(raw.clausePreview).slice(0, 600),
            originalText: normalizeSpace(raw.originalText).slice(0, ORIGINAL_TEXT_LIMIT),
            rankingScore,
            sourceType,
          }];
        })
        .slice(0, MAX_CANDIDATES_PER_ROW);

      const selectedLegalBasis = normalizeSpace(source.selectedLegalBasis);
      if (selectedLegalBasis && isStrictLegalBasis(selectedLegalBasis) && !candidateLegalBases.includes(selectedLegalBasis)) {
        candidateLegalBases.unshift(selectedLegalBasis);
      }

      if (candidateLegalBases.length === 0) {
        return null;
      }

      return {
        rowIndex,
        workProcess: normalizeSpace(source.workProcess),
        category: normalizeSpace(source.category),
        cause: normalizeSpace(source.cause),
        hazardFactor: normalizeSpace(source.hazardFactor),
        ...(isRiskControlIntent(source.controlIntent) ? { controlIntent: source.controlIntent } : {}),
        selectedLegalBasis,
        candidateLegalBases: candidateLegalBases.slice(0, MAX_CANDIDATES_PER_ROW),
        candidateOptions,
      };
    })
    .filter((row): row is LegalBasisFitRequestRow => Boolean(row))
    .slice(0, MAX_ROWS);
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST is supported.");
  }

  const body = await parseJsonBody<LegalBasisFitRequest>(req);
  if (!body) {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const taskName = normalizeSpace(body.taskName);
  const contextText = normalizeSpace(body.contextText);
  const geminiApiKey = normalizeSpace(Deno.env.get("GEMINI_API_KEY"));
  const model = normalizeSpace(Deno.env.get("GEMINI_MODEL")) || "gemini-3.1-pro-preview";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

  if (body.mode === "analyze_context") {
    const contextRows = normalizeContextRows(body.rows);
    if (!taskName || contextRows.length === 0) {
      return errorResponse(400, "VALIDATION_ERROR", "taskName and analyzable rows are required.");
    }
    if (!geminiApiKey) {
      const fallback = buildLocalContextFallback(contextRows);
      if (fallback.length > 0) {
        return jsonResponse({ analyses: fallback, analysisVersion: CONTEXT_ANALYSIS_VERSION }, 200, { "x-risk-guard-source": "risk-legal-context-local-fallback" });
      }
      return errorResponse(503, "MISSING_SECRET", "GEMINI_API_KEY is required for semantic legal context analysis.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONTEXT_ANALYSIS_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildContextAnalysisPrompt(taskName, contextText, contextRows) }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const fallback = buildLocalContextFallback(contextRows);
        if (fallback.length > 0) {
          return jsonResponse({ analyses: fallback, analysisVersion: CONTEXT_ANALYSIS_VERSION }, 200, { "x-risk-guard-source": "risk-legal-context-local-fallback" });
        }
        return errorResponse(502, "GEMINI_CONTEXT_ANALYSIS_FAILED", `Gemini returned ${response.status}.`);
      }

      const payload = await response.json();
      const parsed = parseAiResponse<LegalContextAnalysisResponse>(extractGeminiText(payload));
      const analyses = normalizeContextAnalyses(parsed, contextRows);
      if (analyses.length === 0) {
        const fallback = buildLocalContextFallback(contextRows);
        if (fallback.length > 0) {
          return jsonResponse({ analyses: fallback, analysisVersion: CONTEXT_ANALYSIS_VERSION }, 200, { "x-risk-guard-source": "risk-legal-context-local-fallback" });
        }
        return errorResponse(502, "EMPTY_CONTEXT_ANALYSIS", "Gemini returned no valid row analyses.");
      }

      return jsonResponse({ analyses, analysisVersion: CONTEXT_ANALYSIS_VERSION }, 200, { "x-risk-guard-source": "risk-legal-context-analysis" });
    } catch (error) {
      const fallback = buildLocalContextFallback(contextRows);
      if (fallback.length > 0) {
        return jsonResponse({ analyses: fallback, analysisVersion: CONTEXT_ANALYSIS_VERSION }, 200, { "x-risk-guard-source": "risk-legal-context-local-fallback" });
      }
      const code = error instanceof Error && error.name === "AbortError"
        ? "GEMINI_CONTEXT_ANALYSIS_TIMEOUT"
        : "GEMINI_CONTEXT_ANALYSIS_FAILED";
      return errorResponse(502, code, "Gemini legal context analysis failed.");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const rows = normalizeRows(body.rows);
  if (!taskName || rows.length === 0) {
    return errorResponse(400, "VALIDATION_ERROR", "taskName and rows are required.");
  }

  const fallbackMap = buildFallback(rows);
  const rowsByIndex = new Map(rows.map((row) => [row.rowIndex, row]));

  if (!geminiApiKey) {
    return jsonResponse(
      buildFallbackPayload(fallbackMap, "missing_secret"),
      200,
      { "x-risk-guard-source": "risk-legal-basis-fit-fallback" },
    );
  }

  const prompt = buildPrompt(taskName, contextText, rows);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);

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
      return jsonResponse(
        buildFallbackPayload(fallbackMap, "upstream_error"),
        200,
        { "x-risk-guard-source": "risk-legal-basis-fit-fallback" },
      );
    }

    const payload = await response.json();
    const parsed = parseAiResponse(extractGeminiText(payload));
    if (!parsed || !Array.isArray(parsed.results)) {
      return jsonResponse(
        buildFallbackPayload(fallbackMap, "invalid_response"),
        200,
        { "x-risk-guard-source": "risk-legal-basis-fit-fallback" },
      );
    }
    const merged = mergeAiResults(fallbackMap, rowsByIndex, parsed);
    return jsonResponse({ results: [...merged.values()].sort((left, right) => left.rowIndex - right.rowIndex) }, 200, {
      "x-risk-guard-source": "risk-legal-basis-fit",
    });
  } catch (error) {
    const timeoutMeta = { fallbackReason: "timeout" as const };
    const fallbackReason = error instanceof Error && error.name === "AbortError"
      ? timeoutMeta.fallbackReason
      : "request_error";
    return jsonResponse(
      buildFallbackPayload(fallbackMap, fallbackReason),
      200,
      { "x-risk-guard-source": "risk-legal-basis-fit-fallback" },
    );
  } finally {
    clearTimeout(timeoutId);
  }
});
