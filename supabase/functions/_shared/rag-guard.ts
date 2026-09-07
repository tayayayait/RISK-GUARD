/**
 * 근거 인용 안전 Q&A 의 안전장치.
 *
 * RAG 의 대표적 실패는 "그럴듯한 조문번호를 지어내는 것"이다.
 * 프롬프트로 부탁하는 것만으로는 막히지 않으므로 코드로 강제한다.
 *
 *   1) 게이팅   — 근거가 약하면 아예 생성하지 않는다
 *   2) 인용검증 — 모델이 댄 근거가 실제 검색 결과에 있는지, 인용문이 원문에 있는지 대조
 *   3) 폴백     — 하나라도 실패하면 답변을 버리고 안전관리자 확인으로 넘긴다
 *
 * 안전 정보에서 틀린 답변은 답변이 없는 것보다 나쁘다는 전제로 설계했다.
 */
import type { RetrievedArticle } from "./ragflow-api.ts";

export type QaConfidence = "high" | "medium" | "low";

export interface GateResult {
  passed: boolean;
  reason?: string;
  /** 생성에 실제로 넘길 근거 */
  grounds: RetrievedArticle[];
  /** 기준 미달이지만 검색된 참고용 조문 */
  partialGrounds?: RetrievedArticle[];
}

export interface ModelCitation {
  chunkId: string;
  quote: string;
}

export interface ModelAnswer {
  answer: string;
  citations: ModelCitation[];
  confidence?: QaConfidence;
  needsSafetyOfficerReview?: boolean;
}

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
  similarity: number;
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  citations: VerifiedCitation[];
  droppedCitations: Array<{ chunkId: string; reason: string }>;
}

/** 검색 결과가 이 점수에 못 미치면 생성하지 않는다. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.3;
/** 생성에 넘길 최대 근거 수. 너무 많으면 모델이 엉뚱한 조문을 인용한다. */
export const DEFAULT_MAX_GROUNDS = 5;

/**
 * 검색 결과와 무관하게 항상 안전관리자에게 넘겨야 하는 질문 유형.
 *
 * 법령 조문을 아무리 정확히 인용해도 아래 판단은 챗봇이 대신하면 안 된다.
 * 개인 건강, 특정 사업장의 위법 여부 판정, 작업 중단·재개 결정, 사고 직후 대응.
 */
const ESCALATION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // 순서가 중요하다. 가장 급한 상황을 먼저 잡아야 119 안내가 일반 문구에 가려지지 않는다.
  {
    pattern: /(의식이?\s*없|숨을?\s*안?\s*쉬|심정지|대량\s*출혈|매몰|깔렸|사고.{0,3}(났|발생)|사망|중대재해.{0,3}발생|추락했|쓰러졌)/,
    reason:
      "지금 즉시 119에 신고하고 사업장 비상연락체계에 따라 대응하십시오. " +
      "이 챗봇은 응급 상황을 판단하거나 처치를 안내할 수 없습니다.",
  },
  {
    pattern: /(다쳤|부상|출혈|화상|골절|응급|병원.*가야|아픕니다|아파요|증상|어지럽|메스꺼)/,
    reason: "부상·건강 상태 판단은 챗봇이 대신할 수 없습니다. 의료진과 안전관리자의 확인을 받으십시오.",
  },
  {
    pattern: /(작업.{0,3}중단|작업.{0,3}중지|재개해도|계속해도\s*되|멈춰야\s*하)/,
    reason: "작업 중단·재개 결정은 현장 책임자의 판단 사항입니다. 안전관리자에게 확인하십시오.",
  },
  {
    pattern: /(불법인가|위법인가|법.{0,3}위반|처벌.{0,4}받|과태료.{0,4}나오|벌금.{0,4}얼마|고발|입건)/,
    reason: "특정 사업장의 법 위반 여부 판정은 안전관리자·전문가 또는 관할 기관의 확인이 필요합니다.",
  },
];

export function detectEscalation(question: string): string | null {
  const normalized = question.replace(/\s+/g, " ");
  for (const { pattern, reason } of ESCALATION_PATTERNS) {
    if (pattern.test(normalized)) return reason;
  }
  return null;
}

/**
 * 생성 전 게이팅.
 * 인용 가능한(= 조문 메타데이터가 복원된) 근거만 통과시킨다.
 */
