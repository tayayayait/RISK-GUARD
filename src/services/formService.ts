import { normalizeHazardType } from "../../supabase/functions/_shared/hazard-taxonomy.ts";
import { HAZARD_ARTICLE_MAP } from "../../supabase/functions/_shared/hazard-article-map.ts";
import type { AssessmentData, EvidenceItem, HazardItem, LawActionItem } from "@/types/assessment";
import type { CompanyProfile } from "@/types/companyProfile";
import type {
  AccidentReportData,
  RiskAssessmentRow,
  RiskRowValidationEvent,
  RiskRowValidationSummary,
  RiskValidationField,
  RiskValidationStatus,
} from "@/types/formTemplate";

const STANDARDS_RULES_LAW_NAME = "산업안전보건기준에 관한 규칙";
const ARTICLE_NUMBER_PATTERN = /(제\s*\d+\s*조(?:의\s*\d+)?)/;
const STRICT_LEGAL_BASIS_PATTERN = /^산업안전보건기준에 관한 규칙 제\d+조\([^)]+\)$/;
const LEGAL_BASIS_MIN_SCORE = 94;
const LEGAL_BASIS_MIN_SCORE_FALLBACK = 80;
const LEGAL_BASIS_REQUIRED_HAZARD_TOKEN_MATCHES = 1;
const LEGAL_BASIS_REQUIRED_HAZARD_TOKEN_MATCHES_STRICT = 2;
const LEGAL_BASIS_STRICT_HAZARD_TOKEN_THRESHOLD = 5;
const LEGAL_BASIS_REQUIRED_ROW_SPECIFIC_TOKEN_MATCHES = 1;
const LEGAL_BASIS_ROW_SPECIFIC_TOKEN_THRESHOLD = 2;
const LEGAL_BASIS_CONFLICT_PENALTY = 28;
const LEGAL_BASIS_GENERIC_PENALTY = 10;
const LEGAL_BASIS_LOW_DENSITY_PENALTY = 8;
const LEGAL_BASIS_CONTEXT_MATCH_SCORE = {
  equipment: 9,
  situation: 7,
  target: 5,
  action: 6,
  risk: 9,
} as const;
const LEGAL_BASIS_CONTEXT_CONFLICT_PENALTY_STRONG = 36;
const LEGAL_BASIS_CONTEXT_CONFLICT_PENALTY_SOFT = 18;
const LEGAL_BASIS_CONTEXT_HINT_PATTERN = /(설비|장비|공정|작업|작업유형|equipment|process|industry|location)/i;
const LEGAL_BASIS_GENERIC_CONTEXT_TOKENS = new Set(
  [
    "작업",
    "위험",
    "관리",
    "점검",
    "공정",
    "현장",
    "유형",
    "작업유형",
    "process",
    "equipment",
    "industry",
    "location",
  ].map((token) => toCompact(token)),
);
const LEGAL_BASIS_ROW_GENERIC_TOKENS = new Set(
  [
    "위험",
    "요인",
    "원인",
    "작업",
    "현장",
    "작업자",
    "미흡",
    "부족",
    "불량",
    "관리",
    "조치",
    "개선",
  ].map((token) => toCompact(token)),
);
const HAZARD_ARTICLE_MAP_KEY_ALIASES: Record<string, string[]> = {
  추락: ["고소작업", "비계", "발판", "고정불량"],
  "절단/베임": ["절단"],
};
const MEASURE_MAX_LENGTH = 60;
const MEASURE_DUPLICATE_THRESHOLD = 0.85;
const MEASURE_ROW_DIVERSITY_THRESHOLD = 0.76;
const MEASURE_CROSS_FIELD_SIMILARITY_THRESHOLD = 0.72;
const MEASURE_FRAGMENT_ENDING_PATTERN = /(및|후|또는|중)$/;
const MEASURE_ACTION_STEM_PATTERN = /(확인|점검|유지|실시|적용|강화|완료|정리|통제)$/;
const MEASURE_SENTENCE_END_PATTERN = /(한다|했다|됨|다)$/;

const ARTICLE_TITLE_FALLBACKS = new Map<string, string>();
for (const entries of Object.values(HAZARD_ARTICLE_MAP)) {
  for (const entry of entries) {
    ARTICLE_TITLE_FALLBACKS.set(entry.article, entry.title);
  }
}

export const RISK_CATEGORY_OPTIONS = [
  "기계적 요인",
  "작업특성 요인",
  "인적 요인",
  "환경적 요인",
  "관리적 요인",
  "전기적 요인",
] as const;

export type RiskCategoryOption = (typeof RISK_CATEGORY_OPTIONS)[number];

const RISK_CATEGORY_SET = new Set<string>(RISK_CATEGORY_OPTIONS);

const ELECTRICAL_CATEGORY_STRONG_HINTS = [
  "감전",
  "누전",
  "절연",
  "충전부",
  "접지",
  "통전",
];

const ELECTRICAL_CATEGORY_WEAK_HINTS = [
  "전원 차단",
  "전원 격리",
  "전원 공급",
  "배선",
  "전기",
  "전선",
];

const MANAGEMENT_CATEGORY_HINTS = [
  "점검 미흡",
  "점검부족",
  "작업계획",
  "작업허가",
  "작업허가서",
  "작업절차 미준수",
  "작업절차 미이행",
  "관리감독",
  "감독부족",
  "신호수 미배치",
  "유도자 미배치",
  "작업구역 미분리",
  "잠금표지 미실시",
  "교육 미흡",
  "교육부족",
  "통제 미흡",
  "규정 미준수",
  "비계 고정 점검 미흡",
  "작업발판 고정 점검 미흡",
];

const HUMAN_CATEGORY_HINTS = [
  "부주의",
  "실수",
  "피로",
  "무리하게",
  "성급",
  "임의조작",
  "무리한 자세",
  "안전수칙 위반",
  "보호구 미착용",
  "안전대 미착용",
  "불안정한 자세",
  "몸을 앞으로",
  "경험 부족",
];

const LEGACY_CATEGORY_ALIAS_MAP: Record<string, RiskCategoryOption> = {
  기계적요인: "기계적 요인",
  작업특성요인: "작업특성 요인",
  인적요인: "인적 요인",
  환경적요인: "환경적 요인",
  관리적요인: "관리적 요인",
  전기적요인: "전기적 요인",
  추락: "작업특성 요인",
  붕괴: "작업특성 요인",
  질식: "작업특성 요인",
  감전: "전기적 요인",
  끼임말림: "기계적 요인",
  절단: "기계적 요인",
  낙하물비래: "기계적 요인",
  차량이동장비충돌: "기계적 요인",
  화학노출: "환경적 요인",
};

const HAZARD_KEYWORD_MAP: Record<string, string[]> = {
  추락: [
    "추락",
    "고소",
    "비계",
    "발판",
    "안전대",
    "안전대 미착용",
    "보호구 미착용",
    "몸을 앞으로",
    "불안정한 자세",
    "중심 상실",
    "비계 고정",
    "작업발판 고정",
    "고정 상태 점검 미흡",
  ],
  붕괴: ["붕괴", "무너짐", "지지", "구조물"],
  질식: ["질식", "산소결핍", "밀폐공간", "환기"],
  "폭발/화재": ["폭발", "화재", "점화", "가연성"],
  감전: [
    "감전",
    "충전부",
    "전원 차단",
    "전원 격리",
    "전원 공급",
    "절연",
    "누전",
    "통전",
    "분전반",
    "배전반",
    "배선",
    "전선",
    "차단기",
    "누전차단기",
  ],
  "끼임/말림": ["끼임", "말림", "회전부", "롤러"],
  절단: ["절단", "베임", "커팅", "날"],
  "낙하물/비래": ["낙하물", "비래", "상부", "충돌"],
  "차량/이동장비 충돌": ["차량", "이동장비", "충돌", "지게차"],
  화학노출: ["화학", "유해물질", "노출", "흡입"],
  "소음/분진/반복작업": ["소음", "분진", "반복", "진동"],
};

const HAZARD_STRICT_SCORE_EXCLUSION_KEYWORDS = new Set(["전원"]);

const RISK_ROW_VALIDATION_FIELDS: RiskValidationField[] = [
  "category",
  "cause",
  "hazardFactor",
  "currentMeasure",
  "reductionMeasure",
  "legalBasis",
];

type ContextAxis = "equipment" | "situation" | "target" | "action" | "risk";
interface ContextRule {
  token: string;
  patterns: RegExp[];
}
interface ContextAxes {
  equipment: string[];
  situation: string[];
  target: string[];
  action: string[];
  risk: string[];
}

const EQUIPMENT_CONTEXT_RULES: ContextRule[] = [
  { token: "vehicle_equipment", patterns: [/지게차|차량계|차량|운반기계|이동장비|트럭|굴착기|로더|크레인/i] },
  { token: "rotating_machine", patterns: [/회전부|회전체|회전축|롤러|컨베이어|벨트|체인|기어|풀리/i] },
  { token: "electrical_equipment", patterns: [/충전부|분전반|배전반|누전차단기|차단기|배선|전선|전원(?:\s*(?:차단|격리|공급|케이블|상태|투입)|선)|절연|통전/i] },
  { token: "height_platform", patterns: [/비계|작업발판|고소작업대|사다리|안전대|난간/i] },
  { token: "chemical_equipment", patterns: [/용제|화학|약품|탱크|배관|msds/i] },
];

const SITUATION_CONTEXT_RULES: ContextRule[] = [
  { token: "proximity_zone", patterns: [/사이|벽체|근접|접근|협소|좁은|근거리|가까이/i] },
  { token: "area_separation_missing", patterns: [/작업구역.*분리.*(미흡|부족|없|불명확)|동선.*분리.*(미흡|부족|없)|분리.*명확하지 않/i] },
  { token: "guide_missing", patterns: [/유도자.*(미배치|없|부재)|신호수.*(미배치|없|부재)|유도.*없이/i] },
  { token: "inspection_missing", patterns: [/점검.*(미흡|누락|부족|미실시)|확인.*(누락|없이|미흡)|절차.*(누락|미준수)/i] },
  { token: "power_not_isolated", patterns: [/전원.*(차단.*없이|미차단)|통전.*상태|활선/i] },
];

const TARGET_CONTEXT_RULES: ContextRule[] = [
  { token: "worker_target", patterns: [/작업자|근로자|보행자|인원|피재자|동료/i] },
  { token: "material_target", patterns: [/자재|화물|적재물|물체|하중/i] },
];

const ACTION_CONTEXT_RULES: ContextRule[] = [
  { token: "transport_operation", patterns: [/운반|이송|상하차|적치|주행|후진|전진/i] },
  { token: "approach_operation", patterns: [/접근|근접|다가가|확인.*위해/i] },
  { token: "machine_maintenance", patterns: [/정비|점검|보수|교체|수리/i] },
  { token: "height_work", patterns: [/고소작업|비계|발판|난간|안전대/i] },
  { token: "electrical_work", patterns: [/전원(?:\s*(?:차단|격리|공급|케이블|상태|투입)|선)|충전부|활선|통전|절연|분전반|배전반|배선|전선|차단기/i] },
];

const RISK_CONTEXT_RULES: ContextRule[] = [
  { token: "contact_entrapment", patterns: [/협착|끼임|치임|접촉|충돌|부딪|사이/i] },
  { token: "rotating_entrapment", patterns: [/회전부|회전체|회전축|롤러|말림/i] },
  { token: "fall_risk", patterns: [/추락|전도|미끄러|낙상/i] },
  { token: "electric_shock", patterns: [/감전|누전|충전부|통전|분전반|배전반|배선|전선|차단기|절연|전원(?:\s*(?:차단|격리|공급|케이블|상태|투입)|선)/i] },
  { token: "chemical_exposure", patterns: [/화학|유해물질|노출|흡입|용제/i] },
  { token: "fire_explosion", patterns: [/폭발|화재|인화|발화|점화/i] },
  { token: "collapse_risk", patterns: [/붕괴|붕락|무너지|매몰/i] },
];

const MEASURE_FOCUS_PHRASE_BY_AXIS_TOKEN: Record<string, string> = {
  area_separation_missing: "동선 분리",
  guide_missing: "유도자 배치",
  inspection_missing: "사전 점검",
  power_not_isolated: "전원 격리",
  proximity_zone: "근접 접근",
  transport_operation: "운반 동선",
  approach_operation: "접근 절차",
  machine_maintenance: "점검·정비 절차",
  height_work: "고소 작업 구간",
  electrical_work: "전기 작업 구간",
  vehicle_equipment: "이동장비 구간",
  rotating_machine: "회전부 구간",
  electrical_equipment: "충전부 구간",
  height_platform: "비계·발판",
  chemical_equipment: "화학물질 취급",
  contact_entrapment: "접촉·충돌 위험",
  rotating_entrapment: "회전부 끼임 위험",
  fall_risk: "추락 위험",
  electric_shock: "감전 위험",
  chemical_exposure: "화학노출 위험",
  fire_explosion: "폭발·화재 위험",
  collapse_risk: "붕괴 위험",
};

const TASK_CONTEXT_STOPWORDS = new Set(
  [
    "작업",
    "작업자",
    "현장",
    "상태",
    "위험",
    "요인",
    "및",
    "또는",
    "수",
    "있음",
    "있는",
    "위해",
  ].map((token) => token.toLowerCase()),
);

const TASK_CONTEXT_ELECTRICAL_KEYWORDS = [
  "분전반",
  "배전반",
  "배선",
  "전선",
  "차단기",
  "누전차단기",
  "충전부",
  "전원 차단",
  "전원 격리",
  "전원 공급",
  "전원선",
  "절연",
  "통전",
  "누전",
] as const;

const RISK_HAZARD_CONTEXT_ALIGNMENT_MIN_SCORE = 12;

interface TaskContextProfile {
  hazardTypes: string[];
  contextTokens: string[];
  axes: ContextAxes;
  primaryHazardType: string;
}

const BROAD_WORK_PROCESS_LABELS = new Set([
  "건설업",
  "제조업",
  "물류업",
  "화학업",
  "서비스업",
  "기타",
]);

const WORK_PROCESS_LABEL_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(절단|커팅)/, label: "절단" },
  { pattern: /(용접|절곡)/, label: "용접" },
  { pattern: /(도장|분사)/, label: "도장" },
  { pattern: /(조립|체결)/, label: "조립" },
  { pattern: /(점검|정비|보수|교체)/, label: "설비 점검" },
  { pattern: /(운반|이송|상하차)/, label: "자재 운반" },
  { pattern: /(청소|정리)/, label: "청소" },
  { pattern: /(설치|해체)/, label: "설치/해체" },
];

const HAZARD_FACTOR_CATEGORY_MAP: Record<string, RiskCategoryOption> = {
  감전: "전기적 요인",
  화학노출: "환경적 요인",
  추락: "작업특성 요인",
  붕괴: "작업특성 요인",
  질식: "작업특성 요인",
  "폭발/화재": "작업특성 요인",
  "소음/분진/반복작업": "환경적 요인",
  "끼임/말림": "기계적 요인",
  절단: "기계적 요인",
  "낙하물/비래": "기계적 요인",
  "차량/이동장비 충돌": "기계적 요인",
};

const RISK_CAUSE_MIN_LENGTH = 18;
const RISK_CAUSE_MAX_LENGTH = 56;
const RISK_HAZARD_FACTOR_MIN_LENGTH = 12;
const RISK_HAZARD_FACTOR_MAX_LENGTH = 36;
const RISK_ROW_MIN_COUNT = 2;
const RISK_ROW_MAX_COUNT = 3;
const RISK_ROW_PREFERRED_COUNT = 3;
const INCIDENT_SIGNAL_SIMILARITY_THRESHOLD = 0.72;
const INCIDENT_SIGNAL_STRONG_SIMILARITY_THRESHOLD = 0.84;
const INCIDENT_SIGNAL_MAX_CLAUSE_LENGTH = 160;
const NARRATIVE_REWRITE_SIMILARITY_STRICT = 0.72;
const NARRATIVE_REWRITE_SIMILARITY_SHORT = 0.62;
const NARRATIVE_ROW_DUPLICATE_THRESHOLD = 0.76;
const NARRATIVE_FAILURE_SIGNAL_PATTERN =
  /(미흡|미착용|미사용|미준수|미확인|미차단|미설치|개방|해체|누락|불량|근접|접촉|충돌|방호|격리|비산|낙하|노출|통제)/i;
const INCIDENT_CONNECTOR_SPLIT_PATTERN =
  /(?:[.!?]\s*|\n+|;\s*|,\s*(?=[가-힣A-Za-z])|\s+(?:그리고|또한|다만|및|또는|and|while|with|without|during|where|when|then)\s+)/gi;
const INCIDENT_SIGNAL_TRIGGER_SPLIT_PATTERN =
  /\s+(?=(?:지게차|차량|이동장비|후진|롤러|회전부|blade|cutter|steel|fragment|guard|충돌|끼임|말림|감전|절단|추락|붕괴|질식|폭발|화재|화학|노출))/gi;
const NARRATIVE_INCOMPLETE_ENDING_TOKENS = new Set([
  "및",
  "또는",
  "중",
  "후",
  "때",
  "으로",
  "에서",
  "에게",
  "와",
  "과",
  "하고",
  "하며",
]);
const CONTEXT_ANCHOR_STOPWORDS = new Set(
  [
    "작업",
    "작업자",
    "현장",
    "상태",
    "위험",
    "요인",
    "진행",
    "worker",
    "work",
    "works",
    "during",
    "while",
    "with",
    "without",
    "using",
    "uses",
    "task",
    "operation",
  ].map((token) => token.toLowerCase()),
);

function pickScenarioSeed(taskDescription: string, workProcess: string) {
  const normalized = normalizeSpace(taskDescription ?? "");
  if (normalized) {
    const firstSentence = normalizeSpace((normalized.split(/[.!?]/)[0] ?? ""));
    if (firstSentence.length >= 12) {
      return firstSentence.slice(0, 80);
    }
  }

  return normalizeSpace(workProcess) || "작업 중";
}

function truncateAtBoundary(text: string, maxLength: number) {
  const normalized = normalizeSpace(text);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength);
  const punctuationIndexes = [sliced.lastIndexOf("."), sliced.lastIndexOf("!"), sliced.lastIndexOf("?")];
  const lastPunctuation = Math.max(...punctuationIndexes);
  if (lastPunctuation >= Math.floor(maxLength * 0.55)) {
    return sliced.slice(0, lastPunctuation).trim();
  }

  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace > Math.floor(maxLength * 0.6)) {
    return sliced.slice(0, lastSpace).trim();
  }

  return "";
}

function trimIncompleteEnding(text: string) {
  let normalized = normalizeSpace(text).replace(/[.!?]+$/g, "");
  if (!normalized) {
    return "";
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && NARRATIVE_INCOMPLETE_ENDING_TOKENS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join(" ").trim();
}

function trimDanglingSingleCharToken(text: string) {
  const tokens = normalizeSpace(text).split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) {
    return tokens.join(" ");
  }

  const lastToken = tokens[tokens.length - 1];
  if (lastToken.length === 1) {
    tokens.pop();
  }
  return tokens.join(" ").trim();
}

function appendWithLimit(prefix: string, suffix: string, maxLength: number) {
  const cleanPrefix = trimIncompleteEnding(prefix);
  const cleanSuffix = normalizeSpace(suffix);
  if (!cleanSuffix) {
    return truncateAtBoundary(cleanPrefix, maxLength);
  }

  if (!cleanPrefix) {
    return truncateAtBoundary(cleanSuffix, maxLength);
  }

  const merged = `${cleanPrefix} ${cleanSuffix}`.trim();
  if (merged.length <= maxLength) {
    return merged;
  }

  const reserved = cleanSuffix.length + 1;
  const availablePrefixLength = maxLength - reserved;
  if (availablePrefixLength < 8) {
    return truncateAtBoundary(cleanSuffix, maxLength);
  }

  const truncatedPrefix = truncateAtBoundary(cleanPrefix, availablePrefixLength);
  const fallbackPrefix = trimDanglingSingleCharToken(cleanPrefix.slice(0, availablePrefixLength));
  const safePrefix = trimIncompleteEnding(truncatedPrefix || fallbackPrefix);
  if (!safePrefix) {
    return truncateAtBoundary(cleanSuffix, maxLength);
  }
  return `${safePrefix} ${cleanSuffix}`.trim();
}

function ensureSentence(text: string, fallbackTail: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return fallbackTail;
  }

  if (/(수 있음|위험|우려|발생|가능)/.test(normalized)) {
    return normalized;
  }

  return `${normalized} ${fallbackTail}`;
}

function buildHazardFactorFallback(hazardType: string, hazardName: string) {
  const base = normalizeSpace(hazardName);
  const anchor = base || "안전통제 미흡 상태";

  if (hazardType === "추락") return `${anchor}로 인한 추락 위험 증가`;
  if (hazardType === "감전") return `${anchor}로 인한 감전 위험 증가`;
  if (hazardType === "끼임/말림") return `${anchor}로 인한 끼임·말림 위험 증가`;
  if (hazardType === "절단") return `${anchor}로 인한 절단 위험 증가`;
  if (hazardType === "낙하물/비래") return `${anchor}로 인한 낙하물 충돌 위험 증가`;
  if (hazardType === "차량/이동장비 충돌") return `${anchor}로 인한 이동장비 충돌 위험 증가`;
  if (hazardType === "붕괴") return `${anchor}로 인한 붕괴 위험 증가`;
  if (hazardType === "질식") return `${anchor}로 인한 질식 위험 증가`;
  if (hazardType === "폭발/화재") return `${anchor}로 인한 폭발·화재 위험 증가`;
  if (hazardType === "화학노출") return `${anchor}로 인한 화학노출 위험 증가`;

  return `${anchor}로 인한 작업 중 부상 위험 증가`;
}

