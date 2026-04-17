import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText } from "../_shared/http.ts";

interface WorkProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: Array<{ name: string; type: string; weight?: number }>;
}

interface EvidenceSummaryRequest {
  taskName: string;
  taskDescription: string;
  profile: WorkProfile;
  evidence: {
    title: string;
    sourceBadge: string;
    fullContent: string;
    keywords?: string[];
    url?: string;
  };
}

interface EvidenceSummaryResponse {
  incidentRelevance: string;
  applicabilityReason: string;
  practicalActions: string[];
}

function stripCodeFence(raw: string) {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractFirstJsonObject(raw: string) {
  const text = stripCodeFence(raw);
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

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
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function safeJsonParse<T>(raw: string): T | null {
  if (!raw) return null;

  const candidates = [stripCodeFence(raw), extractFirstJsonObject(raw)].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  return null;
}

function extractGeminiText(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const parts = candidates[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("\n").trim();
}

function normalizeList(value: unknown, max = 6) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? sanitizeText(item) : ""))
    .filter(Boolean)
    .slice(0, max);
}

function normalizeResponse(payload: unknown): EvidenceSummaryResponse | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const row = payload as {
    incidentRelevance?: unknown;
    applicabilityReason?: unknown;
    practicalActions?: unknown;
    summary?: unknown;
    actions?: { immediate?: unknown; same_day?: unknown; pre_resume?: unknown };
    cautions?: unknown;
  };

  const incidentRelevance = typeof row.incidentRelevance === "string" ? sanitizeText(row.incidentRelevance) : "";
  const applicabilityReason = typeof row.applicabilityReason === "string" ? sanitizeText(row.applicabilityReason) : "";
  const practicalActions = normalizeList(row.practicalActions, 6);

  if (incidentRelevance && applicabilityReason) {
    return {
      incidentRelevance,
      applicabilityReason,
      practicalActions,
    };
  }

  const summary = typeof row.summary === "string" ? sanitizeText(row.summary) : "";
  if (!summary) {
    return null;
  }

  const cautions = normalizeList(row.cautions, 5);
  const practicalActionFallback = [
    ...normalizeList(row.actions?.immediate, 5),
    ...normalizeList(row.actions?.same_day, 5),
    ...normalizeList(row.actions?.pre_resume, 5),
  ].slice(0, 6);

  return {
    incidentRelevance: summary,
    applicabilityReason: cautions[0] ?? "적용 이유 정보 없음",
    practicalActions: practicalActionFallback,
  };
}

