import React from "react";
import { AlertTriangle, PhoneCall, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SafetyOfficerBannerProps {
  reason?: string;
  isEmergency?: boolean;
}

export const SafetyOfficerBanner: React.FC<SafetyOfficerBannerProps> = ({
  reason,
  isEmergency = false,
}) => {
  if (isEmergency) {
    return (
      <Alert className="border-destructive/40 bg-destructive/10 text-destructive dark:border-destructive/60 mb-3.5 rounded-xl shadow-xs">
        <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-1">
          <AlertTitle className="text-sm font-bold flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-1.5">긴급/비상 상황 대응 필요</span>
            <a
              href="tel:119"
              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer shadow-xs"
            >
              <PhoneCall className="h-3 w-3" />
              <span>119 즉시 신고</span>
            </a>
          </AlertTitle>
          <AlertDescription className="text-xs text-destructive/95 leading-relaxed font-medium">
            {reason || "인명 피해 또는 응급 상황이 발생한 경우 즉시 작업을 중단하고 119 및 사내 비상연락망으로 신고하십시오."}
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  return (
    <Alert className="border-amber-500/35 bg-amber-50/60 dark:bg-amber-950/25 text-amber-950 dark:text-amber-100 dark:border-amber-500/40 mb-3.5 rounded-xl shadow-xs">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="space-y-0.5">
        <AlertTitle className="text-xs font-bold text-amber-900 dark:text-amber-200">
          안전보건관리책임자(전문가) 확인 필요
        </AlertTitle>
        <AlertDescription className="text-[11.5px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
          {reason || "본 질의는 현장 안전관리자, 안전보건총괄책임자 또는 관할 노동관서의 정밀 검토 및 승인이 필요한 사항입니다."}
        </AlertDescription>
      </div>
    </Alert>
  );
};
