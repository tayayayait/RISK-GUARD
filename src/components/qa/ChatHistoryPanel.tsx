import React, { useState } from "react";
import {
  MessageSquare,
  Plus,
  Trash2,
  Search,
  Clock,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CloudCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SafetyQaSessionSummary, AnswerMode } from "@/types/safetyQa";

interface ChatHistoryPanelProps {
  sessions: SafetyQaSessionSummary[];
  currentSessionId: string | null;
  isLoading?: boolean;
  onSelectSession: (sessionId) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId, e: React.MouseEvent) => void;
  onCloseMobile?: () => void;
}

function formatRelativeTime(isoString: string): string {
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
        className="text-[10px] h-4 px-1.5 py-0 border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10 font-medium flex items-center gap-0.5 rounded-full"
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
        className="text-[10px] h-4 px-1.5 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium flex items-center gap-0.5 rounded-full"
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
        className="text-[10px] h-4 px-1.5 py-0 border-destructive/40 text-destructive bg-destructive/10 font-medium flex items-center gap-0.5 rounded-full"
      >
        <AlertTriangle className="h-2.5 w-2.5" />
        <span>전문가확인</span>
      </Badge>
    );
  }
  return null;
}

export const ChatHistoryPanel: React.FC<ChatHistoryPanelProps> = ({
  sessions,
  currentSessionId,
  isLoading = false,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onCloseMobile,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    return s.title.toLowerCase().includes(searchQuery.toLowerCase().trim());
  });

  return (
    <div className="flex h-full flex-col bg-card/70 backdrop-blur border-r border-border/80 select-none">
      {/* 상단 액션: 새 대화 시작 */}
      <div className="p-3.5 space-y-2.5 border-b border-border/70">
        <Button
          onClick={() => {
            onNewChat();
            onCloseMobile?.();
          }}
          className="w-full justify-start gap-2 h-9 text-xs font-semibold shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          <span>새 대화 시작</span>
        </Button>

        {/* 검색 입력창 */}
        {sessions.length > 2 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="대화 제목 검색..."
              className="h-8 pl-8 text-xs bg-background/70 border-border/70 rounded-lg focus-visible:ring-1"
            />
          </div>
        )}
      </div>

      {/* 세션 목록 */}
      <ScrollArea className="flex-1 px-2.5 py-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-xs">대화 기록 불러오는 중...</span>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-muted-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 mb-2">
              <MessageSquare className="h-5 w-5 opacity-40 stroke-[1.5]" />
            </div>
            <p className="text-xs font-semibold text-foreground/80">
              {searchQuery ? "검색 결과가 없습니다." : "저장된 대화가 없습니다."}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {searchQuery ? "다른 검색어를 입력해 보세요." : "새로운 질문을 시작하면 자동으로 기록됩니다."}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="px-2 pb-1.5 flex items-center justify-between text-[11px] font-semibold text-muted-foreground/80">
              <span>대화 목록 ({filteredSessions.length})</span>
            </div>

            {filteredSessions.map((session) => {
              const isActive = session.sessionId === currentSessionId;
              return (
                <div
                  key={session.sessionId}
                  onClick={() => {
                    onSelectSession(session.sessionId);
                    onCloseMobile?.();
                  }}
                  className={`group relative flex flex-col gap-1 rounded-xl px-3 py-2.5 text-left transition-all cursor-pointer border ${
                    isActive
                      ? "bg-primary/10 border-primary/40 text-foreground shadow-xs font-medium"
                      : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-xs line-clamp-1 flex-1 break-all tracking-tight ${
                        isActive ? "text-primary font-bold" : "text-foreground/90 font-medium"
                      }`}
                      title={session.title}
                    >
                      {session.title || "새 안전 상담"}
                    </span>

                    {/* 삭제 버튼 */}
                    <button
                      type="button"
                      onClick={(e) => onDeleteSession(session.sessionId, e)}
                      title="대화 삭제"
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/15 hover:text-destructive text-muted-foreground shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">삭제</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-1 text-[10.5px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 opacity-60" />
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {renderModeBadge(session.lastAnswerMode)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* 하단 동기화 안내 */}
      <div className="p-3 border-t border-border/70 bg-muted/30 text-[11px] text-muted-foreground flex items-center justify-between">
        <span className="truncate flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>자동 클라우드 동기화</span>
        </span>
        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          연결됨
        </span>
      </div>
    </div>
  );
};