function finalizeCauseNarrative(text: string) {
  const withMechanism = ensureSentence(text, "사고가 발생할 수 있음");
  const trimmed = truncateAtBoundary(withMechanism, RISK_CAUSE_MAX_LENGTH);
  const normalized = trimIncompleteEnding(trimmed || withMechanism);
  if (!normalized) {
    return "작업 조건이 통제되지 않아 사고가 발생할 수 있음";
  }

  if (/(수 있음|우려됨|가능함|발생 가능)$/.test(normalized)) {
    return truncateAtBoundary(normalized, RISK_CAUSE_MAX_LENGTH);
  }

  return appendWithLimit(normalized, "사고가 발생할 수 있음", RISK_CAUSE_MAX_LENGTH);
}

function finalizeHazardFactorNarrative(text: string) {
  const normalized = trimIncompleteEnding(text);
  if (!normalized) {
    return "위험요인 통제 미흡으로 위험 증가";
  }

  if (/(위험 증가|위험 존재|위험 높음|우려 증가)$/.test(normalized)) {
    return truncateAtBoundary(normalized, RISK_HAZARD_FACTOR_MAX_LENGTH);
  }

  if (/위험$/.test(normalized)) {
    return appendWithLimit(normalized.replace(/위험$/g, "").trim(), "위험 증가", RISK_HAZARD_FACTOR_MAX_LENGTH);
  }

  if (/(상태|미흡|불량|노출)$/.test(normalized)) {
    return appendWithLimit(normalized, "로 인한 위험 증가", RISK_HAZARD_FACTOR_MAX_LENGTH);
  }

  return appendWithLimit(normalized, "위험 증가", RISK_HAZARD_FACTOR_MAX_LENGTH);
}

function splitIncidentClauses(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return [];
  }

  const primary = normalized
    .split(INCIDENT_CONNECTOR_SPLIT_PATTERN)
    .map((item) => normalizeSpace(item))
    .filter((item) => item.length >= 10);
  const expanded = primary.flatMap((clause) =>
    clause
      .split(INCIDENT_SIGNAL_TRIGGER_SPLIT_PATTERN)
      .map((item) => normalizeSpace(item))
      .filter((item) => item.length >= 10)
  );

  return unique([...primary, ...expanded]);
}

function collectContextAnchorTokens(text: string) {
  return unique(
    tokenize(text).filter((token) => !CONTEXT_ANCHOR_STOPWORDS.has(token.toLowerCase()))
  );
}

function pickContextAnchorPhrase(tokens: string[], index: number) {
  if (tokens.length === 0) {
    return "";
  }

  const start = (index * 3) % tokens.length;
  const selected = [
    tokens[start],
    tokens[(start + 1) % tokens.length],
    tokens[(start + 2) % tokens.length],
  ].filter(Boolean);
  return normalizeSpace(selected.join(" "));
}

function inferContextFallbackHazardTypes(sourceText: string, fallbackHazardType: string) {
  const inferred = splitIncidentClauses(sourceText)
    .map((clause) => resolveHazardTypeWithContext(clause, clause, fallbackHazardType) || "")
    .filter(Boolean);

  return unique([...inferred, fallbackHazardType]);
}

function hasTaskKeywordHit(text: string, keywords: readonly string[]) {
  const compactText = toCompact(text);
  if (!compactText) {
    return false;
  }

  return keywords.some((keyword) => {
    const compactKeyword = toCompact(keyword);
    return compactKeyword.length >= 2 && compactText.includes(compactKeyword);
  });
}

function buildTaskContextProfileFromText(
  sourceText: string,
  explicitHazardTypes: string[] = [],
): TaskContextProfile {
  const normalizedSource = normalizeSpace(sourceText);
  const explicitTypes = normalizeHazardHints(explicitHazardTypes);
  const inferredTypes = splitIncidentClauses(normalizedSource)
    .map((clause) => resolveHazardTypeWithContext(clause, clause, ""))
    .filter(Boolean);
  const directInferred = resolveHazardTypeWithContext(normalizedSource, normalizedSource, "");
  const hasElectricalKeyword = hasTaskKeywordHit(normalizedSource, TASK_CONTEXT_ELECTRICAL_KEYWORDS);

  const contextDrivenTypes = normalizeHazardHints([
    ...inferredTypes,
    directInferred,
    hasElectricalKeyword ? "감전" : "",
  ]);
  const scopedContextDrivenTypes = contextDrivenTypes.filter((hazardType) => {
    if (hazardType === "감전" && hasElectricalKeyword) {
      return true;
    }
    return countKeywordHits(toCompact(normalizedSource), HAZARD_KEYWORD_MAP[hazardType] ?? []) > 0;
  });
  const scopedExplicitTypes = scopedContextDrivenTypes.length > 0
    ? explicitTypes.filter((type) => scopedContextDrivenTypes.includes(type))
    : explicitTypes;
  const fallbackExplicitType =
    scopedContextDrivenTypes.length === 0 && scopedExplicitTypes.length === 0
      ? (explicitTypes[0] ?? "")
      : "";
  const hazardTypes = unique([
    ...scopedContextDrivenTypes,
    ...scopedExplicitTypes,
    fallbackExplicitType,
  ].filter(Boolean));
  const contextTokens = unique(
    tokenize(normalizedSource).filter((token) => !TASK_CONTEXT_STOPWORDS.has(token.toLowerCase())),
  ).slice(0, 24);
  const axes = extractContextAxes(normalizedSource, [...hazardTypes, ...contextTokens]);
  const primaryHazardType = hazardTypes[0]
    || explicitTypes[0]
    || directInferred
    || "추락";

  return {
    hazardTypes: hazardTypes.length > 0 ? hazardTypes : [primaryHazardType],
    contextTokens,
    axes,
    primaryHazardType,
  };
}

function buildTaskContextProfile(assessment: AssessmentData) {
  const sourceText = normalizeSpace(
    `${assessment.taskName} ${assessment.taskDescription} ${assessment.analysis.scenario}`,
  );
  const explicitHazardTypes = (assessment.profile.hazards ?? []).map((hazard) => hazard.type ?? "");
  return buildTaskContextProfileFromText(sourceText, explicitHazardTypes);
}

function filterHazardTypesByTaskContext(hazardTypes: string[], profile: TaskContextProfile) {
  const normalized = normalizeHazardHints(hazardTypes);
  if (profile.hazardTypes.length === 0) {
    return normalized;
  }

  const filtered = normalized.filter((hazardType) => profile.hazardTypes.includes(hazardType));
  return filtered.length > 0 ? filtered : [profile.primaryHazardType];
}

function isHazardTypeAllowedByTaskContext(hazardType: string, profile: TaskContextProfile) {
  if (!hazardType) {
    return false;
  }
  if (profile.hazardTypes.length === 0) {
    return true;
  }
  return profile.hazardTypes.includes(hazardType);
}

function scoreHazardContextAlignment(
  hazard: HazardItem,
  profile: TaskContextProfile,
  fallbackHazardType: string,
) {
  const narrative = normalizeSpace(`${hazard.reason} ${hazard.name}`);
  const resolvedHazardType = resolveHazardTypeWithContext(
    narrative,
    hazard.type,
    fallbackHazardType,
  ) || fallbackHazardType;
  const candidateAxes = extractContextAxes(narrative, [resolvedHazardType]);
  const typeMatched = isHazardTypeAllowedByTaskContext(resolvedHazardType, profile);

  const equipmentMatches = countAxisTokenMatches(profile.axes.equipment, candidateAxes.equipment);
  const actionMatches = countAxisTokenMatches(profile.axes.action, candidateAxes.action);
  const riskMatches = countAxisTokenMatches(profile.axes.risk, candidateAxes.risk);
  const contextTokenMatches = countTokenMatches(toCompact(narrative), profile.contextTokens);

  let conflictPenalty = 0;
  const profileHasElectricalContext =
    profile.hazardTypes.includes("감전")
    || profile.axes.risk.includes("electric_shock")
    || hasTaskKeywordHit(profile.contextTokens.join(" "), TASK_CONTEXT_ELECTRICAL_KEYWORDS);
  if (profileHasElectricalContext && resolvedHazardType !== "감전") {
    conflictPenalty += 26;
  }
  if (!typeMatched) {
    conflictPenalty += 42;
  }

  const score = (typeMatched ? 24 : 0)
    + equipmentMatches * 9
    + actionMatches * 9
    + riskMatches * 8
    + Math.min(4, contextTokenMatches) * 6
    - conflictPenalty;

  return {
    score,
    hazardType: resolvedHazardType,
    typeMatched,
  };
}

function buildContextFallbackHazard(
  assessment: AssessmentData,
  hazardType: string,
  index: number,
): HazardItem {
  const sourceText = normalizeSpace(
    `${assessment.taskDescription} ${assessment.analysis.scenario} ${assessment.taskName}`
  );
  const contextTokens = collectContextAnchorTokens(sourceText);
  const anchorPhrase = pickContextAnchorPhrase(contextTokens, index) || pickScenarioSeed(assessment.taskDescription, assessment.taskName);
  const failure = inferFailureDescriptor(anchorPhrase, hazardType, index);
  const equipmentAnchor = inferEquipmentAnchor(anchorPhrase, "작업 설비");
  const operation = inferOperationDescriptor(anchorPhrase);
  const riskLabel = hazardTypeRiskLabel(hazardType);
  const inferredCause = finalizeCauseNarrative(
    `${operation} 중 ${equipmentAnchor}의 ${failure} 상태에서 ${riskLabel} 사고가 발생할 수 있음`,
  );
  const inferredHazardFactor = finalizeHazardFactorNarrative(
    `${equipmentAnchor} ${failure}로 ${riskLabel} 위험 증가`,
  );

  return {
    id: `fallback-hazard-${index + 1}`,
    name: inferredHazardFactor,
    type: hazardType,
    weight: 22,
    confidence: "low",
    reason: inferredCause,
  };
}

function inferEquipmentAnchor(text: string, fallback = "") {
  if (/(사다리|ladder|비계|발판|고소작업)/i.test(text)) return "고소작업 설비";
  if (/(절단기|cutter|blade|절단날|커팅)/i.test(text)) return "절단 설비";
  if (/(지게차|forklift|차량|이동장비|후진|주행)/i.test(text)) return "이동장비";
  if (/(회전부|롤러|컨베이어|벨트|회전체)/i.test(text)) return "회전부 설비";
  if (/(전원(?:\s*(?:차단|격리|공급|케이블|상태|투입)|선)|충전부|전선|배선|차단기|분전반|배전반|전기|electric|electrical)/i.test(text)) return "전기 설비";
  if (/(용제|화학|약품|흡입|노출)/i.test(text)) return "화학물질 취급 설비";
  return fallback || "작업 설비";
}

function inferOperationDescriptor(text: string) {
  if (/(점검|정비|보수|교체|repair|maintenance)/i.test(text)) return "점검·정비 작업";
  if (/(절단|커팅|cut|cutter)/i.test(text)) return "절단 작업";
  if (/(주행|후진|운반|이송|forklift|vehicle)/i.test(text)) return "이동·운반 작업";
  if (/(청소|정리|clean)/i.test(text)) return "청소 작업";
  if (/(고소|사다리|비계|발판)/i.test(text)) return "고소 작업";
  return "작업";
}

function inferFailureDescriptor(text: string, hazardType = "", seed = 0) {
  const rules: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /(미착용|미사용|미준수|누락|미흡|부족|without|no)/i, label: "안전조치 미흡" },
    { pattern: /(해체|개방|열린|open|unguarded)/i, label: "방호장치 개방" },
    { pattern: /(미고정|불안정|흔들|이탈|미설치|unsecured)/i, label: "고정상태 불량" },
    { pattern: /(전원.*미차단|활선|통전|격리.*미확인|isolation)/i, label: "전원 격리 미확인" },
    { pattern: /(근접|협착|사이|접촉|충돌|부딪)/i, label: "근접접촉 통제 미흡" },
    { pattern: /(비산|파편|낙하|비래)/i, label: "비산·낙하 방지 미흡" },
  ];

  const matched = rules.find((rule) => rule.pattern.test(text));
  if (matched?.label) {
    return matched.label;
  }

  const fallbackLabels = [
    "안전조치 미흡",
    "고정상태 불량",
    "근접접촉 통제 미흡",
    "방호장치 개방",
    "전원 격리 미확인",
    "비산·낙하 방지 미흡",
  ] as const;
  const fallbackByHazardType: Record<string, readonly string[]> = {
    추락: ["추락방호 설비 미흡", "고정상태 불량", "안전대 착용 미흡", "난간·발판 통제 미흡"],
    감전: ["전원 격리 미확인", "충전부 노출", "절연 상태 불량", "접지 점검 미흡"],
    "끼임/말림": ["회전부 방호 미흡", "정지 확인 누락", "근접접촉 통제 미흡", "방호장치 개방"],
    절단: ["절단부 방호 미흡", "날 상태 점검 누락", "방호장치 개방", "손 접근 통제 미흡"],
    "차량/이동장비 충돌": ["동선 분리 미흡", "유도자 배치 누락", "후진 신호 통제 미흡", "근접접촉 통제 미흡"],
    "낙하물/비래": ["상부 자재 고정 미흡", "비산·낙하 방지 미흡", "출입통제 미흡", "보호구 착용 미흡"],
    "폭발/화재": ["점화원 통제 미흡", "가연물 분리 미흡", "환기·감시 미흡", "화기 작업 통제 미흡"],
    화학노출: ["유해물질 차단 미흡", "환기 관리 미흡", "보호구 착용 미흡", "누출 통제 미흡"],
    붕괴: ["지지 구조 점검 미흡", "고정상태 불량", "하중 통제 미흡", "변형 징후 확인 누락"],
    질식: ["환기 상태 점검 미흡", "산소농도 확인 누락", "밀폐공간 통제 미흡", "감시자 배치 누락"],
  };
  const candidates = fallbackByHazardType[hazardType] ?? fallbackLabels;
  const compactSource = toCompact(`${hazardType} ${text}`);
  if (!compactSource) {
    return candidates[0];
  }

  let entropy = seed * 31;
  for (const char of compactSource) {
    entropy += char.charCodeAt(0);
  }
  return candidates[Math.abs(entropy) % candidates.length];
}

function hazardTypeRiskLabel(hazardType: string) {
  if (hazardType === "추락") return "추락";
  if (hazardType === "감전") return "감전";
  if (hazardType === "끼임/말림") return "끼임·말림";
  if (hazardType === "절단") return "절단";
  if (hazardType === "낙하물/비래") return "낙하물 충돌";
  if (hazardType === "차량/이동장비 충돌") return "이동장비 충돌";
  if (hazardType === "붕괴") return "붕괴";
  if (hazardType === "질식") return "질식";
  if (hazardType === "폭발/화재") return "폭발·화재";
  if (hazardType === "화학노출") return "화학노출";
  return "부상";
}

function buildInferredNarrativeFromClause(clause: string, hazardType: string, fallbackAnchor = "", seed = 0) {
  const normalized = normalizeSpace(clause)
    .replace(/[.!?]+$/g, "")
    .slice(0, INCIDENT_SIGNAL_MAX_CLAUSE_LENGTH);
  const equipmentAnchor = inferEquipmentAnchor(normalized, fallbackAnchor);
  const operation = inferOperationDescriptor(normalized);
  const failure = inferFailureDescriptor(normalized, hazardType, seed);
  const riskLabel = hazardTypeRiskLabel(hazardType);

  return {
    cause: normalizeSpace(`${operation} 중 ${equipmentAnchor}의 ${failure} 상태에서 ${riskLabel} 사고가 발생할 수 있음`),
    hazardFactor: normalizeSpace(`${equipmentAnchor} ${failure}로 ${riskLabel} 위험 증가`),
  };
}

function buildClauseSpecificHazardFactor(clause: string, hazardType: string) {
  const inferred = buildInferredNarrativeFromClause(clause, hazardType);
  const normalized = finalizeHazardFactorNarrative(inferred.hazardFactor);
  return normalizeSpace(normalized);
}

function estimateRiskRowCountFromDescription(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return RISK_ROW_MIN_COUNT;
  }

  return Math.min(RISK_ROW_MAX_COUNT, Math.max(RISK_ROW_MIN_COUNT, RISK_ROW_PREFERRED_COUNT));
}

function buildDerivedHazardFromClause(
  clause: string,
  index: number,
  fallbackHazardType: string,
): HazardItem {
  const hazardType = resolveHazardTypeWithContext(clause, clause, fallbackHazardType) || fallbackHazardType;
  const clauseTokens = tokenize(clause);
  const inferredWeight = Math.min(
    38,
    Math.max(18, 20 + Math.floor(clauseTokens.length / 2) + (hazardType ? 5 : 0)),
  );
  const inferredNarrative = buildInferredNarrativeFromClause(
    clause,
    hazardType,
    pickContextAnchorPhrase(collectContextAnchorTokens(clause), index),
    index,
  );
  return {
    id: `derived-hazard-${index + 1}`,
    name: buildClauseSpecificHazardFactor(clause, hazardType),
    type: hazardType,
    weight: inferredWeight,
    confidence: hazardType ? "medium" : "low",
    reason: finalizeCauseNarrative(inferredNarrative.cause),
  };
}

function scoreHazardSignal(hazard: HazardItem, source: "profile" | "description" | "context") {
  const confidenceBonus = hazard.confidence === "high" ? 12 : hazard.confidence === "medium" ? 8 : 4;
  const detailScore = Math.min(14, tokenize(`${hazard.reason} ${hazard.name}`).length);
  const sourceBonus = source === "profile" ? 8 : source === "context" ? 6 : 5;
  return hazard.weight + confidenceBonus + detailScore + sourceBonus;
}

function hazardsAreNearDuplicate(left: HazardItem, right: HazardItem) {
  const leftText = normalizeSpace(`${left.reason} ${left.name}`);
  const rightText = normalizeSpace(`${right.reason} ${right.name}`);
  const similarity = jaccardSimilarity(leftText, rightText);
  if (similarity >= INCIDENT_SIGNAL_STRONG_SIMILARITY_THRESHOLD) {
    return true;
  }

  const leftType = resolveHazardTypeWithContext(leftText, left.type, left.type);
  const rightType = resolveHazardTypeWithContext(rightText, right.type, right.type);
  if (leftType && leftType === rightType) {
    const compactLeft = toCompact(leftText);
    const compactRight = toCompact(rightText);
    if (compactLeft && compactRight && (compactLeft.includes(compactRight) || compactRight.includes(compactLeft))) {
      return true;
    }
  }
  return leftType === rightType && similarity >= INCIDENT_SIGNAL_SIMILARITY_THRESHOLD;
}

function buildHazardMechanismSignature(hazard: HazardItem, fallbackHazardType: string) {
  const mergedText = normalizeSpace(`${hazard.reason} ${hazard.name}`);
  const hazardType = resolveHazardTypeWithContext(
    mergedText,
    hazard.type,
    fallbackHazardType,
  ) || fallbackHazardType;
  const mechanismAxes = extractContextAxes(mergedText, [hazardType, hazard.name, hazard.reason]);
  const equipment = mechanismAxes.equipment[0] || inferEquipmentAnchor(mergedText, "작업 설비");
  const action = mechanismAxes.action[0] || inferOperationDescriptor(mergedText);
  const failure = inferFailureDescriptor(mergedText, hazardType);
  const risk = mechanismAxes.risk[0] || hazardTypeRiskLabel(hazardType);

  return [
    hazardType,
    equipment,
    action,
    failure,
    risk,
  ]
    .map((token) => toCompact(token))
    .filter((token) => token.length >= 2)
    .join("|");
}

function shouldRewriteNarrative(rawText: string, referenceText: string, maxLength = RISK_CAUSE_MAX_LENGTH) {
  const normalizedRaw = normalizeSpace(rawText);
  const normalizedReference = normalizeSpace(referenceText);
  if (!normalizedRaw) {
    return true;
  }

  if (normalizedRaw.length > maxLength) {
    return true;
  }

  if (!normalizedReference) {
    return false;
  }

  const compactRaw = toCompact(normalizedRaw);
  const compactReference = toCompact(normalizedReference);
  if (compactRaw && compactReference && compactReference.includes(compactRaw)) {
    return true;
  }

  const similarity = jaccardSimilarity(normalizedRaw, normalizedReference);
  const similarityThreshold = normalizedRaw.length <= 24
    ? NARRATIVE_REWRITE_SIMILARITY_SHORT
    : NARRATIVE_REWRITE_SIMILARITY_STRICT;
  return similarity >= similarityThreshold;
}

function hasFailureMechanismSignal(text: string) {
  return NARRATIVE_FAILURE_SIGNAL_PATTERN.test(normalizeSpace(text));
}

function buildContextSignalHazards(assessment: AssessmentData, fallbackHazardType: string) {
  const contextClauses = splitIncidentClauses(
    normalizeSpace(`${assessment.taskDescription} ${assessment.analysis.scenario}`)
  );

  return contextClauses
    .map((clause, index) => {
      const anchorTokens = collectContextAnchorTokens(clause);
      const anchorPhrase = pickContextAnchorPhrase(anchorTokens, index);
      if (!anchorPhrase) {
        return null;
      }

      const hazardType =
        resolveHazardTypeWithContext(clause, `${anchorPhrase} ${assessment.taskName}`, fallbackHazardType)
        || fallbackHazardType;

      return {
        id: `context-signal-${index + 1}`,
        name: buildHazardFactorFallback(hazardType, anchorPhrase),
        type: hazardType,
        weight: 24,
        confidence: "low" as const,
        reason: `${anchorPhrase} 조건이 충분히 통제되지 않아 ${hazardType} 사고가 발생할 수 있음`,
      } satisfies HazardItem;
    })
    .filter((hazard): hazard is HazardItem => Boolean(hazard));
}

