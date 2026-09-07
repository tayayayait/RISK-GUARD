import { beforeEach, describe, expect, it, vi } from "vitest";
import { SafetyQaService } from "@/services/safetyQaService";
import { invokeBackend } from "@/services/edgeFunctionClient";
import type { SafetyQaResponse } from "@/types/safetyQa";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
}));

describe("SafetyQaService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("올바른 payload와 supabaseFunction 이름으로 safety-rag-qa를 호출한다", async () => {
    const mockResponse: SafetyQaResponse = {
      answered: true,
      answer: "달비계 작업 시 안전대 착용 및 작업발판 설치 기준은 제156조 및 제63조에 따릅니다.",
      citations: [
        {
          chunkId: "chunk-123",
          quote: "안전대를 착용하여야 한다",
          docTitle: "산업안전보건기준에 관한 규칙",
          articleLabel: "제32조",
          articleTitle: "보호구의 지급 등",
          section: "제1편 > 제4장",
          effectiveDate: "2026-03-02",
          authority: "고용노동부령",
          sourceUrl: "https://www.law.go.kr/법령/산업안전보건기준에관한규칙/제32조",
        },
      ],
      confidence: "high",
      needsSafetyOfficerReview: false,
      relatedArticles: [],
      disclaimer: "공식 법령집을 확인하시기 바랍니다.",
      meta: {
        retrieved: 5,
        grounded: 2,
        threshold: 0.3,
        elapsedMs: 2500,
      },
    };

    vi.mocked(invokeBackend).mockResolvedValue(mockResponse);

    const result = await SafetyQaService.askQuestion("달비계 작업 안전대 기준");

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "safety-rag-qa",
        legacyPath: "/safety-rag-qa",
        payload: {
          question: "달비계 작업 안전대 기준",
        },
        timeoutMs: 45000,
      })
    );
    expect(result).toEqual(mockResponse);
    expect(result?.answered).toBe(true);
    expect(result?.citations).toHaveLength(1);
  });

  it("빈 질문을 입력하면 에러를 던진다", async () => {
    await expect(SafetyQaService.askQuestion("   ")).rejects.toThrow(
      "질문 내용을 입력해 주세요."
    );
    expect(invokeBackend).not.toHaveBeenCalled();
  });

  it("옵션(similarityThreshold, timeoutMs)이 주어지면 올바르게 payload에 반영된다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      answered: false,
      answer: "근거 부족으로 답변할 수 없습니다.",
      citations: [],
      confidence: "low",
      needsSafetyOfficerReview: true,
      abstainReason: "최고 유사도 미달",
      relatedArticles: [
        {
          articleLabel: "제42조",
          articleTitle: "추락의 방지",
          docTitle: "산업안전보건기준에 관한 규칙",
          sourceUrl: "https://www.law.go.kr",
          similarity: 0.25,
        },
      ],
      disclaimer: "면책 고지",
      meta: {
        retrieved: 3,
        grounded: 0,
        threshold: 0.4,
        elapsedMs: 1200,
      },
    });

    const result = await SafetyQaService.askQuestion("우주정거장 안전수칙", {
      similarityThreshold: 0.4,
      timeoutMs: 30000,
      messages: [{ role: "user", content: "이전 질문" }, { role: "assistant", content: "이전 답변" }],
      sessionId: "session-abc-123",
    });

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          question: "우주정거장 안전수칙",
          similarityThreshold: 0.4,
          messages: [{ role: "user", content: "이전 질문" }, { role: "assistant", content: "이전 답변" }],
          sessionId: "session-abc-123",
        },
        timeoutMs: 30000,
      })
    );
    expect(result?.answered).toBe(false);
    expect(result?.needsSafetyOfficerReview).toBe(true);
    expect(result?.relatedArticles).toHaveLength(1);
  });
});
