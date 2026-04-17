import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText, withErrorBoundary } from "../_shared/http.ts";
import { normalizeHazardType, STANDARD_HAZARD_TYPES } from "../_shared/hazard-taxonomy.ts";
import { normalizeGeminiAnalyzeResponse } from "../gemini-analyze/normalize.ts";
import { postProcessRiskAssessmentHazards } from "./hazard-postprocess.ts";

interface AnalyzeTaskInput {
  taskName: string;
  taskDescription: string;
  siteName?: string;
  workDate?: string;
  photoCount?: number;
  formType?: "risk-assessment" | "accident-report";
  formTemplateHint?: string;
}

const DEFAULT_PRIMARY_TIMEOUT_MS = 22000;
const DEFAULT_REPAIR_TIMEOUT_MS = 7000;

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
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  return null;
}

function dedupeModels(models: Array<string | undefined>) {
  return [...new Set(models.map((value) => sanitizeText(value ?? "")).filter(Boolean))];
}

function pickFirstSentence(text: string) {
  const normalized = sanitizeText(text);
  if (!normalized) {
    return "";
  }

  const split = normalized.split(/(?<=[.!?])\s+/);
  return sanitizeText(split[0] ?? normalized);
}

function inferIndustry(taskName: string, taskDescription: string) {
  const source = `${taskName} ${taskDescription}`;
  if (/(건설|토목|비계|콘크리트|철근|거푸집)/.test(source)) return "건설업";
  if (/(제조|가공|조립|절단|용접|프레스|선반)/.test(source)) return "제조업";
  if (/(물류|창고|상하차|지게차|운반|적재)/.test(source)) return "물류업";
  if (/(화학|도장|용제|시약|유해물질)/.test(source)) return "화학업";
  if (/(서비스|청소|시설관리|유지보수)/.test(source)) return "서비스업";
  return "기타";
}

function normalizeLocation(siteName?: string) {
  const value = sanitizeText(siteName ?? "");
  return value || "현장 미상";
}

function fallbackActions(hazardType: string) {
  if (hazardType === "추락") {
    return [
      "작업을 즉시 중지하고 추락 위험 구간 출입을 통제한다.",
      "비계와 발판의 고정 상태를 재점검하고 이상 구간을 보수한다.",
      "안전대 및 추락방지 보호구 착용 상태를 전원 확인한다.",
    ];
  }

  if (hazardType === "감전") {
    return [
      "전원을 즉시 차단하고 충전부 접근을 통제한다.",
      "절연 상태와 접지 상태를 점검하고 이상 구간을 격리한다.",
      "감전 위험 구간에 경고 표지와 접근 통제를 적용한다.",
    ];
  }

  return [
    "작업을 일시 중지하고 위험 구간 접근을 통제한다.",
    "위험요인 원인을 점검하고 즉시 가능한 임시 조치를 적용한다.",
    "작업 재개 전 작업자 대상 안전수칙을 재확인한다.",
  ];
}

function fallbackImprovements(hazardType: string) {
  if (hazardType === "추락") {
    return [
      "비계 및 작업발판 점검 체크리스트를 표준화해 작업 전 확인을 의무화한다.",
      "추락 위험 공정은 작업허가제와 TBM을 통해 승인 후 착수하도록 개선한다.",
      "고소작업 전담 감독자를 지정하고 보호구 착용 점검 기록을 상시 관리한다.",
    ];
  }

  if (hazardType === "감전") {
    return [
      "전기설비 정기점검 주기를 단축하고 이상 징후 점검 항목을 세분화한다.",
      "잠금표지 절차를 표준화하고 전기작업 허가체계를 강화한다.",
      "충전부 노출 구간 절연·차폐 설비를 보강하고 누전 점검을 정례화한다.",
    ];
  }

  return [
    "위험요인별 표준작업절차를 정비하고 준수 여부를 정기 점검한다.",
    "작업 전 안전점검과 위험성 확인 절차를 문서화해 운영한다.",
    "유사사고 재발방지를 위한 교육 및 현장 점검을 정례화한다.",
  ];
}

