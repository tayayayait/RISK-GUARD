import { useMemo } from "react";
import { useAssessment } from "@/contexts/AssessmentContext";
import { RiskAssessmentTable } from "@/components/forms/RiskAssessmentTable";
import { findUnresolvedRows } from "@/lib/riskRowAcceptability";
import type { RiskAssessmentRow } from "@/types/formTemplate";

/**
 * 법정 위험성평가표 (시행규칙 제37조제1항).
 *
 * 서식센터와 같은 `RiskAssessmentTable`을 그대로 쓴다. 표를 두 벌 만들지 않기 위해서다.
 * 이 화면의 편집은 `updateRiskRow`를 거쳐 `riskRows`에 반영되고 디바운스 저장된다.
 */
export function RiskRowSection() {
  const { assessment, updateRiskRow } = useAssessment();
  const rows = assessment?.riskRows ?? [];

  const unresolved = useMemo(() => findUnresolvedRows(rows), [rows]);
  const openImprovements = useMemo(
    () => rows.filter((row) => (row.improvementStatus ?? "planned") !== "done").length,
    [rows],
  );

  const handleChange = (index: number, field: keyof RiskAssessmentRow, value: string | number) => {
    updateRiskRow(index, { [field]: value } as Partial<RiskAssessmentRow>);
  };

  return (
    <section
      className="rounded-radius-lg border border-border bg-surface p-space-5"
      data-testid="risk-row-section"
    >
      <div className="mb-space-3">
        <h2 className="text-heading-2 text-neutral-900">위험성평가표</h2>
        <p className="text-caption text-neutral-500">
          유해·위험 요인별로 위험성이 허용 가능한 수준인지 결정하고, 허용 불가능한 항목에 대한
          개선대책과 이행 상태를 관리합니다.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="mb-space-3 flex flex-wrap gap-space-3 text-caption">
          <span className="rounded-radius-md bg-neutral-100 px-2 py-1 text-neutral-700">
            전체 {rows.length}건
          </span>
          <span className="rounded-radius-md bg-neutral-100 px-2 py-1 text-neutral-700">
            미완료 개선대책 {openImprovements}건
          </span>
          {unresolved.length > 0 && (
            <span
              className="rounded-radius-md bg-warning-050 px-2 py-1 text-warning-700"
              data-testid="risk-row-unresolved-warning"
            >
              허용 불가인데 감소대책이 비어 있는 행 {unresolved.length}건
            </span>
          )}
        </div>
      )}

      <RiskAssessmentTable data={rows} onChange={handleChange} />
    </section>
  );
}
