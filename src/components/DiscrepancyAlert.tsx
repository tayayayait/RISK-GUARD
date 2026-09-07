import React from "react";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import type { DiscrepancyItem } from "../../supabase/functions/_shared/scan-crosscheck";

interface DiscrepancyAlertProps {
  discrepancies: DiscrepancyItem[];
}

export const DiscrepancyAlert: React.FC<DiscrepancyAlertProps> = ({ discrepancies }) => {
  if (!discrepancies || discrepancies.length === 0) {
    return null;
  }

  const criticals = discrepancies.filter((d) => d.severity === "critical");
  const warnings = discrepancies.filter((d) => d.severity === "warn");
  const infos = discrepancies.filter((d) => d.severity === "info");

  return (
    <div className="space-y-3 w-full" data-testid="discrepancy-alerts">
      {criticals.length > 0 && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4 text-red-900 shadow-sm" data-testid="discrepancy-critical-banner">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-bold text-red-900 text-sm md:text-base">
                ⚠️ [중대 경고] 현장 라벨과 공식 안전정보 간 중대 불일치 발견
              </h4>
              <p className="text-xs md:text-sm text-red-800">
                라벨에 필수 위험 경고가 누락되었거나 신호어가 낮게 표기되어 있습니다. 반드시 안전관리자 확인 후 작업하십시오.
              </p>
              <ul className="list-disc list-inside text-xs md:text-sm text-red-700 space-y-0.5 pt-1">
                {criticals.map((item, idx) => (
                  <li key={idx}>
                    <span className="font-semibold">{item.message}</span>
                    <span className="text-xs text-neutral-600 block pl-4">
                      (라벨 표기: {item.onLabel} ↔ 공식 기준: {item.onRecord})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-3.5 text-amber-900 shadow-sm" data-testid="discrepancy-warn-banner">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="font-semibold text-amber-900 text-xs md:text-sm">
                주의: 라벨 표기와 공식 데이터 간 차이점
              </h5>
              <ul className="list-disc list-inside text-xs text-amber-800 space-y-0.5">
                {warnings.map((item, idx) => (
                  <li key={idx}>{item.message}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {infos.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500 shrink-0" />
          <div>{infos.map((i) => i.message).join(" | ")}</div>
        </div>
      )}
    </div>
  );
};