function fallbackHazardFactorNarrative(hazardType: string) {
  if (hazardType === "추락") return "비계 고정 불량 상태로 인한 추락 위험 증가";
  if (hazardType === "감전") return "전원 미차단 상태로 인한 감전 위험 증가";
  if (hazardType === "끼임/말림") return "회전부 방호 미흡 상태로 인한 끼임 위험 증가";
  if (hazardType === "절단") return "절단부 노출 상태로 인한 절단 위험 증가";
  if (hazardType === "붕괴") return "지지 구조 불안정 상태로 인한 붕괴 위험 증가";
  if (hazardType === "질식") return "밀폐공간 환기 미흡 상태로 인한 질식 위험 증가";
  if (hazardType === "폭발/화재") return "점화원 통제 미흡 상태로 인한 화재 위험 증가";
  if (hazardType === "낙하물/비래") return "상부 자재 고정 불량 상태로 인한 낙하물 위험 증가";
  if (hazardType === "차량/이동장비 충돌") return "동선 분리 미흡 상태로 인한 충돌 위험 증가";
  if (hazardType === "화학노출") return "유해물질 관리 미흡 상태로 인한 화학노출 위험 증가";
  if (hazardType === "소음/분진/반복작업") return "반복작업 통제 미흡 상태로 인한 건강장해 위험 증가";

  return "안전통제 미흡 상태로 인한 작업 중 부상 위험 증가";
}

function fallbackCauseNarrative(scenarioSeed: string, hazardFactorNarrative: string) {
  const seed = sanitizeText(scenarioSeed).slice(0, 48);
  return `${seed} 과정에서 ${hazardFactorNarrative} 요인이 충분히 통제되지 않아 사고가 발생할 수 있음`;
}

function buildFallbackAnalyzeResult(input: AnalyzeTaskInput) {
  const taskName = sanitizeText(input.taskName);
  const taskDescription = sanitizeText(input.taskDescription);
  const hazardType = normalizeHazardType(`${taskName} ${taskDescription}`, taskDescription) || STANDARD_HAZARD_TYPES[0];
  const scenarioSeed = pickFirstSentence(taskDescription) || `${taskName} 작업 중 사고가 발생할 수 있음`;
  const hazardFactorNarrative = fallbackHazardFactorNarrative(hazardType);
  const causeNarrative = fallbackCauseNarrative(scenarioSeed, hazardFactorNarrative);
  const actionItems = fallbackActions(hazardType);
  const improvementItems = fallbackImprovements(hazardType);

  return {
    profile: {
      industry: inferIndustry(taskName, taskDescription),
      workLocation: normalizeLocation(input.siteName),
      equipment: [],
      hazards: [
        {
          id: "H1",
          name: hazardFactorNarrative,
          type: hazardType,
          weight: 28,
          confidence: "low",
          reason: causeNarrative,
        },
      ],
    },
    profileConfidence: {
      industry: "low",
      workLocation: "low",
      equipment: "low",
      hazards: "low",
    },
    scenario: scenarioSeed,
    immediateActions: actionItems.map((action, index) => ({
      id: `A${index + 1}`,
      action,
      priority: index === 0 ? 1 : (index === 1 ? 2 : 3),
    })),
    improvements: improvementItems.map((action, index) => ({
      id: `I${index + 1}`,
      action,
      category: "관리",
    })),
    briefingDraft: `${taskName || "해당 작업"} 관련 위험요인을 점검하고 즉시 조치 및 재발방지 대책을 수립합니다.`,
  };
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
          maxOutputTokens: 1400,
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
    "The previous output is malformed JSON.",
    "Return exactly one valid JSON object only.",
    "Do not include markdown or extra explanation.",
    "",
    raw,
  ].join("\n");
}

