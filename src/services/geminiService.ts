import type {
  ImmediateAction,
  Improvement,
  ProfileConfidence,
  WorkProfile,
} from "@/types/assessment";
import { invokeBackend } from "@/services/edgeFunctionClient";

export interface AnalyzeTaskInput {
  taskName: string;
  taskDescription: string;
  siteName?: string;
  workDate?: string;
  photos?: File[];
  formType?: "risk-assessment" | "accident-report";
  formTemplateHint?: string;
}

export interface GeminiAnalyzeResult {
  profile: WorkProfile;
  profileConfidence: ProfileConfidence;
  scenario: string;
  immediateActions: ImmediateAction[];
  improvements: Improvement[];
  briefingDraft: string;
}

const DEFAULT_MAX_RETRY_COUNT = 2;
const FORM_AUTOFILL_MAX_RETRY_COUNT = 0;
const RETRY_DELAY_MS = 1200;
const GEMINI_ANALYZE_TIMEOUT_MS = 60000;
const FORM_AUTOFILL_TIMEOUT_MS = 60000;
const ANALYSIS_FAILURE_MESSAGE =
  "AI 분석 실패: Gemini 응답을 확보하지 못했습니다. 목업 데이터는 사용하지 않습니다.";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveAnalyzeBackend(input: AnalyzeTaskInput) {
  if (input.formType) {
    return {
      supabaseFunction: "form-autofill-analyze",
      legacyPath: "/form-autofill/analyze",
      timeoutMs: FORM_AUTOFILL_TIMEOUT_MS,
    };
  }

  return {
    supabaseFunction: "gemini-analyze",
    legacyPath: "/gemini/analyze",
    timeoutMs: GEMINI_ANALYZE_TIMEOUT_MS,
  };
}

function resolveRetryLimit(input: AnalyzeTaskInput) {
  return input.formType ? FORM_AUTOFILL_MAX_RETRY_COUNT : DEFAULT_MAX_RETRY_COUNT;
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.startsWith("Timeout:") || error.message.includes("UPSTREAM_TIMEOUT");
}

async function analyzeTaskByProxy(input: AnalyzeTaskInput) {
  const backend = resolveAnalyzeBackend(input);

  return invokeBackend<GeminiAnalyzeResult>({
    supabaseFunction: backend.supabaseFunction,
    legacyPath: backend.legacyPath,
    timeoutMs: backend.timeoutMs,
    throwOnError: true,
    payload: {
      taskName: input.taskName,
      taskDescription: input.taskDescription,
      siteName: input.siteName,
      workDate: input.workDate,
      photoCount: input.photos?.length ?? 0,
      formType: input.formType,
      formTemplateHint: input.formTemplateHint,
    },
  });
}

export const GeminiService = {
  async analyzeTask(input: AnalyzeTaskInput): Promise<GeminiAnalyzeResult> {
    let lastError: unknown = null;
    const maxRetryCount = resolveRetryLimit(input);

    for (let attempt = 0; attempt <= maxRetryCount; attempt += 1) {
      try {
        const proxyResult = await analyzeTaskByProxy(input);
        if (proxyResult) {
          return proxyResult;
        }

        throw new Error("EMPTY_GEMINI_RESPONSE");
      } catch (error) {
        lastError = error;
        if (isTimeoutError(error)) {
          break;
        }

        if (attempt < maxRetryCount) {
          console.warn(`[GeminiService] Gemini analysis failed (attempt ${attempt + 1}). Retrying...`, error);
          await sleep(RETRY_DELAY_MS);
          continue;
        }
      }
    }

    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${ANALYSIS_FAILURE_MESSAGE} (${reason})`);
  },
};
