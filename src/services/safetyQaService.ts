import { invokeBackend } from "@/services/edgeFunctionClient";
import type { ChatTurnMessage, SafetyQaRequest, SafetyQaResponse } from "@/types/safetyQa";

const SAFETY_QA_TIMEOUT_MS = 45000;

export interface SafetyQaOptions {
  similarityThreshold?: number;
  timeoutMs?: number;
  messages?: ChatTurnMessage[];
  sessionId?: string;
}

export const SafetyQaService = {
  /**
   * 산업안전보건 AI Q&A 질의 (하이브리드 법령 RAG + 일반 안전 가이드)
   * @param question 사용자 질문
   * @param options 검색 옵션 및 멀티턴 대화 히스토리
   */
  async askQuestion(
    question: string,
    options?: SafetyQaOptions,
  ): Promise<SafetyQaResponse | null> {
    const trimmed = question.trim();
    if (!trimmed) {
      throw new Error("질문 내용을 입력해 주세요.");
    }

    const payload: SafetyQaRequest = {
      question: trimmed,
      ...(options?.similarityThreshold !== undefined
        ? { similarityThreshold: options.similarityThreshold }
        : {}),
      ...(options?.messages && options.messages.length > 0
        ? { messages: options.messages.slice(-8) }
        : {}),
      ...(options?.sessionId ? { sessionId: options.sessionId } : {}),
    };

    return invokeBackend<SafetyQaResponse>({
      supabaseFunction: "safety-rag-qa",
      legacyPath: "/safety-rag-qa",
      payload,
      timeoutMs: options?.timeoutMs ?? SAFETY_QA_TIMEOUT_MS,
    });
  },
};
