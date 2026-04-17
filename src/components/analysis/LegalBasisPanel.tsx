import { FileSearch, ExternalLink, Database, HardDrive, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildStandardsRulesPdfUrl } from "@/lib/lawOriginalText";
import { resolveLegalNarrativeDisplay } from "@/lib/legalNarrative";
import type { EvidenceItem } from "@/types/assessment";

const SOURCE_TYPE_MAP: Record<string, { label: string; icon: typeof Database; className: string; tooltip: string }> = {
  db: {
    label: "DB 구축",
    icon: Database,
    className: "bg-blue-50 text-blue-700 border-blue-200",
    tooltip: "사전 구축된 법령 데이터베이스에서 검색된 조문입니다.",
  },
  storage: {
    label: "법령 원문",
    icon: HardDrive,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    tooltip: "업로드된 법령 원문 파일(PDF/MD)에서 직접 추출된 조문입니다.",
  },
  api: {
    label: "공공 API",
    icon: Globe,
    className: "bg-amber-50 text-amber-700 border-amber-200",
    tooltip: "KOSHA 공공데이터 API에서 실시간 검색된 결과입니다.",
  },
};
const EXCERPT_MAX_LENGTH = 120;
const REASON_MAX_LENGTH = 160;

function truncateSentence(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const safe = lastSpace >= Math.floor(maxLength * 0.6) ? sliced.slice(0, lastSpace) : sliced;
  return safe.replace(/[,\s]+$/g, "").trim();
}

function toSingleSentence(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const firstSentence = normalized
    .split(/(?<=[.!?])\s+|(?<=다\.)\s+|;|\n/g)
    .map((part) => part.trim())
    .find(Boolean) ?? normalized;

  return truncateSentence(firstSentence, maxLength);
}

function resolveArticleNumber(item: EvidenceItem) {
  if (item.articleNumber?.trim()) {
    return item.articleNumber.trim();
  }

  const source = `${item.legalBasis ?? ""} ${item.title}`;
  const match = source.match(/(제\d+조(?:의\d+)?)/);
  return match?.[1] ?? "";
}

interface LegalBasisPanelProps {
  items: EvidenceItem[];
  selectedArticleNumber?: string | null;
  onSelectArticle: (articleNumber: string) => void;
}

export function LegalBasisPanel({ items, selectedArticleNumber, onSelectArticle }: LegalBasisPanelProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-radius-md border border-border bg-surface p-space-4 text-body-md text-neutral-500">
        표시할 법령 근거가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-space-3">
      {items.map((item) => {
        const articleNumber = resolveArticleNumber(item);
        const fullTextUrl = buildStandardsRulesPdfUrl(articleNumber || item.legalBasis || item.title);
        const isSelected = Boolean(selectedArticleNumber && articleNumber === selectedArticleNumber);
        const sourceInfo = SOURCE_TYPE_MAP[item.sourceType ?? ""];
        const SourceIcon = sourceInfo?.icon;
        const narrative = resolveLegalNarrativeDisplay({
          title: item.title,
          legalBasis: item.legalBasis,
          articleNumber,
          relevanceReason: item.relevanceReason,
          applicabilityReason: item.applicabilityReason,
          keyExcerpt: item.keyExcerpt,
          summaryArticle: item.summaryArticle,
        });
        const displayReason = narrative.applicabilityReason;
        const displayExcerpt = narrative.keyExcerpt;
        const displayRequirement = toSingleSentence(displayExcerpt, EXCERPT_MAX_LENGTH);
        const conciseReason = toSingleSentence(displayReason, REASON_MAX_LENGTH);

        return (
          <article
            key={item.id}
            role={articleNumber ? "button" : undefined}
            tabIndex={articleNumber ? 0 : undefined}
            className={cn(
              "w-full rounded-radius-md border bg-surface p-space-4 text-left transition-colors",
              isSelected ? "border-primary-400 bg-primary-050" : "border-border hover:bg-neutral-050",
              articleNumber ? "cursor-pointer" : "cursor-default",
            )}
            onClick={() => {
              if (articleNumber) {
                onSelectArticle(articleNumber);
              }
            }}
            onKeyDown={(event) => {
              if (!articleNumber) {
                return;
              }

              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectArticle(articleNumber);
              }
            }}
            aria-disabled={!articleNumber}
          >
            <div className="mb-space-2 flex items-start justify-between gap-space-3">
              <div className="min-w-0">
                <p className="text-caption text-neutral-500">관련도 {item.relevanceScore}%</p>
                <h3 className="text-body-md text-neutral-900 font-semibold leading-snug break-words whitespace-pre-wrap">{item.title}</h3>
              </div>
              {sourceInfo ? (
                <span
                  className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", sourceInfo.className)}
                  title={sourceInfo.tooltip}
                >
                  {SourceIcon && <SourceIcon className="h-3 w-3" />}
                  {sourceInfo.label}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-neutral-300 bg-neutral-50 px-2 py-0.5 text-[11px] font-semibold text-neutral-500">
                  출처 미확인
                </span>
              )}
            </div>

            <div className="mb-space-2 flex flex-wrap items-center gap-space-2 text-caption text-primary-700 min-w-0 break-words whitespace-pre-wrap">
              <FileSearch className="h-3.5 w-3.5" />
              {item.legalBasis || articleNumber || "근거 조항 미확인"}
            </div>

            {displayRequirement && (
              <div className="rounded-radius-sm border border-neutral-200 bg-neutral-50 px-space-3 py-space-2">
                <p className="text-caption text-neutral-600 mb-1">즉시 확인 핵심 요구사항</p>
                <p className="text-caption text-neutral-800 leading-relaxed whitespace-pre-wrap break-words">{displayRequirement}</p>
              </div>
            )}

            {conciseReason && (
              <p className="mt-space-2 text-caption text-neutral-600 whitespace-pre-wrap break-words">
                <span className="font-semibold text-primary-700">적용 이유:</span> {conciseReason}
              </p>
            )}

            <a
              href={fullTextUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="mt-space-2 inline-flex items-center gap-space-1 text-caption font-semibold text-primary-700 hover:text-primary-900"
            >
              원문보기
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </article>
        );
      })}
    </div>
  );
}
