import { describe, expect, it } from "vitest";
import {
  detectEscalation,
  gateGrounds,
  verifyCitations,
  DEFAULT_SIMILARITY_THRESHOLD,
} from "../../supabase/functions/_shared/rag-guard";
import { parseArticleRef } from "../../supabase/functions/_shared/ragflow-api";
import type { RetrievedArticle } from "../../supabase/functions/_shared/ragflow-api";

/** 업로드 스크립트가 생성하는 실제 청크 형식 그대로 */
function chunk(
  id: string,
  articleLabel: string,
  articleTitle: string,
  body: string,
  similarity = 0.5,
  effectiveDate = "2026-03-02",
): RetrievedArticle {
  const content = [
    `[산업안전보건기준에 관한 규칙] ${articleLabel}(${articleTitle})`,
    "소속: 제3편 보건기준 > 제9장 분진에 의한 건강장해의 예방",
    `시행일: ${effectiveDate} · 고용노동부령 제00450호`,
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
    ref: parseArticleRef(content),
  };
}

describe("parseArticleRef", () => {
  it("복원한다: 법령명 / 조문번호 / 제목 / 시행일 / 본문", () => {
    const c = chunk("a1", "제609조", "국소배기장치의 성능", "별표 17에서 정하는 제어풍속 이상의 성능을 갖춘 것이어야 한다.");
    expect(c.ref).not.toBeNull();
    expect(c.ref!.docTitle).toBe("산업안전보건기준에 관한 규칙");
    expect(c.ref!.articleLabel).toBe("제609조");
    expect(c.ref!.articleTitle).toBe("국소배기장치의 성능");
    expect(c.ref!.effectiveDate).toBe("2026-03-02");
    expect(c.ref!.authority).toBe("고용노동부령");
    expect(c.ref!.body).toContain("제어풍속");
    expect(c.ref!.sourceUrl).toContain("law.go.kr");
  });

  it("가지번호 조문(제619조의2)도 인식한다", () => {
    const c = chunk("a2", "제619조의2", "산소 및 유해가스 농도의 측정", "측정하여야 한다.");
    expect(c.ref!.articleLabel).toBe("제619조의2");
  });

  it("형식이 다른 청크는 null 을 반환한다 (인용 근거로 쓰지 않기 위해)", () => {
    expect(parseArticleRef("1. 물체가떨어지거나날아올위험또는근로자가추락할위험이있는작업: 안전모")).toBeNull();
  });
});

describe("detectEscalation", () => {
  it("응급 상황은 119 안내를 우선한다", () => {
    const reason = detectEscalation("동료가 추락해서 의식이 없어요 어떻게 하죠?");
    expect(reason).toContain("119");
  });

  it("부상·건강 질문은 의료진 확인으로 넘긴다", () => {
    expect(detectEscalation("작업 중에 어지럽고 메스꺼운데 계속 일해도 되나요")).toBeTruthy();
  });

  it("법 위반 여부 판정 요청은 거절한다", () => {
    expect(detectEscalation("우리 현장 이거 불법인가요?")).toContain("확인");
  });

  it("일반 법령 질문은 통과시킨다", () => {
    expect(detectEscalation("국소배기장치의 제어풍속 기준이 뭔가요?")).toBeNull();
  });
});