function buildFormSpecificRules(input: AnalyzeTaskInput) {
  if (input.formType === "risk-assessment") {
    return [
      "Form mode: risk-assessment.",
      "- hazards must contain 2~3 items.",
      "- each hazard should represent a distinct accident mechanism (no duplicate mechanism).",
      "- each hazard must be grounded in explicit taskDescription context.",
      "- hazards.reason must be a complete Korean sentence suitable for the '원인' column.",
      "- hazards.reason should include work condition + failure mechanism + accident possibility.",
      "- hazards.reason target length: 18~56 characters.",
      "- hazards.name must be suitable for the '유해위험요인' column and describe a concrete hazardous state.",
      "- hazards.name target length: 12~36 characters.",
      "- immediateActions should be currently applied or immediately applicable controls.",
      "- improvements should be preventive actions for follow-up management.",
      "- scenario should describe realistic incident context from the provided description.",
    ];
  }

  if (input.formType === "accident-report") {
    return [
      "Form mode: accident-report.",
      "- scenario must be 1~2 Korean sentences suitable for '재해관련 작업유형(당시 상황)'.",
      "- scenario must include: (1) what work was being done, (2) accident mechanism, (3) immediate accident result.",
      "- avoid generic text; ground every sentence in taskDescription details.",
      "- hazards must be 2~4 items and each hazard.reason must describe one distinct causal factor.",
      "- each hazards.reason should read like '통제 미흡/절차 누락/방호 결함' style causal narrative.",
      "- hazards.name should be concise causal labels, not generic placeholders.",
      "- improvements must be exactly 3 practical prevention actions for legal report writing.",
      "- each improvement action should be directly executable on-site and end with a Korean action verb style.",
      "- avoid duplicate wording across scenario/hazards/improvements.",
    ];
  }

  return ["Form mode: general."];
}

function buildPrompt(input: AnalyzeTaskInput) {
  const hazardTypeList = STANDARD_HAZARD_TYPES.join("|");

  return [
    "You are a Korean industrial safety assessor specialized in form drafting.",
    "Return ONLY one valid JSON object. No markdown, no explanation.",
    "All text values must be in Korean.",
    "",
    "Required schema:",
    "{",
    '  "profile": {',
    '    "industry": "건설업|제조업|물류업|화학업|서비스업|기타",',
    '    "workLocation": "구체적 작업장소",',
    '    "equipment": ["장비1", "장비2"],',
    `    "hazards": [{"id":"H1","name":"유해위험요인 문장","type":"${hazardTypeList}","weight":1-40,"confidence":"high|medium|low","reason":"원인 문장"}],`,
    "  },",
    '  "profileConfidence": {"industry":"high|medium|low","workLocation":"high|medium|low","equipment":"high|medium|low","hazards":"high|medium|low"},',
    '  "scenario": "사고 시나리오 1문장",',
    '  "immediateActions": [{"id":"A1","action":"즉시 조치","priority":1|2|3}],',
    '  "improvements": [{"id":"I1","action":"개선 조치","category":"시설|관리|교육"}],',
    '  "briefingDraft": "작업 전 안전 브리핑 문안"',
    "}",
    "",
    "Rules:",
    "- hazards.type must be one of the allowed values.",
    "- hazards.weight must be numeric in range 1..40.",
    "- Use concrete details from the input. Do not invent unrelated industries or tasks.",
    "- Keep immediateActions and improvements each 3 items.",
    ...buildFormSpecificRules(input),
    "",
    `taskName: ${input.taskName}`,
    `taskDescription: ${input.taskDescription}`,
    `siteName: ${input.siteName ?? "미정"}`,
    `workDate: ${input.workDate ?? "미정"}`,
    `photoCount: ${input.photoCount ?? 0}`,
    `formType: ${input.formType ?? "general"}`,
    ...(input.formTemplateHint
      ? ["", "[Form template guidance]", input.formTemplateHint]
      : []),
  ].join("\n");
}

