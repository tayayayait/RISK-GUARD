import { memo, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { RISK_CATEGORY_OPTIONS, normalizeRiskCategoryValue } from "@/services/formService";
import { formatRiskLevel, resolveAcceptability } from "@/lib/riskRowAcceptability";
import {
  IMPROVEMENT_STATUS_LABELS,
  IMPROVEMENT_STATUS_VALUES,
  RISK_ACCEPTABILITY_LABELS,
  RISK_ACCEPTABILITY_VALUES,
} from "@/types/formTemplate";
import type { ImprovementStatus, RiskAcceptability, RiskAssessmentRow } from "@/types/formTemplate";
import type { RiskControlIntent } from "@/types/riskControlIntent";

export interface LegalBasisReviewDetail {
  status: "verified" | "review_required" | "unknown";
  evidenceExcerpt?: string;
  applicabilityReason?: string;
  reason?: string;
}

interface Props {
  data: RiskAssessmentRow[];
  onChange: (index: number, field: keyof RiskAssessmentRow, value: string | number) => void;
  onAddRow?: () => void;
  onReclassifyCategories?: () => void;
  onAddRiskWithAi?: () => void;
  isAddingRiskWithAi?: boolean;
  disableAddRiskWithAi?: boolean;
  onMatchLegalBasisWithAi?: () => void;
  isMatchingLegalBasis?: boolean;
  disableMatchLegalBasis?: boolean;
  legalBasisReviewRequiredByRow?: boolean[];
  legalBasisReviewDetailsByRow?: Array<LegalBasisReviewDetail | undefined>;
  readOnly?: boolean;
}

const BORDER_COLOR = "border-neutral-900";

const HEADER_CELL_BASE = `border ${BORDER_COLOR} px-1.5 py-1.5 text-center align-middle font-semibold text-[12px] leading-[1.35]`;
const HEADER_CELL_SUB = `${HEADER_CELL_BASE} font-medium`;
const META_LABEL_CELL = `${HEADER_CELL_BASE} bg-neutral-50`;
const META_VALUE_CELL = `border ${BORDER_COLOR} bg-white`;
const BODY_CELL_BASE = `border ${BORDER_COLOR} px-2 py-2 text-[12px] leading-[1.5] text-neutral-900 whitespace-pre-wrap break-words`;
const BODY_TEXT_CELL = `${BODY_CELL_BASE} align-top`;
const BODY_CENTER_CELL = `${BODY_CELL_BASE} align-middle text-center`;
const BODY_EDITABLE_TEXT =
  "h-[112px] w-full resize-none border-0 bg-transparent p-0 text-[12px] leading-[1.55] text-neutral-900 outline-none focus-visible:ring-1 focus-visible:ring-primary-600 focus-visible:ring-inset disabled:cursor-default disabled:opacity-100";
const INLINE_INPUT_BASE =
  "w-full border-0 bg-transparent p-0 text-[12px] text-neutral-900 outline-none focus-visible:ring-1 focus-visible:ring-primary-600 focus-visible:ring-inset disabled:cursor-default disabled:opacity-100";
const LEGAL_BASIS_MATCH_POLICY =
  "법적기준 매칭 기준: 사고유형·장비·원인·유해위험요인·통제목적을 함께 보고 후보 법령을 찾습니다. 같은 조문 반복은 가능한 경우 피합니다. 후보가 없거나 원문 검증이 부족하면 검토 필요로 표시합니다.";

const RISK_CONTROL_INTENT_LABELS: Record<RiskControlIntent, string> = {
  access_control: "접근통제",
  supervision: "유도·감시",
  traffic_operation: "차량운행",
  operating_procedure: "작업절차",
  equipment_guard: "설비방호",
  energy_isolation: "에너지격리",
  inspection_maintenance: "점검정비",
  ventilation_detection: "환기·측정",
  ppe: "보호구",
  structural_support: "구조지지",
  emergency_response: "비상대응",
  general_control: "일반통제",
};

function clampRiskInput(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(5, value));
}

const IMPROVEMENT_STATUS_OPTIONS: Array<{ value: ImprovementStatus; label: string }> =
  IMPROVEMENT_STATUS_VALUES.map((value) => ({ value, label: IMPROVEMENT_STATUS_LABELS[value] }));