function selectRiskHazards(assessment: AssessmentData) {
  const preferredTargetCount = estimateRiskRowCountFromDescription(assessment.taskDescription);
  const minimumTargetCount = RISK_ROW_MIN_COUNT;
  const taskContextProfile = buildTaskContextProfile(assessment);
  const fallbackHazardType = resolveHazardTypeWithContext(
    assessment.taskDescription,
    `${assessment.taskName} ${assessment.analysis.scenario}`,
    taskContextProfile.primaryHazardType,
  ) || resolveHazardTypeWithContext(
    assessment.profile.hazards[0]?.type ?? "",
    assessment.profile.hazards[0]?.reason ?? "",
    taskContextProfile.primaryHazardType,
  ) || taskContextProfile.primaryHazardType || "추락";

  const profileHazards = [...(assessment.profile.hazards ?? [])]
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
    .map((hazard, index) => {
      const normalizedType = resolveHazardTypeWithContext(
        `${hazard.name} ${hazard.reason}`,
        hazard.type,
        fallbackHazardType,
      ) || fallbackHazardType;
      const inferredNarrative = buildInferredNarrativeFromClause(
        `${hazard.reason} ${hazard.name}`,
        normalizedType,
        pickContextAnchorPhrase(collectContextAnchorTokens(`${hazard.reason} ${hazard.name}`), index),
      );
      const shouldRewriteReason = shouldRewriteNarrative(
        hazard.reason,
        `${assessment.taskDescription} ${assessment.analysis.scenario}`,
      );
      const shouldRewriteName = shouldRewriteNarrative(
        hazard.name,
        assessment.taskDescription,
      ) || hazard.name.length < RISK_HAZARD_FACTOR_MIN_LENGTH;

      return {
        ...hazard,
        id: hazard.id || `profile-hazard-${index + 1}`,
        type: normalizedType,
        name: shouldRewriteName
          ? finalizeHazardFactorNarrative(inferredNarrative.hazardFactor)
          : finalizeHazardFactorNarrative(hazard.name),
        reason: shouldRewriteReason
          ? finalizeCauseNarrative(inferredNarrative.cause)
          : finalizeCauseNarrative(hazard.reason),
      } satisfies HazardItem;
    });

  const clauseSources = splitIncidentClauses(
    normalizeSpace(`${assessment.taskDescription} ${assessment.analysis.scenario} ${assessment.taskName}`),
  );
  const clauseHazards = clauseSources.map((clause, index) =>
    buildDerivedHazardFromClause(clause, index, fallbackHazardType)
  );
  const contextSignalHazards = buildContextSignalHazards(assessment, fallbackHazardType);

  const scoredCandidates = [
    ...profileHazards.map((hazard) => ({ hazard, baseScore: scoreHazardSignal(hazard, "profile") })),
    ...clauseHazards.map((hazard) => ({ hazard, baseScore: scoreHazardSignal(hazard, "description") })),
    ...contextSignalHazards.map((hazard) => ({ hazard, baseScore: scoreHazardSignal(hazard, "context") })),
  ].map((item) => {
    const alignment = scoreHazardContextAlignment(item.hazard, taskContextProfile, fallbackHazardType);
    return {
      hazard: {
        ...item.hazard,
        type: alignment.hazardType,
      },
      score: item.baseScore + alignment.score,
      contextScore: alignment.score,
      typeMatched: alignment.typeMatched,
    };
  });

  const strictScopedCandidates = scoredCandidates.filter((item) =>
    item.typeMatched && item.contextScore >= RISK_HAZARD_CONTEXT_ALIGNMENT_MIN_SCORE
  );
  const typeScopedCandidates = scoredCandidates.filter((item) => item.typeMatched);
  const scored = (strictScopedCandidates.length > 0
    ? strictScopedCandidates
    : (typeScopedCandidates.length > 0 ? typeScopedCandidates : scoredCandidates))
    .sort((left, right) => right.score - left.score);

  const selected: HazardItem[] = [];
  const usedHazardTypes = new Set<string>();
  const usedMechanismSignatures = new Set<string>();
  const trySelect = (hazard: HazardItem, preferDiversity: boolean) => {
    const hazardType = resolveHazardTypeWithContext(
      `${hazard.name} ${hazard.reason}`,
      hazard.type,
      fallbackHazardType,
    ) || fallbackHazardType;
    if (!isHazardTypeAllowedByTaskContext(hazardType, taskContextProfile)) {
      return false;
    }
    const mechanismSignature = buildHazardMechanismSignature(hazard, fallbackHazardType);
    if (preferDiversity && taskContextProfile.hazardTypes.length > 1 && usedHazardTypes.has(hazardType)) {
      return false;
    }
    if (usedMechanismSignatures.has(mechanismSignature)) {
      return false;
    }
    if (selected.some((existing) => hazardsAreNearDuplicate(existing, hazard))) {
      return false;
    }
    selected.push({ ...hazard, type: hazardType });
    usedHazardTypes.add(hazardType);
    usedMechanismSignatures.add(mechanismSignature);
    return true;
  };

  for (const item of scored) {
    if (selected.length >= preferredTargetCount) {
      break;
    }
    trySelect(item.hazard, true);
  }

  for (const item of scored) {
    if (selected.length >= preferredTargetCount) {
      break;
    }
    trySelect(item.hazard, false);
  }

  const sourceText = normalizeSpace(`${assessment.taskDescription} ${assessment.analysis.scenario} ${assessment.taskName}`);
  const fallbackTypes = filterHazardTypesByTaskContext(
    unique([
      ...inferContextFallbackHazardTypes(sourceText, fallbackHazardType),
      ...taskContextProfile.hazardTypes,
      fallbackHazardType,
    ]),
    taskContextProfile,
  );
  const mechanismFallbackTypes = fallbackTypes.length > 0
    ? fallbackTypes
    : [taskContextProfile.primaryHazardType || fallbackHazardType];
  let fallbackIndex = 0;
  let safetyCounter = 0;
  while (selected.length < preferredTargetCount && safetyCounter < 24) {
    const hazardType = mechanismFallbackTypes[fallbackIndex % mechanismFallbackTypes.length]
      || taskContextProfile.primaryHazardType
      || fallbackHazardType;
    fallbackIndex += 1;
    safetyCounter += 1;
    const fallbackHazard = buildContextFallbackHazard(assessment, hazardType, fallbackIndex);
    if (!trySelect(fallbackHazard, false)) {
      continue;
    }
  }

  let fillSafetyCounter = 0;
  while (selected.length < preferredTargetCount && fillSafetyCounter < 64) {
    const hazardType = mechanismFallbackTypes[fallbackIndex % mechanismFallbackTypes.length]
      || taskContextProfile.primaryHazardType
      || fallbackHazardType;
    fallbackIndex += 1;
    fillSafetyCounter += 1;
    const fallbackHazard = buildContextFallbackHazard(assessment, hazardType, fallbackIndex);
    if (trySelect(fallbackHazard, false)) {
      continue;
    }
  }

  while (selected.length < minimumTargetCount) {
    const hazardType = mechanismFallbackTypes[fallbackIndex % mechanismFallbackTypes.length]
      || taskContextProfile.primaryHazardType
      || fallbackHazardType;
    fallbackIndex += 1;
    const fallbackHazard = buildContextFallbackHazard(assessment, hazardType, fallbackIndex);
    selected.push({
      ...fallbackHazard,
      type: hazardType,
      id: `forced-fallback-${fallbackIndex}`,
    });
  }

  const finalTargetCount = selected.length >= minimumTargetCount
    ? Math.min(preferredTargetCount, selected.length)
    : minimumTargetCount;
  return selected.slice(0, finalTargetCount);
}

function normalizeRiskNarratives(assessment: AssessmentData, hazard: HazardItem, workProcess: string, seed = 0) {
  const hazardType = resolveHazardTypeWithContext(
    `${hazard.name} ${hazard.reason}`,
    hazard.type,
    hazard.type,
  ) || hazard.type || "추락";
  const scenarioSeed = pickScenarioSeed(assessment.taskDescription, workProcess);

  const rawCause = normalizeSpace(hazard.reason);
  const rawHazardFactor = normalizeSpace(hazard.name);
  const contextReference = normalizeSpace(
    `${assessment.taskDescription} ${assessment.analysis.scenario} ${assessment.taskName}`,
  );
  const inferredNarrative = buildInferredNarrativeFromClause(
    `${rawCause} ${rawHazardFactor}`,
    hazardType,
    inferEquipmentAnchor(contextReference, scenarioSeed),
    seed,
  );
  const shouldRewriteCause = shouldRewriteNarrative(rawCause, contextReference, RISK_CAUSE_MAX_LENGTH)
    || !hasFailureMechanismSignal(rawCause);
  const shouldRewriteHazardFactor = shouldRewriteNarrative(
    rawHazardFactor,
    assessment.taskDescription,
    RISK_HAZARD_FACTOR_MAX_LENGTH,
  ) || !hasFailureMechanismSignal(rawHazardFactor);
  const causeSeed = normalizeSpace(shouldRewriteCause ? inferredNarrative.cause : rawCause);
  const hazardFactorSeed = normalizeSpace(shouldRewriteHazardFactor ? inferredNarrative.hazardFactor : rawHazardFactor);

  const expandedCause = finalizeCauseNarrative(
    causeSeed || `${scenarioSeed} 중 ${inferredNarrative.cause}`,
  );
  const expandedHazardFactor = finalizeHazardFactorNarrative(
    hazardFactorSeed || buildHazardFactorFallback(hazardType, inferEquipmentAnchor(scenarioSeed)),
  );

  return {
    cause: normalizeSpace(expandedCause),
    hazardFactor: normalizeSpace(expandedHazardFactor),
  };
}

function buildNarrativeMechanismKey(
  row: Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor">,
) {
  const hazardType = resolveRowHazardType(row) || row.category || "추락";
  const mergedText = normalizeSpace(`${row.workProcess ?? ""} ${row.cause ?? ""} ${row.hazardFactor ?? ""}`);
  const mechanismAxes = extractContextAxes(mergedText, [hazardType, row.category ?? ""]);
  const equipment = mechanismAxes.equipment[0] || inferEquipmentAnchor(mergedText, row.workProcess ?? "작업 설비");
  const action = mechanismAxes.action[0] || inferOperationDescriptor(mergedText);
  const failure = inferFailureDescriptor(mergedText, hazardType);
  const risk = mechanismAxes.risk[0] || hazardTypeRiskLabel(hazardType);

  return [
    hazardType,
    equipment,
    action,
    failure,
    risk,
  ]
    .map((token) => toCompact(token))
    .filter((token) => token.length >= 2)
    .join("|");
}

function rewriteRowNarrativesByContext(
  row: RiskAssessmentRow,
  assessment: AssessmentData,
  seed: number,
  forcedHazardType?: string,
) {
  const hazardType = forcedHazardType || resolveRowHazardType(row) || "추락";
  const clausePool = splitIncidentClauses(
    normalizeSpace(`${assessment.taskDescription} ${assessment.analysis.scenario} ${assessment.taskName}`),
  );
  const baseClause = clausePool.length > 0
    ? clausePool[seed % clausePool.length]
    : normalizeSpace(`${assessment.taskDescription} ${assessment.analysis.scenario} ${row.workProcess}`);
  const anchorTokens = collectContextAnchorTokens(
    `${baseClause} ${row.workProcess ?? ""} ${row.category ?? ""}`,
  );
  const anchor = pickContextAnchorPhrase(anchorTokens, seed) || row.workProcess || assessment.taskName;
  const inferred = buildInferredNarrativeFromClause(baseClause, hazardType, anchor, seed);

  return {
    cause: finalizeCauseNarrative(inferred.cause),
    hazardFactor: finalizeHazardFactorNarrative(inferred.hazardFactor),
  };
}

function enforceRiskNarrativeDiversity(rows: RiskAssessmentRow[], assessment: AssessmentData) {
  const usedMechanismKeys = new Set<string>();
  const usedNarrativeTexts: string[] = [];

  return rows.map((row, index) => {
    let nextRow = row;
    let mechanismKey = buildNarrativeMechanismKey(nextRow);
    let narrativeText = normalizeSpace(`${nextRow.cause} ${nextRow.hazardFactor}`);
    let isNearDuplicate = usedNarrativeTexts.some((text) => jaccardSimilarity(text, narrativeText) >= NARRATIVE_ROW_DUPLICATE_THRESHOLD);

    if (usedMechanismKeys.has(mechanismKey) || isNearDuplicate) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const rewritten = rewriteRowNarrativesByContext(nextRow, assessment, index + attempt + 1);
        const candidate = {
          ...nextRow,
          cause: rewritten.cause,
          hazardFactor: rewritten.hazardFactor,
        };
        const candidateKey = buildNarrativeMechanismKey(candidate);
        const candidateText = normalizeSpace(`${candidate.cause} ${candidate.hazardFactor}`);
        const candidateNearDuplicate = usedNarrativeTexts.some((text) =>
          jaccardSimilarity(text, candidateText) >= NARRATIVE_ROW_DUPLICATE_THRESHOLD
        );

        if (!usedMechanismKeys.has(candidateKey) && !candidateNearDuplicate) {
          nextRow = candidate;
          mechanismKey = candidateKey;
          narrativeText = candidateText;
          isNearDuplicate = false;
          break;
        }
      }
    }

    usedMechanismKeys.add(mechanismKey);
    if (!isNearDuplicate) {
      usedNarrativeTexts.push(narrativeText);
    }

    return nextRow;
  });
}

function hasHazardSignalMatch(text: string, hazardType: string) {
  const normalizedText = normalizeSpace(text);
  if (!normalizedText || !hazardType) {
    return false;
  }

  const resolvedType = resolveHazardTypeWithContext(normalizedText, normalizedText, hazardType);
  if (resolvedType === hazardType) {
    return true;
  }

  const compactText = toCompact(normalizedText);
  if (!compactText) {
    return false;
  }
  return countKeywordHits(compactText, HAZARD_KEYWORD_MAP[hazardType] ?? [hazardType]) > 0;
}

function getHazardKeywordsForStrictScore(hazardType: string) {
  return (HAZARD_KEYWORD_MAP[hazardType] ?? []).filter((keyword) => {
    const normalizedKeyword = normalizeSpace(keyword);
    return normalizedKeyword && !HAZARD_STRICT_SCORE_EXCLUSION_KEYWORDS.has(normalizedKeyword);
  });
}

function scoreHazardKeywordPresence(textCompact: string, hazardType: string, strict = false) {
  const keywords = strict
    ? getHazardKeywordsForStrictScore(hazardType)
    : (HAZARD_KEYWORD_MAP[hazardType] ?? []);
  return countKeywordHits(textCompact, keywords);
}

function hasDominantConflictingHazardSignal(text: string, hazardType: string) {
  const compactText = toCompact(text);
  if (!compactText || !hazardType) {
    return false;
  }

  const expectedScore = scoreHazardKeywordPresence(compactText, hazardType, true);
  let topConflictScore = 0;

  for (const candidateHazardType of Object.keys(HAZARD_KEYWORD_MAP)) {
    if (candidateHazardType === hazardType) {
      continue;
    }
    const score = scoreHazardKeywordPresence(compactText, candidateHazardType, true);
    if (score > topConflictScore) {
      topConflictScore = score;
    }
  }

  return topConflictScore >= 2 && topConflictScore >= expectedScore + 1;
}

function collectMeasureAnchorTokens(
  row: Pick<RiskAssessmentRow, "workProcess" | "cause" | "hazardFactor">,
  hazardType: string,
) {
  const contextText = normalizeSpace(`${row.workProcess ?? ""} ${row.cause ?? ""} ${row.hazardFactor ?? ""}`);
  const axes = extractContextAxes(contextText, [hazardType]);
  const axisTokens = unique([
    ...axes.situation,
    ...axes.action,
    ...axes.equipment,
    ...axes.risk,
  ])
    .map((token) => MEASURE_FOCUS_PHRASE_BY_AXIS_TOKEN[token] ?? "")
    .filter(Boolean);
  const narrativeTokens = filterSpecificContextTokens(unique([
    ...tokenize(row.workProcess ?? ""),
    ...tokenize(row.cause ?? ""),
    ...tokenize(row.hazardFactor ?? ""),
  ]));
  const hazardTokens = (HAZARD_KEYWORD_MAP[hazardType] ?? [])
    .map((token) => normalizeSpace(token))
    .filter(Boolean);

  return unique([...axisTokens, ...hazardTokens, ...narrativeTokens])
    .map((token) => token.trim())
    .filter((token) => toCompact(token).length >= 2)
    .slice(0, 24);
}

function hasMeasureAnchorMatch(text: string, anchors: string[]) {
  const compactText = toCompact(text);
  if (!compactText || anchors.length === 0) {
    return false;
  }

  return anchors.some((anchor) => {
    const compactAnchor = toCompact(anchor);
    return compactAnchor.length >= 2 && compactText.includes(compactAnchor);
  });
}

function hasMechanismAxisConsistency(
  row: Pick<RiskAssessmentRow, "workProcess" | "cause" | "hazardFactor">,
  hazardType: string,
  measureText: string,
) {
  const normalizedMeasure = normalizeSpace(measureText);
  if (!normalizedMeasure) {
    return false;
  }

  const rowText = normalizeSpace(`${row.workProcess ?? ""} ${row.cause ?? ""} ${row.hazardFactor ?? ""}`);
  const rowAxes = extractContextAxes(
    rowText,
    [hazardType, ...tokenize(row.workProcess ?? ""), ...tokenize(row.cause ?? ""), ...tokenize(row.hazardFactor ?? "")],
  );
  const measureAxes = extractContextAxes(
    normalizedMeasure,
    [hazardType, ...tokenize(row.workProcess ?? ""), ...tokenize(row.cause ?? ""), ...tokenize(row.hazardFactor ?? "")],
  );
  const rowSignalCount = rowAxes.equipment.length + rowAxes.action.length + rowAxes.risk.length;
  if (rowSignalCount === 0) {
    return true;
  }

  const equipmentMatched = countAxisTokenMatches(rowAxes.equipment, measureAxes.equipment);
  const actionMatched = countAxisTokenMatches(rowAxes.action, measureAxes.action);
  const riskMatched = countAxisTokenMatches(rowAxes.risk, measureAxes.risk);

  return (equipmentMatched + actionMatched + riskMatched) > 0;
}

function shouldRewriteMeasureForConsistency(
  row: Pick<RiskAssessmentRow, "workProcess" | "cause" | "hazardFactor">,
  hazardType: string,
  measureText: string,
) {
  if (!hasHazardSignalMatch(measureText, hazardType)) {
    return true;
  }

  if (hasDominantConflictingHazardSignal(measureText, hazardType)) {
    return true;
  }

  const anchors = collectMeasureAnchorTokens(row, hazardType);
  if (anchors.length === 0) {
    return !hasMechanismAxisConsistency(row, hazardType, measureText);
  }

  if (!hasMeasureAnchorMatch(measureText, anchors)) {
    return true;
  }

  return !hasMechanismAxisConsistency(row, hazardType, measureText);
}

function rewriteMeasureByHazardType(
  row: Pick<RiskAssessmentRow, "workProcess" | "cause" | "hazardFactor">,
  hazardType: string,
  kind: "current" | "reduction",
  seed = 0,
) {
  const contextText = normalizeSpace(`${row.workProcess ?? ""} ${row.cause ?? ""} ${row.hazardFactor ?? ""}`);
  const equipment = inferEquipmentAnchor(contextText, row.workProcess ?? "작업 설비");
  const riskLabel = hazardTypeRiskLabel(hazardType);
  const anchorTokens = collectMeasureAnchorTokens(row, hazardType);
  const anchorToken = anchorTokens.length > 0 ? anchorTokens[Math.abs(seed) % anchorTokens.length] : "";
  const failureDescriptor = inferFailureDescriptor(contextText, hazardType);
  const operationDescriptor = inferOperationDescriptor(contextText);

  const templatePool = HAZARD_MEASURE_TEMPLATE[hazardType]?.[kind] ?? [];
  if (templatePool.length > 0) {
    const templateIndex = Math.abs(seed) % templatePool.length;
    const templated = toConciseMeasure(templatePool[templateIndex]);
    if (templated) {
      return templated;
    }
  }

  const variant = Math.abs(seed) % 3;
  let contextualSentence: string;
  if (kind === "current") {
    if (variant === 0) {
      contextualSentence = `${equipment} ${anchorToken || riskLabel} 구간 ${riskLabel} 통제 상태를 점검한다.`;
    } else if (variant === 1) {
      contextualSentence = `${anchorToken || equipment} ${failureDescriptor || riskLabel} 유무를 확인하고 ${operationDescriptor || "조치"} 이행을 점검한다.`;
    } else {
      contextualSentence = `${equipment} ${riskLabel} 예방 조치와 ${anchorToken || "보호구"} 관리 상태를 확인한다.`;
    }
  } else {
    if (variant === 0) {
      contextualSentence = `${equipment} ${anchorToken || riskLabel} 구간 ${riskLabel} 저감 조치를 시행한다.`;
    } else if (variant === 1) {
      contextualSentence = `${anchorToken || equipment} ${failureDescriptor || riskLabel} 방지 설비를 보강하고 관리 기준을 수립한다.`;
    } else {
      contextualSentence = `${equipment} ${riskLabel} 위험 개선을 위해 ${anchorToken || "안전설비"} 교체·보강을 시행한다.`;
    }
  }

  const conciseContextual = toConciseMeasure(contextualSentence);
  if (conciseContextual) {
    return conciseContextual;
  }

  const FALLBACK_CURRENT = [
    `${riskLabel} 위험 통제 상태를 점검한다.`,
    `${riskLabel} 위험 예방 조치 이행을 확인한다.`,
    `${riskLabel} 위험 관리 기준 준수를 점검한다.`,
  ];
  const FALLBACK_REDUCTION = [
    `${riskLabel} 위험 저감 조치를 시행한다.`,
    `${riskLabel} 위험 방지 설비를 보강한다.`,
    `${riskLabel} 위험 개선 계획을 수립·시행한다.`,
  ];
  const fallbackPool = kind === "current" ? FALLBACK_CURRENT : FALLBACK_REDUCTION;
  return toConciseMeasure(fallbackPool[Math.abs(seed) % fallbackPool.length]);
}