function chooseGeminiModels(input: AnalyzeTaskInput) {
  const strategy = (Deno.env.get("GEMINI_MODEL_STRATEGY") ?? "hybrid").toLowerCase();
  const flashModel = Deno.env.get("GEMINI_MODEL_FLASH") ?? "gemini-3-flash-preview";
  const proModel = Deno.env.get("GEMINI_MODEL_PRO") ?? "gemini-3.1-pro-preview";
  const fixedModel = Deno.env.get("GEMINI_MODEL_FIXED") ?? flashModel;
  const fixedFormModel = Deno.env.get("GEMINI_FORM_MODEL");

  // Product decision: risk-assessment form autofill is pinned to pro.
  if (input.formType === "risk-assessment") {
    return [proModel];
  }

  if (fixedFormModel) {
    const alternate = sanitizeText(fixedFormModel) === sanitizeText(flashModel) ? proModel : flashModel;
    return dedupeModels([fixedFormModel, alternate, proModel]);
  }

  if (strategy === "fixed") {
    const alternate = sanitizeText(fixedModel) === sanitizeText(flashModel) ? proModel : flashModel;
    return dedupeModels([fixedModel, alternate, proModel]);
  }

  // Default order: flash first for latency, then pro for reliability.
  return dedupeModels([flashModel, proModel]);
}

function applyRiskAssessmentHazardPostProcess(
  payload: ReturnType<typeof normalizeGeminiAnalyzeResponse>,
  input: AnalyzeTaskInput,
) {
  if (!payload || input.formType !== "risk-assessment") {
    return payload;
  }

  return {
    ...payload,
    profile: {
      ...payload.profile,
      hazards: postProcessRiskAssessmentHazards({
        taskName: input.taskName,
        taskDescription: input.taskDescription,
        hazards: payload.profile.hazards,
      }),
    },
  };
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
    Deno.env.get("GEMINI_FORM_PRIMARY_TIMEOUT_MS"),
    DEFAULT_PRIMARY_TIMEOUT_MS,
  );
  const repairTimeoutMs = resolveTimeoutMs(
    Deno.env.get("GEMINI_FORM_REPAIR_TIMEOUT_MS"),
    DEFAULT_REPAIR_TIMEOUT_MS,
  );

  let lastErrorCode = "UPSTREAM_ERROR";
  let lastErrorMessage = "Gemini API failed.";
  let lastErrorDetail = "";

  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex += 1) {
    const model = modelCandidates[modelIndex];
    const isLastModel = modelIndex === modelCandidates.length - 1;
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
      const firstPostProcessed = applyRiskAssessmentHazardPostProcess(firstNormalized, { ...body, taskName, taskDescription });

      if (firstPostProcessed) {
        return jsonResponse(firstPostProcessed, 200, { "x-risk-guard-source": "form-autofill-analyze" });
      }

      if (!isLastModel) {
        lastErrorCode = "PARSE_ERROR";
        lastErrorMessage = `Gemini response schema validation failed at model '${model}'. Trying next model.`;
        lastErrorDetail = firstText;
        continue;
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
      const repairedPostProcessed = applyRiskAssessmentHazardPostProcess(repairedNormalized, { ...body, taskName, taskDescription });

      if (repairedPostProcessed) {
        return jsonResponse(repairedPostProcessed, 200, { "x-risk-guard-source": "form-autofill-analyze" });
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

  const fallbackPayload = applyRiskAssessmentHazardPostProcess(
    normalizeGeminiAnalyzeResponse(buildFallbackAnalyzeResult({ ...body, taskName, taskDescription })),
    { ...body, taskName, taskDescription },
  );
  if (fallbackPayload) {
    return jsonResponse(fallbackPayload, 200, {
      "x-risk-guard-source": "form-autofill-analyze-fallback",
      "x-risk-guard-upstream-error": lastErrorCode,
    });
  }

  const status = lastErrorCode === "UPSTREAM_TIMEOUT" ? 504 : 502;
  return errorResponse(status, lastErrorCode, lastErrorMessage, lastErrorDetail);
}, "form-autofill-analyze"));
