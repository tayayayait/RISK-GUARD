/**
 * M2 — 근거 인용 안전 Q&A
 *
 *   질문 → RAGFlow 조문 검색 → 게이팅 → Gemini 생성 → 인용 검증 → 응답
 *
 * 어느 단계에서든 근거가 부족하면 추측하지 않고 안전관리자 확인으로 넘긴다.
 * 인용 검증은 프롬프트가 아니라 코드로 수행한다(rag-guard.ts).
 */
import {
  handlePreflight,
  jsonResponse,
  errorResponse,
  parseJsonBody,
  withErrorBoundary,
} from "../_shared/http.ts";
import { readEnv } from "../_shared/runtime-env.ts";
import { retrieveArticles, RagflowError, type RetrievedArticle } from "../_shared/ragflow-api.ts";
import {
  gateGrounds,
  verifyCitations,
  detectEscalation,
  ABSTAIN_MESSAGE,
  QA_DISCLAIMER,
  QA_GUIDANCE_DISCLAIMER,
  DEFAULT_SIMILARITY_THRESHOLD,
  type ModelAnswer,
  type QaConfidence,
  type VerifiedCitation,
} from "../_shared/rag-guard.ts";

export type AnswerMode = "grounded" | "guidance" | "escalation";

export interface SafetyQaRequest {
  question: string;
  /** 재검색 시 임계치를 조정하려는 경우에만 사용 */
  similarityThreshold?: number;
  /** 멀티턴 대화 히스토리 */
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  /** 세션 식별자 (선택) */
  sessionId?: string;
}

export interface SafetyQaResponse {
  answered: boolean;
  answerMode: AnswerMode;
  answer: string;
  citations: VerifiedCitation[];
  confidence: QaConfidence;
  needsSafetyOfficerReview: boolean;
  abstainReason?: string;
  /** 답변하지 못했거나 guidance 모드일 때도 사용자가 직접 확인할 수 있도록 검색 결과는 돌려준다. */
  relatedArticles: Array<{
    articleLabel: string;
    articleTitle: string | null;
    docTitle: string;
    sourceUrl: string;
    similarity: number;
  }>;
  disclaimer: string;
  meta: {
    retrieved: number;
    grounded: number;
    droppedCitations?: Array<{ chunkId: string; reason: string }>;
    threshold: number;
    elapsedMs: number;
  };
}

export interface HandleOptions {
  /** 테스트에서 실제 API 호출을 대체하기 위한 주입점 */
  retrieve?: typeof retrieveArticles;
  generate?: (question: string, grounds: RetrievedArticle[]) => Promise<ModelAnswer>;
  generateGuidance?: (
    question: string,
    history: Array<{ role: "user" | "assistant"; content: string }>,
    partialGrounds: RetrievedArticle[],
  ) => Promise<{ answer: string; confidence?: QaConfidence; needsSafetyOfficerReview?: boolean }>;
  now?: Date;
}

const GENERATION_TIMEOUT_MS = 25000;

const GROUNDED_ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chunkId: { type: "string" },
          quote: { type: "string" },
        },
        required: ["chunkId", "quote"],
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    needsSafetyOfficerReview: { type: "boolean" },
  },
  required: ["answer", "citations", "confidence", "needsSafetyOfficerReview"],
};

const GUIDANCE_ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    needsSafetyOfficerReview: { type: "boolean" },
  },
  required: ["answer", "confidence", "needsSafetyOfficerReview"],
};

function buildGroundedPrompt(question: string, grounds: RetrievedArticle[]): string {
  const groundsText = grounds
    .map((g) => `### 근거 chunkId: ${g.id}\n${g.content}`)
    .join("\n\n---\n\n");

  return `당신은 산업안전보건 법령 상담 도우미입니다.
아래에 제공된 법령 조문만을 근거로 질문에 답하십시오.

[절대 규칙]
1. 제공된 조문에 없는 내용은 절대 말하지 마십시오. 일반 상식이나 기억에 의존하지 마십시오.
2. citations 의 chunkId 는 반드시 아래 근거에 실제로 있는 값을 그대로 쓰십시오. 지어내면 답변 전체가 폐기됩니다.
3. citations 의 quote 는 해당 조문 원문에서 **그대로 복사한 연속된 문장**이어야 합니다. 요약하거나 바꿔 쓰지 마십시오.
4. 제공된 조문으로 답할 수 없으면 answer 를 빈 문자열로 두고 citations 를 빈 배열로 두십시오.
5. 개인의 건강 판단, 특정 사업장의 위법 여부 판정, 작업 중단 결정은 하지 말고
   needsSafetyOfficerReview 를 true 로 두십시오.
6. 답변은 한국어로, 현장 작업자가 이해할 수 있는 평이한 문장으로 작성하십시오.

[제공된 법령 조문]
${groundsText}

[질문]
${question}`;
}