function pickDiverseRowMeasure(
  row: RiskAssessmentRow,
  hazardType: string,
  kind: "current" | "reduction",
  used: string[],
  rowIndex: number,
  counterpart?: string,
) {
  const original = toConciseMeasure(kind === "current" ? row.currentMeasure : row.reductionMeasure);
  if (
    original
    && !isNearDuplicate(original, used, MEASURE_ROW_DIVERSITY_THRESHOLD)
    && (!counterpart || !areMeasuresNearDuplicate(original, counterpart, MEASURE_CROSS_FIELD_SIMILARITY_THRESHOLD))
  ) {
    return original;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const seed = rowIndex * 4 + attempt + 1;
    const candidate = rewriteMeasureByHazardType(row, hazardType, kind, seed);
    if (!candidate) {
      continue;
    }
    if (isNearDuplicate(candidate, used, MEASURE_ROW_DIVERSITY_THRESHOLD)) {
      continue;
    }
    if (counterpart && areMeasuresNearDuplicate(candidate, counterpart, MEASURE_CROSS_FIELD_SIMILARITY_THRESHOLD)) {
      continue;
    }
    return candidate;
  }

  const workAnchor = normalizeSpace(row.workProcess || "해당 작업");
  const riskLabel = hazardTypeRiskLabel(hazardType);
  const anchoredFallback = toConciseMeasure(
    kind === "current"
      ? `${workAnchor}의 ${riskLabel} 통제 상태를 점검한다.`
      : `${workAnchor}의 ${riskLabel} 저감 조치를 시행한다.`,
  );
  if (
    anchoredFallback
    && !isNearDuplicate(anchoredFallback, used, MEASURE_ROW_DIVERSITY_THRESHOLD)
    && (!counterpart || !areMeasuresNearDuplicate(anchoredFallback, counterpart, MEASURE_CROSS_FIELD_SIMILARITY_THRESHOLD))
  ) {
    return anchoredFallback;
  }

  return toConciseMeasure(
    kind === "current"
      ? `${riskLabel} 위험 통제 ${rowIndex + 1}차 점검을 시행한다.`
      : `${riskLabel} 위험 저감 ${rowIndex + 1}차 조치를 시행한다.`,
  ) || (kind === "current" ? "위험 통제 상태를 점검한다." : "위험 저감 조치를 시행한다.");
}

function enforceMeasureDiversityAcrossRows(rows: RiskAssessmentRow[]) {
  const usedCurrent: string[] = [];
  const usedReduction: string[] = [];

  return rows.map((row, index) => {
    const hazardType = resolveRowHazardType(row) || "추락";
    const currentMeasure = pickDiverseRowMeasure(row, hazardType, "current", usedCurrent, index);
    usedCurrent.push(currentMeasure);

    const reductionMeasure = pickDiverseRowMeasure(
      {
        ...row,
        currentMeasure,
      },
      hazardType,
      "reduction",
      usedReduction,
      index,
      currentMeasure,
    );
    usedReduction.push(reductionMeasure);

    return {
      ...row,
      currentMeasure,
      reductionMeasure,
    };
  });
}

function enforceRiskRowsConsistency(
  rows: RiskAssessmentRow[],
  assessment: AssessmentData,
  baseContext: RiskLawContext,
) {
  const taskProfile = buildTaskContextProfile(assessment);
  const baseTaskHazardTypes = normalizeHazardHints([
    ...(baseContext.taskHazardTypes ?? []),
    ...taskProfile.hazardTypes,
  ]);
  const baseTaskContextTokens = unique([
    ...(baseContext.taskContextTokens ?? []),
    ...taskProfile.contextTokens,
  ]).slice(0, 24);

  const alignedRows = rows.map((row, index) => {
    let nextRow = { ...row };
    let rowHazardType = resolveRowHazardType(nextRow) || taskProfile.primaryHazardType;

    if (!isHazardTypeAllowedByTaskContext(rowHazardType, taskProfile)) {
      const rewritten = rewriteRowNarrativesByContext(
        nextRow,
        assessment,
        index + 1,
        taskProfile.primaryHazardType,
      );
      nextRow = {
        ...nextRow,
        cause: rewritten.cause,
        hazardFactor: rewritten.hazardFactor,
      };
      rowHazardType = resolveRowHazardType(nextRow) || taskProfile.primaryHazardType;
    }

    if (!hasHazardSignalMatch(`${nextRow.cause} ${nextRow.hazardFactor}`, rowHazardType)) {
      const rewritten = rewriteRowNarrativesByContext(nextRow, assessment, index + 2, rowHazardType);
      nextRow = {
        ...nextRow,
        cause: rewritten.cause,
        hazardFactor: rewritten.hazardFactor,
      };
      rowHazardType = resolveRowHazardType(nextRow) || rowHazardType;
    }

    if (shouldRewriteMeasureForConsistency(nextRow, rowHazardType, nextRow.currentMeasure)) {
      nextRow.currentMeasure = rewriteMeasureByHazardType(nextRow, rowHazardType, "current", index + 1);
    }
    if (shouldRewriteMeasureForConsistency(nextRow, rowHazardType, nextRow.reductionMeasure)) {
      nextRow.reductionMeasure = rewriteMeasureByHazardType(nextRow, rowHazardType, "reduction", index + 5);
    }
    if (areMeasuresNearDuplicate(nextRow.currentMeasure, nextRow.reductionMeasure, MEASURE_CROSS_FIELD_SIMILARITY_THRESHOLD)) {
      nextRow.reductionMeasure = rewriteMeasureByHazardType(nextRow, rowHazardType, "reduction", index + 9);
    }

    const rowScopedContext: RiskLawContext = {
      ...baseContext,
      taskHazardTypes: normalizeHazardHints([
        ...baseTaskHazardTypes,
        rowHazardType,
      ]),
      taskContextTokens: unique([
        ...baseTaskContextTokens,
        ...tokenize(nextRow.workProcess ?? ""),
        ...tokenize(nextRow.cause ?? ""),
        ...tokenize(nextRow.hazardFactor ?? ""),
      ]).slice(0, 24),
    };
    const [resolvedLegalBasis] = resolveRiskRowsLegalBasis([{
      workProcess: nextRow.workProcess,
      category: nextRow.category,
      cause: nextRow.cause,
      hazardFactor: nextRow.hazardFactor,
    }], rowScopedContext);
    nextRow.legalBasis = resolvedLegalBasis ?? "";

    return nextRow;
  });

  return enforceMeasureDiversityAcrossRows(alignedRows);
}

export interface RiskLawContext {
  lawItems?: EvidenceItem[];
  lawActionItems?: LawActionItem[];
  workTokens?: string[];
  equipmentTokens?: string[];
  taskHazardTypes?: string[];
  taskContextTokens?: string[];
}

export interface RiskRowsValidationOptions {
  rewriteInvalidFields?: boolean;
  clearUnresolvedFields?: boolean;
  assessment?: AssessmentData;
  siteName?: string;
  timestamp?: string;
}

export interface RiskRowsValidationResult {
  rows: RiskAssessmentRow[];
  validationSummary: RiskRowValidationSummary;
  validationEvents: RiskRowValidationEvent[];
}

export interface RiskLegalBasisCandidateOption {
  legalBasis: string;
  articleNumber: string;
  articleTitle: string;
  score: number;
  sourceType: "storage" | "action" | "fallback";
}

interface LegalBasisCandidate {
  legalBasis: string;
  articleNumber: string;
  articleTitle: string;
  searchText: string;
  contextSearchText: string;
  relevanceScore: number;
  sourceWeight: number;
  hazardTypes: string[];
  sourceType: "storage" | "action" | "fallback";
}

interface LegalBasisScore {
  score: number;
  hazardTypeMatched: boolean;
  hazardTokenMatches: number;
  rowSpecificTokenMatches: number;
  keywordDensity: number;
  workMatches: number;
  equipmentMatches: number;
  hasContextHint: boolean;
  requiredHazardTokenMatches: number;
  requiredRowSpecificTokenMatches: number;
  passes: boolean;
}

interface RankedLegalBasisCandidate {
  candidate: LegalBasisCandidate;
  score: number;
}

interface LegalBasisCandidateSets {
  storageCandidates: LegalBasisCandidate[];
  actionCandidates: LegalBasisCandidate[];
}

interface RiskRowLegalBasisEvaluation {
  index: number;
  ranked: RankedLegalBasisCandidate[];
}

const HAZARD_MEASURE_TEMPLATE: Record<string, { current: string[]; reduction: string[] }> = {
  추락: {
    current: [
      "비계·발판 고정 상태와 안전대 체결 여부를 확인한다.",
      "개구부 안전난간 설치 상태 및 덮개 고정을 점검한다.",
      "고소 작업 전 개인보호구 착용 기준 준수를 확인한다.",
    ],
    reduction: [
      "추락 위험 구간에 수직 안전망을 추가 설치한다.",
      "개구부 주변 이중 난간과 발끝막이판을 보강한다.",
      "안전대 부착설비 고정점을 견고한 구조물로 교체한다.",
    ],
  },
  붕괴: {
    current: [
      "지지 구조물 변형 유무와 볼트 체결 상태를 확인한다.",
      "굴착면 경사도와 토사 유실 징후를 육안 점검한다.",
      "거푸집 동바리 수직 수평도와 하중 전달 상태를 점검한다.",
    ],
    reduction: [
      "지지부 보강재를 추가 설치하고 변위 계측을 실시한다.",
      "굴착 사면에 흙막이 판넬을 설치해 토사 유실을 방지한다.",
      "동바리 연결부에 수평 가새를 추가 설치하여 횡좌굴을 방지한다.",
    ],
  },
  질식: {
    current: [
      "밀폐공간 산소 농도와 유해가스 수치를 측정한다.",
      "출입 허가 절차 이행 여부와 감시인 배치 상태를 확인한다.",
      "비상 구조 장비 비치 상태와 구조 연락 체계를 점검한다.",
    ],
    reduction: [
      "환기 장비 가동 후 측정값이 기준 충족 시 작업을 개시한다.",
      "송기마스크 착용 기준을 수립하고 예비 공기원을 확보한다.",
      "밀폐공간 출입 전 작업 허가서와 비상 대피 훈련을 시행한다.",
    ],
  },
  "폭발/화재": {
    current: [
      "가연성 물질과 점화원 분리 상태를 확인한다.",
      "가스 누출 검지기 작동 상태와 경보 설정을 점검한다.",
      "인화성 증기 농도를 측정하고 작업 전 화기 허가를 확인한다.",
    ],
    reduction: [
      "화기 통제 구역을 설정하고 소화기를 작업 반경 내 배치한다.",
      "방폭 전기설비로 교체하고 정전기 접지를 완료한다.",
      "가연물 격리 거리를 확보하고 자동 소화설비를 설치한다.",
    ],
  },
  감전: {
    current: [
      "충전부 노출·절연 상태와 전원 차단 여부를 점검한다.",
      "접지선 연결 상태와 누전차단기 동작 여부를 확인한다.",
      "배선 피복 손상 유무와 분전반 시건 장치를 점검한다.",
    ],
    reduction: [
      "잠금표지 후 전원 차단 상태를 재확인하고 작업한다.",
      "절연 방호구를 추가 설치하고 활선 접근 금지 표지를 부착한다.",
      "누전차단기 정격 감도를 재설정하고 정기 시험을 실시한다.",
    ],
  },
  "끼임/말림": {
    current: [
      "회전부 방호장치와 비상정지 장치 상태를 점검한다.",
      "구동부 인터록 연동 여부와 방호 커버 체결을 확인한다.",
      "작업복 소매·장갑 등 말림 유발 요소를 사전 점검한다.",
    ],
    reduction: [
      "운전 정지 후 방호장치 복구를 확인하고 작업한다.",
      "끼임 위험 구간에 광전자식 안전장치를 추가 설치한다.",
      "정비 작업 시 잠금·표지 절차를 의무화하고 이행 기록을 관리한다.",
    ],
  },
  절단: {
    current: [
      "절단부 커버 체결 상태와 공구 날 마모도를 점검한다.",
      "절단 작업 전 고정 지그 안착 여부와 비산 방호 상태를 확인한다.",
      "절단기 비상정지 스위치 작동과 방호 덮개 체결을 점검한다.",
    ],
    reduction: [
      "정지 상태에서 날 교체·고정을 완료한 뒤 작업한다.",
      "절단 비산물 방호 스크린을 설치하고 보안경 착용을 의무화한다.",
      "자동 절단기 도입으로 수동 접촉 구간을 최소화한다.",
    ],
  },
  "낙하물/비래": {
    current: [
      "상부 작업 구간의 낙하물 방지망 설치 상태를 점검한다.",
      "자재 적치 고정 상태와 안전모 착용 여부를 확인한다.",
      "양중 작업 구간 하부 출입통제 조치 이행을 점검한다.",
    ],
    reduction: [
      "상부 자재 결속을 강화하고 투하설비를 설치한다.",
      "낙하물 방지 선반과 수직 보호망을 이중 설치한다.",
      "양중 경로 하부에 출입금지 구역을 설정하고 안내 표지를 부착한다.",
    ],
  },
  "차량/이동장비 충돌": {
    current: [
      "이동장비 운반 동선과 보행자 통로 분리 상태를 점검한다.",
      "후진 경보장치 작동 여부와 유도자 배치 상태를 확인한다.",
      "이동장비 제동 성능과 후사경 시야 확보를 점검한다.",
    ],
    reduction: [
      "차량 동선과 보행 동선을 물리적 방책으로 완전 분리한다.",
      "후진 구간에 신호수를 배치하고 후방 카메라를 설치한다.",
      "이동장비 속도 제한 장치를 설정하고 경고등을 부착한다.",
    ],
  },
  화학노출: {
    current: [
      "유해물질 취급 구간의 보호구 착용 상태를 확인한다.",
      "국소배기장치 가동 상태와 포집 효율을 점검한다.",
      "화학물질 저장 용기 밀봉 상태와 라벨 표시를 점검한다.",
    ],
    reduction: [
      "MSDS 기준에 따라 적합 보호구를 교체 지급한다.",
      "국소배기장치 덕트를 보수하고 흡입 풍속을 기준치로 조정한다.",
      "유해물질 취급 절차서를 갱신하고 비상 세안설비를 확보한다.",
    ],
  },
  "소음/분진/반복작업": {
    current: [
      "소음 측정 결과와 청력 보호구 착용 여부를 점검한다.",
      "분진 발생 구간 습윤 조치 이행과 방진마스크 착용을 확인한다.",
      "반복 작업 자세와 휴식 시간 배분 기준 준수를 점검한다.",
    ],
    reduction: [
      "소음원 차폐 판넬을 설치하고 방음 보호구를 지급한다.",
      "분진 집진 설비를 보강하고 작업장 환기량을 증대한다.",
      "반복 작업 주기를 단축하고 인력 교대 계획을 수립한다.",
    ],
  },
};

function toRiskLabel(score: number) {
  if (score >= 15) return "높음";
  if (score >= 6) return "보통";
  return "낮음";
}

function formatRiskLevel(frequency: number, severity: number) {
  const score = frequency * severity;
  return `${score}(${toRiskLabel(score)})`;
}