function truncateText(value: string, max = 6000) {
  const text = sanitizeText(value);
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max - 1)}…`;
}

function buildPrompt(input: EvidenceSummaryRequest) {
  const evidenceContent = truncateText(input.evidence.fullContent, 6000);
  const keywordText = (input.evidence.keywords ?? []).map((item) => sanitizeText(item)).filter(Boolean).slice(0, 8).join(", ");

  return [
    "You are a Korean industrial safety advisor.",
    "Return ONLY one valid JSON object. No markdown, no explanation.",
    "All text values must be in Korean.",
    "",
    "Required schema:",
    "{",
    '  "incidentRelevance": "현재 우리 회사 사고와의 관련성 설명 2~3문장",',
    '  "applicabilityReason": "이 법령이 왜 적용되는지 이유 설명 1~2문장",',
    '  "practicalActions": ["실제로 취해야 할 조치 1", "실제로 취해야 할 조치 2"]',
    "}",
    "",
    "Rules:",
    "- incidentRelevance must explain connection to the current company accident context.",
    "- applicabilityReason must explain legal applicability in plain Korean.",
    "- practicalActions must be concrete, executable, and easy to understand.",
    "- Keep each practical action to one sentence.",
    "- Do not include legal interpretations beyond provided evidence.",
    "- practicalActions may be an empty array when not applicable.",
    "",
    `taskName: ${sanitizeText(input.taskName)}`,
    `taskDescription: ${sanitizeText(input.taskDescription)}`,
    `industry: ${sanitizeText(input.profile.industry)}`,
    `workLocation: ${sanitizeText(input.profile.workLocation)}`,
    `equipment: ${(input.profile.equipment ?? []).map((item) => sanitizeText(item)).filter(Boolean).join(", ")}`,
    `hazards: ${(input.profile.hazards ?? []).map((hazard) => sanitizeText(hazard.name)).filter(Boolean).join(", ")}`,
    `evidenceSource: ${sanitizeText(input.evidence.sourceBadge)}`,
    `evidenceTitle: ${sanitizeText(input.evidence.title)}`,
    `evidenceKeywords: ${keywordText || "없음"}`,
    `evidenceUrl: ${sanitizeText(input.evidence.url ?? "") || "없음"}`,
    "evidenceContent:",
    evidenceContent,
  ].join("\n");
}

function buildRepairPrompt(raw: string) {
  return [
    "다음 출력은 JSON 형식이 깨져 있습니다.",
    "유효한 JSON 객체 하나만 반환하세요.",
    "설명문, 마크다운, 코드블록은 포함하지 마세요.",
    "",
    raw,
  ].join("\n");
}

async function requestGemini(endpoint: string, prompt: string, temperature: number) {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
      },
    }),
  });
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST is supported.");
  }

  const body = await parseJsonBody<EvidenceSummaryRequest>(req);
  if (!body) {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const taskName = sanitizeText(body.taskName);
  const taskDescription = sanitizeText(body.taskDescription);
  const evidenceTitle = sanitizeText(body.evidence?.title ?? "");
  const evidenceContent = sanitizeText(body.evidence?.fullContent ?? "");

  if (!taskName || !taskDescription || !body.profile || !evidenceTitle || !evidenceContent) {
    return errorResponse(400, "VALIDATION_ERROR", "taskName, taskDescription, profile, evidence.title, evidence.fullContent are required.");
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    return errorResponse(503, "MISSING_SECRET", "GEMINI_API_KEY is not configured.");
  }

  const model = Deno.env.get("GEMINI_SUMMARY_MODEL") ?? Deno.env.get("GEMINI_MODEL_FLASH") ?? "gemini-3-flash-preview";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

  const requestBody: EvidenceSummaryRequest = {
    ...body,
    taskName,
    taskDescription,
    evidence: {
      ...body.evidence,
      title: evidenceTitle,
      fullContent: evidenceContent,
      sourceBadge: sanitizeText(body.evidence.sourceBadge),
      keywords: Array.isArray(body.evidence.keywords)
        ? body.evidence.keywords.map((item) => sanitizeText(item)).filter(Boolean).slice(0, 8)
        : [],
      ...(sanitizeText(body.evidence.url ?? "") ? { url: sanitizeText(body.evidence.url ?? "") } : {}),
    },
  };

  try {
    const response = await requestGemini(endpoint, buildPrompt(requestBody), 0.2);
    if (!response.ok) {
      const errorText = await response.text();
      return errorResponse(502, "UPSTREAM_ERROR", `Gemini API failed with ${response.status}.`, errorText);
    }

    const result = await response.json();
    const firstText = extractGeminiText(result);
    const firstParsed = safeJsonParse<unknown>(firstText);
    const firstNormalized = normalizeResponse(firstParsed);

    if (firstNormalized) {
      return jsonResponse(firstNormalized, 200, { "x-risk-guard-source": "gemini-evidence-summary" });
    }

    const repairResponse = await requestGemini(endpoint, buildRepairPrompt(firstText), 0);
    if (!repairResponse.ok) {
      const repairError = await repairResponse.text();
      return errorResponse(502, "PARSE_ERROR", "Gemini response is not valid JSON and repair failed.", repairError);
    }

    const repairedResult = await repairResponse.json();
    const repairedText = extractGeminiText(repairedResult);
    const repairedParsed = safeJsonParse<unknown>(repairedText);
    const repairedNormalized = normalizeResponse(repairedParsed);

    if (!repairedNormalized) {
      return errorResponse(502, "PARSE_ERROR", "Gemini response schema validation failed.", repairedText);
    }

    return jsonResponse(repairedNormalized, 200, { "x-risk-guard-source": "gemini-evidence-summary" });
  } catch (error) {
    return errorResponse(502, "UPSTREAM_NETWORK_ERROR", "Gemini request failed.", String(error));
  }
});