function buildGuidancePrompt(
  question: string,
  history: Array<{ role: string; content: string }> = [],
  partialGrounds: RetrievedArticle[] = [],
): string {
  const historyText = history.length > 0
    ? `[이전 대화 맥락]\n` +
      history
        .slice(-6)
        .map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`)
        .join("\n") +
      "\n\n"
    : "";

  const refCandidates = partialGrounds
    .filter((g) => g.ref)
    .slice(0, 3)
    .map((g) => `- ${g.ref!.docTitle} ${g.ref!.articleLabel}${g.ref!.articleTitle ? ` (${g.ref!.articleTitle})` : ""}`)
    .join("\n");

  const refText = refCandidates ? `[참고 가능한 관련 법령 후보]\n${refCandidates}\n\n` : "";

  return `당신은 대한민국 산업안전보건 전문 AI 상담관입니다.
현장 작업자 및 안전관리자가 안전하게 작업할 수 있도록 친절하고 실질적이며 명확하게 안내하십시오.

[답변 원칙]
1. 작업자가 질문한 작업(예: 반도체 공정, 용접, 밀폐공간, 사다리/비계 작업 등)에 대해 필수 작업 전 점검 사항, 안전 수칙, 필수 보호구, 비상 대응 요령을 가독성 높게(번호/불릿) 정리하여 설명하십시오.
2. 특정 조문이 100% 일치하지 않더라도, 산업안전보건 기준 및 현장 표준 작업 절차에 입각한 전문적인 실무 가이드를 제공하십시오.
3. 법적 위법 여부 단정, 특정 사고 책임 귀속, 개인 질병 진단 등은 확정하지 말고 필요한 경우 안전보건관리책임자나 전문가 확인을 권고하십시오.
4. 답변은 한국어로, 정중하고 이해하기 쉽게 작성하십시오.

${historyText}${refText}[질문]
${question}`;
}

function getCandidateModels(): string[] {
  const custom = readEnv("GEMINI_QA_MODEL", "GEMINI_MODEL_FLASH").trim();
  const list = [
    custom,
    "gemini-3-flash-preview",
    "gemini-3.1-pro-preview",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ].filter(Boolean);

  return [...new Set(list)];
}

async function callGeminiApi(
  apiKey: string,
  model: string,
  prompt: string,
  schema: unknown,
  temperature: number,
  timeoutMs: number = GENERATION_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  let isTimedOut = false;
  const timeoutId = setTimeout(() => {
    isTimedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature,
          },
        }),
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini ${model} HTTP ${res.status}: ${text.slice(0, 150)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`Gemini ${model} returned empty content`);
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (isTimedOut || (err instanceof Error && err.name === "AbortError")) {
      throw new Error(`Gemini ${model} timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}

