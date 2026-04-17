import { type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface FormCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  automationRate: number;
  badgeText?: string;
  isAvailable?: boolean;
}

export function FormCard({
  title,
  description,
  icon: Icon,
  href,
  automationRate,
  badgeText,
  isAvailable = true,
}: FormCardProps) {
  return (
    <Link
      to={isAvailable ? href : "#"}
      className={cn(
        "group flex flex-col justify-between p-space-6 bg-surface border rounded-radius-lg transition-all",
        isAvailable 
          ? "border-border hover:border-primary-500 hover:shadow-sm" 
          : "border-border opacity-60 cursor-not-allowed"
      )}
    >
      <div>
        <div className="flex items-start justify-between mb-space-4">
          <div className={cn(
            "p-space-3 rounded-radius-md",
            isAvailable ? "bg-primary-050 text-primary-700" : "bg-neutral-100 text-neutral-500"
          )}>
            <Icon className="h-6 w-6" />
          </div>
          {badgeText && (
            <span className={cn(
              "px-space-2 py-0.5 rounded-full text-caption font-medium",
              isAvailable 
                ? "bg-warning-050 text-warning-700 border border-warning-200" 
                : "bg-neutral-100 text-neutral-500 border border-neutral-200"
            )}>
              {badgeText}
            </span>
          )}
        </div>
        
        <h3 className="text-heading-3 text-neutral-900 mb-space-2 group-hover:text-primary-700 transition-colors">
          {title}
        </h3>
        <p className="text-body-sm text-neutral-600 mb-space-6 line-clamp-2">
          {description}
        </p>
      </div>

      <div className="flex items-center justify-between pt-space-4 border-t border-border">
        <div className="flex items-center gap-space-2">
          <span className="text-caption text-neutral-500">자동화율</span>
          <div className="flex items-center gap-space-1">
            <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full",
                  automationRate >= 90 ? "bg-success-500" : 
                  automationRate >= 60 ? "bg-warning-500" : "bg-primary-500"
                )}
                style={{ width: `${automationRate}%` }}
              />
            </div>
            <span className="text-caption font-mono-num font-medium text-neutral-700">{automationRate}%</span>
          </div>
        </div>
        {isAvailable && (
          <span className="text-body-sm font-medium text-primary-700 opacity-0 group-hover:opacity-100 transition-opacity">
            작성하기 ➔
          </span>
        )}
      </div>
    </Link>
  );
}
