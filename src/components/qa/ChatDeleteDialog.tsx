import React from "react";
import {
  Trash2,
  Clock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SafetyQaSessionSummary, AnswerMode } from "@/types/safetyQa";

interface ChatDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: SafetyQaSessionSummary | null;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "방금 전";
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "방금 전";

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMin < 1) return "방금 전";
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    if (diffDay === 1) return "어제";
    if (diffDay < 7) return `${diffDay}일 전`;

    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  } catch {
    return "";
  }
}

function renderModeBadge(mode?: AnswerMode) {
  if (mode === "grounded") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] h-4 px-1.5 py-0 border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10 font-medium flex items-center gap-0.5 rounded-full shrink-0"
      >
        <ShieldCheck className="h-2.5 w-2.5" />
        <span>법령인용</span>
      </Badge>
    );
  }
  if (mode === "guidance") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] h-4 px-1.5 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium flex items-center gap-0.5 rounded-full shrink-0"
      >
        <Sparkles className="h-2.5 w-2.5" />
        <span>안전가이드</span>
      </Badge>
    );
  }
  if (mode === "escalation") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] h-4 px-1.5 py-0 border-destructive/40 text-destructive bg-destructive/10 font-medium flex items-center gap-0.5 rounded-full shrink-0"
      >
        <AlertTriangle className="h-2.5 w-2.5" />
        <span>전문가확인</span>
      </Badge>
    );
  }
  return null;
}

export const ChatDeleteDialog: React.FC<ChatDeleteDialogProps> = ({
  open,
  onOpenChange,
  session,
  onConfirm,
  isDeleting = false,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[440px] rounded-2xl border border-border/80 bg-card/95 p-5 sm:p-6 backdrop-blur-md shadow-2xl space-y-4">
        {/* 상단 헤더 & 경고 아이콘 */}
        <AlertDialogHeader className="space-y-3 sm:space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 shadow-xs">
              <Trash2 className="h-5 w-5 stroke-[1.8]" />
            </div>
            <div>
              <AlertDialogTitle className="text-base sm:text-lg font-bold text-foreground text-left">
                대화 기록 삭제
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-muted-foreground text-left mt-0.5">
                선택한 대화 기록을 영구히 삭제합니다.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {/* 삭제 대상 세션 요약 카드 */}
        {session && (
          <div className="rounded-xl border border-border/70 bg-muted/40 dark:bg-muted/20 p-3.5 space-y-2 text-left transition-all">
            <div className="flex items-start justify-between gap-2">
              <span
                className="text-xs font-semibold text-foreground/90 line-clamp-2 break-all leading-snug"
                title={session.title}
              >
                {session.title || "새 안전 상담"}
              </span>
              {renderModeBadge(session.lastAnswerMode)}
            </div>

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 opacity-70" />
                <span>{formatRelativeTime(session.updatedAt)}</span>
              </div>
              {session.messageCount !== undefined && session.messageCount > 0 && (
                <div className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3 opacity-70" />
                  <span>메시지 {session.messageCount}개</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 경고 안내문 */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-destructive/5 dark:bg-destructive/10 border border-destructive/15 rounded-xl p-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            삭제된 대화 기록과 인용된 법령 내역은 복구할 수 없습니다. 계속 진행하시겠습니까?
          </p>
        </div>

        {/* 하단 액션 버튼 */}
        <AlertDialogFooter className="flex flex-row items-center justify-end gap-2 pt-2 sm:space-x-0">
          <AlertDialogCancel asChild>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              className="h-9 px-4 text-xs font-semibold text-muted-foreground hover:text-foreground border-border/80 rounded-xl"
            >
              취소
            </Button>
          </AlertDialogCancel>

          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="h-9 px-4 text-xs font-semibold gap-1.5 shadow-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all rounded-xl"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>삭제 중...</span>
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                <span>삭제하기</span>
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