function normalizeSpace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function toCompact(text: string) {
  return normalizeSpace(text)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isAllowedRiskCategory(value: string): value is RiskCategoryOption {
  return RISK_CATEGORY_SET.has(value);
}

function normalizeRiskCategoryAlias(value: string) {
  const compact = toCompact(value);
  if (!compact) {
    return "";
  }

  return LEGACY_CATEGORY_ALIAS_MAP[compact] ?? "";
}

function containsAnyHint(text: string, hints: string[]) {
  const compact = toCompact(text);
  if (!compact) {
    return false;
  }

  return hints.some((hint) => compact.includes(toCompact(hint)));
}

function countHintHits(text: string, hints: string[]) {
  const compact = toCompact(text);
  if (!compact) {
    return 0;
  }

  return hints.reduce((hits, hint) => {
    const compactHint = toCompact(hint);
    if (!compactHint) {
      return hits;
    }
    return compact.includes(compactHint) ? hits + 1 : hits;
  }, 0);
}

function hasReliableElectricalSignal(causeSignals: string, hazardSignals: string) {
  const mergedSignals = normalizeSpace(`${causeSignals} ${hazardSignals}`);
  if (!mergedSignals) {
    return false;
  }

  const strongHits = countHintHits(mergedSignals, ELECTRICAL_CATEGORY_STRONG_HINTS);
  if (strongHits > 0) {
    return true;
  }

  const weakHits = countHintHits(mergedSignals, ELECTRICAL_CATEGORY_WEAK_HINTS);
  return weakHits >= 2;
}

function getElectricalSignalStrength(causeSignals: string, hazardSignals: string) {
  const mergedSignals = normalizeSpace(`${causeSignals} ${hazardSignals}`);
  const strongHits = countHintHits(mergedSignals, ELECTRICAL_CATEGORY_STRONG_HINTS);
  const weakHits = countHintHits(mergedSignals, ELECTRICAL_CATEGORY_WEAK_HINTS);
  return strongHits * 3 + weakHits;
}

function inferHazardTypeFromRowSignals(causeSignals: string, hazardSignals: string) {
  const mergedSignals = normalizeSpace(`${causeSignals} ${hazardSignals}`);
  if (!mergedSignals) {
    return "";
  }

  const causeCompact = toCompact(causeSignals);
  const hazardCompact = toCompact(hazardSignals);
  const directCauseType = normalizeHazardType(causeSignals, causeSignals);
  const directHazardType = normalizeHazardType(hazardSignals, hazardSignals);
  const contextualType = resolveHazardTypeWithContext(causeSignals, hazardSignals, "");
  const scores = new Map<string, number>();

  for (const hazardType of Object.keys(HAZARD_KEYWORD_MAP)) {
    const keywords = HAZARD_KEYWORD_MAP[hazardType] ?? [];
    let score = 0;
    score += countKeywordHits(causeCompact, keywords) * 7;
    score += countKeywordHits(hazardCompact, keywords) * 5;
    if (directCauseType === hazardType) {
      score += 18;
    }
    if (directHazardType === hazardType) {
      score += 12;
    }
    if (contextualType === hazardType) {
      score += 10;
    }
    if (score > 0) {
      scores.set(hazardType, score);
    }
  }

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const top = ranked[0];
  if (!top || top[1] < 10) {
    return "";
  }

  return top[0];
}

function deriveRiskCategoryFromRowSignals(row: Pick<RiskAssessmentRow, "category" | "cause" | "hazardFactor">): RiskCategoryOption {
  const causeSignals = normalizeSpace(row.cause ?? "");
  const hazardSignals = normalizeSpace(row.hazardFactor ?? "");
  const electricalSignalStrength = getElectricalSignalStrength(causeSignals, hazardSignals);

  if (containsAnyHint(causeSignals, MANAGEMENT_CATEGORY_HINTS)) {
    return "관리적 요인";
  }

  if (containsAnyHint(causeSignals, HUMAN_CATEGORY_HINTS)) {
    return "인적 요인";
  }

  const inferredHazardType = inferHazardTypeFromRowSignals(causeSignals, hazardSignals);
  const inferredHazardCategory = HAZARD_FACTOR_CATEGORY_MAP[inferredHazardType];
  if (inferredHazardCategory) {
    if (inferredHazardCategory === "기계적 요인" && electricalSignalStrength >= 3) {
      return "전기적 요인";
    }
    if (inferredHazardCategory !== "전기적 요인" || hasReliableElectricalSignal(causeSignals, hazardSignals)) {
      return inferredHazardCategory;
    }
  }

  if (containsAnyHint(hazardSignals, MANAGEMENT_CATEGORY_HINTS)) {
    return "관리적 요인";
  }

  if (containsAnyHint(hazardSignals, HUMAN_CATEGORY_HINTS)) {
    return "인적 요인";
  }

  if (hasReliableElectricalSignal(causeSignals, hazardSignals)) {
    return "전기적 요인";
  }

  const normalizedHazardType = normalizeHazardType(row.category, `${hazardSignals} ${causeSignals}`);
  const hazardFallbackCategory = HAZARD_FACTOR_CATEGORY_MAP[normalizedHazardType] ?? "작업특성 요인";
  if (hazardFallbackCategory === "전기적 요인" && !hasReliableElectricalSignal(causeSignals, hazardSignals)) {
    return "작업특성 요인";
  }

  return hazardFallbackCategory;
}

function isStrictLegalBasisFormat(text: string) {
  return STRICT_LEGAL_BASIS_PATTERN.test(normalizeSpace(text));
}

function extractArticleNumber(sourceText?: string) {
  if (!sourceText) {
    return "";
  }

  const match = sourceText.match(ARTICLE_NUMBER_PATTERN);
  return match?.[1] ? match[1].replace(/\s+/g, "") : "";
}

function isStandardsRulesLaw(sourceText?: string) {
  const normalized = toCompact(sourceText ?? "");
  return normalized.includes(toCompact(STANDARDS_RULES_LAW_NAME))
    || normalized.includes("occupationalsafetyandhealthstandardsrules");
}

function cleanArticleTitle(title: string) {
  const cleaned = normalizeSpace(title)
    .replace(/^[\s:~\-–—,.;[\]()"'`]+/g, "")
    .replace(/[\s:~\-–—,.;[\]()"'`]+$/g, "");
  if (!cleaned) {
    return "";
  }

  if (ARTICLE_NUMBER_PATTERN.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function extractArticleTitle(articleNumber: string, sources: string[]) {
  if (!articleNumber) {
    return "";
  }

  const articleRegex = articleNumber.replace(/\s+/g, "\\s*");
  const articlePattern = new RegExp(articleRegex);
  const titleInParenPattern = new RegExp(`${articleRegex}\\s*[\\[(]\\s*([^\\])]{2,80}?)\\s*[\\])]`);

  for (const source of sources) {
    const normalized = normalizeSpace(source ?? "");
    if (!normalized) {
      continue;
    }

    const parenMatch = normalized.match(titleInParenPattern);
    if (parenMatch?.[1]) {
      const cleaned = cleanArticleTitle(parenMatch[1]);
      if (cleaned) {
        return cleaned;
      }
    }

    const articleMatch = normalized.match(articlePattern);
    if (!articleMatch) {
      continue;
    }

    const articleIndex = normalized.indexOf(articleMatch[0]);
    const afterArticle = normalizeSpace(
      normalized
        .slice(articleIndex + articleMatch[0].length)
        .replace(/^[\s:~\-–—,.;[\]()"'`]+/g, ""),
    );
    if (!afterArticle) {
      continue;
    }

    const plainTitle = cleanArticleTitle(afterArticle.split(/[.;!?\n]/)[0] ?? "");
    if (plainTitle) {
      return plainTitle;
    }
  }

  return "";
}

function formatStandardsRulesLegalBasis(articleNumber: string, articleTitle = "") {
  const normalizedArticleNumber = articleNumber.replace(/\s+/g, "");
  if (!normalizedArticleNumber) {
    return "";
  }

  const cleanedTitle = cleanArticleTitle(articleTitle);
  if (!cleanedTitle) {
    return "";
  }

  const formatted = `${STANDARDS_RULES_LAW_NAME} ${normalizedArticleNumber}(${cleanedTitle})`;
  return isStrictLegalBasisFormat(formatted) ? formatted : "";
}

function toStandardsRulesLegalBasis(articleSource?: string, titleSources: string[] = []) {
  const articleNumber = extractArticleNumber(articleSource);
  if (!articleNumber) {
    return "";
  }

  const articleTitle = extractArticleTitle(articleNumber, titleSources);
  return formatStandardsRulesLegalBasis(articleNumber, articleTitle);
}

function tokenize(text: string) {
  return text
    .split(/[^0-9A-Za-z가-힣]+/g)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);
}

function collectContextTokensByRules(text: string, rules: ContextRule[]) {
  return rules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map((rule) => rule.token);
}

function extractContextAxes(text: string, additionalSignals: string[] = []): ContextAxes {
  const normalized = normalizeSpace(`${text} ${additionalSignals.join(" ")}`);
  if (!normalized) {
    return {
      equipment: [],
      situation: [],
      target: [],
      action: [],
      risk: [],
    };
  }

  return {
    equipment: unique(collectContextTokensByRules(normalized, EQUIPMENT_CONTEXT_RULES)),
    situation: unique(collectContextTokensByRules(normalized, SITUATION_CONTEXT_RULES)),
    target: unique(collectContextTokensByRules(normalized, TARGET_CONTEXT_RULES)),
    action: unique(collectContextTokensByRules(normalized, ACTION_CONTEXT_RULES)),
    risk: unique(collectContextTokensByRules(normalized, RISK_CONTEXT_RULES)),
  };
}

function countKeywordHits(textCompact: string, keywords: string[]) {
  return keywords.reduce((count, keyword) => {
    const compactKeyword = toCompact(keyword);
    if (!compactKeyword) {
      return count;
    }
    return textCompact.includes(compactKeyword) ? count + 1 : count;
  }, 0);
}

function resolveHazardTypeWithContext(primaryText: string, secondaryText = "", explicitHint = "") {
  const mergedText = normalizeSpace(`${primaryText} ${secondaryText} ${explicitHint}`);
  if (!mergedText) {
    return "";
  }

  const axes = extractContextAxes(mergedText, [explicitHint]);
  const textCompact = toCompact(mergedText);
  const scores = new Map<string, number>();
  for (const hazardType of Object.keys(HAZARD_KEYWORD_MAP)) {
    const keywordHits = countKeywordHits(textCompact, HAZARD_KEYWORD_MAP[hazardType] ?? []);
    scores.set(hazardType, keywordHits * 8);
  }

  const hintedType = normalizeHazardType(explicitHint, mergedText);
  if (hintedType) {
    scores.set(hintedType, (scores.get(hintedType) ?? 0) + 12);
  }

  const vehicleStrength = (axes.equipment.includes("vehicle_equipment") ? 2 : 0)
    + (axes.action.includes("transport_operation") ? 1 : 0)
    + (axes.situation.includes("proximity_zone") ? 1 : 0)
    + (axes.situation.includes("guide_missing") ? 1 : 0)
    + (axes.risk.includes("contact_entrapment") ? 1 : 0);
  const rotatingStrength = (axes.equipment.includes("rotating_machine") ? 2 : 0)
    + (axes.action.includes("machine_maintenance") ? 1 : 0)
    + (axes.risk.includes("rotating_entrapment") ? 2 : 0);

  const hasVehiclePrimarySignal = axes.equipment.includes("vehicle_equipment")
    || axes.action.includes("transport_operation");

  if (hasVehiclePrimarySignal && vehicleStrength > 0) {
    scores.set(
      "차량/이동장비 충돌",
      (scores.get("차량/이동장비 충돌") ?? 0) + 12 + vehicleStrength * 7,
    );
  } else if (axes.situation.includes("guide_missing") && axes.risk.includes("contact_entrapment")) {
    scores.set(
      "차량/이동장비 충돌",
      (scores.get("차량/이동장비 충돌") ?? 0) + 6,
    );
  }
  if (rotatingStrength > 0) {
    scores.set(
      "끼임/말림",
      (scores.get("끼임/말림") ?? 0) + 10 + rotatingStrength * 8,
    );
  }
  if (axes.risk.includes("contact_entrapment")) {
    scores.set("끼임/말림", (scores.get("끼임/말림") ?? 0) + 8);
    scores.set("차량/이동장비 충돌", (scores.get("차량/이동장비 충돌") ?? 0) + 8);
  }
  if (axes.risk.includes("fall_risk") || axes.action.includes("height_work") || axes.equipment.includes("height_platform")) {
    scores.set("추락", (scores.get("추락") ?? 0) + 18);
  }
  if (axes.risk.includes("electric_shock") || axes.action.includes("electrical_work") || axes.equipment.includes("electrical_equipment")) {
    scores.set("감전", (scores.get("감전") ?? 0) + 18);
  }
  if (axes.risk.includes("chemical_exposure") || axes.equipment.includes("chemical_equipment")) {
    scores.set("화학노출", (scores.get("화학노출") ?? 0) + 18);
  }
  if (axes.risk.includes("fire_explosion")) {
    scores.set("폭발/화재", (scores.get("폭발/화재") ?? 0) + 18);
  }
  if (axes.risk.includes("collapse_risk")) {
    scores.set("붕괴", (scores.get("붕괴") ?? 0) + 18);
  }

  if (vehicleStrength >= 3 && rotatingStrength === 0) {
    scores.set("끼임/말림", (scores.get("끼임/말림") ?? 0) - 14);
  }
  if (rotatingStrength >= 3 && vehicleStrength === 0) {
    scores.set("차량/이동장비 충돌", (scores.get("차량/이동장비 충돌") ?? 0) - 14);
  }

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const top = ranked[0];
  if (top && top[1] > 0) {
    return top[0];
  }

  return normalizeHazardType(mergedText, explicitHint);
}

function resolveRowHazardType(row: Pick<RiskAssessmentRow, "category" | "cause" | "hazardFactor">) {
  const primarySignals = normalizeSpace(`${row.cause ?? ""} ${row.hazardFactor ?? ""}`);
  const secondarySignals = normalizeSpace(`${row.hazardFactor ?? ""} ${row.category ?? ""}`);
  return resolveHazardTypeWithContext(primarySignals, secondarySignals, row.category)
    || normalizeHazardType(primarySignals, secondarySignals)
    || normalizeHazardType(row.category, row.hazardFactor);
}

function resolveHazardArticleMapEntries(hazardType: string) {
  if (!hazardType) {
    return [] as Array<{ article: string; title: string }>;
  }

  const candidateKeys = unique([
    hazardType,
    ...(HAZARD_ARTICLE_MAP_KEY_ALIASES[hazardType] ?? []),
  ]);

  return candidateKeys.flatMap((key) => HAZARD_ARTICLE_MAP[key as keyof typeof HAZARD_ARTICLE_MAP] ?? []);
}

function isBroadIndustryLabel(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return false;
  }

  if (BROAD_WORK_PROCESS_LABELS.has(normalized)) {
    return true;
  }

  return /^[가-힣A-Za-z]{2,6}$/.test(normalized);
}

function inferWorkProcessLabelFromText(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }

  const matchedRule = WORK_PROCESS_LABEL_RULES.find(({ pattern }) => pattern.test(normalized));
  return matchedRule?.label ?? "";
}

function resolveWorkProcessLabel(assessment: AssessmentData, hazard: HazardItem) {
  const candidates = [
    assessment.taskName,
    assessment.taskDescription,
    hazard.reason,
    hazard.name,
    assessment.profile.workLocation,
  ].map((value) => normalizeSpace(value ?? ""));

  for (const candidate of candidates) {
    const inferred = inferWorkProcessLabelFromText(candidate);
    if (inferred) {
      return inferred;
    }
  }

  const taskName = normalizeSpace(assessment.taskName ?? "");
  if (taskName && !isBroadIndustryLabel(taskName)) {
    return taskName;
  }

  const firstDescriptionSentence = normalizeSpace((assessment.taskDescription ?? "").split(/[.!?\n]/)[0] ?? "");
  if (firstDescriptionSentence && !isBroadIndustryLabel(firstDescriptionSentence)) {
    return firstDescriptionSentence;
  }

  return "작업 공정";
}

function toRiskFactorCategory(hazard: HazardItem) {
  return deriveRiskCategoryFromRowSignals({
    category: hazard.type,
    cause: hazard.reason,
    hazardFactor: hazard.name,
  });
}

export function normalizeRiskCategoryValue(
  category: string,
  row?: Pick<RiskAssessmentRow, "category" | "cause" | "hazardFactor">,
): RiskCategoryOption {
  if (isAllowedRiskCategory(category)) {
    return category;
  }

  const legacyMapped = normalizeRiskCategoryAlias(category);
  if (legacyMapped) {
    return legacyMapped;
  }

  if (row) {
    return deriveRiskCategoryFromRowSignals(row);
  }

  return "작업특성 요인";
}

function createHazardTokens(row: Pick<RiskAssessmentRow, "category" | "cause" | "hazardFactor">) {
  const normalizedType = resolveRowHazardType(row);
  const typeKeywords = normalizedType ? HAZARD_KEYWORD_MAP[normalizedType] ?? [normalizedType] : [];

  return unique([
    ...typeKeywords,
    normalizedType,
    ...tokenize(row.hazardFactor),
    ...tokenize(row.category),
    ...tokenize(row.cause),
  ]);
}

function createRowSpecificHazardTokens(
  row: Pick<RiskAssessmentRow, "category" | "cause" | "hazardFactor">,
  rowHazardType?: string,
) {
  const hazardKeywords = rowHazardType
    ? unique([
      rowHazardType,
      ...(HAZARD_KEYWORD_MAP[rowHazardType] ?? []),
    ])
    : [];
  const genericHazardTokens = new Set(
    hazardKeywords.map((token) => toCompact(token)),
  );

  return unique([
    ...tokenize(row.cause ?? ""),
    ...tokenize(row.hazardFactor ?? ""),
  ]).filter((token) => {
    const compact = toCompact(token);
    if (compact.length < 2) {
      return false;
    }
    if (LEGAL_BASIS_GENERIC_CONTEXT_TOKENS.has(compact)) {
      return false;
    }
    if (LEGAL_BASIS_ROW_GENERIC_TOKENS.has(compact)) {
      return false;
    }
    if (genericHazardTokens.has(compact)) {
      return false;
    }
    return true;
  });
}

function pickLawEvidenceItems(items: EvidenceItem[]) {
  return items.filter((item) => item.type === "law" && item.sourceBadge === "법령");
}

function sourceWeightByLawItem(item: EvidenceItem) {
  if (item.sourceType === "storage") return 70;
  return 0;
}

function normalizeHazardHints(values: string[]) {
  return unique(
    values
      .map((value) => normalizeHazardType(value, value))
      .filter(Boolean),
  );
}

function buildStorageArticleTitleMap(candidates: LegalBasisCandidate[]) {
  const titleByArticle = new Map<string, string>();
  for (const candidate of candidates) {
    if (candidate.sourceType !== "storage") {
      continue;
    }

    if (!candidate.articleNumber || !candidate.articleTitle) {
      continue;
    }

    titleByArticle.set(candidate.articleNumber, candidate.articleTitle);
  }

  return titleByArticle;
}

function dedupeLegalBasisCandidates(candidates: LegalBasisCandidate[]) {
  const deduped = new Map<string, LegalBasisCandidate>();
  for (const candidate of candidates) {
    if (!candidate.articleNumber || !candidate.legalBasis || !isStrictLegalBasisFormat(candidate.legalBasis)) {
      continue;
    }

    const key = candidate.articleNumber;
    const previous = deduped.get(key);
    const previousScore = previous
      ? previous.sourceWeight + previous.relevanceScore + (previous.legalBasis.includes("(") ? 1 : 0)
      : Number.NEGATIVE_INFINITY;
    const candidateScore = candidate.sourceWeight + candidate.relevanceScore + (candidate.legalBasis.includes("(") ? 1 : 0);

    if (!previous || previousScore < candidateScore) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()].sort((left, right) => {
    const leftScore = left.sourceWeight + left.relevanceScore;
    const rightScore = right.sourceWeight + right.relevanceScore;
    return rightScore - leftScore;
  });
}

function detectFallbackHazardTypes(
  row: Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor">,
  preferredHazardType?: string,
) {
  const rowText = normalizeSpace(`${row.workProcess ?? ""} ${row.category ?? ""} ${row.cause ?? ""} ${row.hazardFactor ?? ""}`);
  const keywordMatchedHazards = Object.entries(HAZARD_KEYWORD_MAP)
    .filter(([, keywords]) => keywords.some((keyword) => rowText.includes(keyword)))
    .map(([hazardType]) => hazardType);

  return normalizeHazardHints([
    preferredHazardType ?? "",
    resolveHazardTypeWithContext(rowText, rowText, preferredHazardType ?? ""),
    ...keywordMatchedHazards,
  ]);
}

function buildRowFallbackCandidates(
  row: Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor">,
  rowHazardType?: string,
): LegalBasisCandidate[] {
  const fallbackHazardTypes = detectFallbackHazardTypes(row, rowHazardType);
  const entries = fallbackHazardTypes.flatMap((hazardType) => resolveHazardArticleMapEntries(hazardType).map((entry) => ({
    hazardType,
    article: entry.article,
    title: entry.title,
  })));
  if (entries.length === 0) {
    return [];
  }

  return dedupeLegalBasisCandidates(entries.map((entry) => ({
    legalBasis: `${STANDARDS_RULES_LAW_NAME} ${entry.article}(${entry.title})`,
    articleNumber: entry.article,
    articleTitle: entry.title,
    searchText: `${entry.article} ${entry.title} ${entry.hazardType}`,
    contextSearchText: `${entry.article} ${entry.title} ${entry.hazardType} ${row.workProcess ?? ""} ${row.cause ?? ""} ${row.hazardFactor ?? ""}`,
    relevanceScore: 80,
    sourceWeight: 50,
    hazardTypes: [entry.hazardType],
    sourceType: "fallback" as const,
  })));
}

function buildLegalBasisCandidates(context: RiskLawContext): LegalBasisCandidateSets {
  const evidenceCandidates: LegalBasisCandidate[] = (context.lawItems ?? [])
    .filter((item) => item.sourceType === "storage")
    .filter((item) => isStandardsRulesLaw(`${item.legalBasis ?? ""} ${item.title}`))
    .map((item) => {
      const articleSource = item.articleNumber || item.legalBasis || item.title;
      const articleNumber = extractArticleNumber(articleSource);
      const articleTitle = extractArticleTitle(articleNumber, [
        item.title,
        item.summaryArticle ?? "",
        item.clausePreview ?? "",
        item.legalBasis ?? "",
      ]);
      const legalBasis = toStandardsRulesLegalBasis(articleSource, [
        item.title,
        item.summaryArticle ?? "",
        item.clausePreview ?? "",
        item.legalBasis ?? "",
      ]);
      const searchText = [
        item.title,
        item.legalBasis ?? "",
        item.articleNumber ?? "",
        item.keywords.join(" "),
        (item.applicationPoints ?? []).join(" "),
        item.summaryBullets.join(" "),
        item.clausePreview ?? "",
        item.relevanceReason ?? "",
        item.applicabilityReason ?? "",
        item.keyExcerpt ?? "",
        item.summaryArticle ?? "",
      ].join(" ");
      const contextSearchText = [
        item.title,
        item.legalBasis ?? "",
        item.articleNumber ?? "",
        item.summaryBullets.join(" "),
        item.clausePreview ?? "",
        item.relevanceReason ?? "",
        item.applicabilityReason ?? "",
        item.keyExcerpt ?? "",
        item.summaryArticle ?? "",
      ].join(" ");

      let defaultTitle = articleTitle;
      if (!defaultTitle && articleNumber) {
        defaultTitle = ARTICLE_TITLE_FALLBACKS.get(articleNumber) ?? "";
      }
      const finalTitle = defaultTitle;

      let finalLegalBasis = legalBasis;
      if (!isStrictLegalBasisFormat(finalLegalBasis) && articleNumber && finalTitle) {
        finalLegalBasis = `${STANDARDS_RULES_LAW_NAME} ${articleNumber}(${finalTitle})`;
      }

      if (!articleNumber || !finalTitle || !isStrictLegalBasisFormat(finalLegalBasis)) {
        return null;
      }

      const inferredType = normalizeHazardType(item.title, searchText);
      const hazardTypes = normalizeHazardHints([
        ...item.keywords,
        ...(item.applicationPoints ?? []),
        inferredType,
      ]);

      return {
        legalBasis: finalLegalBasis,
        articleNumber,
        articleTitle: finalTitle,
        searchText,
        contextSearchText,
        relevanceScore: item.relevanceScore,
        sourceWeight: sourceWeightByLawItem(item),
        hazardTypes,
        sourceType: "storage",
      };
    })
    .filter((candidate): candidate is LegalBasisCandidate => Boolean(candidate));

  const storageTitleByArticle = buildStorageArticleTitleMap(evidenceCandidates);

  const actionCandidates: LegalBasisCandidate[] = (context.lawActionItems ?? [])
    .filter((item) => item.articleNumbers.length > 0)
    .filter((item) => isStandardsRulesLaw(`${item.lawName ?? ""} ${item.legalBasis ?? ""}`))
    .flatMap((item) => {
      const actionSearchText = [
        item.actionText,
        item.legalBasis ?? "",
        item.lawName ?? "",
        item.clausePreview ?? "",
        item.legalRequirement ?? "",
        item.relevanceReason ?? "",
        item.actionNeedReason ?? "",
        item.applicabilityReason ?? "",
        item.keyExcerpt ?? "",
        item.summaryArticle ?? "",
      ].join(" ");

      const inferredType = normalizeHazardType(item.actionText, actionSearchText);
      const hazardTypes = normalizeHazardHints([
        item.actionText,
        item.legalRequirement ?? "",
        inferredType,
      ]);

      return item.articleNumbers.map((articleNumber) => {
        const normalizedArticleNumber = extractArticleNumber(articleNumber);
        const storageArticleTitle = storageTitleByArticle.get(normalizedArticleNumber);
        if (!normalizedArticleNumber || !storageArticleTitle) {
          return null;
        }
        const actionContextText = [
          item.actionText,
          item.legalBasis ?? "",
          item.lawName ?? "",
          item.clausePreview ?? "",
          item.legalRequirement ?? "",
          item.relevanceReason ?? "",
          item.actionNeedReason ?? "",
          item.applicabilityReason ?? "",
          item.keyExcerpt ?? "",
          item.summaryArticle ?? "",
        ].join(" ");
        const legalBasis = formatStandardsRulesLegalBasis(normalizedArticleNumber, storageArticleTitle);
        if (!legalBasis || !isStrictLegalBasisFormat(legalBasis)) {
          return null;
        }

        return {
          legalBasis,
          articleNumber: normalizedArticleNumber,
          articleTitle: storageArticleTitle,
          searchText: actionSearchText,
          contextSearchText: actionContextText,
          relevanceScore: 0,
          sourceWeight: 45,
          hazardTypes,
          sourceType: "action",
        };
      })
        .filter((candidate): candidate is LegalBasisCandidate => Boolean(candidate));
    });

  return {
    storageCandidates: dedupeLegalBasisCandidates(evidenceCandidates),
    actionCandidates: dedupeLegalBasisCandidates(actionCandidates),
  };
}

function countTokenMatches(targetCompact: string, tokens: string[]) {
  let count = 0;
  for (const token of tokens) {
    const compactToken = toCompact(token);
    if (compactToken.length < 2) {
      continue;
    }

    if (targetCompact.includes(compactToken)) {
      count += 1;
    }
  }

  return count;
}

function filterSpecificContextTokens(tokens: string[]) {
  return tokens.filter((token) => {
    const compact = toCompact(token);
    if (compact.length < 2) {
      return false;
    }
    return !LEGAL_BASIS_GENERIC_CONTEXT_TOKENS.has(compact);
  });
}

function countAxisTokenMatches(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length;
}

function contextAxisTokenCount(axes: ContextAxes) {
  return axes.equipment.length + axes.situation.length + axes.target.length + axes.action.length + axes.risk.length;
}

function hasAxisToken(tokens: string[], token: string) {
  return tokens.includes(token);
}

function hasVehicleContext(axes: ContextAxes) {
  return hasAxisToken(axes.equipment, "vehicle_equipment") || hasAxisToken(axes.action, "transport_operation");
}

function hasRotatingContext(axes: ContextAxes) {
  return hasAxisToken(axes.equipment, "rotating_machine") || hasAxisToken(axes.risk, "rotating_entrapment");
}

function calculateContextConflictPenalty(
  rowAxes: ContextAxes,
  candidateAxes: ContextAxes,
  rowHazardType: string,
  candidateHazardTypes: string[],
) {
  const rowVehicleContext = hasVehicleContext(rowAxes)
    && (hasAxisToken(rowAxes.risk, "contact_entrapment") || hasAxisToken(rowAxes.situation, "proximity_zone"));
  const rowRotatingContext = hasRotatingContext(rowAxes);
  const candidateVehicleContext = hasVehicleContext(candidateAxes) || candidateHazardTypes.includes("차량/이동장비 충돌");
  const candidateRotatingContext = hasRotatingContext(candidateAxes) || candidateHazardTypes.includes("끼임/말림");

  let penalty = 0;
  if (rowVehicleContext && !rowRotatingContext && candidateRotatingContext && !candidateVehicleContext) {
    penalty += LEGAL_BASIS_CONTEXT_CONFLICT_PENALTY_STRONG;
  }
  if (rowRotatingContext && !rowVehicleContext && candidateVehicleContext && !candidateRotatingContext) {
    penalty += LEGAL_BASIS_CONTEXT_CONFLICT_PENALTY_STRONG;
  }
  if (rowHazardType === "차량/이동장비 충돌" && candidateRotatingContext && !candidateVehicleContext) {
    penalty += LEGAL_BASIS_CONTEXT_CONFLICT_PENALTY_SOFT;
  }
  if (rowHazardType === "끼임/말림" && candidateVehicleContext && !candidateRotatingContext) {
    penalty += LEGAL_BASIS_CONTEXT_CONFLICT_PENALTY_SOFT;
  }
  return penalty;
}

function scoreLegalBasisCandidate(
  candidate: LegalBasisCandidate,
  rowHazardType: string | undefined,
  hazardTokens: string[],
  rowSpecificTokens: string[],
  workTokens: string[],
  equipmentTokens: string[],
  rowContextAxes: ContextAxes,
  taskHazardTypes: string[],
  taskContextTokens: string[],
): LegalBasisScore {
  const normalizedRowHazardType = normalizeSpace(rowHazardType ?? "");
  const normalizedTaskHazardTypes = normalizeHazardHints(taskHazardTypes);
  const hazardTarget = toCompact(candidate.searchText);
  const contextTarget = toCompact(candidate.contextSearchText || candidate.searchText);
  const specificWorkTokens = filterSpecificContextTokens(workTokens);
  const specificEquipmentTokens = filterSpecificContextTokens(equipmentTokens);
  const candidateContextAxes = extractContextAxes(
    normalizeSpace(`${candidate.searchText} ${candidate.contextSearchText}`),
    [...candidate.hazardTypes, candidate.articleTitle, candidate.articleNumber],
  );
  const candidateHazardTypes = normalizeHazardHints([
    ...candidate.hazardTypes,
    normalizeHazardType(candidate.articleTitle, candidate.searchText),
  ]);
  const hazardTypeMatched = normalizedRowHazardType
    ? candidateHazardTypes.includes(normalizedRowHazardType)
    : false;
  const taskHazardTypeMatched = normalizedTaskHazardTypes.length === 0
    || candidateHazardTypes.some((hazardType) => normalizedTaskHazardTypes.includes(hazardType));
  const rowWithinTaskHazardScope = !normalizedRowHazardType
    || normalizedTaskHazardTypes.length === 0
    || normalizedTaskHazardTypes.includes(normalizedRowHazardType);
  const directMappingEntries = normalizedRowHazardType
    ? resolveHazardArticleMapEntries(normalizedRowHazardType)
    : [];
  const isDirectMatch = directMappingEntries.some((entry) => entry.article === candidate.articleNumber);

  const hazardTokenMatches = countTokenMatches(hazardTarget, hazardTokens);
  const rowSpecificTokenMatches = countTokenMatches(hazardTarget, rowSpecificTokens);
  const workMatches = countTokenMatches(contextTarget, specificWorkTokens);
  const equipmentMatches = countTokenMatches(contextTarget, specificEquipmentTokens);
  const taskContextMatches = countTokenMatches(contextTarget, taskContextTokens);
  const equipmentAxisMatches = countAxisTokenMatches(rowContextAxes.equipment, candidateContextAxes.equipment);
  const situationAxisMatches = countAxisTokenMatches(rowContextAxes.situation, candidateContextAxes.situation);
  const targetAxisMatches = countAxisTokenMatches(rowContextAxes.target, candidateContextAxes.target);
  const actionAxisMatches = countAxisTokenMatches(rowContextAxes.action, candidateContextAxes.action);
  const riskAxisMatches = countAxisTokenMatches(rowContextAxes.risk, candidateContextAxes.risk);
  const contextAxisMatches = equipmentAxisMatches + situationAxisMatches + targetAxisMatches + actionAxisMatches + riskAxisMatches;
  const rowContextSignalCount = contextAxisTokenCount(rowContextAxes);
  const hasContextHint = LEGAL_BASIS_CONTEXT_HINT_PATTERN.test(candidate.contextSearchText || candidate.searchText);
  const hasContextTokens = specificWorkTokens.length > 0 || specificEquipmentTokens.length > 0;
  const requiredHazardTokenMatches = candidate.sourceType === "fallback"
    ? LEGAL_BASIS_REQUIRED_HAZARD_TOKEN_MATCHES
    : (
      !normalizedRowHazardType
        ? 0
        : (
          hazardTokens.length >= LEGAL_BASIS_STRICT_HAZARD_TOKEN_THRESHOLD
            ? LEGAL_BASIS_REQUIRED_HAZARD_TOKEN_MATCHES_STRICT
            : LEGAL_BASIS_REQUIRED_HAZARD_TOKEN_MATCHES
        )
    );
  const requiredRowSpecificTokenMatches = candidate.sourceType === "fallback"
    ? 0
    : (
      !normalizedRowHazardType
        ? (rowSpecificTokens.length > 0 ? LEGAL_BASIS_REQUIRED_ROW_SPECIFIC_TOKEN_MATCHES : 0)
        : (
          !hasContextTokens && rowSpecificTokens.length >= LEGAL_BASIS_ROW_SPECIFIC_TOKEN_THRESHOLD
            ? LEGAL_BASIS_REQUIRED_ROW_SPECIFIC_TOKEN_MATCHES
            : 0
        )
    );
  const hasRowSpecificRequirement = requiredRowSpecificTokenMatches === 0
    || rowSpecificTokenMatches >= requiredRowSpecificTokenMatches;
  const keywordDensity = hazardTokenMatches + rowSpecificTokenMatches + workMatches + equipmentMatches;
  const conflictPenalty = normalizedRowHazardType && !hazardTypeMatched && !isDirectMatch
    ? LEGAL_BASIS_CONFLICT_PENALTY
    : 0;
  const genericPenalty = rowSpecificTokens.length === 0
    ? LEGAL_BASIS_GENERIC_PENALTY
    : 0;
  const lowDensityPenalty = keywordDensity <= 1
    ? LEGAL_BASIS_LOW_DENSITY_PENALTY
    : 0;
  const contextConflictPenalty = calculateContextConflictPenalty(
    rowContextAxes,
    candidateContextAxes,
    normalizedRowHazardType,
    candidateHazardTypes,
  );
  const taskHazardScopePenalty = taskHazardTypeMatched ? 0 : 34;

  const score = candidate.sourceWeight
    + Math.round(candidate.relevanceScore / 10)
    + (hazardTypeMatched ? 35 : 0)
    + (taskHazardTypeMatched ? 10 : 0)
    + Math.min(3, hazardTokenMatches) * 12
    + Math.min(3, rowSpecificTokenMatches) * 10
    + (workMatches > 0 ? 10 : 0)
    + (equipmentMatches > 0 ? 10 : 0)
    + Math.min(3, taskContextMatches) * 6
    + equipmentAxisMatches * LEGAL_BASIS_CONTEXT_MATCH_SCORE.equipment
    + situationAxisMatches * LEGAL_BASIS_CONTEXT_MATCH_SCORE.situation
    + targetAxisMatches * LEGAL_BASIS_CONTEXT_MATCH_SCORE.target
    + actionAxisMatches * LEGAL_BASIS_CONTEXT_MATCH_SCORE.action
    + riskAxisMatches * LEGAL_BASIS_CONTEXT_MATCH_SCORE.risk
    + (hasContextHint ? 4 : 0)
    + (isDirectMatch ? 30 : 0)
    - conflictPenalty
    - genericPenalty
    - lowDensityPenalty
    - contextConflictPenalty
    - taskHazardScopePenalty;

  const hasWorkOrEquipmentRequirement = candidate.sourceType === "fallback"
    ? true
    : (
      !hasContextTokens
        ? true
        : workMatches > 0 || equipmentMatches > 0
    );

  const hasHazardTypeValidation = !normalizedRowHazardType
    || hazardTypeMatched
    || isDirectMatch
    || (
      candidate.sourceType === "fallback"
      && hazardTokenMatches >= LEGAL_BASIS_REQUIRED_HAZARD_TOKEN_MATCHES_STRICT
    );
  const requiredKeywordDensity = candidate.sourceType === "fallback"
    ? 1
    : (rowSpecificTokens.length > 0 ? 2 : 1);
  const hasKeywordDensity = keywordDensity >= requiredKeywordDensity;
  const requiredContextAxisMatches = rowContextSignalCount >= 2
    ? 1
    : 0;
  const hasContextAxisMatch = contextAxisMatches >= requiredContextAxisMatches;
  const minimumScore = candidate.sourceType === "fallback"
    ? LEGAL_BASIS_MIN_SCORE_FALLBACK
    : (!normalizedRowHazardType ? LEGAL_BASIS_MIN_SCORE - 10 : LEGAL_BASIS_MIN_SCORE);

  const passes = hazardTokenMatches >= requiredHazardTokenMatches
    && rowWithinTaskHazardScope
    && taskHazardTypeMatched
    && hasHazardTypeValidation
    && hasKeywordDensity
    && hasContextAxisMatch
    && hasRowSpecificRequirement
    && hasWorkOrEquipmentRequirement
    && score >= minimumScore;

  return {
    score,
    hazardTypeMatched,
    hazardTokenMatches,
    rowSpecificTokenMatches,
    keywordDensity,
    workMatches,
    equipmentMatches,
    hasContextHint,
    requiredHazardTokenMatches,
    requiredRowSpecificTokenMatches,
    passes,
  };
}

function legalBasisDedupKey(candidate: Pick<LegalBasisCandidate, "legalBasis" | "articleNumber">) {
  const normalizedArticleNumber = extractArticleNumber(candidate.articleNumber ?? "");
  if (normalizedArticleNumber) {
    return toCompact(normalizedArticleNumber);
  }

  const extractedArticleNumber = extractArticleNumber(candidate.legalBasis ?? "");
  if (extractedArticleNumber) {
    return toCompact(extractedArticleNumber);
  }

  return toCompact(candidate.legalBasis ?? "");
}

function rankLegalBasisCandidatesForRow(
  row: Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor">,
  context: RiskLawContext,
  candidates: LegalBasisCandidate[],
) {
  if (candidates.length === 0) {
    return [] as RankedLegalBasisCandidate[];
  }

  const rowHazardType = resolveRowHazardType(row) || undefined;

  const hazardTokens = createHazardTokens(row);
  const rowSpecificTokens = createRowSpecificHazardTokens(row, rowHazardType);

  const workTokens = unique([
    ...tokenize(row.workProcess ?? ""),
    ...(context.workTokens ?? []).flatMap((token) => tokenize(token)),
  ]).slice(0, 12);
  const equipmentTokens = unique(
    (context.equipmentTokens ?? []).flatMap((token) => tokenize(token)),
  ).slice(0, 12);
  const rowContextAxes = extractContextAxes(
    normalizeSpace(`${row.workProcess ?? ""} ${row.category ?? ""} ${row.cause ?? ""} ${row.hazardFactor ?? ""}`),
    [...workTokens, ...equipmentTokens, ...tokenize(row.cause ?? ""), ...tokenize(row.hazardFactor ?? "")],
  );
  const taskHazardTypes = normalizeHazardHints([
    ...(context.taskHazardTypes ?? []),
    rowHazardType ?? "",
  ]);
  const taskContextTokens = unique([
    ...(context.taskContextTokens ?? []),
    ...workTokens,
    ...equipmentTokens,
    ...tokenize(row.workProcess ?? ""),
    ...tokenize(row.cause ?? ""),
    ...tokenize(row.hazardFactor ?? ""),
  ]).slice(0, 24);

  const ranked = candidates
    .map((candidate) => {
      const scored = scoreLegalBasisCandidate(
        candidate,
        rowHazardType,
        hazardTokens,
        rowSpecificTokens,
        workTokens,
        equipmentTokens,
        rowContextAxes,
        taskHazardTypes,
        taskContextTokens,
      );
      if (!scored.passes) {
        return null;
      }

      return {
        candidate,
        score: scored.score,
      } satisfies RankedLegalBasisCandidate;
    })
    .filter((item): item is RankedLegalBasisCandidate => Boolean(item))
    .sort((left, right) => right.score - left.score);

  return ranked;
}

function normalizeSimilarityText(text: string) {
  return normalizeSpace(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function buildBigrams(text: string) {
  if (text.length < 2) {
    return new Set<string>(text ? [text] : []);
  }

  const grams = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }

  return grams;
}

function jaccardSimilarity(left: string, right: string) {
  const leftSet = buildBigrams(normalizeSimilarityText(left));
  const rightSet = buildBigrams(normalizeSimilarityText(right));

  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function areMeasuresNearDuplicate(left: string, right: string, threshold = MEASURE_DUPLICATE_THRESHOLD) {
  const normalizedLeft = normalizeSpace(left);
  const normalizedRight = normalizeSpace(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  const compactLeft = toCompact(normalizedLeft);
  const compactRight = toCompact(normalizedRight);
  if (compactLeft && compactRight && (compactLeft.includes(compactRight) || compactRight.includes(compactLeft))) {
    return true;
  }

  return jaccardSimilarity(normalizedLeft, normalizedRight) >= threshold;
}

function isNearDuplicate(text: string, used: string[], threshold = MEASURE_DUPLICATE_THRESHOLD) {
  return used.some((item) => areMeasuresNearDuplicate(text, item, threshold));
}

function truncateMeasureAtBoundary(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace < Math.floor(maxLength * 0.6)) {
    return "";
  }

  return sliced.slice(0, lastSpace).trim();
}

function finalizeMeasureSentence(text: string) {
  let sentence = normalizeSpace(text)
    .replace(/[;:,]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .trim();

  if (!sentence) {
    return "";
  }

  if (MEASURE_FRAGMENT_ENDING_PATTERN.test(sentence)) {
    return "";
  }

  if (sentence.endsWith("필요")) {
    sentence = `${sentence}하다`;
  } else if (MEASURE_ACTION_STEM_PATTERN.test(sentence)) {
    sentence = `${sentence}한다`;
  } else if (!MEASURE_SENTENCE_END_PATTERN.test(sentence)) {
    return "";
  }

  return `${sentence}.`;
}

function toConciseMeasure(text: string) {
  const normalized = normalizeSpace(text)
    .replace(/\r?\n+/g, " ")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^[-*•◈\s]+/, "");

  if (!normalized) {
    return "";
  }

  const colonNormalized = normalized.includes(":")
    ? normalizeSpace(normalized.split(":").slice(1).join(":")) || normalized
    : normalized;

  const firstSentence = colonNormalized
    .split(/(?<=[.!?])\s+|\r?\n+|;/g)
    .map((part) => normalizeSpace(part))
    .find(Boolean) ?? colonNormalized;

  const truncated = truncateMeasureAtBoundary(firstSentence, MEASURE_MAX_LENGTH);
  if (!truncated) {
    return "";
  }

  const finalized = finalizeMeasureSentence(truncated);
  if (!finalized || finalized.length > MEASURE_MAX_LENGTH) {
    return "";
  }

  return finalized;
}

function fallbackMeasureByHazard(hazard: HazardItem, kind: "current" | "reduction") {
  const normalizedType = normalizeHazardType(hazard.type, hazard.name) || "위험요인";
  const templatePool = HAZARD_MEASURE_TEMPLATE[normalizedType]?.[kind] ?? [];
  const fallback = templatePool[0]
    ?? (kind === "current"
      ? "작업 중 위험요인 통제 상태를 점검한다."
      : "위험요인 제거·통제 조치를 시행한다.");

  return toConciseMeasure(fallback);
}

function ensureUniqueMeasure(text: string, used: string[], hazard: HazardItem, kind: "current" | "reduction") {
  const concise = toConciseMeasure(text);
  if (concise && !isNearDuplicate(concise, used)) {
    return concise;
  }

  const fallback = fallbackMeasureByHazard(hazard, kind);
  if (fallback && !isNearDuplicate(fallback, used)) {
    return fallback;
  }

  const hazardAnchor = toConciseMeasure(
    kind === "current"
      ? `${hazard.name} 위험요인 통제 상태를 점검한다.`
      : `${hazard.name} 위험요인 추가 조치를 시행한다.`,
  );
  if (hazardAnchor && !isNearDuplicate(hazardAnchor, used)) {
    return hazardAnchor;
  }

  return toConciseMeasure(
    kind === "current"
      ? `현장 통제 상태 ${used.length + 1}차 점검을 실시한다.`
      : `현장 개선 조치 ${used.length + 1}차 이행을 완료한다.`,
  );
}

function scoreMeasureRelevance(text: string, hazardTokens: string[], workTokens: string[], equipmentTokens: string[]) {
  const target = toCompact(text);
  const hazardMatches = countTokenMatches(target, hazardTokens);
  const workMatches = countTokenMatches(target, workTokens);
  const equipmentMatches = countTokenMatches(target, equipmentTokens);

  return hazardMatches * 6 + workMatches * 2 + equipmentMatches * 2;
}

function assignMeasuresByRow(
  hazards: HazardItem[],
  sourceTexts: string[],
  context: RiskLawContext,
  kind: "current" | "reduction",
) {
  const candidates = unique(sourceTexts.map((text) => toConciseMeasure(text)).filter(Boolean));
  const used: string[] = [];

  return hazards.map((hazard) => {
    const hazardTokens = createHazardTokens({
      category: hazard.type,
      cause: hazard.reason,
      hazardFactor: hazard.name,
    });

    const ranked = candidates
      .map((text) => ({
        text,
        score: scoreMeasureRelevance(text, hazardTokens, context.workTokens ?? [], context.equipmentTokens ?? []),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score);

    const nonDuplicate = ranked.find((item) => !isNearDuplicate(item.text, used));
    const selected = nonDuplicate
      ? nonDuplicate.text
      : (ranked[0]?.text ?? "");

    const uniqueMeasure = ensureUniqueMeasure(selected, used, hazard, kind);
    used.push(uniqueMeasure);
    return uniqueMeasure;
  });
}

export function getRiskLawContextFromAssessment(assessment: AssessmentData): RiskLawContext {
  const taskContextProfile = buildTaskContextProfile(assessment);
  return {
    lawItems: pickLawEvidenceItems(assessment.evidenceItems),
    lawActionItems: assessment.lawActionItems,
    workTokens: unique([
      ...tokenize(assessment.taskName),
      ...tokenize(assessment.profile.industry),
      ...tokenize(assessment.profile.workLocation),
    ]).slice(0, 12),
    equipmentTokens: unique(
      (assessment.profile.equipment ?? []).flatMap((item) => tokenize(item)),
    ).slice(0, 12),
    taskHazardTypes: taskContextProfile.hazardTypes,
    taskContextTokens: taskContextProfile.contextTokens,
  };
}

export function resolveRiskRowLegalBasis(
  row: Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor">,
  context: RiskLawContext,
) {
  return resolveRiskRowsLegalBasis([row], context)[0] ?? "";
}

function evaluateRiskRowsLegalBasis(
  rows: Array<Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor">>,
  context: RiskLawContext,
) {
  const { storageCandidates, actionCandidates } = buildLegalBasisCandidates(context);

  if (import.meta.env.DEV) {
    console.debug(
      "[LegalBasis] storageCandidates:",
      storageCandidates.length,
      "actionCandidates:",
      actionCandidates.length,
      "lawItems:",
      context.lawItems?.length,
      "actionItems:",
      context.lawActionItems?.length,
    );
  }

  const mergeRankedCandidates = (...groups: RankedLegalBasisCandidate[][]) => {
    const deduped = new Map<string, RankedLegalBasisCandidate>();
    for (const group of groups) {
      for (const item of group) {
        const key = legalBasisDedupKey(item.candidate);
        const previous = deduped.get(key);
        if (!previous || previous.score < item.score) {
          deduped.set(key, item);
        }
      }
    }
    return [...deduped.values()].sort((left, right) => right.score - left.score);
  };

  const evaluations: RiskRowLegalBasisEvaluation[] = rows.map((row, index) => {
    const rowHazardType = resolveRowHazardType(row);
    const rankedStorage = rankLegalBasisCandidatesForRow(row, context, storageCandidates);
    const rowFallbackCandidates = buildRowFallbackCandidates(row, rowHazardType || undefined);
    const rankedFallback = rankLegalBasisCandidatesForRow(row, context, rowFallbackCandidates);
    const rankedAction = rankLegalBasisCandidatesForRow(row, context, actionCandidates);
    const rankedPrimary = mergeRankedCandidates(rankedStorage, rankedAction);
    return {
      index,
      ranked: rankedPrimary.length > 0
        ? rankedPrimary
        : mergeRankedCandidates(rankedFallback),
    };
  });

  return evaluations;
}

function mapRiskRowCandidateOptions(
  ranked: RankedLegalBasisCandidate[],
  maxCandidates: number,
) {
  const deduped = new Map<string, RiskLegalBasisCandidateOption>();
  for (const item of ranked) {
    const key = legalBasisDedupKey(item.candidate);
    const previous = deduped.get(key);
    if (previous && previous.score >= item.score) {
      continue;
    }

    deduped.set(key, {
      legalBasis: item.candidate.legalBasis,
      articleNumber: item.candidate.articleNumber,
      articleTitle: item.candidate.articleTitle,
      score: item.score,
      sourceType: item.candidate.sourceType,
    });
  }

  return [...deduped.values()]
    .filter((candidate) => isStrictLegalBasisFormat(candidate.legalBasis))
    .sort((left, right) => right.score - left.score)
    .slice(0, maxCandidates);
}

export function getRiskRowsLegalBasisCandidateOptions(
  rows: Array<Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor">>,
  context: RiskLawContext,
  maxCandidates = 3,
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [] as RiskLegalBasisCandidateOption[][];
  }

  const safeMaxCandidates = Number.isFinite(maxCandidates) ? Math.max(1, Math.trunc(maxCandidates)) : 3;
  const evaluations = evaluateRiskRowsLegalBasis(rows, context);
  const optionsByIndex = rows.map(() => [] as RiskLegalBasisCandidateOption[]);

  for (const evaluation of evaluations) {
    optionsByIndex[evaluation.index] = mapRiskRowCandidateOptions(evaluation.ranked, safeMaxCandidates);
  }

  return optionsByIndex;
}

export function resolveRiskRowsLegalBasis(
  rows: Array<Pick<RiskAssessmentRow, "workProcess" | "category" | "cause" | "hazardFactor">>,
  context: RiskLawContext,
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const evaluations = evaluateRiskRowsLegalBasis(rows, context);

  const sortedByCandidateScarcity = evaluations
    .slice()
    .sort((left, right) => {
      if (left.ranked.length !== right.ranked.length) {
        return left.ranked.length - right.ranked.length;
      }
      const leftTopScore = left.ranked[0]?.score ?? Number.NEGATIVE_INFINITY;
      const rightTopScore = right.ranked[0]?.score ?? Number.NEGATIVE_INFINITY;
      return rightTopScore - leftTopScore;
    });

  const resolved = rows.map(() => "");
  const usedLegalBasisKeys = new Set<string>();

  for (const item of sortedByCandidateScarcity) {
    if (item.ranked.length === 0) {
      resolved[item.index] = "";
      continue;
    }

    const selected = item.ranked.find(({ candidate }) => {
      const legalBasisKey = legalBasisDedupKey(candidate);
      return Boolean(legalBasisKey) && !usedLegalBasisKeys.has(legalBasisKey);
    });
    if (!selected) {
      resolved[item.index] = "";
      continue;
    }

    const resolvedLegalBasis = isStrictLegalBasisFormat(selected.candidate.legalBasis)
      ? selected.candidate.legalBasis
      : "";
    resolved[item.index] = resolvedLegalBasis;
    if (resolvedLegalBasis) {
      const legalBasisKey = legalBasisDedupKey(selected.candidate);
      if (legalBasisKey) {
        usedLegalBasisKeys.add(legalBasisKey);
      }
    }
  }

  return resolved.map((legalBasis) => (isStrictLegalBasisFormat(legalBasis) ? legalBasis : ""));
}

interface RiskRowValidationFailure {
  field: RiskValidationField;
  reasonCode: string;
  detectedHazardType: string;
}

interface RiskRowValidationPassContext {
  expectedHazardType: string;
  detectedHazardType: string;
  recommendedLegalBasis: string;
  derivedCategory: RiskCategoryOption;
  failures: RiskRowValidationFailure[];
}

function isMostlyEmptyRiskRowForValidation(row: RiskAssessmentRow) {
  return [
    row.workProcess ?? "",
    row.cause ?? "",
    row.hazardFactor ?? "",
    row.currentMeasure ?? "",
    row.reductionMeasure ?? "",
    row.legalBasis ?? "",
    row.improvementDate ?? "",
    row.completionDate ?? "",
    row.responsiblePerson ?? "",
  ].every((value) => normalizeSpace(value).length === 0);
}

function resolveExpectedHazardTypeForRow(row: RiskAssessmentRow) {
  return resolveRowHazardType(row)
    || resolveHazardTypeWithContext(
      `${row.cause ?? ""} ${row.hazardFactor ?? ""}`,
      `${row.category ?? ""} ${row.workProcess ?? ""}`,
      row.category ?? "",
    )
    || "추락";
}

function resolveDetectedHazardTypeForRow(row: RiskAssessmentRow, fallbackHazardType: string) {
  return resolveHazardTypeWithContext(
    `${row.currentMeasure ?? ""} ${row.reductionMeasure ?? ""}`,
    `${row.cause ?? ""} ${row.hazardFactor ?? ""}`,
    row.category ?? "",
  ) || fallbackHazardType;
}

function detectHazardTypeFromField(row: RiskAssessmentRow, field: RiskValidationField, fallbackHazardType: string) {
  if (field === "category") {
    return resolveHazardTypeWithContext(
      `${row.category ?? ""}`,
      `${row.cause ?? ""} ${row.hazardFactor ?? ""}`,
      row.category ?? "",
    ) || fallbackHazardType;
  }
  if (field === "cause") {
    return resolveHazardTypeWithContext(
      `${row.cause ?? ""}`,
      `${row.hazardFactor ?? ""} ${row.category ?? ""}`,
      row.category ?? "",
    ) || fallbackHazardType;
  }
  if (field === "hazardFactor") {
    return resolveHazardTypeWithContext(
      `${row.hazardFactor ?? ""}`,
      `${row.cause ?? ""} ${row.category ?? ""}`,
      row.category ?? "",
    ) || fallbackHazardType;
  }
  if (field === "currentMeasure") {
    return resolveHazardTypeWithContext(
      `${row.currentMeasure ?? ""}`,
      `${row.cause ?? ""} ${row.hazardFactor ?? ""}`,
      row.category ?? "",
    ) || fallbackHazardType;
  }
  if (field === "reductionMeasure") {
    return resolveHazardTypeWithContext(
      `${row.reductionMeasure ?? ""}`,
      `${row.cause ?? ""} ${row.hazardFactor ?? ""}`,
      row.category ?? "",
    ) || fallbackHazardType;
  }
  return resolveHazardTypeWithContext(
    `${row.legalBasis ?? ""}`,
    `${row.cause ?? ""} ${row.hazardFactor ?? ""}`,
    row.category ?? "",
  ) || fallbackHazardType;
}

function buildRowScopedValidationContext(
  row: RiskAssessmentRow,
  context: RiskLawContext,
  expectedHazardType: string,
): RiskLawContext {
  return {
    ...context,
    taskHazardTypes: normalizeHazardHints([
      ...(context.taskHazardTypes ?? []),
      expectedHazardType,
    ]),
    taskContextTokens: unique([
      ...(context.taskContextTokens ?? []),
      ...tokenize(row.workProcess ?? ""),
      ...tokenize(row.cause ?? ""),
      ...tokenize(row.hazardFactor ?? ""),
    ]).slice(0, 24),
  };
}

function evaluateRiskRowValidationPass(
  row: RiskAssessmentRow,
  context: RiskLawContext,
): RiskRowValidationPassContext {
  const expectedHazardType = resolveExpectedHazardTypeForRow(row);
  const detectedHazardType = resolveDetectedHazardTypeForRow(row, expectedHazardType);
  const derivedCategory = deriveRiskCategoryFromRowSignals({
    category: row.category,
    cause: row.cause,
    hazardFactor: row.hazardFactor,
  });

  const rowScopedContext = buildRowScopedValidationContext(row, context, expectedHazardType);
  const recommendedLegalBasis = resolveRiskRowsLegalBasis([{
    workProcess: row.workProcess,
    category: row.category,
    cause: row.cause,
    hazardFactor: row.hazardFactor,
  }], rowScopedContext)[0] ?? "";

  const failures: RiskRowValidationFailure[] = [];

  const normalizedCategory = normalizeRiskCategoryValue(row.category, row);
  if (normalizedCategory !== derivedCategory) {
    failures.push({
      field: "category",
      reasonCode: "category_mismatch",
      detectedHazardType: detectHazardTypeFromField(row, "category", expectedHazardType),
    });
  }

  if (
    !hasHazardSignalMatch(row.cause, expectedHazardType)
    || hasDominantConflictingHazardSignal(row.cause, expectedHazardType)
  ) {
    failures.push({
      field: "cause",
      reasonCode: "cause_hazard_mismatch",
      detectedHazardType: detectHazardTypeFromField(row, "cause", expectedHazardType),
    });
  }

  if (
    !hasHazardSignalMatch(row.hazardFactor, expectedHazardType)
    || hasDominantConflictingHazardSignal(row.hazardFactor, expectedHazardType)
  ) {
    failures.push({
      field: "hazardFactor",
      reasonCode: "hazard_factor_mismatch",
      detectedHazardType: detectHazardTypeFromField(row, "hazardFactor", expectedHazardType),
    });
  }

  if (shouldRewriteMeasureForConsistency(row, expectedHazardType, row.currentMeasure)) {
    failures.push({
      field: "currentMeasure",
      reasonCode: "current_measure_mismatch",
      detectedHazardType: detectHazardTypeFromField(row, "currentMeasure", expectedHazardType),
    });
  }

  if (shouldRewriteMeasureForConsistency(row, expectedHazardType, row.reductionMeasure)) {
    failures.push({
      field: "reductionMeasure",
      reasonCode: "reduction_measure_mismatch",
      detectedHazardType: detectHazardTypeFromField(row, "reductionMeasure", expectedHazardType),
    });
  }

  const normalizedLegalBasis = normalizeSpace(row.legalBasis ?? "");
  if (normalizedLegalBasis && !isStrictLegalBasisFormat(normalizedLegalBasis)) {
    failures.push({
      field: "legalBasis",
      reasonCode: "legal_basis_invalid_format",
      detectedHazardType: detectHazardTypeFromField(row, "legalBasis", expectedHazardType),
    });
  } else if (recommendedLegalBasis) {
    const currentArticle = extractArticleNumber(normalizedLegalBasis);
    const recommendedArticle = extractArticleNumber(recommendedLegalBasis);
    if (currentArticle && recommendedArticle && currentArticle !== recommendedArticle) {
      failures.push({
        field: "legalBasis",
        reasonCode: "legal_basis_mismatch",
        detectedHazardType: detectHazardTypeFromField(row, "legalBasis", expectedHazardType),
      });
    }
  }

  return {
    expectedHazardType,
    detectedHazardType,
    recommendedLegalBasis,
    derivedCategory,
    failures,
  };
}

function rewriteRowNarrativesForValidation(
  row: RiskAssessmentRow,
  expectedHazardType: string,
  rowIndex: number,
  assessment?: AssessmentData,
) {
  if (assessment) {
    return rewriteRowNarrativesByContext(row, assessment, rowIndex + 1, expectedHazardType);
  }

  const contextText = normalizeSpace(`${row.workProcess ?? ""} ${row.cause ?? ""} ${row.hazardFactor ?? ""}`);
  const operationDescriptor = inferOperationDescriptor(contextText);
  const equipment = inferEquipmentAnchor(contextText, row.workProcess || "작업 설비");
  const failureDescriptor = inferFailureDescriptor(contextText, expectedHazardType, rowIndex + 1);
  const riskLabel = hazardTypeRiskLabel(expectedHazardType);

  return {
    cause: finalizeCauseNarrative(
      `${operationDescriptor} 중 ${equipment}의 ${failureDescriptor} 상태에서 ${riskLabel} 사고가 발생할 수 있음`,
    ),
    hazardFactor: finalizeHazardFactorNarrative(
      `${equipment} ${failureDescriptor}로 ${riskLabel} 위험 증가`,
    ),
  };
}

function buildRiskRowValidationSummaryInternal(rows: RiskAssessmentRow[]): RiskRowValidationSummary {
  const hazardTypeCounts: Record<string, number> = {};
  let reviewRequiredRows = 0;

  for (const row of rows) {
    const hazardType = row.expectedHazardType
      || resolveExpectedHazardTypeForRow(row);
    if (hazardType) {
      hazardTypeCounts[hazardType] = (hazardTypeCounts[hazardType] ?? 0) + 1;
    }
    if (row.validationStatus === "review_required") {
      reviewRequiredRows += 1;
    }
  }

  const totalRows = rows.length;
  return {
    totalRows,
    reviewRequiredRows,
    okRows: totalRows - reviewRequiredRows,
    hazardTypeCounts,
  };
}

export function validateRiskAssessmentRows(
  rows: RiskAssessmentRow[],
  context: RiskLawContext = {},
  options: RiskRowsValidationOptions = {},
): RiskRowsValidationResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      rows: [],
      validationSummary: {
        totalRows: 0,
        reviewRequiredRows: 0,
        okRows: 0,
        hazardTypeCounts: {},
      },
      validationEvents: [],
    };
  }

  const rewriteInvalidFields = options.rewriteInvalidFields === true;
  const clearUnresolvedFields = options.clearUnresolvedFields === true;
  const timestamp = options.timestamp ?? new Date().toISOString();
  const siteName = normalizeSpace(options.siteName ?? "");
  const validationEvents: RiskRowValidationEvent[] = [];

  const validatedRows = rows.map((sourceRow, rowIndex) => {
    let workingRow = createEmptyRiskAssessmentRow(sourceRow);
    if (isMostlyEmptyRiskRowForValidation(workingRow)) {
      return {
        ...workingRow,
        validationStatus: "ok" as RiskValidationStatus,
        reviewRequiredFields: [] as RiskValidationField[],
        reviewReasonCodes: [] as string[],
        expectedHazardType: "",
        detectedHazardType: "",
      };
    }

    let pass = evaluateRiskRowValidationPass(workingRow, context);
    const rewrittenFields = new Set<RiskValidationField>();
    const initialFailures = pass.failures.slice();

    if (rewriteInvalidFields && pass.failures.length > 0) {
      if (pass.failures.some((failure) => failure.field === "category")) {
        workingRow = {
          ...workingRow,
          category: pass.derivedCategory,
        };
        rewrittenFields.add("category");
      }

      if (
        pass.failures.some((failure) =>
          failure.field === "cause" || failure.field === "hazardFactor"
        )
      ) {
        const rewrittenNarratives = rewriteRowNarrativesForValidation(
          workingRow,
          pass.expectedHazardType,
          rowIndex,
          options.assessment,
        );
        workingRow = {
          ...workingRow,
          cause: rewrittenNarratives.cause,
          hazardFactor: rewrittenNarratives.hazardFactor,
        };
        rewrittenFields.add("cause");
        rewrittenFields.add("hazardFactor");
      }

      if (pass.failures.some((failure) => failure.field === "currentMeasure")) {
        workingRow = {
          ...workingRow,
          currentMeasure: rewriteMeasureByHazardType(workingRow, pass.expectedHazardType, "current", rowIndex + 1),
        };
        rewrittenFields.add("currentMeasure");
      }

      if (pass.failures.some((failure) => failure.field === "reductionMeasure")) {
        workingRow = {
          ...workingRow,
          reductionMeasure: rewriteMeasureByHazardType(workingRow, pass.expectedHazardType, "reduction", rowIndex + 5),
        };
        rewrittenFields.add("reductionMeasure");
      }

      if (pass.failures.some((failure) => failure.field === "legalBasis")) {
        workingRow = {
          ...workingRow,
          legalBasis: pass.recommendedLegalBasis,
        };
        rewrittenFields.add("legalBasis");
      }

      pass = evaluateRiskRowValidationPass(workingRow, context);

      if (clearUnresolvedFields && pass.failures.length > 0) {
        const unresolvedFields = unique(pass.failures.map((failure) => failure.field));
        for (const field of unresolvedFields) {
          if (field === "category") {
            workingRow = {
              ...workingRow,
              category: pass.derivedCategory,
            };
            continue;
          }

          if (field === "cause") {
            workingRow = { ...workingRow, cause: "" };
            continue;
          }
          if (field === "hazardFactor") {
            workingRow = { ...workingRow, hazardFactor: "" };
            continue;
          }
          if (field === "currentMeasure") {
            workingRow = { ...workingRow, currentMeasure: "" };
            continue;
          }
          if (field === "reductionMeasure") {
            workingRow = { ...workingRow, reductionMeasure: "" };
            continue;
          }
          if (field === "legalBasis") {
            workingRow = { ...workingRow, legalBasis: "" };
          }
        }
        pass = evaluateRiskRowValidationPass(workingRow, context);
      }
    }

    const reviewRequiredFields = unique(pass.failures.map((failure) => failure.field));
    const reviewReasonCodes = unique(pass.failures.map((failure) => failure.reasonCode));
    const validationStatus: RiskValidationStatus = reviewRequiredFields.length > 0 ? "review_required" : "ok";

    const eventSourceFailures = initialFailures.length > 0
      ? initialFailures
      : pass.failures;
    for (const failure of eventSourceFailures) {
      validationEvents.push({
        timestamp,
        siteName,
        formType: "risk-assessment",
        rowIndex,
        expectedHazardType: pass.expectedHazardType,
        detectedHazardType: failure.detectedHazardType || pass.detectedHazardType,
        field: failure.field,
        reasonCode: failure.reasonCode,
        rewritten: rewrittenFields.has(failure.field),
        finalStatus: validationStatus,
      });
    }

    return {
      ...workingRow,
      validationStatus,
      reviewRequiredFields,
      reviewReasonCodes,
      expectedHazardType: pass.expectedHazardType,
      detectedHazardType: pass.detectedHazardType,
    };
  });

  return {
    rows: validatedRows,
    validationSummary: buildRiskRowValidationSummaryInternal(validatedRows),
    validationEvents,
  };
}

export function buildRiskRowValidationSummary(rows: RiskAssessmentRow[]) {
  return buildRiskRowValidationSummaryInternal(rows);
}

export function reclassifyRiskAssessmentRows(rows: RiskAssessmentRow[]) {
  return rows.map((row) => ({
    ...row,
    category: deriveRiskCategoryFromRowSignals({
      category: row.category,
      cause: row.cause,
      hazardFactor: row.hazardFactor,
    }),
  }));
}

export function normalizeRiskAssessmentRows(rows: RiskAssessmentRow[]) {
  return rows.map((row) =>
    createEmptyRiskAssessmentRow({
      ...row,
      category: normalizeRiskCategoryValue(row.category, {
        category: row.category,
        cause: row.cause,
        hazardFactor: row.hazardFactor,
      }),
      legalBasis: isStrictLegalBasisFormat(row.legalBasis ?? "")
        ? normalizeSpace(row.legalBasis ?? "")
        : "",
    }));
}

export function createEmptyRiskAssessmentRow(seed: Partial<RiskAssessmentRow> = {}): RiskAssessmentRow {
  const frequency = typeof seed.frequency === "number" ? Math.min(5, Math.max(1, seed.frequency)) : 1;
  const severity = typeof seed.severity === "number" ? Math.min(5, Math.max(1, seed.severity)) : 1;
  const validationStatus: RiskValidationStatus = seed.validationStatus === "review_required"
    ? "review_required"
    : "ok";
  const reviewRequiredFields = Array.isArray(seed.reviewRequiredFields)
    ? seed.reviewRequiredFields.filter((field): field is RiskValidationField => RISK_ROW_VALIDATION_FIELDS.includes(field))
    : [];
  const reviewReasonCodes = Array.isArray(seed.reviewReasonCodes)
    ? seed.reviewReasonCodes
      .map((value) => normalizeSpace(String(value ?? "")))
      .filter(Boolean)
    : [];

  return {
    workProcess: seed.workProcess ?? "",
    category: normalizeRiskCategoryValue(seed.category ?? ""),
    cause: seed.cause ?? "",
    hazardFactor: seed.hazardFactor ?? "",
    legalBasis: isStrictLegalBasisFormat(seed.legalBasis ?? "") ? normalizeSpace(seed.legalBasis ?? "") : "",
    currentMeasure: seed.currentMeasure ?? "",
    frequency,
    severity,
    riskLevel: seed.riskLevel ?? formatRiskLevel(frequency, severity),
    reductionMeasure: seed.reductionMeasure ?? "",
    postRiskLevel: seed.postRiskLevel ?? "",
    improvementDate: seed.improvementDate ?? "",
    completionDate: seed.completionDate ?? "",
    responsiblePerson: seed.responsiblePerson ?? "",
    validationStatus,
    reviewRequiredFields,
    reviewReasonCodes,
    expectedHazardType: normalizeSpace(seed.expectedHazardType ?? ""),
    detectedHazardType: normalizeSpace(seed.detectedHazardType ?? ""),
  };
}

const ACCIDENT_INJURY_TYPE_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(골절|fracture)/i, label: "골절" },
  { pattern: /(절단|절상|열상|laceration|cut)/i, label: "절단·열상" },
  { pattern: /(타박|좌상|bruise|contusion)/i, label: "타박상" },
  { pattern: /(염좌|삠|sprain|strain)/i, label: "염좌·근육손상" },
  { pattern: /(화상|burn)/i, label: "화상" },
  { pattern: /(감전|전기|electric shock)/i, label: "감전" },
  { pattern: /(질식|흡입|asphyxia)/i, label: "질식·흡입손상" },
];

const ACCIDENT_INJURY_PART_RULES: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(머리|두부|head)/i, label: "머리" },
  { pattern: /(목|경부|neck)/i, label: "목" },
  { pattern: /(어깨|shoulder)/i, label: "어깨" },
  { pattern: /(팔|손목|손|상지|arm|hand|wrist)/i, label: "팔·손" },
  { pattern: /(가슴|흉부|chest)/i, label: "가슴" },
  { pattern: /(허리|요추|등|back|waist)/i, label: "허리·등" },
  { pattern: /(복부|abdomen)/i, label: "복부" },
  { pattern: /(골반|pelvis)/i, label: "골반" },
  { pattern: /(다리|무릎|발목|발|하지|leg|knee|ankle|foot)/i, label: "다리·발" },
];

function pickAccidentLabelByRules(text: string, rules: Array<{ pattern: RegExp; label: string }>) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }

  for (const rule of rules) {
    if (rule.pattern.test(normalized)) {
      return rule.label;
    }
  }
  return "";
}

