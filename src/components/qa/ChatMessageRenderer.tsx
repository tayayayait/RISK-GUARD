import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatMessageRendererProps {
  content: string;
  isAssistant?: boolean;
  className?: string;
}

/**
 * 인라인 마크다운 서식(볼드, 인라인 코드, 일반 텍스트) 파싱
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  // 정규식: **bold** 또는 `code` 매칭
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      const inner = part.slice(2, -2);
      return (
        <strong key={idx} className="font-semibold text-foreground">
          {inner}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <code
          key={idx}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] font-medium text-primary"
        >
          {inner}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

/**
 * 줄글 내에서 " 1. ", " 2. " 등으로 이어지는 텍스트를 적절히 줄바꿈 분리
 */
function normalizeStructuredText(rawContent: string): string {
  if (!rawContent) return "";
  // 텍스트 중간에 마침표나 쉼표 뒤 " 1. ", " 2. " 형태로 붙어있는 경우 줄바꿈 삽입
  let normalized = rawContent.replace(/([.!?])\s+(\d+\.\s+)/g, "$1\n\n$2");
  // " - " 또는 " • " 형태도 줄바꿈 분리
  normalized = normalized.replace(/([.!?])\s+([-\u2022]\s+)/g, "$1\n$2");
  return normalized;
}

export const ChatMessageRenderer: React.FC<ChatMessageRendererProps> = ({
  content,
  isAssistant = false,
  className = "",
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // 마크다운 기호 제거한 순수 텍스트 복사
      const plainText = content.replace(/\*\*(.*?)\*\*/g, "$1");
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const normalized = normalizeStructuredText(content);
  // 단락 분리 (\n\n)
  const paragraphs = normalized.split(/\n{2,}/);

  return (
    <div className={`relative group text-sm leading-relaxed space-y-3 ${className}`}>
      {paragraphs.map((paragraph, pIdx) => {
        const lines = paragraph.split(/\n/);

        // 번호 목록 또는 불릿 목록인지 판별
        const isNumbered = /^\d+\.\s+/.test(lines[0].trim());
        const isBullet = /^[-*\u2022]\s+/.test(lines[0].trim());

        if (isNumbered || isBullet) {
          return (
            <div key={pIdx} className="space-y-2 pl-0.5">
              {lines.map((line, lIdx) => {
                const trimmed = line.trim();
                const numberedMatch = trimmed.match(/^(\d+\.)\s+(.+)$/);
                const bulletMatch = trimmed.match(/^[-*\u2022]\s+(.+)$/);

                if (numberedMatch) {
                  return (
                    <div key={lIdx} className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary mt-0.5 select-none">
                        {numberedMatch[1].replace(".", "")}
                      </span>
                      <div className="flex-1 text-foreground/90 pt-0.5">
                        {renderInlineFormatting(numberedMatch[2])}
                      </div>
                    </div>
                  );
                }

                if (bulletMatch) {
                  return (
                    <div key={lIdx} className="flex items-start gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-2 select-none" />
                      <div className="flex-1 text-foreground/90">
                        {renderInlineFormatting(bulletMatch[1])}
                      </div>
                    </div>
                  );
                }

                return (
                  <p key={lIdx} className="text-foreground/90">
                    {renderInlineFormatting(trimmed)}
                  </p>
                );
              })}
            </div>
          );
        }

        // 일반 단락
        return (
          <p key={pIdx} className="text-foreground/95 whitespace-pre-wrap">
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {renderInlineFormatting(line)}
                {lIdx < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      })}

      {/* 어시스턴트 메시지 복사 액션 버튼 */}
      {isAssistant && content && (
        <div className="flex items-center justify-end pt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/80 gap-1 rounded-md"
            title="답변 내용 복사"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  복사됨
                </span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>복사</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
