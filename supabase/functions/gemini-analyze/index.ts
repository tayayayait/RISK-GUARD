import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText, withErrorBoundary } from "../_shared/http.ts";
import { normalizeGeminiAnalyzeResponse } from "./normalize.ts";

interface AnalyzeTaskInput {
  taskName: string;
  taskDescription: string;
  siteName?: string;
  workDate?: string;
  photoCount?: number;
  formType?: "risk-assessment" | "accident-report";
  formTemplateHint?: string;
}

const DEFAULT_PRIMARY_TIMEOUT_MS = 30000;
const DEFAULT_REPAIR_TIMEOUT_MS = 25000;

function stripCodeFence(raw: string) {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractGeminiText(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const parts = candidates[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("\n").trim();
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
    const normalizedCandidate = candidate
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, "$1");

    try {
      return JSON.parse(normalizedCandidate) as T;
    } catch {
      continue;
    }
  }

  return null;
}

function dedupeModels(models: Array<string | undefined>) {
  return [...new Set(models.map((value) => sanitizeText(value ?? "")).filter(Boolean))];
}

function resolveTimeoutMs(value: string | undefined, fallbackMs: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallbackMs;
  }

  return Math.max(3000, Math.trunc(parsed));
}

async function requestGeminiWithTimeout(
  endpoint: string,
  prompt: string,
  temperature: number,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(endpoint, {
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
          maxOutputTokens: 2500,
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`GEMINI_TIMEOUT:${timeoutMs}`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildRepairPrompt(raw: string) {
  return [
    "Previous output was malformed JSON.",
    "Return exactly one valid JSON object only.",
    "No markdown, no explanation.",
    "Keep the same schema.",
    "",
    raw,
  ].join("\n");
}

function buildPrompt(input: AnalyzeTaskInput) {
  const hazardTypeList = [
    "추락",
    "붕괴",
    "질식",
    "폭발/화재",
    "감전",
    "끼임/말림",
    "절단",
    "낙하물/비래",
    "차량/이동장비 충돌",
    "화학노출",
    "소음/분진/반복작업",
  ].join("|");

  return [
    "You are a Korean industrial safety assessor.",
    "Return exactly one valid JSON object.",
    "No markdown. No code fences. No explanation.",
    "All natural-language fields must be in Korean.",
    "",
    "JSON schema:",
    "{",
    '  "profile": {',
    '    "industry": "string",',
    '    "workLocation": "string",',
    '    "equipment": ["string"],',
    `    "hazards": [{"id":"H1","name":"string","type":"${hazardTypeList}","weight":1,"confidence":"high","reason":"string"}]`,
    "  },",
    '  "profileConfidence": {"industry":"high","workLocation":"high","equipment":"high","hazards":"high"},',
    '  "scenario": "string",',
    '  "immediateActions": [{"id":"A1","action":"string","priority":1}],',
    '  "improvements": [{"id":"I1","action":"string","category":"시설"}],',
    '  "briefingDraft": "string"',
    "}",
    "",
    "Rules:",
    "- hazards.type must be one of allowed values.",
    "- hazards.weight must be integer in range 1..40.",
    "- confidence/profileConfidence values must be high|medium|low.",
    "- immediateActions must contain exactly 3 items.",
    "- improvements must contain exactly 3 items.",
    "- Use concrete details from the input task.",
    "",
    `taskName: ${input.taskName}`,
    `taskDescription: ${input.taskDescription}`,
    `siteName: ${input.siteName ?? "미정"}`,
    `workDate: ${input.workDate ?? "미정"}`,
    `photoCount: ${input.photoCount ?? 0}`,
    `formType: ${input.formType ?? "general"}`,
    ...(input.formType === "risk-assessment" && input.formTemplateHint
      ? ["", "[Template guidance]", input.formTemplateHint]
      : []),
  ].join("\n");
}

function chooseGeminiModels(_input: AnalyzeTaskInput) {
  const strategy = (Deno.env.get("GEMINI_MODEL_STRATEGY") ?? "hybrid").toLowerCase();
  const flashModel = Deno.env.get("GEMINI_MODEL_FLASH") ?? "gemini-3-flash-preview";
  const fixedModel = Deno.env.get("GEMINI_MODEL_FIXED") ?? flashModel;
  const fixedAnalyzeModel = Deno.env.get("GEMINI_ANALYZE_MODEL");

  if (fixedAnalyzeModel) {
    return dedupeModels([fixedAnalyzeModel]);
  }

  if (strategy === "fixed") {
    return dedupeModels([fixedModel]);
  }

  return dedupeModels([flashModel]);
}

serve(withErrorBoundary(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST is supported.");
  }

  const body = await parseJsonBody<AnalyzeTaskInput>(req);
  if (!body) {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const taskName = sanitizeText(body.taskName);
  const taskDescription = sanitizeText(body.taskDescription);
  if (!taskName || !taskDescription) {
    return errorResponse(400, "VALIDATION_ERROR", "taskName and taskDescription are required.");
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    return errorResponse(503, "MISSING_SECRET", "GEMINI_API_KEY is not configured.");
  }

  const modelCandidates = chooseGeminiModels({ ...body, taskName, taskDescription });
  const prompt = buildPrompt({ ...body, taskName, taskDescription });
  const primaryTimeoutMs = resolveTimeoutMs(
    Deno.env.get("GEMINI_ANALYZE_PRIMARY_TIMEOUT_MS"),
    DEFAULT_PRIMARY_TIMEOUT_MS,
  );
  const repairTimeoutMs = resolveTimeoutMs(
    Deno.env.get("GEMINI_ANALYZE_REPAIR_TIMEOUT_MS"),
    DEFAULT_REPAIR_TIMEOUT_MS,
  );

  let lastErrorCode = "UPSTREAM_ERROR";
  let lastErrorMessage = "Gemini API failed.";
  let lastErrorDetail = "";

  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
    const model = modelCandidates[modelIndex];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

    try {
      const response = await requestGeminiWithTimeout(endpoint, prompt, 0.2, primaryTimeoutMs);
      if (!response.ok) {
        const errorText = await response.text();
        lastErrorCode = response.status === 408 || response.status === 504 ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR";
        lastErrorMessage = `Gemini API failed with ${response.status} at model '${model}'.`;
        lastErrorDetail = errorText;
        continue;
      }

      const result = await response.json();
      const firstText = extractGeminiText(result);
      const firstParsed = safeJsonParse<unknown>(firstText);
      const firstNormalized = normalizeGeminiAnalyzeResponse(firstParsed);

      if (firstNormalized) {
        return jsonResponse(firstNormalized, 200, { "x-risk-guard-source": "gemini" });
      }

      const repairResponse = await requestGeminiWithTimeout(endpoint, buildRepairPrompt(firstText), 0, repairTimeoutMs);
      if (!repairResponse.ok) {
        const repairError = await repairResponse.text();
        lastErrorCode = repairResponse.status === 408 || repairResponse.status === 504 ? "UPSTREAM_TIMEOUT" : "PARSE_ERROR";
        lastErrorMessage = `Gemini repair failed with ${repairResponse.status} at model '${model}'.`;
        lastErrorDetail = repairError;
        continue;
      }

      const repairedResult = await repairResponse.json();
      const repairedText = extractGeminiText(repairedResult);
      const repairedParsed = safeJsonParse<unknown>(repairedText);
      const repairedNormalized = normalizeGeminiAnalyzeResponse(repairedParsed);

      if (repairedNormalized) {
        return jsonResponse(repairedNormalized, 200, { "x-risk-guard-source": "gemini" });
      }

      lastErrorCode = "PARSE_ERROR";
      lastErrorMessage = `Gemini response schema validation failed at model '${model}'.`;
      lastErrorDetail = repairedText;
    } catch (error) {
      const errorText = String(error);
      if (errorText.startsWith("Error: GEMINI_TIMEOUT:")) {
        lastErrorCode = "UPSTREAM_TIMEOUT";
        lastErrorMessage = `Gemini request timed out at model '${model}'.`;
        lastErrorDetail = errorText;
        continue;
      }

      lastErrorCode = "UPSTREAM_NETWORK_ERROR";
      lastErrorMessage = `Gemini request failed at model '${model}'.`;
      lastErrorDetail = errorText;
    }
  }

  const status = lastErrorCode === "UPSTREAM_TIMEOUT" ? 504 : 502;
  return errorResponse(status, lastErrorCode, lastErrorMessage, lastErrorDetail);
}, "gemini-analyze"));