const ACCIDENT_SENTENCE_MAX_LENGTH = 240;
const ACCIDENT_SITUATION_MAX_LENGTH = 360;
const ACCIDENT_CAUSE_MAX_LENGTH = 220;
const ACCIDENT_CAUSE_MAX_ITEMS = 4;
const ACCIDENT_PLAN_TARGET_COUNT = 3;
const ACCIDENT_DUPLICATE_SIMILARITY_THRESHOLD = 0.76;
const ACCIDENT_LIST_PREFIX_PATTERN = /^(?:[-*•]|[0-9]{1,2}[.)]|[①-⑳])\s*/;

function ensureKoreanSentence(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function toSingleSentence(text: string, maxLength = 180) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }

  const first = (normalized.split(/(?<=[.!?])\s+|[;\n]/)[0] ?? normalized).trim();
  if (first.length <= maxLength) {
    return ensureKoreanSentence(first);
  }
  return ensureKoreanSentence(first.slice(0, maxLength).replace(/[,\s]+$/g, ""));
}

function stripAccidentListPrefix(text: string) {
  return normalizeSpace(text).replace(ACCIDENT_LIST_PREFIX_PATTERN, "").trim();
}

function normalizeAccidentNarrativeSeed(text: string, maxLength = ACCIDENT_SENTENCE_MAX_LENGTH) {
  const stripped = stripAccidentListPrefix(text).replace(/\r\n?/g, " ");
  if (!stripped) {
    return "";
  }

  const normalized = trimIncompleteEnding(stripped.replace(/[.!?]+$/g, ""));
  if (!normalized) {
    return "";
  }

  const bounded = truncateAtBoundary(normalized, maxLength)
    || trimDanglingSingleCharToken(normalized.slice(0, maxLength));
  return trimIncompleteEnding(bounded || normalized);
}

