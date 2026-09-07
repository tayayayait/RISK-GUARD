import React from "react";
import { GHS_PICTOGRAMS } from "../../supabase/functions/_shared/ghs-codes";

interface GhsPictogramProps {
  code: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export const GhsPictogram: React.FC<GhsPictogramProps> = ({
  code,
  size = "md",
  showLabel = true,
}) => {
  const normalizedCode = code.replace(/\.gif$/i, "").toUpperCase();
  const meta = GHS_PICTOGRAMS[normalizedCode] || {
    code: normalizedCode,
    ko: normalizedCode,
    en: normalizedCode,
    symbol: "경고 심볼",
    description: "",
  };

  const sizeClasses = {
    sm: "w-10 h-10 text-xs",
    md: "w-16 h-16 text-sm",
    lg: "w-24 h-24 text-base",
  }[size];

  // GHS 빨간 마름모 테두리 + 내부 상징 아이콘
  return (
    <div className="flex flex-col items-center gap-1.5" data-testid={`ghs-pictogram-${normalizedCode}`}>
      <div
        className={`relative flex items-center justify-center p-1 rounded-sm border-2 border-red-600 bg-white shadow-sm rotate-45 aspect-square ${sizeClasses}`}
      >
        <div className="-rotate-45 flex flex-col items-center justify-center text-center">
          <span className="font-bold text-red-700 leading-tight">
            {normalizedCode.replace("GHS0", "G")}
          </span>
          <span className="text-[9px] text-neutral-600 font-medium">
            {meta.symbol}
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="text-xs font-semibold text-neutral-800 text-center mt-1">
          {meta.ko}
        </span>
      )}
    </div>
  );
};
