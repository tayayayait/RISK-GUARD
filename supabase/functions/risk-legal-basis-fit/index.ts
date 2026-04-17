import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { HAZARD_ARTICLE_MAP } from "../_shared/hazard-article-map.ts";
import { normalizeHazardType } from "../_shared/hazard-taxonomy.ts";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText } from "../_shared/http.ts";

type FitStatus = "verified" | "review_required" | "unknown";

interface LegalBasisFitRequestRow {
  rowIndex: number;
  workProcess: string;
  category: string;
  cause: string;
  hazardFactor: string;
  selectedLegalBasis: string;
  candidateLegalBases: string[];
}

interface LegalBasisFitRequest {
  taskName: string;
  contextText?: string;
  rows: LegalBasisFitRequestRow[];
}

interface LegalBasisFitResultRow {
  rowIndex: number;
  recommendedLegalBasis: string;
  status: FitStatus;
  score: number;
  reason: string;
}

interface AiResultRow {
  rowIndex?: unknown;
  recommendedLegalBasis?: unknown;
  status?: unknown;
  score?: unknown;
  reason?: unknown;
}

interface AiResponseShape {
  results?: AiResultRow[];
}

const STRICT_LEGAL_BASIS_PATTERN = /^산업안전보건기준에 관한 규칙 제\d+조\([^)]+\)$/;
const MAX_ROWS = 20;
const MAX_CANDIDATES_PER_ROW = 5;
const REQUEST_TIMEOUT_MS = 9000;
const SCORE_MIN = 0;
const SCORE_MAX = 100;

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

function tokenize(value?: string) {
  return normalizeSpace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function dedupe(values: string[]) {
  return [...new Set(values.map((value) => normalizeSpace(value)).filter(Boolean))];
}

function extractArticleNumber(legalBasis: string) {
  const normalized = normalizeSpace(legalBasis);
  const match = normalized.match(/제\s*\d+\s*조(?:의\s*\d+)?/);
  return match ? match[0].replace(/\s+/g, "") : "";
}

function hazardArticleSet(hazardType: string) {
  if (!hazardType) {
    return new Set<string>();
  }

  const entries = HAZARD_ARTICLE_MAP[hazardType as keyof typeof HAZARD_ARTICLE_MAP] ?? [];
  return new Set(entries.map((entry) => normalizeSpace(entry.article).replace(/\s+/g, "")));
}

function stageStatusByScore(score: number): FitStatus {
  if (score >= 70) return "verified";
  if (score >= 45) return "review_required";
  return "unknown";
}

function scoreCandidate(row: LegalBasisFitRequestRow, candidateLegalBasis: string) {
  const rowText = normalizeSpace(`${row.workProcess} ${row.category} ${row.cause} ${row.hazardFactor}`);
  const hazardType = normalizeHazardType(`${row.cause} ${row.hazardFactor}`, `${row.hazardFactor} ${row.category}`);
  const rowTokens = dedupe(tokenize(rowText));
  const candidateTokens = dedupe(tokenize(candidateLegalBasis));
  const tokenMatches = candidateTokens.filter((token) => rowTokens.includes(token)).length;

  const rowHazardSet = hazardArticleSet(hazardType);
  const candidateArticle = extractArticleNumber(candidateLegalBasis);
  const articleMatched = Boolean(candidateArticle && rowHazardSet.has(candidateArticle));
  const selectedMatched = normalizeSpace(row.selectedLegalBasis) === normalizeSpace(candidateLegalBasis);

  let score = 20;
  score += Math.min(3, tokenMatches) * 12;
  if (articleMatched) score += 35;
  if (selectedMatched) score += 4;
  if (hazardType) score += 3;
  return clampScore(score);
}

function fallbackSelect(row: LegalBasisFitRequestRow): LegalBasisFitResultRow {
  const candidates = dedupe(row.candidateLegalBases).filter(isStrictLegalBasis);
  if (candidates.length === 0) {
    return {
      rowIndex: row.rowIndex,
      recommendedLegalBasis: "",
      status: "unknown",
      score: 0,
      reason: "유효한 법적기준 후보가 없어 자동 검토를 진행할 수 없습니다.",
    };
  }

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(row, candidate),
    }))
    .sort((left, right) => right.score - left.score);

  const top = scored[0];
  if (!top) {
    return {
      rowIndex: row.rowIndex,
      recommendedLegalBasis: candidates[0],
      status: "unknown",
      score: 0,
      reason: "법적기준 후보 점수를 계산할 수 없어 수동 확인이 필요합니다.",
    };
  }

  const status = stageStatusByScore(top.score);
  const reason = status === "verified"
    ? withPeriod(`행 위험요인과 ${extractArticleNumber(top.candidate)} 조문의 연관성이 충분하여 적합하다고 판단했습니다`)
    : withPeriod(`행 위험요인과 조문 연결 점수(${top.score})가 낮아 수동 확인이 필요합니다`);

  return {
    rowIndex: row.rowIndex,
    recommendedLegalBasis: top.candidate,
    status,
    score: top.score,
    reason,
  };
}

