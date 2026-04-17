import { cn } from "@/lib/utils";

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: "default" | "danger" | "warning" | "success";
}

const variantStyles = {
  default: "border-border",
  danger: "border-risk-critical-border bg-risk-critical-bg",
  warning: "border-risk-high-border bg-risk-high-bg",
  success: "border-risk-low-border bg-risk-low-bg",
};

export function MetricCard({ title, value, subtitle, icon, variant = "default" }: Props) {
  return (
    <div className={cn("rounded-radius-lg border bg-surface p-space-5 min-h-[132px] flex flex-col justify-between", variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <span className="text-label-md text-neutral-500">{title}</span>
        {icon}
      </div>
      <div>
        <div className="text-metric-lg font-mono-num">{value}</div>
        {subtitle && <div className="text-caption text-neutral-500 mt-space-1">{subtitle}</div>}
      </div>
    </div>
  );
}