function AcceptabilityBadge({
  value,
  label,
  disabled,
  onChange,
}: {
  value: RiskAcceptability;
  label: string;
  disabled: boolean;
  onChange: (value: RiskAcceptability) => void;
}) {
  const isAcceptable = value === "acceptable";
  const badgeClass = isAcceptable
    ? "border-success-600 bg-success-050 text-success-700"
    : "border-danger-600 bg-danger-050 text-danger-700";

  return (
    <select
      value={value}
      aria-label={label}
      disabled={disabled}
      className={`mt-1 w-full cursor-pointer rounded-sm border px-1 py-0.5 text-[11px] font-medium disabled:cursor-default ${badgeClass}`}
      onChange={(event) => onChange(event.target.value as RiskAcceptability)}
    >
      {RISK_ACCEPTABILITY_VALUES.map((option) => (
        <option key={option} value={option}>
          {RISK_ACCEPTABILITY_LABELS[option]}
        </option>
      ))}
    </select>
  );
}

function getControlIntentLabel(intent?: RiskControlIntent) {
  if (!intent) {
    return "";
  }
  return RISK_CONTROL_INTENT_LABELS[intent] ?? "";
}

export const RiskAssessmentTable = memo(function RiskAssessmentTable({
  data,
  onChange,
  onAddRow,
  onMatchLegalBasisWithAi,
  isMatchingLegalBasis = false,
  disableMatchLegalBasis = false,
  legalBasisReviewRequiredByRow = [],
  legalBasisReviewDetailsByRow = [],
  readOnly = false,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="p-space-8 text-center text-neutral-500 bg-surface border border-border rounded-radius-md">
        자동 생성된 위험성평가 데이터가 없습니다. 상단에서 작업 상황을 입력하고 AI 분석을 실행해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-space-3">
      <div className="flex items-center justify-between gap-space-3">
        <p className="text-caption text-neutral-600">
          위험성평가표는 서식 폭이 넓습니다. 표 전체 확인을 위해 가로 스크롤이 생성될 수 있습니다.
        </p>
        {!readOnly && (
          <div className="flex items-center gap-2">
            {onMatchLegalBasisWithAi && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onMatchLegalBasisWithAi}
                disabled={disableMatchLegalBasis || isMatchingLegalBasis}
              >
                {isMatchingLegalBasis ? "법령 매칭 중..." : "AI로 적합한 법령 찾기"}
              </Button>
            )}
            {onAddRow && (
              <Button type="button" variant="outline" size="sm" onClick={onAddRow}>
                행 추가
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="rounded-radius-md border border-primary-100 bg-primary-050 px-space-3 py-space-2 text-caption text-primary-800">
        {LEGAL_BASIS_MATCH_POLICY}
      </p>

      <div className={`w-full overflow-x-auto border-2 ${BORDER_COLOR} bg-white`}>
        <table className="min-w-[1860px] table-fixed border-collapse text-[12px] text-neutral-900">
          <colgroup>
            <col style={{ width: "140px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "190px" }} />
            <col style={{ width: "210px" }} />
            <col style={{ width: "170px" }} />
            <col style={{ width: "170px" }} />
            <col style={{ width: "75px" }} />
            <col style={{ width: "75px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "180px" }} />
            <col style={{ width: "130px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "90px" }} />
          </colgroup>

          <thead className="bg-white">
            <tr className="h-9">
              <th className={META_LABEL_CELL}>공정명</th>
              <th className={META_VALUE_CELL} colSpan={4} />
              <th
                className={`${HEADER_CELL_BASE} text-[30px] tracking-[0.18em] font-bold`}
                colSpan={4}
                rowSpan={2}
              >
                위험성평가
              </th>
              <th className={META_LABEL_CELL} colSpan={2} rowSpan={2}>
                평가자
                <br />
                (리더및팀원)
              </th>
              <th className={META_VALUE_CELL} colSpan={4} rowSpan={2} />
            </tr>
            <tr className="h-9">
              <th className={META_LABEL_CELL}>평가일시</th>
              <th className={META_VALUE_CELL} colSpan={4} />
            </tr>
            <tr className="h-11">
              <th className={HEADER_CELL_BASE} rowSpan={2}>
                작업내용
              </th>
              <th className={HEADER_CELL_BASE} colSpan={3}>
                유해위험요인 파악
              </th>
              <th className={HEADER_CELL_BASE}>관련근거</th>
              <th className={HEADER_CELL_BASE} rowSpan={2}>
                현재상태 및 조치
              </th>
              <th className={HEADER_CELL_BASE} colSpan={3}>
                현재위험성
              </th>
              <th className={HEADER_CELL_BASE} rowSpan={2}>
                감소대책
              </th>
              <th className={HEADER_CELL_BASE} rowSpan={2}>
                개선 후 위험성
              </th>
              <th className={HEADER_CELL_BASE} rowSpan={2}>
                개선일
              </th>
              <th className={HEADER_CELL_BASE} rowSpan={2}>
                완료일
              </th>
              <th className={HEADER_CELL_BASE} rowSpan={2}>
                담당자
              </th>
              <th className={HEADER_CELL_BASE} rowSpan={2}>
                비고
              </th>
            </tr>
            <tr className="h-11">
              <th className={HEADER_CELL_SUB}>분류</th>
              <th className={HEADER_CELL_SUB}>원인</th>
              <th className={HEADER_CELL_SUB}>유해위험요인</th>
              <th className={HEADER_CELL_SUB}>법적기준</th>
              <th className={HEADER_CELL_SUB}>가능성(빈도)</th>
              <th className={HEADER_CELL_SUB}>중대성(강도)</th>
              <th className={HEADER_CELL_SUB}>위험성</th>
            </tr>
          </thead>

          <tbody>
            {data.map((row, index) => {
              const reviewRequired = row.validationStatus === "review_required";
              const reviewFields = new Set(row.reviewRequiredFields ?? []);
              const reviewReasonText = (row.reviewReasonCodes ?? []).join(", ");
              const reviewCellClass = reviewRequired ? " bg-warning-050/50" : "";
              const legalBasisText = row.legalBasis.trim();
              const controlIntentLabel = getControlIntentLabel(row.controlIntent);
              const legalBasisReviewDetail = legalBasisReviewDetailsByRow[index];
              const showLegalBasisReviewReason = !legalBasisText && legalBasisReviewRequiredByRow[index];
              const legalBasisTextareaClass =
                controlIntentLabel || showLegalBasisReviewReason || legalBasisReviewDetail || legalBasisText
                  ? `${BODY_EDITABLE_TEXT} h-[86px]`
                  : BODY_EDITABLE_TEXT;

              return (
              <tr key={`${row.hazardFactor}-${index}`} className="h-[128px]">
                <td className={`${BODY_TEXT_CELL}${reviewRequired ? reviewCellClass : ""}`}>
                  {reviewRequired && (
                    <div className="mb-1">
                      <span
                        className="inline-flex items-center rounded border border-warning-300 bg-warning-100 px-1.5 py-0.5 text-[10px] font-semibold text-warning-800"
                        title={reviewReasonText || undefined}
                      >
                        검토 필요
                      </span>
                    </div>
                  )}
                  <textarea
                    className={BODY_EDITABLE_TEXT}
                    value={row.workProcess}
                    aria-label={`작업내용-${index + 1}`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "workProcess", event.target.value)}
                  />
                </td>
                <td className={`${BODY_TEXT_CELL}${reviewFields.has("category") ? reviewCellClass : ""}`}>
                  <select
                    className="h-[112px] w-full border-0 bg-transparent p-0 text-[12px] leading-[1.55] text-neutral-900 outline-none focus-visible:ring-1 focus-visible:ring-primary-600 focus-visible:ring-inset disabled:cursor-default disabled:opacity-100"
                    value={normalizeRiskCategoryValue(row.category, row)}
                    aria-label={`분류-${index + 1}`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "category", event.target.value)}
                  >
                    {RISK_CATEGORY_OPTIONS.map((option) => (
                      <option key={`${option}-${index}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`${BODY_TEXT_CELL}${reviewFields.has("cause") ? reviewCellClass : ""}`}>
                  <textarea
                    className={BODY_EDITABLE_TEXT}
                    value={row.cause}
                    aria-label={`원인-${index + 1}`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "cause", event.target.value)}
                  />
                </td>
                <td className={`${BODY_TEXT_CELL}${reviewFields.has("hazardFactor") ? reviewCellClass : ""}`}>
                  <textarea
                    className={BODY_EDITABLE_TEXT}
                    value={row.hazardFactor}
                    aria-label={`유해위험요인-${index + 1}`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "hazardFactor", event.target.value)}
                  />
                </td>
                <td className={`${BODY_TEXT_CELL}${reviewFields.has("legalBasis") ? reviewCellClass : ""}`}>
                  {(controlIntentLabel || showLegalBasisReviewReason || legalBasisReviewDetail || legalBasisText) && (
                    <div className="mb-1 flex flex-wrap gap-1 text-[10px] leading-[1.25]">
                      {controlIntentLabel && (
                        <span className="rounded border border-primary-100 bg-primary-050 px-1 text-primary-800">
                          통제목적: {controlIntentLabel}
                        </span>
                      )}
                      {legalBasisReviewDetail?.status === "verified" && (
                        <span className="rounded border border-success-200 bg-success-050 px-1 text-success-800">
                          원문 확인
                        </span>
                      )}
                      {legalBasisReviewDetail?.status === "review_required" && (
                        <span
                          className="rounded border border-warning-200 bg-warning-050 px-1 text-warning-800"
                          title={legalBasisReviewDetail.reason || legalBasisReviewDetail.applicabilityReason}
                        >
                          검토 후보
                        </span>
                      )}
                      {legalBasisReviewDetail?.status === "unknown" && (
                        <span className="rounded border border-neutral-200 bg-neutral-50 px-1 text-neutral-700">
                          확인 불가
                        </span>
                      )}
                    </div>
                  )}
                  <textarea
                    className={legalBasisTextareaClass}
                    value={row.legalBasis}
                    placeholder={!row.legalBasis.trim() && legalBasisReviewRequiredByRow[index] ? "검토 필요" : ""}
                    aria-label={`법적기준-${index + 1}`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "legalBasis", event.target.value)}
                  />
                  {legalBasisReviewDetail?.evidenceExcerpt && (
                    <details className="mt-1 rounded border border-neutral-200 bg-neutral-50 px-1.5 py-1 text-[10px] leading-[1.45]">
                      <summary className="cursor-pointer font-semibold text-neutral-700">원문 근거</summary>
                      <p className="mt-1 text-neutral-800">{legalBasisReviewDetail.evidenceExcerpt}</p>
                      {legalBasisReviewDetail.applicabilityReason && (
                        <p className="mt-1 text-neutral-600">
                          적용 판단: {legalBasisReviewDetail.applicabilityReason}
                        </p>
                      )}
                    </details>
                  )}
                </td>
                <td className={`${BODY_TEXT_CELL}${reviewFields.has("currentMeasure") ? reviewCellClass : ""}`}>
                  <textarea
                    className={BODY_EDITABLE_TEXT}
                    value={row.currentMeasure}
                    aria-label={`현재조치-${index + 1}`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "currentMeasure", event.target.value)}
                  />
                </td>
                <td className={BODY_CENTER_CELL}>
                  <RiskScoreInput
                    value={row.frequency}
                    label={`가능성-${index + 1}`}
                    disabled={readOnly}
                    onChange={(nextValue) => {
                      onChange(index, "frequency", nextValue);
                      onChange(index, "riskLevel", formatRiskLevel(nextValue, row.severity));
                    }}
                  />
                </td>
                <td className={BODY_CENTER_CELL}>
                  <RiskScoreInput
                    value={row.severity}
                    label={`중대성-${index + 1}`}
                    disabled={readOnly}
                    onChange={(nextValue) => {
                      onChange(index, "severity", nextValue);
                      onChange(index, "riskLevel", formatRiskLevel(row.frequency, nextValue));
                    }}
                  />
                </td>
                <td className={`${BODY_CENTER_CELL} font-semibold`}>
                  <div>{row.riskLevel || formatRiskLevel(row.frequency, row.severity)}</div>
                  <AcceptabilityBadge
                    value={row.acceptability ?? resolveAcceptability(row.frequency, row.severity).acceptability}
                    label={`허용여부-${index + 1}`}
                    disabled={readOnly}
                    onChange={(nextValue) => onChange(index, "acceptability", nextValue)}
                  />
                </td>
                <td className={`${BODY_TEXT_CELL}${reviewFields.has("reductionMeasure") ? reviewCellClass : ""}`}>
                  <textarea
                    className={BODY_EDITABLE_TEXT}
                    value={row.reductionMeasure}
                    aria-label={`감소대책-${index + 1}`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "reductionMeasure", event.target.value)}
                  />
                </td>
                <td className={BODY_CENTER_CELL}>
                  <div className="flex items-center justify-center gap-1">
                    <RiskScoreInput
                      value={row.postFrequency ?? row.frequency}
                      label={`개선후가능성-${index + 1}`}
                      disabled={readOnly}
                      onChange={(nextValue) => {
                        const nextSeverity = row.postSeverity ?? row.severity;
                        onChange(index, "postFrequency", nextValue);
                        onChange(index, "postRiskLevel", formatRiskLevel(nextValue, nextSeverity));
                        onChange(
                          index,
                          "postAcceptability",
                          resolveAcceptability(nextValue, nextSeverity).acceptability,
                        );
                      }}
                    />
                    <span className="text-[11px] text-neutral-500">×</span>
                    <RiskScoreInput
                      value={row.postSeverity ?? row.severity}
                      label={`개선후중대성-${index + 1}`}
                      disabled={readOnly}
                      onChange={(nextValue) => {
                        const nextFrequency = row.postFrequency ?? row.frequency;
                        onChange(index, "postSeverity", nextValue);
                        onChange(index, "postRiskLevel", formatRiskLevel(nextFrequency, nextValue));
                        onChange(
                          index,
                          "postAcceptability",
                          resolveAcceptability(nextFrequency, nextValue).acceptability,
                        );
                      }}
                    />
                  </div>
                  <div className="mt-1 font-semibold" data-testid={`post-risk-level-${index}`}>
                    {row.postRiskLevel
                      || formatRiskLevel(row.postFrequency ?? row.frequency, row.postSeverity ?? row.severity)}
                  </div>
                  <AcceptabilityBadge
                    value={
                      row.postAcceptability
                      ?? resolveAcceptability(
                        row.postFrequency ?? row.frequency,
                        row.postSeverity ?? row.severity,
                      ).acceptability
                    }
                    label={`개선후허용여부-${index + 1}`}
                    disabled={readOnly}
                    onChange={(nextValue) => onChange(index, "postAcceptability", nextValue)}
                  />
                </td>
                <td className={BODY_CENTER_CELL}>
                  <input
                    type="date"
                    value={row.improvementDate || ""}
                    aria-label={`개선일-${index + 1}`}
                    className={`${INLINE_INPUT_BASE} h-8 text-center`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "improvementDate", event.target.value)}
                  />
                </td>
                <td className={BODY_CENTER_CELL}>
                  <input
                    type="date"
                    value={row.completionDate || ""}
                    aria-label={`완료일-${index + 1}`}
                    className={`${INLINE_INPUT_BASE} h-8 text-center`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "completionDate", event.target.value)}
                  />
                  <select
                    value={row.improvementStatus ?? "planned"}
                    aria-label={`이행상태-${index + 1}`}
                    className={`${INLINE_INPUT_BASE} mt-1 h-7 cursor-pointer text-center text-[11px]`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "improvementStatus", event.target.value)}
                  >
                    {IMPROVEMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={BODY_CENTER_CELL}>
                  <input
                    type="text"
                    value={row.responsiblePerson || ""}
                    aria-label={`담당자-${index + 1}`}
                    className={`${INLINE_INPUT_BASE} h-8 text-center`}
                    disabled={readOnly}
                    onChange={(event) => onChange(index, "responsiblePerson", event.target.value)}
                  />
                </td>
                <td className={BODY_CENTER_CELL} />
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

function RiskScoreInput({
  value,
  label,
  disabled = false,
  onChange,
}: {
  value: number;
  label: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = clampRiskInput(Number.parseInt(event.target.value, 10));
    onChange(next);
  };

  return (
    <input
      type="number"
      min={1}
      max={5}
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={handleChange}
      className={`${INLINE_INPUT_BASE} h-8 w-[56px] text-center mx-auto`}
    />
  );
}