export function gateGrounds(
  retrieved: RetrievedArticle[],
  options: { threshold?: number; maxGrounds?: number; today?: Date } = {},
): GateResult {
  const threshold = options.threshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const maxGrounds = options.maxGrounds ?? DEFAULT_MAX_GROUNDS;
  const today = options.today ?? new Date();

  if (retrieved.length === 0) {
    return { passed: false, reason: "관련 법령 조문을 찾지 못했습니다.", grounds: [], partialGrounds: [] };
  }

  // 조문 메타데이터를 복원하지 못한 청크는 인용할 수 없으므로 근거로 쓰지 않는다.
  const citable = retrieved.filter((item) => item.ref !== null);
  if (citable.length === 0) {
    return { passed: false, reason: "인용 가능한 조문 형태의 근거가 없습니다.", grounds: [], partialGrounds: [] };
  }

  // 아직 시행되지 않은 조문은 현재 기준의 근거가 될 수 없다.
  const effective = citable.filter((item) => {
    const date = item.ref?.effectiveDate;
    if (!date) return true;
    return new Date(date) <= today;
  });
  if (effective.length === 0) {
    return { passed: false, reason: "검색된 조문이 모두 아직 시행 전입니다.", grounds: [], partialGrounds: [] };
  }

  const best = Math.max(...effective.map((item) => item.similarity));
  if (best < threshold) {
    return {
      passed: false,
      reason: `근거 적합도가 기준(${threshold})에 미치지 못합니다. (최고 ${best.toFixed(3)})`,
      grounds: [],
      partialGrounds: effective.slice(0, maxGrounds),
    };
  }

  return { passed: true, grounds: effective.slice(0, maxGrounds), partialGrounds: [] };
}

/** 인용문 대조용 정규화. 공백·따옴표 차이로 인한 오탈락을 막는다. */
function normalizeForMatch(value: string): string {
  return value.replace(/[\s\u200B]+/g, "").replace(/[""''「」『』]/g, "");
}

/**
 * 모델이 낸 인용을 실제 근거와 대조한다.
 *
 * - chunkId 가 실제로 검색된 근거 집합에 있는가
 * - quote 가 해당 조문 원문에 실재하는 문구인가
 *
 * 둘 중 하나라도 어긋난 인용은 버린다. 남은 인용이 0건이면 답변 자체를 폐기한다.
 */
export function verifyCitations(
  modelAnswer: ModelAnswer,
  grounds: RetrievedArticle[],
): VerifyResult {
  const byId = new Map(grounds.map((g) => [g.id, g]));
  const citations: VerifiedCitation[] = [];
  const dropped: Array<{ chunkId: string; reason: string }> = [];

  for (const cited of modelAnswer.citations ?? []) {
    const ground = byId.get(cited.chunkId);
    if (!ground || !ground.ref) {
      dropped.push({ chunkId: cited.chunkId, reason: "검색 결과에 없는 근거를 인용했습니다." });
      continue;
    }

    const quote = (cited.quote ?? "").trim();
    if (!quote) {
      dropped.push({ chunkId: cited.chunkId, reason: "인용문이 비어 있습니다." });
      continue;
    }

    if (!normalizeForMatch(ground.content).includes(normalizeForMatch(quote))) {
      dropped.push({ chunkId: cited.chunkId, reason: "인용문이 조문 원문에 없습니다." });
      continue;
    }

    citations.push({
      chunkId: cited.chunkId,
      quote,
      docTitle: ground.ref.docTitle,
      articleLabel: ground.ref.articleLabel,
      articleTitle: ground.ref.articleTitle,
      section: ground.ref.section,
      effectiveDate: ground.ref.effectiveDate,
      authority: ground.ref.authority,
      sourceUrl: ground.ref.sourceUrl,
      similarity: ground.similarity,
    });
  }

  if (citations.length === 0) {
    return {
      ok: false,
      reason: "검증을 통과한 인용이 없습니다.",
      citations: [],
      droppedCitations: dropped,
    };
  }

  return { ok: true, citations, droppedCitations: dropped };
}

export const ABSTAIN_MESSAGE =
  "현재 확보된 근거로는 확정적으로 답변드리기 어렵습니다. 안전관리자 확인이 필요합니다.";

export const QA_DISCLAIMER =
  "본 답변은 산업안전보건 법령 원문을 검색해 제공하는 참고 정보입니다.\n" +
  "실제 적용은 사업장 상황에 따라 달라질 수 있으므로 최종 판단은 안전관리자·관할 기관 확인을 거치십시오.";

export const QA_GUIDANCE_DISCLAIMER =
  "본 답변은 산업안전보건 AI의 일반 전문 지식에 기반한 안전 가이드 및 체크리스트입니다.\n" +
  "법적 분쟁 예방이나 법적 의무 확인이 필요한 경우 공식 법령 조문 또는 안전보건관리책임자의 확인을 거치십시오.";