describe("gateGrounds", () => {
  it("검색 결과가 없으면 생성하지 않는다", () => {
    const gate = gateGrounds([]);
    expect(gate.passed).toBe(false);
    expect(gate.grounds).toEqual([]);
  });

  it("조문 형식이 아닌 청크만 있으면 생성하지 않는다", () => {
    const raw: RetrievedArticle = {
      id: "x",
      content: "조문번호없는파편",
      documentId: "d",
      documentKeyword: "",
      importantKeywords: [],
      similarity: 0.9,
      vectorSimilarity: 0.9,
      termSimilarity: 0.9,
      ref: null,
    };
    const gate = gateGrounds([raw]);
    expect(gate.passed).toBe(false);
    expect(gate.reason).toContain("인용 가능한");
  });

  it("최고 유사도가 임계치 미만이면 생성하지 않는다", () => {
    const gate = gateGrounds([chunk("a", "제1조", "목적", "본문", DEFAULT_SIMILARITY_THRESHOLD - 0.05)]);
    expect(gate.passed).toBe(false);
    expect(gate.reason).toContain("적합도");
  });

  it("아직 시행 전인 조문은 근거에서 제외한다", () => {
    const future = chunk("a", "제1조", "목적", "본문", 0.9, "2099-01-01");
    const gate = gateGrounds([future], { today: new Date("2026-08-19") });
    expect(gate.passed).toBe(false);
    expect(gate.reason).toContain("시행 전");
  });

  it("통과 시 근거 수를 제한한다", () => {
    const many = Array.from({ length: 9 }, (_, i) => chunk(`a${i}`, `제${i + 1}조`, "제목", "본문", 0.8));
    const gate = gateGrounds(many, { maxGrounds: 5 });
    expect(gate.passed).toBe(true);
    expect(gate.grounds).toHaveLength(5);
  });
});

describe("verifyCitations — 인용 환각 차단", () => {
  const ground = chunk(
    "chunk-609",
    "제609조",
    "국소배기장치의 성능",
    "제607조 또는 제617조제1항 단서에 따라 설치하는 국소배기장치는 별표 17에서 정하는 제어풍속 이상의 성능을 갖춘 것이어야 한다.",
  );

  it("원문에 실재하는 인용은 통과시키고 조문 메타데이터를 붙인다", () => {
    const result = verifyCitations(
      {
        answer: "제어풍속 이상의 성능을 갖춰야 합니다.",
        citations: [{ chunkId: "chunk-609", quote: "별표 17에서 정하는 제어풍속 이상의 성능을 갖춘 것이어야 한다." }],
      },
      [ground],
    );
    expect(result.ok).toBe(true);
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].articleLabel).toBe("제609조");
    expect(result.citations[0].effectiveDate).toBe("2026-03-02");
  });

  it("★검색 결과에 없는 chunkId 를 인용하면 버린다 (조문번호 지어내기 차단)", () => {
    const result = verifyCitations(
      {
        answer: "제999조에 따라...",
        citations: [{ chunkId: "chunk-999", quote: "지어낸 내용" }],
      },
      [ground],
    );
    expect(result.ok).toBe(false);
    expect(result.droppedCitations[0].reason).toContain("검색 결과에 없는");
  });

  it("★원문에 없는 문구를 인용하면 버린다 (내용 지어내기 차단)", () => {
    const result = verifyCitations(
      {
        answer: "초당 5미터 이상이어야 합니다.",
        citations: [{ chunkId: "chunk-609", quote: "제어풍속은 초당 5미터 이상이어야 한다." }],
      },
      [ground],
    );
    expect(result.ok).toBe(false);
    expect(result.droppedCitations[0].reason).toContain("원문에 없");
  });

  it("공백 차이는 허용한다 (PDF 줄바꿈으로 생긴 공백 때문에 정상 인용이 탈락하면 안 됨)", () => {
    const result = verifyCitations(
      {
        answer: "요약",
        citations: [{ chunkId: "chunk-609", quote: "별표17에서 정하는 제어풍속 이상의   성능을 갖춘 것이어야 한다." }],
      },
      [ground],
    );
    expect(result.ok).toBe(true);
  });

  it("유효한 인용과 무효한 인용이 섞이면 무효만 버리고 답변은 살린다", () => {
    const result = verifyCitations(
      {
        answer: "답변",
        citations: [
          { chunkId: "chunk-609", quote: "별표 17에서 정하는 제어풍속 이상의 성능을 갖춘 것이어야 한다." },
          { chunkId: "chunk-없음", quote: "환각" },
        ],
      },
      [ground],
    );
    expect(result.ok).toBe(true);
    expect(result.citations).toHaveLength(1);
    expect(result.droppedCitations).toHaveLength(1);
  });

  it("인용이 하나도 없으면 답변을 폐기한다", () => {
    const result = verifyCitations({ answer: "근거 없는 답변", citations: [] }, [ground]);
    expect(result.ok).toBe(false);
  });
});