function accidentLinesAreNearDuplicate(left: string, right: string) {
  const normalizedLeft = normalizeSpace(left);
  const normalizedRight = normalizeSpace(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  const compactLeft = toCompact(normalizedLeft);
  const compactRight = toCompact(normalizedRight);
  if (compactLeft && compactRight && (compactLeft.includes(compactRight) || compactRight.includes(compactLeft))) {
    return true;
  }

  return jaccardSimilarity(normalizedLeft, normalizedRight) >= ACCIDENT_DUPLICATE_SIMILARITY_THRESHOLD;
}

function dedupeAccidentNarratives(values: string[], maxItems: number) {
  const selected: string[] = [];
  for (const value of values) {
    const normalized = ensureKoreanSentence(normalizeAccidentNarrativeSeed(value));
    if (!normalized) {
      continue;
    }
    if (selected.some((existing) => accidentLinesAreNearDuplicate(existing, normalized))) {
      continue;
    }
    selected.push(normalized);
    if (selected.length >= maxItems) {
      break;
    }
  }
  return selected;
}

function buildAccidentWorkType(assessment: AssessmentData) {
  const candidates = [
    assessment.taskName,
    (assessment.taskDescription ?? "").split(/[.!?\n]/)[0] ?? "",
    (assessment.analysis.scenario ?? "").split(/[.!?\n]/)[0] ?? "",
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAccidentNarrativeSeed(
      normalizeSpace(candidate).replace(/\s*사고(?:\s*발생.*)?$/g, ""),
      80,
    );
    if (normalized.length >= 4) {
      return normalized;
    }
  }

  return "관련 작업";
}

function toAccidentSituationSentence(text: string, workType: string) {
  const normalized = normalizeAccidentNarrativeSeed(text, 220);
  if (!normalized) {
    return "";
  }

  if (/(사고|재해|부상)/.test(normalized)) {
    return ensureKoreanSentence(normalized);
  }

  if (hasFailureMechanismSignal(normalized) || /(위험|가능|우려)/.test(normalized)) {
    return ensureKoreanSentence(`${normalized} 상태에서 사고가 발생하였다`);
  }

  if (workType) {
    return ensureKoreanSentence(`${workType} 중 ${normalized} 과정에서 사고가 발생하였다`);
  }

  return ensureKoreanSentence(`${normalized} 과정에서 사고가 발생하였다`);
}

function buildAccidentSituation(assessment: AssessmentData, workType: string) {
  const scenario = normalizeSpace(assessment.analysis.scenario);
  const description = normalizeSpace(assessment.taskDescription);
  const candidates = unique([
    scenario,
    description,
    ...splitIncidentClauses(scenario),
    ...splitIncidentClauses(description),
  ]);

  const first = candidates[0] || `${workType} 중 사고가 발생하였다`;
  const second = candidates.find((candidate) =>
    candidate !== first
    && candidate.length >= 16
    && hasFailureMechanismSignal(candidate)
    && !accidentLinesAreNearDuplicate(first, candidate)
  );

  const stitched = normalizeSpace([
    toAccidentSituationSentence(first, workType),
    second ? toAccidentSituationSentence(second, workType) : "",
  ].filter(Boolean).join(" "));

  const bounded = truncateAtBoundary(stitched, ACCIDENT_SITUATION_MAX_LENGTH)
    || normalizeAccidentNarrativeSeed(stitched, ACCIDENT_SITUATION_MAX_LENGTH);
  return ensureKoreanSentence(bounded || stitched || `${workType} 중 사고가 발생하였다`);
}

function toAccidentCauseSentence(text: string, riskLabel: string) {
  const normalized = normalizeAccidentNarrativeSeed(text, ACCIDENT_CAUSE_MAX_LENGTH);
  if (!normalized) {
    return "";
  }

  if (/(사고|재해)/.test(normalized) && /(발생|원인)/.test(normalized)) {
    return ensureKoreanSentence(normalized);
  }

  if (hasFailureMechanismSignal(normalized) || /(위험|가능|우려)/.test(normalized)) {
    return ensureKoreanSentence(`${normalized} 상태가 충분히 통제되지 않아 ${riskLabel} 사고가 발생하였다`);
  }

  return ensureKoreanSentence(`${normalized}로 인해 ${riskLabel} 사고가 발생하였다`);
}

function extractAccidentLocationFromText(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }

  const locationPattern = /([가-힣A-Za-z0-9\-]+(?:동|층|호|라인|구역|현장|작업장|야드|플랫폼))/;
  const matched = normalized.match(locationPattern);
  return normalizeSpace(matched?.[1] ?? "");
}