async function generateGroundedWithGemini(
  question: string,
  grounds: RetrievedArticle[],
): Promise<ModelAnswer> {
  const apiKey = readEnv("GEMINI_API_KEY", "GOOGLE_API_KEY", "VITE_GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("MISSING_SECRET:GEMINI_API_KEY");
  }

  const prompt = buildGroundedPrompt(question, grounds);
  const models = getCandidateModels();
  let lastError: unknown = null;

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const timeoutMs = i === 0 ? GENERATION_TIMEOUT_MS : 15000;
    try {
      const rawText = await callGeminiApi(apiKey, model, prompt, GROUNDED_ANSWER_SCHEMA, 0, timeoutMs);
      return JSON.parse(rawText) as ModelAnswer;
    } catch (err) {
      lastError = err;
      console.warn(`[safety-rag-qa] Grounded model ${model} failed, trying next:`, err);
    }
  }

  throw new Error(
    `All candidate models failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function generateGuidanceWithGemini(
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
  partialGrounds: RetrievedArticle[] = [],
): Promise<{ answer: string; confidence?: QaConfidence; needsSafetyOfficerReview?: boolean }> {
  const apiKey = readEnv("GEMINI_API_KEY", "GOOGLE_API_KEY", "VITE_GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("MISSING_SECRET:GEMINI_API_KEY");
  }

  const prompt = buildGuidancePrompt(question, history, partialGrounds);
  const models = getCandidateModels();
  let lastError: unknown = null;

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const timeoutMs = i === 0 ? GENERATION_TIMEOUT_MS : 15000;
    try {
      const rawText = await callGeminiApi(apiKey, model, prompt, GUIDANCE_ANSWER_SCHEMA, 0.3, timeoutMs);
      return JSON.parse(rawText) as {
        answer: string;
        confidence?: QaConfidence;
        needsSafetyOfficerReview?: boolean;
      };
    } catch (err) {
      lastError = err;
      console.warn(`[safety-rag-qa] Guidance model ${model} failed, trying next:`, err);
    }
  }

  throw new Error(
    `All candidate models failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function toRelated(items: RetrievedArticle[]) {
  return items
    .filter((item) => item.ref)
    .slice(0, 5)
    .map((item) => ({
      articleLabel: item.ref!.articleLabel,
      articleTitle: item.ref!.articleTitle,
      docTitle: item.ref!.docTitle,
      sourceUrl: item.ref!.sourceUrl,
      similarity: item.similarity,
    }));
}

function abstain(
  reason: string,
  retrieved: RetrievedArticle[],
  threshold: number,
  startedAt: number,
  extra: Partial<SafetyQaResponse["meta"]> = {},
  answerOverride?: string,
  mode: AnswerMode = "escalation",
): Response {
  const body: SafetyQaResponse = {
    answered: false,
    answerMode: mode,
    answer: answerOverride ?? ABSTAIN_MESSAGE,
    citations: [],
    confidence: "low",
    needsSafetyOfficerReview: true,
    abstainReason: reason,
    relatedArticles: toRelated(retrieved),
    disclaimer: QA_DISCLAIMER,
    meta: {
      retrieved: retrieved.length,
      grounded: 0,
      threshold,
      elapsedMs: Date.now() - startedAt,
      ...extra,
    },
  };
  return jsonResponse(body, 200, { "x-risk-guard-source": "safety-rag-qa" });
}

export async function handleSafetyRagQa(req: Request, options: HandleOptions = {}): Promise<Response> {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST method is allowed.");
  }

  const body = await parseJsonBody<SafetyQaRequest>(req);
  const question = (body?.question ?? "").trim();
  if (!question) {
    return errorResponse(400, "VALIDATION_ERROR", "question is required.");
  }

  const startedAt = Date.now();
  const threshold = body?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const retrieve = options.retrieve ?? retrieveArticles;
  const generateGrounded = options.generate ?? generateGroundedWithGemini;
  const generateGuidance = options.generateGuidance ?? generateGuidanceWithGemini;
  const history = Array.isArray(body?.messages) ? body!.messages! : [];

  // 1) 검색 결과와 무관하게 사람이 즉각 대응해야 하는 초응급/위법판정 질문 필터
  const escalation = detectEscalation(question);

  // 2) 조문 검색 (RAGFlow)
  let retrieved: RetrievedArticle[] = [];
  try {
    retrieved = await retrieve(question, { pageSize: 12 });
  } catch (err) {
    if (err instanceof RagflowError && err.code === "MISSING_SECRET") {
      return errorResponse(503, "MISSING_SECRET:RAGFLOW", err.message);
    }
    // RAGFlow 일시 오류 시에도 안전 가이드로 폴백할 수 있도록 에러 기록 후 빈 배열 유지
    console.warn("[safety-rag-qa] RAGFlow retrieval error, falling back to guidance:", err);
  }

  if (escalation) {
    return abstain(escalation, retrieved, threshold, startedAt, {}, escalation, "escalation");
  }

  // 3) 게이팅 — 법령 인용이 가능한지 확인
  const gate = gateGrounds(retrieved, { threshold, today: options.now });

  if (gate.passed) {
    // 4A) Grounded 모드: 조문 기반 인용 생성 시도
    try {
      const modelAnswer = await generateGrounded(question, gate.grounds);

      if (modelAnswer.answer?.trim()) {
        const verified = verifyCitations(modelAnswer, gate.grounds);
        if (verified.ok) {
          const response: SafetyQaResponse = {
            answered: true,
            answerMode: "grounded",
            answer: modelAnswer.answer.trim(),
            citations: verified.citations,
            confidence: modelAnswer.confidence ?? "high",
            needsSafetyOfficerReview: modelAnswer.needsSafetyOfficerReview ?? false,
            relatedArticles: toRelated(retrieved),
            disclaimer: QA_DISCLAIMER,
            meta: {
              retrieved: retrieved.length,
              grounded: gate.grounds.length,
              ...(verified.droppedCitations.length ? { droppedCitations: verified.droppedCitations } : {}),
              threshold,
              elapsedMs: Date.now() - startedAt,
            },
          };
          return jsonResponse(response, 200, { "x-risk-guard-source": "safety-rag-qa" });
        }
      }
    } catch (err) {
      console.warn("[safety-rag-qa] Grounded generation failed, falling back to guidance:", err);
    }
  }

  // 4B) Guidance 모드: 법령 조문 미달 또는 일반 작업 질문 시 AI 안전 가이드 생성
  try {
    const guidanceResult = await generateGuidance(
      question,
      history,
      gate.partialGrounds ?? retrieved,
    );

    const response: SafetyQaResponse = {
      answered: true,
      answerMode: "guidance",
      answer: guidanceResult.answer.trim(),
      citations: [],
      confidence: guidanceResult.confidence ?? "medium",
      needsSafetyOfficerReview: guidanceResult.needsSafetyOfficerReview ?? false,
      relatedArticles: toRelated(retrieved),
      disclaimer: QA_GUIDANCE_DISCLAIMER,
      meta: {
        retrieved: retrieved.length,
        grounded: 0,
        threshold,
        elapsedMs: Date.now() - startedAt,
      },
    };

    return jsonResponse(response, 200, { "x-risk-guard-source": "safety-rag-qa" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("MISSING_SECRET")) {
      return errorResponse(503, message, "Generation model is not configured.");
    }
    console.warn("[safety-rag-qa] Guidance generation failed, degrading gracefully:", err);

    // AI 생성 실패 시(타임아웃, 업스트림 에러 등) 502 에러로 서버 전체가 죽는 대신
    // 검색된 관련 조문과 함께 안전관리자 확인 안내를 담은 응답(HTTP 200)을 제공하여 UI 정상 유지
    const fallbackReason = `AI 실시간 답변 생성 지연 (${message})`;
    const fallbackAnswer = retrieved.length > 0
      ? `현재 AI 실시간 안전 가이드 생성이 지연되어 검색된 관련 법령 조문을 먼저 표시합니다. 구체적인 안전수칙 및 작업 기준은 아래 관련 조문과 사내 안전관리자의 확인을 거치시기 바랍니다.`
      : `현재 AI 실시간 생성 서비스 응답이 지연되고 있습니다. 작업 전 안전수칙 및 위험요인은 현장 안전관리자 또는 관련 작업 표준지침을 확인해 주시기 바랍니다. (긴급 상황: 119)`;

    return abstain(
      fallbackReason,
      retrieved,
      threshold,
      startedAt,
      { elapsedMs: Date.now() - startedAt },
      fallbackAnswer,
      "guidance",
    );
  }
}

type DenoServeGlobal = {
  serve?: (handler: (req: Request) => Promise<Response> | Response) => unknown;
};
const denoRuntime = (globalThis as { Deno?: DenoServeGlobal }).Deno;
if (denoRuntime?.serve && readEnv("SAFETY_RAG_QA_DISABLE_SERVE") !== "1") {
  denoRuntime.serve(withErrorBoundary(handleSafetyRagQa, "safety-rag-qa"));
}
