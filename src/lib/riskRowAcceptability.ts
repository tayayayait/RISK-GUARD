import type { RiskControlIntent } from "@/types/riskControlIntent";
import type { ImprovementStatus, RiskAcceptability, RiskAssessmentRow } from "@/types/formTemplate";

/**
 * 시행규칙 제37조제1항의 3단계 중 ②·③에 해당하는 계산.
 *
 *   ① 유해·위험 요인 파악        → AI 분석 파이프라인 (기존)
 *   ② 위험성이 허용 가능한 수준인지 결정  → resolveAcceptability
 *   ③ 허용 불가능하면 개선대책 수립·이행  → estimatePostRisk + 이행 필드
 *
 * 임계값은 기존 서식센터 표(`toRiskLabel`)와 동일하게 유지한다. 새 척도를 도입하면
 * 이미 작성된 평가표와 등급이 어긋난다.
 */

export const RISK_LABEL_HIGH_THRESHOLD = 15;
export const RISK_LABEL_MEDIUM_THRESHOLD = 6;

export function toRiskLabel(score: number) {
  if (score >= RISK_LABEL_HIGH_THRESHOLD) return "높음";
  if (score >= RISK_LABEL_MEDIUM_THRESHOLD) return "보통";
  return "낮음";
}

export function clampRiskScale(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

export function calculateRiskScore(frequency: number, severity: number) {
  return clampRiskScale(frequency) * clampRiskScale(severity);
}

export function formatRiskLevel(frequency: number, severity: number) {
  const score = calculateRiskScore(frequency, severity);
  return `${score}(${toRiskLabel(score)})`;
}

/**
 * 허용 가능 여부. 위험성 점수가 "낮음"(6 미만)일 때만 허용 가능으로 본다.
 * 자동 산출값이며 평가자가 화면에서 뒤집을 수 있다.
 */
export function resolveAcceptability(frequency: number, severity: number): {
  acceptability: RiskAcceptability;
  acceptabilityBasis: string;
} {
  const score = calculateRiskScore(frequency, severity);

  if (score >= RISK_LABEL_HIGH_THRESHOLD) {
    return {
      acceptability: "not_acceptable",
      acceptabilityBasis: `위험성 ${score}점(높음). 작업 전 감소대책 이행이 필요하다.`,
    };
  }

  if (score >= RISK_LABEL_MEDIUM_THRESHOLD) {
    return {
      acceptability: "not_acceptable",
      acceptabilityBasis: `위험성 ${score}점(보통). 감소대책 수립이 필요하다.`,
    };
  }

  return {
    acceptability: "acceptable",
    acceptabilityBasis: `위험성 ${score}점(낮음). 현재 조치로 허용 가능한 수준이다.`,
  };
}

/**
 * 감소대책의 통제 유형별 기대 저감폭.
 *
 * 위험성 감소는 주로 가능성(빈도)에서 발생한다. 중대성(강도)은 유해·위험 요인 자체를
 * 제거하거나 대체하지 않는 한 잘 변하지 않으므로 기본값을 유지한다.
 * (예: 추락 방호망을 설치해도 추락 시 피해 정도는 그대로다.)
 */
const ENGINEERING_INTENTS: RiskControlIntent[] = [
  "access_control",
  "equipment_guard",
  "energy_isolation",
  "structural_support",
  "ventilation_detection",
];

const PPE_INTENTS: RiskControlIntent[] = ["ppe"];

export function resolveFrequencyReductionStep(controlIntent?: RiskControlIntent) {
  if (controlIntent && ENGINEERING_INTENTS.includes(controlIntent)) {
    return 2;
  }
  if (controlIntent && PPE_INTENTS.includes(controlIntent)) {
    return 1;
  }
  return 1;
}

export interface PostRiskEstimate {
  postFrequency: number;
  postSeverity: number;
  postRiskLevel: string;
  postAcceptability: RiskAcceptability;
}

/**
 * 개선 후 위험성 추정치. 감소대책이 없으면 현재 위험성이 그대로 남는다.
 * 어디까지나 초기값이고 평가자가 확정해야 한다.
 */
export function estimatePostRisk(
  frequency: number,
  severity: number,
  reductionMeasure: string,
  controlIntent?: RiskControlIntent,
): PostRiskEstimate {
  const baseFrequency = clampRiskScale(frequency);
  const baseSeverity = clampRiskScale(severity);
  const hasReductionMeasure = reductionMeasure.trim().length > 0;

  const postFrequency = hasReductionMeasure
    ? Math.max(1, baseFrequency - resolveFrequencyReductionStep(controlIntent))
    : baseFrequency;
  const postSeverity = baseSeverity;

  return {
    postFrequency,
    postSeverity,
    postRiskLevel: formatRiskLevel(postFrequency, postSeverity),
    postAcceptability: resolveAcceptability(postFrequency, postSeverity).acceptability,
  };
}

function resolveImprovementStatus(row: Partial<RiskAssessmentRow>): ImprovementStatus {
  if (row.improvementStatus) {
    return row.improvementStatus;
  }
  return row.completionDate?.trim() ? "done" : "planned";
}

/**
 * 행 하나에 대해 ②·③ 단계 필드를 채운다.
 * 이미 값이 있는 필드는 덮어쓰지 않는다 (평가자가 손댄 값을 보존).
 */
export function applyRiskFields(row: RiskAssessmentRow): RiskAssessmentRow {
  const frequency = clampRiskScale(row.frequency);
  const severity = clampRiskScale(row.severity);

  const resolved = resolveAcceptability(frequency, severity);
  const acceptability = row.acceptability ?? resolved.acceptability;
  const acceptabilityBasis = row.acceptabilityBasis?.trim()
    ? row.acceptabilityBasis
    : resolved.acceptabilityBasis;

  const estimate = estimatePostRisk(
    frequency,
    severity,
    row.reductionMeasure ?? "",
    row.controlIntent,
  );

  const postFrequency = row.postFrequency ?? estimate.postFrequency;
  const postSeverity = row.postSeverity ?? estimate.postSeverity;
  const hasExplicitPostScale = row.postFrequency !== undefined || row.postSeverity !== undefined;

  const postRiskLevel = hasExplicitPostScale
    ? formatRiskLevel(postFrequency, postSeverity)
    : (isLegacyPostRiskLevel(row.postRiskLevel) ? estimate.postRiskLevel : row.postRiskLevel!);

  const postAcceptability = row.postAcceptability
    ?? resolveAcceptability(postFrequency, postSeverity).acceptability;

  return {
    ...row,
    frequency,
    severity,
    riskLevel: row.riskLevel?.trim() ? row.riskLevel : formatRiskLevel(frequency, severity),
    acceptability,
    acceptabilityBasis,
    postFrequency,
    postSeverity,
    postRiskLevel,
    postAcceptability,
    improvementStatus: resolveImprovementStatus(row),
    completionNote: row.completionNote ?? "",
  };
}

/**
 * `postRiskLevel`은 과거에 "low" 같은 등급 문자열이 하드코딩되어 있었다.
 * "12(보통)" 형식이 아니면 재계산 대상으로 본다.
 */
function isLegacyPostRiskLevel(value?: string) {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return true;
  }
  return !/^\d+\(.+\)$/.test(normalized);
}

export function applyRiskFieldsToRows(rows: RiskAssessmentRow[]): RiskAssessmentRow[] {
  return rows.map((row) => applyRiskFields(row));
}

/** 허용 불가능한데 감소대책이 비어 있는 행 — 저장 전 경고 대상. */
export function findUnresolvedRows(rows: RiskAssessmentRow[]) {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      (row.acceptability ?? "not_acceptable") === "not_acceptable"
      && !(row.reductionMeasure ?? "").trim()
    );
}