function buildAccidentCauseList(assessment: AssessmentData) {
  const narrativeSource = normalizeSpace(
    `${assessment.taskDescription} ${assessment.analysis.scenario} ${assessment.taskName}`,
  );
  const dominantHazardType =
    resolveHazardTypeWithContext(narrativeSource, assessment.profile.hazards[0]?.type ?? "", "추락")
    || "추락";
  const dominantRiskLabel = hazardTypeRiskLabel(dominantHazardType);

  const fromHazards = assessment.profile.hazards.map((hazard) => {
    const merged = normalizeSpace(`${hazard.reason} ${hazard.name} ${narrativeSource}`);
    const hazardType =
      resolveHazardTypeWithContext(merged, hazard.type, dominantHazardType)
      || dominantHazardType;
    const riskLabel = hazardTypeRiskLabel(hazardType);
    const inferred = buildInferredNarrativeFromClause(
      merged,
      hazardType,
      inferEquipmentAnchor(merged, "작업 설비"),
    );
    const rawReason = normalizeSpace(hazard.reason);
    const reasonSeed = rawReason && hasFailureMechanismSignal(rawReason)
      ? rawReason
      : inferred.cause;
    return toAccidentCauseSentence(reasonSeed, riskLabel);
  });
  const fromScenario = toAccidentCauseSentence(
    assessment.analysis.scenario || assessment.taskDescription,
    dominantRiskLabel,
  );

  const merged = dedupeAccidentNarratives([
    ...(fromScenario ? [fromScenario] : []),
    ...fromHazards,
  ], ACCIDENT_CAUSE_MAX_ITEMS);

  if (merged.length > 0) {
    return merged;
  }

  return [toAccidentCauseSentence(assessment.taskDescription || assessment.taskName || "사고 원인 확인 필요", dominantRiskLabel)];
}

function normalizePreventionAction(action: string) {
  const normalized = normalizeAccidentNarrativeSeed(action, 140);
  if (!normalized) {
    return "";
  }

  if (/(한다|하였다|해야 한다|운영한다|관리한다|점검한다|확인한다|개선한다|정비한다|시행한다|실시한다|준수한다|강화한다|유지한다|기록한다|교육한다)$/.test(normalized)) {
    return ensureKoreanSentence(normalized);
  }

  if (/(수립|운영|관리|점검|확인|개선|정비|시행|실시|준수|강화|유지|기록|교육|훈련|통제)$/.test(normalized)) {
    return ensureKoreanSentence(`${normalized}한다`);
  }

  return ensureKoreanSentence(`${normalized}를 시행한다`);
}

function buildAccidentPreventionFallbacks(assessment: AssessmentData) {
  const source = normalizeSpace(
    `${assessment.taskDescription} ${assessment.analysis.scenario} ${assessment.profile.hazards.map((hazard) => hazard.type).join(" ")}`,
  );
  const dominantHazardType =
    resolveHazardTypeWithContext(source, assessment.profile.hazards[0]?.type ?? "", "추락")
    || "추락";

  const firstLineByHazard: Record<string, string> = {
    추락: "비계·작업발판 고정 상태와 추락 방호 설비를 작업 전 체크리스트로 확인하고 미흡 시 즉시 보완한다",
    감전: "전기 작업 전 전원 차단과 잠금표지 절차를 확인하고 충전부 노출 구간 접근을 통제한다",
    "끼임/말림": "설비 정비·청소·자재 위치 조정 시 전원 차단과 잠금표지(LOTO)를 실시한 뒤 작업한다",
    절단: "절단 설비의 방호장치와 비상정지 장치 상태를 확인하고 손 접근 금지 기준을 준수한다",
    "차량/이동장비 충돌": "이동장비 작업은 동선 분리와 유도자 배치를 완료한 후 신호체계에 따라 운행한다",
    "낙하물/비래": "상부 작업 시 낙하물 방지망과 자재 고정 상태를 확인하고 하부 출입을 통제한다",
  };

  return [
    firstLineByHazard[dominantHazardType] ?? "위험요인별 표준작업절차를 재정비하고 작업 전 점검 기준을 준수한다",
    "동일·유사 작업은 TBM을 통해 사고 경과와 핵심 위험요인을 공유한 후 작업한다",
    "관리감독자를 지정하여 보호구 착용 상태와 현장 통제 이행 여부를 상시 점검하고 기록한다",
  ];
}

function buildAccidentPreventionPlan(assessment: AssessmentData) {
  const actions = assessment.analysis.improvements
    .map((item) => normalizePreventionAction(item.action))
    .filter(Boolean)
    .slice(0, 5);
  const fallbackActions = buildAccidentPreventionFallbacks(assessment)
    .map((action) => normalizePreventionAction(action))
    .filter(Boolean);
  const merged = dedupeAccidentNarratives(
    [...actions, ...fallbackActions],
    ACCIDENT_PLAN_TARGET_COUNT,
  );

  return merged
    .map((action, index) => `${index + 1}. ${action}`)
    .join("\n");
}

function buildAccidentNarratives(assessment: AssessmentData) {
  const scenarioSource = normalizeSpace(
    `${assessment.taskDescription ?? ""} ${assessment.analysis.scenario ?? ""} ${assessment.profile.hazards.map((hazard) => `${hazard.name} ${hazard.reason}`).join(" ")}`
  );
  const injuryType = pickAccidentLabelByRules(scenarioSource, ACCIDENT_INJURY_TYPE_RULES);
  const injuryPart = pickAccidentLabelByRules(scenarioSource, ACCIDENT_INJURY_PART_RULES);
  const location = normalizeSpace(assessment.profile.workLocation)
    || extractAccidentLocationFromText(scenarioSource)
    || "사고 발생 구역";
  const workType = buildAccidentWorkType(assessment);
  const situation = buildAccidentSituation(assessment, workType);
  const causes = buildAccidentCauseList(assessment)
    .filter((entry) => !accidentLinesAreNearDuplicate(entry, situation))
    .slice(0, ACCIDENT_CAUSE_MAX_ITEMS);
  const fallbackCauses = causes.length > 0
    ? causes
    : [toAccidentCauseSentence(situation, hazardTypeRiskLabel(resolveHazardTypeWithContext(scenarioSource, "추락", "추락") || "추락"))];
  const preventionPlan = buildAccidentPreventionPlan(assessment);

  return {
    injuryType,
    injuryPart,
    location,
    workType,
    situation,
    causes: fallbackCauses,
    preventionPlan,
  };
}

export function applyCompanyProfileDefaults(
  report: AccidentReportData,
  companyProfile?: CompanyProfile | null,
): AccidentReportData {
  if (!companyProfile) {
    return report;
  }

  return {
    ...report,
    businessInfo: {
      ...report.businessInfo,
      businessName: companyProfile.businessName,
      businessNumber: companyProfile.businessNumber,
      managementNumber: companyProfile.managementNumber,
      industry: companyProfile.industry,
      address: companyProfile.headquartersAddress,
    },
  };
}

export const FormService = {
  mapAssessmentToRiskForm(assessment: AssessmentData, context?: RiskLawContext): RiskAssessmentRow[] {
    return this.mapAssessmentToRiskFormDetailed(assessment, context).rows;
  },

  mapAssessmentToRiskFormDetailed(assessment: AssessmentData, context?: RiskLawContext): RiskRowsValidationResult {
    const defaultContext = getRiskLawContextFromAssessment(assessment);
    const lawContext: RiskLawContext = {
      ...defaultContext,
      ...(context ?? {}),
      taskHazardTypes: normalizeHazardHints([
        ...(defaultContext.taskHazardTypes ?? []),
        ...(context?.taskHazardTypes ?? []),
      ]),
      taskContextTokens: unique([
        ...(defaultContext.taskContextTokens ?? []),
        ...(context?.taskContextTokens ?? []),
      ]).slice(0, 24),
    };
    const hazards = selectRiskHazards(assessment);

    const currentMeasures = assignMeasuresByRow(
      hazards,
      assessment.analysis.immediateActions.map((item) => item.action),
      lawContext,
      "current",
    );
    const reductionMeasures = assignMeasuresByRow(
      hazards,
      assessment.analysis.improvements.map((item) => item.action),
      lawContext,
      "reduction",
    );

    const baseRows = hazards.map((hazard: HazardItem, index) => {
      const frequency = Math.min(5, Math.max(1, Math.ceil(hazard.weight / 10)));
      const severity = Math.min(5, Math.max(1, Math.ceil(hazard.weight / 8)));
      const workProcess = resolveWorkProcessLabel(assessment, hazard);
      const category = toRiskFactorCategory(hazard);
      const narratives = normalizeRiskNarratives(assessment, hazard, workProcess, index);

      return {
        workProcess,
        category,
        cause: narratives.cause,
        hazardFactor: narratives.hazardFactor,
        legalBasis: "",
        currentMeasure: currentMeasures[index] || "현장 상태를 점검한다.",
        frequency,
        severity,
        riskLevel: formatRiskLevel(frequency, severity),
        reductionMeasure: reductionMeasures[index] || "추가 개선 조치를 시행한다.",
        postRiskLevel: "low",
        improvementDate: "",
        completionDate: "",
        responsiblePerson: "",
      };
    });

    const diversifiedRows = enforceRiskNarrativeDiversity(baseRows, assessment);

    const legalBases = resolveRiskRowsLegalBasis(
      diversifiedRows.map((row) => ({
        workProcess: row.workProcess,
        category: row.category,
        cause: row.cause,
        hazardFactor: row.hazardFactor,
      })),
      lawContext,
    );

    const rowsWithLegalBasis = diversifiedRows.map((row, index) => ({
      ...row,
      legalBasis: legalBases[index] ?? "",
      currentMeasure: row.currentMeasure || "현장 상태를 점검한다.",
    }));

    const consistentRows = enforceRiskRowsConsistency(rowsWithLegalBasis, assessment, lawContext);
    return validateRiskAssessmentRows(consistentRows, lawContext, {
      rewriteInvalidFields: true,
      clearUnresolvedFields: true,
      assessment,
      siteName: assessment.siteName,
    });
  },

  revalidateRiskAssessmentRows(
    rows: RiskAssessmentRow[],
    context: RiskLawContext = {},
    options: Omit<RiskRowsValidationOptions, "rewriteInvalidFields" | "clearUnresolvedFields"> = {},
  ): RiskRowsValidationResult {
    return validateRiskAssessmentRows(rows, context, {
      ...options,
      rewriteInvalidFields: false,
      clearUnresolvedFields: false,
    });
  },

  validateRiskAssessmentRows(
    rows: RiskAssessmentRow[],
    context: RiskLawContext = {},
    options: RiskRowsValidationOptions = {},
  ): RiskRowsValidationResult {
    return validateRiskAssessmentRows(rows, context, options);
  },

  mapAssessmentToAccidentReport(
    assessment: AssessmentData,
    companyProfile?: CompanyProfile | null,
  ): AccidentReportData {
    const today = new Date();
    const narratives = buildAccidentNarratives(assessment);

    const report = {
      administrativeInfo: {
        receiptNumber: "",
        receiptDate: "",
        processingDate: "",
        processingPeriodDays: "14",
        writerName: "",
        writerPhone: "",
        writtenYear: today.getFullYear().toString(),
        writtenMonth: (today.getMonth() + 1).toString(),
        writtenDay: today.getDate().toString(),
        employerName: "",
        workerRepresentativeName: "",
        laborOfficeName: "",
      },
      businessInfo: {
        businessName: assessment.siteName || "",
        businessNumber: "",
        managementNumber: "",
        workersCount: "",
        industry: assessment.profile.industry || "",
        address: assessment.profile.workLocation || "",
        subcontractorInfo: {
          businessName: "",
          managementNumber: "",
        },
        dispatchedInfo: {
          businessName: "",
          managementNumber: "",
        },
        constructionInfo: {
          orderer: "",
          principalBusinessName: "",
          principalManagementNumber: "",
          constructionSiteName: assessment.taskName || "",
          constructionType: "",
          progressRate: "",
          constructionAmount: "",
        },
      },
      victimInfo: {
        name: "",
        residentNumber: "",
        address: "",
        phone: "",
        nationality: "",
        nationalityType: "",
        visaType: "",
        jobTitle: "",
        hireDate: "",
        experienceYears: "",
        experienceMonths: "",
        employmentType: "",
        workType: "",
        injuryType: narratives.injuryType,
        injuryPart: narratives.injuryPart,
        expectedRestDays: "",
        isDead: false,
      },
      accidentDetails: {
        occurredDate: {
          year: today.getFullYear().toString(),
          month: (today.getMonth() + 1).toString().padStart(2, "0"),
          day: today.getDate().toString().padStart(2, "0"),
          dayOfWeek: ["일", "월", "화", "수", "목", "금", "토"][today.getDay()],
          hour: today.getHours().toString().padStart(2, "0"),
          minute: today.getMinutes().toString().padStart(2, "0"),
        },
        location: narratives.location,
        workType: narratives.workType,
        workTiming: "during_work",
        situation: narratives.situation,
        cause: narratives.causes,
      },
      preventionPlan: {
        plan: narratives.preventionPlan,
        requestTechnicalSupport: false,
        consentPersonalData: false,
      },
      legalViolations: assessment.lawActionItems.flatMap((item) => item.articleNumbers),
    };

    return applyCompanyProfileDefaults(report, companyProfile);
  },
};
