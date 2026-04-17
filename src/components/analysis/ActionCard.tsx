import { FileText, Quote } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LawActionItem } from "@/types/assessment";

const STAGE_META: Record<LawActionItem["stage"], { label: string; badgeClassName: string; panelClassName: string }> = {
  immediate: {
    label: "즉시",
    badgeClassName: "bg-accent-100 text-accent-800",
    panelClassName: "border-accent-200 bg-accent-050",
  },
  same_day: {
    label: "당일",
    badgeClassName: "bg-primary-100 text-primary-800",
    panelClassName: "border-primary-200 bg-primary-050",
  },
  pre_resume: {
    label: "재개 전",
    badgeClassName: "bg-success-100 text-success-700",
    panelClassName: "border-success-200 bg-success-050",
  },
  improvement: {
    label: "재발 방지",
    badgeClassName: "bg-neutral-200 text-neutral-800",
    panelClassName: "border-neutral-300 bg-neutral-050",
  },
};

function isDebugReason(reason?: string): boolean {
  if (!reason) return false;
  return /hazardType\s*\d+/.test(reason);
}

interface ActionCardProps {
  item: LawActionItem;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onSelectArticle: (articleNumber: string) => void;
  className?: string;
}

export function ActionCard({ item, checked, onCheckedChange, onSelectArticle, className }: ActionCardProps) {
  const stageMeta = STAGE_META[item.stage];
  const displayReason = isDebugReason(item.relevanceReason)
    ? "해당 작업 조건에 관련된 법령 조항입니다."
    : item.relevanceReason;

  return (
    <div className={cn("rounded-radius-md border p-space-4", stageMeta.panelClassName, className)}>
      <div className="flex items-start gap-space-3">
        <Checkbox
          id={`action-check-${item.id}`}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(Boolean(value))}
          className="mt-1"
          aria-label={`${item.actionText} 체크`}
        />
        <div className="min-w-0 flex-1 space-y-space-2">
          <div className="flex flex-wrap items-center gap-space-2">
            <span className={cn("inline-flex items-center rounded-radius-sm px-2 py-1 text-caption font-semibold", stageMeta.badgeClassName)}>
              {stageMeta.label}
            </span>
          </div>

          <p className="text-body-md text-neutral-900 font-medium leading-relaxed">{item.actionText}</p>

          {item.articleNumbers.length > 0 && (
            <div className="flex flex-wrap items-center gap-space-2">
              <FileText className="h-4 w-4 text-neutral-500" />
              {item.articleNumbers.map((articleNumber) => (
                <Button
                  key={`${item.id}-${articleNumber}`}
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-caption text-primary-700"
                  onClick={() => onSelectArticle(articleNumber)}
                >
                  {item.legalBasis || articleNumber}
                </Button>
              ))}
            </div>
          )}

          {item.clausePreview && (
            <div className="rounded-radius-sm border border-neutral-200 bg-white px-space-3 py-space-2">
              <div className="mb-1 flex items-center gap-space-1 text-caption text-neutral-600">
                <Quote className="h-3.5 w-3.5" />
                핵심 발췌
              </div>
              <p className="text-caption text-neutral-700 leading-relaxed">{item.clausePreview}</p>
            </div>
          )}

          {displayReason && (
            <p className="text-caption text-neutral-700">
              <span className="font-semibold text-primary-700">적용 이유:</span> {displayReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