function buildFallback(rows: LegalBasisFitRequestRow[]) {
  const map = new Map<number, LegalBasisFitResultRow>();
  for (const row of rows) {
    map.set(row.rowIndex, fallbackSelect(row));
  }
  return map;
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

function parseAiResponse(text: string) {
  const candidates = [stripCodeFence(text), extractFirstJsonObject(text)].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as AiResponseShape;
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
    selectedLegalBasis: normalizeSpace(row.selectedLegalBasis),
    candidateLegalBases: row.candidateLegalBases,
  }));

  return [
    "당신은 위험성평가표 법적기준 적합성 검토기입니다.",
    "출력은 반드시 JSON 객체 하나만 반환하세요.",
    "출력 스키마:",
    "{",
    '  "results": [',
    '    { "rowIndex": 0, "recommendedLegalBasis": "산업안전보건기준에 관한 규칙 제N조(조문명)", "status": "verified|review_required|unknown", "score": 0-100, "reason": "string" }',
    "  ]",
    "}",
    "",
    "판정 기준:",
    "- 각 행의 원인/유해위험요인에 가장 적합한 후보를 candidateLegalBases에서 1개 선택",
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
    if (!status || !reason) {
      continue;
    }

    if (status === "verified" && score < 55) {
      continue;
    }
    if (status === "unknown" && fallback.status !== "unknown") {
      continue;
    }

    merged.set(rowIndex, {
      rowIndex,
      recommendedLegalBasis: recommendation,
      status,
      score,
      reason,
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
        selectedLegalBasis,
        candidateLegalBases: candidateLegalBases.slice(0, MAX_CANDIDATES_PER_ROW),
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
  const rows = normalizeRows(body.rows);
  if (!taskName || rows.length === 0) {
    return errorResponse(400, "VALIDATION_ERROR", "taskName and rows are required.");
  }

  const fallbackMap = buildFallback(rows);
  const rowsByIndex = new Map(rows.map((row) => [row.rowIndex, row]));

  const geminiApiKey = normalizeSpace(Deno.env.get("GEMINI_API_KEY"));
  if (!geminiApiKey) {
    return jsonResponse({ results: [...fallbackMap.values()] }, 200, { "x-risk-guard-source": "risk-legal-basis-fit-fallback" });
  }

  const model = normalizeSpace(Deno.env.get("GEMINI_MODEL")) || "gemini-3.1-pro-preview";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
  const prompt = buildPrompt(taskName, contextText, rows);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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
      return jsonResponse({ results: [...fallbackMap.values()] }, 200, { "x-risk-guard-source": "risk-legal-basis-fit-fallback" });
    }

    const payload = await response.json();
    const parsed = parseAiResponse(extractGeminiText(payload));
    const merged = mergeAiResults(fallbackMap, rowsByIndex, parsed);
    return jsonResponse({ results: [...merged.values()].sort((left, right) => left.rowIndex - right.rowIndex) }, 200, {
      "x-risk-guard-source": "risk-legal-basis-fit",
    });
  } catch {
    return jsonResponse({ results: [...fallbackMap.values()] }, 200, { "x-risk-guard-source": "risk-legal-basis-fit-fallback" });
  } finally {
    clearTimeout(timeoutId);
  }
});

