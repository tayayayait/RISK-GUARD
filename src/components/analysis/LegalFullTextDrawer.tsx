import { useEffect, useRef } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveLegalNarrativeDisplay } from "@/lib/legalNarrative";
import type { EvidenceItem } from "@/types/assessment";

const EXCERPT_MAX_LENGTH = 120;
const REASON_MAX_LENGTH = 220;

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

function ensurePeriod(text: string) {
  if (!text) {
    return "";
  }
  return /[.!?…。？！]$/.test(text) ? text : `${text}.`;
}

function toReadableReason(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+|(?<=다\.)\s+|;|\n/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return "";
  }

  const combined = sentences.slice(0, 2).join(" ");
  if (combined.length <= maxLength) {
    return ensurePeriod(combined);
  }

  return ensurePeriod(toSingleSentence(combined, maxLength));
}

export interface SelectedArticleDetail {
  articleNumber: string;
  title: string;
  legalBasis?: string;
  clausePreview?: string;
  relevanceReason?: string;
  keyExcerpt?: string;
  applicabilityReason?: string;
  summaryArticle?: string;
  summaryBullets: string[];
  url?: string;
  sourceType?: EvidenceItem["sourceType"];
}

interface LegalFullTextDrawerProps {
  selectedArticle: SelectedArticleDetail;
  onClose: () => void;
}

export function LegalFullTextDrawer({ selectedArticle, onClose }: LegalFullTextDrawerProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const narrative = resolveLegalNarrativeDisplay({
    title: selectedArticle.title,
    legalBasis: selectedArticle.legalBasis,
    articleNumber: selectedArticle.articleNumber,
    relevanceReason: selectedArticle.relevanceReason,
    applicabilityReason: selectedArticle.applicabilityReason,
    keyExcerpt: selectedArticle.keyExcerpt,
    summaryArticle: selectedArticle.summaryArticle,
  });
  const displayReason = narrative.applicabilityReason;
  const displayExcerpt = narrative.keyExcerpt;
  const conciseExcerpt = toSingleSentence(displayExcerpt, EXCERPT_MAX_LENGTH);
  const conciseReason = toReadableReason(displayReason, REASON_MAX_LENGTH);

  useEffect(() => {
    titleRef.current?.focus();
  }, [selectedArticle.articleNumber]);

  return (
    <div className="space-y-space-4">
      <div className="rounded-radius-lg border border-border bg-surface p-space-4">
        <div className="mb-space-3 flex items-start justify-between gap-space-3">
          <div>
            <p className="text-caption text-neutral-500">법령 전문 보기</p>
            <h3
              ref={titleRef}
              tabIndex={-1}
              className="text-heading-3 text-neutral-900 break-words whitespace-pre-wrap focus:outline-none"
            >
              {selectedArticle.title}
            </h3>
            <p className="text-caption text-primary-700 mt-1 break-words whitespace-pre-wrap">{selectedArticle.legalBasis ?? selectedArticle.articleNumber}</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={onClose}>
            닫기
            <X className="h-4 w-4" />
          </Button>
        </div>

        {conciseExcerpt ? (
          <div className="rounded-radius-md border border-neutral-200 bg-neutral-50 p-space-3">
            <p className="text-caption text-neutral-600 mb-1">핵심 발췌</p>
            <p className="text-body-sm text-neutral-800 leading-relaxed whitespace-pre-wrap break-words">{conciseExcerpt}</p>
          </div>
        ) : (
          <p className="text-body-sm text-neutral-500">핵심 발췌 정보가 없습니다.</p>
        )}

        <div className="mt-space-4">
          <p className="text-caption text-neutral-600 mb-1">적용 이유</p>
          <p className="text-body-sm text-neutral-800 leading-relaxed whitespace-pre-wrap break-words">
            {conciseReason || "관련성 근거가 제공되지 않았습니다."}
          </p>
        </div>

        {selectedArticle.url && (
          <a
            href={selectedArticle.url}
            target="_blank"
            rel="noreferrer"
            className="mt-space-4 inline-flex items-center gap-space-1 text-body-sm text-primary-700"
          >
            원문 링크 열기
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      <div className="rounded-radius-md border border-warning-300 bg-warning-050 p-space-3 text-caption text-warning-700">
        현재 응답에는 조문 전문 원문이 포함되지 않아 핵심 요구사항과 적용 이유만 표시합니다.
      </div>
    </div>
  );
}
