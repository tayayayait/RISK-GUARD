import React from "react";
import { ExternalLink, BookOpen, Quote, Calendar, ShieldCheck } from "lucide-react";
import type { VerifiedCitation } from "@/types/safetyQa";
import { Badge } from "@/components/ui/badge";

interface CitationCardProps {
  citation: VerifiedCitation;
  index: number;
}

export const CitationCard: React.FC<CitationCardProps> = ({ citation, index }) => {
  return (
    <div className="group relative rounded-xl border border-border/80 bg-card/90 p-4 shadow-xs transition-all duration-200 hover:border-primary/50 hover:shadow-md hover:bg-card">
      {/* 헤더: 인용 번호, 법령명, 조문 번호 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="h-5 px-2 text-[11px] font-semibold text-primary border-primary/30 bg-primary/5 flex items-center gap-1"
          >
            <ShieldCheck className="h-3 w-3 text-primary" />
            <span>근거 #{index + 1}</span>
          </Badge>
          <span className="font-semibold text-sm text-foreground tracking-tight">
            {citation.docTitle}
          </span>
          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-xs text-primary border border-primary/20">
            {citation.articleLabel}
            {citation.articleTitle ? ` (${citation.articleTitle})` : ""}
          </span>
        </div>

        {/* 법령 원문 바로가기 링크 */}
        {citation.sourceUrl && (
          <a
            href={citation.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-all duration-150 hover:text-primary hover:underline underline-offset-4"
            title="국가법령정보센터 원문 보기"
          >
            <span className="font-medium">원문 보기</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* 소속 및 시행일 메타데이터 */}
      {(citation.section || citation.effectiveDate) && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground/90">
          {citation.section && (
            <span className="flex items-center gap-1 truncate">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground/70" />
              <span>{citation.section}</span>
            </span>
          )}
          {citation.effectiveDate && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground/70" />
              <span>시행 {citation.effectiveDate}</span>
            </span>
          )}
        </div>
      )}

      {/* 검증된 인용문구 하이라이트 블록 */}
      {citation.quote && (
        <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-foreground/90 border-l-[3px] border-primary/70">
          <div className="flex items-start gap-2.5">
            <Quote className="h-3.5 w-3.5 shrink-0 text-primary/70 mt-0.5" />
            <p className="text-[12.5px] leading-relaxed tracking-normal text-foreground/90 font-normal break-keep">
              "{citation.quote}"
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
