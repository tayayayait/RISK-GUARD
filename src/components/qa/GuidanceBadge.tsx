import React from "react";
import { Info, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface GuidanceBadgeProps {
  showBanner?: boolean;
}

export const GuidanceBadge: React.FC<GuidanceBadgeProps> = ({ showBanner = true }) => {
  return (
    <div className="space-y-2.5">
      <Badge className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25 text-[11.5px] font-medium gap-1.5 px-2.5 py-1 shadow-xs">
        <Sparkles className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
        <span>AI 안전 가이드 (실무 체크리스트)</span>
      </Badge>

      {showBanner && (
        <Alert className="border-sky-500/25 bg-sky-50/50 dark:bg-sky-950/20 text-sky-950 dark:text-sky-200 py-3 px-3.5 rounded-xl">
          <Info className="h-4 w-4 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <AlertTitle className="text-xs font-semibold text-sky-900 dark:text-sky-100 tracking-tight">
              AI 일반 안전보건 가이드 (법적 효력 없음)
            </AlertTitle>
            <AlertDescription className="text-[11.5px] text-sky-800/90 dark:text-sky-300/90 leading-relaxed">
              본 답변은 현장 안전 작업을 돕기 위한 실무 가이드입니다. 법령상 의무 규정 확인이 필요한 경우 관련 법령 조문을 확인하거나 안전보건관리책임자에게 문의하십시오.
            </AlertDescription>
          </div>
        </Alert>
      )}
    </div>
  );
};
