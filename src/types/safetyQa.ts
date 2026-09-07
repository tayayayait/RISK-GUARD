/**
 * M2 근거 인용 안전 Q&A 프론트엔드 타입 정의
 * supabase/functions/safety-rag-qa/index.ts 및 rag-guard.ts 와 1:1 대응
 */

export type QaConfidence = "high" | "medium" | "low";
export type AnswerMode = "grounded" | "guidance" | "escalation";

/** 검증된 법령 인용 항목 */
export interface VerifiedCitation {
  chunkId: string;
  quote: string;
  docTitle: string;
  articleLabel: string;
  articleTitle: string | null;
  section: string | null;
  effectiveDate: string | null;
  authority: string | null;
  sourceUrl: string;
}

/** 관련 조문 항목 (답변 불가 시 또는 참조용) */
export interface RelatedArticle {
  articleLabel: string;
  articleTitle: string | null;
  docTitle: string;
  sourceUrl: string;
  similarity: number;
}

/** 대화 턴 항목 */
export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string;
}

/** 질문 요청 페이로드 */
export interface SafetyQaRequest {
  question: string;
  similarityThreshold?: number;
  /** 멀티턴 대화 히스토리 */
  messages?: ChatTurnMessage[];
  /** 세션 ID */
  sessionId?: string;
}

/** Q&A 응답 페이로드 */
export interface SafetyQaResponse {
  answered: boolean;
  answerMode?: AnswerMode;
  answer: string;
  citations: VerifiedCitation[];
  confidence: QaConfidence;
  needsSafetyOfficerReview: boolean;
  abstainReason?: string;
  relatedArticles: RelatedArticle[];
  disclaimer: string;
  meta: {
    retrieved: number;
    grounded: number;
    droppedCitations?: Array<{ chunkId: string; reason: string }>;
    threshold: number;
    elapsedMs: number;
  };
}

/** UI 대화 메시지 아이템 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  response?: SafetyQaResponse;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
}

/** Supabase에 저장되는 대화 세션 요약 */
export interface SafetyQaSessionSummary {
  id: string;
  sessionId: string;
  title: string;
  lastAnswerMode: AnswerMode;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/** Supabase에 저장되는 대화 세션 상세 */
export interface SafetyQaSessionDetail extends SafetyQaSessionSummary {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    response?: SafetyQaResponse;
  }>;
}

