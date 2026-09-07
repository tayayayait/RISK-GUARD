/**
 * RAGFlow 검색 클라이언트.
 *
 * 이 코퍼스는 `scripts/upload-law-to-ragflow.mjs` 가 조문 1건 = 청크 1건으로 올린 것이다.
 * 청크 본문이 아래 고정 형식이므로 검색 결과에서 인용 메타데이터를 되살릴 수 있다.
 *
 *   [산업안전보건기준에 관한 규칙] 제609조(국소배기장치의 성능)
 *   소속: 제3편 보건기준 > 제9장 분진에 의한 건강장해의 예방 > 제2절 설비 등의 기준
 *   시행일: 2026-03-02 · 고용노동부령 제00450호
 *
 *   <조문 본문>
 *
 * PDF를 RAGFlow 자동 청킹에 맡기면 이 구조가 깨져 "제609조"라고 인용할 근거가 사라진다.
 */
import { readEnv } from "./runtime-env.ts";

export interface RagflowChunk {
  id: string;
  content: string;
  documentId: string;
  documentKeyword: string;
  importantKeywords: string[];
  similarity: number;
  vectorSimilarity: number;
  termSimilarity: number;
}

/** 청크 헤더에서 복원한 법령 인용 정보. */
export interface LawArticleRef {
  docTitle: string;
  articleLabel: string;
  articleTitle: string | null;
  section: string | null;
  effectiveDate: string | null;
  authority: string | null;
  body: string;
  sourceUrl: string;
}

export interface RetrievedArticle extends RagflowChunk {
  ref: LawArticleRef | null;
}

export interface RagflowSearchOptions {
  topK?: number;
  pageSize?: number;
  similarityThreshold?: number;
  /** 벡터 코사인 가중치. 나머지 (1-x) 는 키워드 가중치. 법령은 정확 용어가 중요해 낮게 잡는다. */
  vectorSimilarityWeight?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class RagflowError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "RagflowError";
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

export function resolveRagflowConfig(): { baseUrl: string; apiKey: string; datasetId: string } {
  return {
    baseUrl: (readEnv("RAGFLOW_API_URL", "VITE_RAGFLOW_API_URL") || "").replace(/\/+$/, ""),
    apiKey: readEnv("RAGFLOW_API_KEY", "VITE_RAGFLOW_API_KEY"),
    datasetId: readEnv("RAGFLOW_DATASET_ID", "VITE_RAGFLOW_DATASET_ID"),
  };
}

const HEADER_PATTERN = /^\[([^\]]+)\]\s*(제\d+조(?:의\d+)?)\s*(?:\(([^)]*)\))?/;
const SECTION_PATTERN = /^소속:\s*(.+)$/m;
const EFFECTIVE_PATTERN = /^시행일:\s*(\d{4}-\d{2}-\d{2})(?:\s*·\s*(.+?)\s*제\d+호)?/m;

/**
 * 청크 본문에서 인용 메타데이터를 복원한다.
 * 형식이 맞지 않으면 null 을 반환한다 — 이런 청크는 인용 근거로 쓰지 않는다.
 */
export function parseArticleRef(content: string): LawArticleRef | null {
  const headerMatch = HEADER_PATTERN.exec(content.trim());
  if (!headerMatch) return null;

  const [, docTitle, articleLabel, articleTitle] = headerMatch;
  const section = SECTION_PATTERN.exec(content)?.[1]?.trim() ?? null;
  const effective = EFFECTIVE_PATTERN.exec(content);

  // 헤더 블록(빈 줄 앞)을 제외한 나머지가 조문 본문이다.
  const blankLine = content.indexOf("\n\n");
  const body = (blankLine === -1 ? content : content.slice(blankLine + 2)).trim();

  return {
    docTitle: docTitle.trim(),
    articleLabel,
    articleTitle: articleTitle?.trim() || null,
    section,
    effectiveDate: effective?.[1] ?? null,
    authority: effective?.[2]?.trim() ?? null,
    body,
    sourceUrl: `https://www.law.go.kr/법령/${encodeURIComponent(docTitle.trim())}/${articleLabel}`,
  };
}

export async function retrieveArticles(
  question: string,
  options: RagflowSearchOptions = {},
): Promise<RetrievedArticle[]> {
  const { baseUrl, apiKey, datasetId } = resolveRagflowConfig();
  if (!baseUrl || !apiKey || !datasetId) {
    throw new RagflowError("MISSING_SECRET", "RAGFLOW_API_URL / RAGFLOW_API_KEY / RAGFLOW_DATASET_ID is not configured.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/v1/retrieval`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        question,
        dataset_ids: [datasetId],
        page_size: options.pageSize ?? 12,
        top_k: options.topK ?? 1024,
        similarity_threshold: options.similarityThreshold ?? 0.15,
        vector_similarity_weight: options.vectorSimilarityWeight ?? 0.4,
      }),
      signal: options.signal ?? controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new RagflowError(`HTTP_${res.status}`, text.slice(0, 200));
    }

    const json = await res.json() as {
      code?: number;
      message?: string;
      data?: { chunks?: Array<Record<string, unknown>> };
    };

    if (json.code !== 0) {
      throw new RagflowError(`UPSTREAM_${json.code}`, json.message ?? "RAGFlow retrieval failed");
    }

    return (json.data?.chunks ?? []).map((raw) => {
      const content = String(raw.content ?? "");
      return {
        id: String(raw.id ?? ""),
        content,
        documentId: String(raw.document_id ?? ""),
        documentKeyword: String(raw.document_keyword ?? ""),
        importantKeywords: Array.isArray(raw.important_keywords)
          ? (raw.important_keywords as unknown[]).map(String)
          : [],
        similarity: Number(raw.similarity ?? 0),
        vectorSimilarity: Number(raw.vector_similarity ?? 0),
        termSimilarity: Number(raw.term_similarity ?? 0),
        ref: parseArticleRef(content),
      };
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof RagflowError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new RagflowError("TIMEOUT", `RAGFlow retrieval timed out`);
    }
    throw new RagflowError("NETWORK_ERROR", err instanceof Error ? err.message : String(err));
  }
}
