import { describe, expect, it, vi } from "vitest";
import { handleSafetyRagQa } from "../../supabase/functions/safety-rag-qa/index";
import type { RetrievedArticle } from "../../supabase/functions/_shared/ragflow-api";

function createMockArticle(
  id: string,
  articleLabel: string,
  articleTitle: string,
  body: string,
  similarity = 0.8,
): RetrievedArticle {
  const content = [
    `[산업안전보건기준에 관한 규칙] ${articleLabel}(${articleTitle})`,
    "소속: 제3편 보건기준 > 제9장",
    "시행일: 2026-03-02 · 고용노동부령 제00450호",
    "",
    body,
  ].join("\n");

  return {
    id,
    content,
    documentId: "doc-1",
    documentKeyword: "산업안전보건기준에 관한 규칙",
    importantKeywords: [],
    similarity,
    vectorSimilarity: similarity,
    termSimilarity: similarity,
    ref: {
      docTitle: "산업안전보건기준에 관한 규칙",
      articleLabel,
      articleTitle,
      section: "제3편 > 제9장",
      effectiveDate: "2026-03-02",
      authority: "고용노동부령",
      body,
      sourceUrl: `https://www.law.go.kr/법령/산업안전보건기준에관한규칙/${encodeURIComponent(articleLabel)}`,
    },
  };
}

describe("handleSafetyRagQa", () => {
  it("OPTIONS 요청에 200 CORS preflight 응답을 반환한다", async () => {
    const req = new Request("http://localhost/safety-rag-qa", { method: "OPTIONS" });
    const res = await handleSafetyRagQa(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("POST가 아닌 메소드는 405 METHOD_NOT_ALLOWED를 반환한다", async () => {
    const req = new Request("http://localhost/safety-rag-qa", { method: "GET" });
    const res = await handleSafetyRagQa(req);
    expect(res.status).toBe(405);
  });

  it("질문이 비어있으면 400 VALIDATION_ERROR를 반환한다", async () => {
    const req = new Request("http://localhost/safety-rag-qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "   " }),
    });
    const res = await handleSafetyRagQa(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error?.code).toBe("VALIDATION_ERROR");
  });

  it("응급 질문(119 필요 상황)은 즉시 에스컬레이션 응답을 반환한다", async () => {
    const req = new Request("http://localhost/safety-rag-qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "작업자가 추락해서 의식이 없어요 119 불러야 하나요" }),
    });
    const res = await handleSafetyRagQa(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answered).toBe(false);
    expect(data.answerMode).toBe("escalation");
    expect(data.answer).toContain("119");
  });

  it("근거 조문이 충분하고 인용이 유효하면 grounded 모드로 응답한다", async () => {
    const mockGround = createMockArticle(
      "chunk-609",
      "제609조",
      "국소배기장치의 성능",
      "별표 17에서 정하는 제어풍속 이상의 성능을 갖춘 것이어야 한다.",
      0.85,
    );

    const req = new Request("http://localhost/safety-rag-qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "국소배기장치 제어풍속 기준이 어떻게 되나요?" }),
    });

    const res = await handleSafetyRagQa(req, {
      retrieve: vi.fn().mockResolvedValue([mockGround]),
      generate: vi.fn().mockResolvedValue({
        answer: "국소배기장치는 제어풍속 이상의 성능을 갖추어야 합니다.",
        citations: [
          {
            chunkId: "chunk-609",
            quote: "별표 17에서 정하는 제어풍속 이상의 성능을 갖춘 것이어야 한다.",
          },
        ],
        confidence: "high",
        needsSafetyOfficerReview: false,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answered).toBe(true);
    expect(data.answerMode).toBe("grounded");
    expect(data.citations).toHaveLength(1);
    expect(data.citations[0].articleLabel).toBe("제609조");
  });

  it("법령 검색 결과가 없거나 임계치 미만일 때 guidance 모드로 안전 가이드를 생성한다", async () => {
    const req = new Request("http://localhost/safety-rag-qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "반도체 클린룸 청소 시 주의할 안전수칙을 알려주세요." }),
    });

    const res = await handleSafetyRagQa(req, {
      retrieve: vi.fn().mockResolvedValue([]),
      generateGuidance: vi.fn().mockResolvedValue({
        answer: "반도체 클린룸 청소 시 안전수칙:\n1. 정전기 방지복 착용\n2. 환기 상태 확인",
        confidence: "medium",
        needsSafetyOfficerReview: false,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answered).toBe(true);
    expect(data.answerMode).toBe("guidance");
    expect(data.answer).toContain("반도체 클린룸");
  });

  it("AI 생성 API가 실패(타임아웃, Abort 등)해도 502가 아니라 안내 메시지와 관련 조문 목록을 200으로 반환한다", async () => {
    const mockGround = createMockArticle(
      "chunk-100",
      "제100조",
      "의자 등",
      "사업주는 앉아서 하는 작업에 의자를 지급하여야 한다.",
      0.4,
    );

    const req = new Request("http://localhost/safety-rag-qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "현장 의자 지급 기준" }),
    });

    const res = await handleSafetyRagQa(req, {
      retrieve: vi.fn().mockResolvedValue([mockGround]),
      generate: vi.fn().mockRejectedValue(new Error("Gemini gemini-3-flash-preview timed out after 25000ms")),
      generateGuidance: vi.fn().mockRejectedValue(new Error("Gemini gemini-3-flash-preview timed out after 25000ms")),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answered).toBe(false);
    expect(data.needsSafetyOfficerReview).toBe(true);
    expect(data.relatedArticles).toHaveLength(1);
    expect(data.relatedArticles[0].articleLabel).toBe("제100조");
  });
});
