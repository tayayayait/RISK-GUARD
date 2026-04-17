import { AlertTriangle, AlertOctagon, ShieldAlert, ShieldCheck } from "lucide-react";
import type { RiskLevel } from "@/types/assessment";
import { cn } from "@/lib/utils";

const CONFIG: Record<RiskLevel, { label: string; icon: React.ElementType; textClass: string; bgClass: string; borderClass: string }> = {
  critical: { label: "치명", icon: AlertOctagon, textClass: "text-risk-critical-text", bgClass: "bg-risk-critical-bg", borderClass: "border-risk-critical-border" },
  high: { label: "높음", icon: AlertTriangle, textClass: "text-risk-high-text", bgClass: "bg-risk-high-bg", borderClass: "border-risk-high-border" },
  medium: { label: "보통", icon: ShieldAlert, textClass: "text-risk-medium-text", bgClass: "bg-risk-medium-bg", borderClass: "border-risk-medium-border" },
  low: { label: "낮음", icon: ShieldCheck, textClass: "text-risk-low-text", bgClass: "bg-risk-low-bg", borderClass: "border-risk-low-border" },
};

interface Props {
  level: RiskLevel;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function RiskBadge({ level, size = "md", showLabel = true }: Props) {
  const c = CONFIG[level];
  const Icon = c.icon;
  const sizeClasses = size === "sm" ? "h-6 px-2 text-xs gap-1" : size === "lg" ? "h-8 px-3 text-sm gap-2" : "h-7 px-2.5 text-xs gap-1.5";

  return (
    <span
      className={cn("inline-flex items-center rounded-radius-sm border font-semibold", c.textClass, c.bgClass, c.borderClass, sizeClasses)}
      role="status"
      aria-label={`위험등급: ${c.label}`}
    >
      <Icon className={cn(size === "sm" ? "h-3 w-3" : size === "lg" ? "h-4.5 w-4.5" : "h-3.5 w-3.5")} />
      {showLabel && c.label}
    </span>
  );
}
