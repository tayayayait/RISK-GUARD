import React from "react";
import { ExternalLink, BookOpen, ChevronRight } from "lucide-react";
import type { RelatedArticle } from "@/types/safetyQa";

interface RelatedArticleListProps {
  articles: RelatedArticle[];
  title?: string;
}

export const RelatedArticleList: React.FC<RelatedArticleListProps> = ({
  articles,
  title = "관련 법령 조문",
}) => {
  if (!articles || articles.length === 0) return null;

  return (
    <div className="mt-3.5 rounded-xl border border-border/80 bg-card/70 p-3.5 shadow-xs">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground/80 mb-2.5">
        <BookOpen className="h-4 w-4 text-primary" />
        <span>{title} ({articles.length}건)</span>
      </div>

      <div className="divide-y divide-border/50">
        {articles.map((item, idx) => (
          <div
            key={`${item.docTitle}-${item.articleLabel}-${idx}`}
            className="flex items-center justify-between py-2 text-xs first:pt-0 last:pb-0 hover:bg-muted/40 px-1.5 -mx-1.5 rounded-md transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              <span className="font-medium text-foreground truncate">{item.docTitle}</span>
              <span className="text-primary font-semibold shrink-0">
                {item.articleLabel}
                {item.articleTitle ? ` (${item.articleTitle})` : ""}
              </span>
            </div>

            {item.sourceUrl && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground hover:text-primary transition-colors ml-2 font-medium"
                title="국가법령정보센터 바로가기"
              >
                <span>원문</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
