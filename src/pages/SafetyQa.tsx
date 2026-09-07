import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Send,
  Bot,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Info,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowLeft,
  History,
  Plus,
  Shield,
  Zap,
  ArrowUpRight,
  HardHat,
  Flame,
  Wind,
  Construction,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CitationCard } from "@/components/qa/CitationCard";
import { RelatedArticleList } from "@/components/qa/RelatedArticleList";
import { SafetyOfficerBanner } from "@/components/qa/SafetyOfficerBanner";
import { GuidanceBadge } from "@/components/qa/GuidanceBadge";
import { ChatHistoryPanel } from "@/components/qa/ChatHistoryPanel";
import { ChatMessageRenderer } from "@/components/qa/ChatMessageRenderer";
import { ChatDeleteDialog } from "@/components/qa/ChatDeleteDialog";
import { ChatResetDialog } from "@/components/qa/ChatResetDialog";
import { SafetyQaService } from "@/services/safetyQaService";
import { SafetyQaHistoryService } from "@/services/safetyQaHistoryService";
import type {
  ChatMessage,
  ChatTurnMessage,
  QaConfidence,
  SafetyQaResponse,
  SafetyQaSessionSummary,
} from "@/types/safetyQa";

const QUICK_PROMPTS = [
  {
    icon: Construction,
    category: "공정 점검",
    text: "오늘 반도체 공정 작업인데 어떤 점검이나 준비를 해야 할까?",
  },
  {
    icon: Wind,
    category: "밀폐공간",
    text: "밀폐공간 맨홀 작업 시 산소농도 측정 기준 및 환기 규정은?",
  },
  {
    icon: Flame,
    category: "화재 예방",
    text: "용접 작업 전 화재 예방을 위한 필수 안전 조치사항은?",
  },
  {
    icon: HardHat,
    category: "고소 작업",
    text: "달비계 작업 시 추락 방지를 위한 안전대 및 작업발판 기준은?",
  },
];

function generateNewSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const INITIAL_MESSAGE: ChatMessage = {
  id: "initial-bot-message",
  role: "assistant",
  content:
    "안녕하세요! **산업안전보건 AI 전문 상담관**입니다.\n\n" +
    "현장 작업 절차, 안전 점검 사항, 보호구 기준 등 무엇이든 편하게 질문하세요.\n" +
    "법령 근거가 있는 사항은 공식 조문을 인용해 답변하고, 일반 안전 가이드가 필요한 질문에도 실무 전문 지식을 바탕으로 친절히 안내해 드립니다.",
  timestamp: new Date(),
};

function renderConfidenceBadge(confidence?: QaConfidence) {
  if (!confidence) return null;
  switch (confidence) {
    case "high":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[11px] font-medium gap-1 rounded-full px-2">
          <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          <span>신뢰도 높음 (법령 조문 일치)</span>
        </Badge>
      );
    case "medium":
      return (
        <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 text-[11px] font-medium gap-1 rounded-full px-2">
          <ShieldCheck className="h-3 w-3 text-blue-600 dark:text-blue-400" />
          <span>신뢰도 보통 (관련 조문 인용)</span>
        </Badge>
      );
    case "low":
    default:
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[11px] font-medium gap-1 rounded-full px-2">
          <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          <span>신뢰도 주의 (추가 확인 권장)</span>
        </Badge>
      );
  }
}

export const SafetyQa: React.FC = () => {
  const navigate = useNavigate();

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    const active = SafetyQaHistoryService.loadActiveSession();
    return active?.sessionId || generateNewSessionId();
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const active = SafetyQaHistoryService.loadActiveSession();
    return active && active.messages.length > 0 ? active.messages : [INITIAL_MESSAGE];
  });

  const [sessions, setSessions] = useState<SafetyQaSessionSummary[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // 커스텀 확인 모달 상태 관리
  const [sessionToDelete, setSessionToDelete] = useState<SafetyQaSessionSummary | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const [inputQuestion, setInputQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadSessions = useCallback(async () => {
    setIsHistoryLoading(true);
    try {
      const list = await SafetyQaHistoryService.listSessions();
      setSessions(list);
    } catch (err) {
      console.warn("[SafetyQa] Failed to fetch session history:", err);
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const scrollToBottom = () => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const saveCurrentSession = useCallback(
    async (messagesToSave: ChatMessage[], sessionIdToSave: string) => {
      if (messagesToSave.length > 1 || (messagesToSave.length === 1 && messagesToSave[0].id !== "initial-bot-message")) {
        await SafetyQaHistoryService.saveSession(sessionIdToSave, messagesToSave);
        await loadSessions();
      }
    },
    [loadSessions]
  );

  const handleSend = async (questionToSend?: string) => {
    const question = (questionToSend ?? inputQuestion).trim();
    if (!question || isLoading) return;

    const userMessageId = `user-${Date.now()}`;
    const botMessageId = `bot-${Date.now()}`;

    const userMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: question,
      timestamp: new Date(),
    };

    const loadingBotMessage: ChatMessage = {
      id: botMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    };

    const previousTurns: ChatTurnMessage[] = messages
      .filter((m) => !m.isLoading && !m.isError && m.id !== "initial-bot-message")
      .slice(-6)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    const updatedMessages = [...messages, userMessage, loadingBotMessage];
    setMessages(updatedMessages);
    setInputQuestion("");
    setIsLoading(true);

    const userOnlyMessages = [...messages, userMessage];
    saveCurrentSession(userOnlyMessages, currentSessionId);

    try {
      const response: SafetyQaResponse | null = await SafetyQaService.askQuestion(question, {
        messages: previousTurns,
        sessionId: currentSessionId,
      });

      if (!response) {
        throw new Error("서버로부터 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }

      const finalMessages = updatedMessages.map((msg) =>
        msg.id === botMessageId
          ? {
              ...msg,
              isLoading: false,
              content: response.answer,
              response,
            }
          : msg
      );

      setMessages(finalMessages);
      saveCurrentSession(finalMessages, currentSessionId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "질문 처리 중 오류가 발생했습니다.";
      const errorMessages = updatedMessages.map((msg) =>
        msg.id === botMessageId
          ? {
              ...msg,
              isLoading: false,
              isError: true,
              errorMessage,
              content:
                "죄송합니다. 답변 생성 중 오류가 발생했습니다. 잠시 후 다시 질문해 주세요.",
            }
          : msg
      );
      setMessages(errorMessages);
      saveCurrentSession(errorMessages, currentSessionId);
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    const newSessionId = generateNewSessionId();
    setCurrentSessionId(newSessionId);
    setMessages([INITIAL_MESSAGE]);
    setInputQuestion("");
    SafetyQaHistoryService.clearActiveSession();
  };

  const handleSelectSession = async (targetSessionId: string) => {
    if (targetSessionId === currentSessionId) return;

    setIsLoading(true);
    try {
      const detail = await SafetyQaHistoryService.getSession(targetSessionId);
      if (detail && Array.isArray(detail.messages) && detail.messages.length > 0) {
        setCurrentSessionId(targetSessionId);
        const mappedMessages: ChatMessage[] = detail.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp),
          response: m.response,
        }));
        setMessages(mappedMessages);
        SafetyQaHistoryService.saveActiveSession(
          mappedMessages,
          targetSessionId,
          detail.title
        );
      }
    } catch (err) {
      console.warn("[SafetyQa] Failed to load session detail:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = (targetSessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = sessions.find((s) => s.sessionId === targetSessionId) || {
      id: targetSessionId,
      sessionId: targetSessionId,
      title: "대화 기록",
      lastAnswerMode: "guidance",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
    setSessionToDelete(target);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!sessionToDelete) return;
    setIsDeletingSession(true);
    try {
      const targetId = sessionToDelete.sessionId;
      await SafetyQaHistoryService.deleteSession(targetId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== targetId));

      if (targetId === currentSessionId) {
        handleNewChat();
      }
      setIsDeleteDialogOpen(false);
      setSessionToDelete(null);
    } catch (err) {
      console.warn("[SafetyQa] Failed to delete session:", err);
    } finally {
      setIsDeletingSession(false);
    }
  };

  const handleResetChat = () => {
    if (messages.length <= 1) {
      handleNewChat();
      return;
    }
    setIsResetDialogOpen(true);
  };

  const handleConfirmReset = () => {
    handleNewChat();
    setIsResetDialogOpen(false);
  };

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const isInitialState = messages.length <= 1;

  return (
    <DashboardShell noPadding>
      <div className="flex flex-1 h-full min-h-0 bg-background/95 overflow-hidden">
        {/* 모바일 대화 기록 Drawer (Sheet) */}
        <Sheet open={isMobileDrawerOpen} onOpenChange={setIsMobileDrawerOpen}>
          <SheetContent side="left" className="p-0 w-80 max-w-[85vw]">
            <ChatHistoryPanel
              sessions={sessions}
              currentSessionId={currentSessionId}
              isLoading={isHistoryLoading}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
              onDeleteSession={handleDeleteSession}
              onCloseMobile={() => setIsMobileDrawerOpen(false)}
            />
          </SheetContent>
        </Sheet>

        {/* 데스크탑 좌측 대화 기록 사이드바 (접기/펼치기 가능) */}
        {isSidebarOpen && (
          <aside className="hidden md:flex w-72 lg:w-80 flex-col shrink-0 h-full">
            <ChatHistoryPanel
              sessions={sessions}
              currentSessionId={currentSessionId}
              isLoading={isHistoryLoading}
              onSelectSession={handleSelectSession}
              onNewChat={handleNewChat}
              onDeleteSession={handleDeleteSession}
            />
          </aside>
        )}

        {/* 메인 채팅 영역 */}
        <div className="flex flex-1 h-full flex-col min-h-0 bg-background/60 overflow-hidden relative">
          {/* 상단 헤더 바 */}
          <header className="flex items-center justify-between border-b border-border/70 bg-card/80 px-3 sm:px-6 py-2.5 backdrop-blur-md shrink-0 z-10">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGoBack}
                className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5 border-border/80 hover:bg-accent shrink-0 rounded-lg shadow-xs"
                title="이전 화면으로 돌아가기"
                aria-label="뒤로가기"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline font-medium">뒤로가기</span>
              </Button>

              {/* 사이드바 토글 버튼 */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.innerWidth < 768) {
                    setIsMobileDrawerOpen(true);
                  } else {
                    setIsSidebarOpen((prev) => !prev);
                  }
                }}
                className="h-8 px-2 sm:px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5 shrink-0 border border-border/70 md:border-transparent rounded-lg"
                title="대화 기록 보기"
                aria-label="대화 기록 보기"
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">대화 기록</span>
                {sessions.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] shrink-0 font-semibold rounded-full">
                    {sessions.length}
                  </Badge>
                )}
              </Button>

              <div className="h-4 w-px bg-border/80 hidden sm:block shrink-0" />

              {/* 서비스 아이덴티티 */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary border border-primary/20 shrink-0 shadow-xs">
                  <Shield className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5 truncate">
                    <span>대화형 안전 AI 어시스턴트</span>
                    <Badge variant="outline" className="text-[9.5px] h-4 px-1.5 text-primary border-primary/30 bg-primary/5 font-semibold rounded-full hidden sm:inline-flex items-center gap-0.5">
                      <Zap className="h-2.5 w-2.5" />
                      하이브리드 RAG
                    </Badge>
                  </h1>
                  <p className="text-[10.5px] sm:text-[11px] text-muted-foreground truncate hidden xs:flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>공식 법령 조문 & 현장 안전보건 전문 가이드 제공</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewChat}
                className="text-xs gap-1.5 h-8 px-2.5 sm:px-3 text-primary border-primary/30 hover:bg-primary/10 hover:border-primary/50 rounded-lg font-medium shadow-xs"
                title="새 대화 시작"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">새 대화</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetChat}
                className="text-xs text-muted-foreground hover:text-foreground gap-1 h-8 px-2 sm:px-2.5 rounded-lg"
                title="현재 대화 초기화"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden md:inline">초기화</span>
              </Button>
            </div>
          </header>

          {/* 대화 스크롤 영역 */}
          <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6 min-h-0">
            <div className="mx-auto max-w-4xl space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3.5 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* 어시스턴트 아바타 */}
                  {message.role === "assistant" && (
                    <div className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-blue-700 text-primary-foreground shadow-sm border border-primary/20">
                      <Bot className="h-4.5 w-4.5" />
                    </div>
                  )}

                  {/* 메시지 본체 */}
                  <div
                    className={`flex max-w-[88%] md:max-w-[82%] flex-col ${
                      message.role === "user" ? "items-end" : "items-start w-full"
                    }`}
                  >
                    {/* 어시스턴트 발신자 라벨 & 메타 헤더 */}
                    {message.role === "assistant" && (
                      <div className="flex items-center gap-2 mb-1.5 px-1">
                        <span className="text-xs font-bold text-foreground/90 tracking-tight">
                          안전보건 AI 상담관
                        </span>
                        {message.response?.answerMode === "grounded" && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5 font-medium rounded-full">
                            법령 조문 기반
                          </Badge>
                        )}
                        {message.response?.answerMode === "guidance" && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/5 font-medium rounded-full">
                            실무 가이드
                          </Badge>
                        )}
                      </div>
                    )}

                    <div
                      className={`rounded-2xl p-4 sm:p-5 text-sm shadow-xs leading-relaxed transition-all ${
                        message.role === "user"
                          ? "bg-gradient-to-br from-primary to-primary/95 text-primary-foreground rounded-tr-xs shadow-md font-medium"
                          : "bg-card border border-border/80 text-card-foreground rounded-tl-xs w-full shadow-xs"
                      }`}
                    >
                      {/* 로딩 인디케이터 */}
                      {message.isLoading ? (
                        <div className="flex items-center gap-3 py-2 text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0.2s]" />
                            <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0.4s]" />
                          </div>
                          <span className="text-xs text-muted-foreground font-medium">
                            안전보건 법령 조문 및 실무 가이드 분석 중...
                          </span>
                        </div>
                      ) : (
                        <>
                          {/* 어시스턴트 상단 메타 (모드별 배지 및 신뢰도) */}
                          {message.role === "assistant" && message.response && (
                            <div className="border-b border-border/60 pb-3 mb-3.5 space-y-2">
                              {message.response.answerMode === "grounded" ? (
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    {renderConfidenceBadge(message.response.confidence)}
                                    {message.response.meta?.elapsedMs && (
                                      <span className="text-[11px] text-muted-foreground">
                                        {(message.response.meta.elapsedMs / 1000).toFixed(1)}초 소요
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[11px] text-muted-foreground font-medium">
                                    참조 법령 {message.response.citations.length}건
                                  </span>
                                </div>
                              ) : message.response.answerMode === "guidance" ? (
                                <GuidanceBadge showBanner={true} />
                              ) : null}
                            </div>
                          )}

                          {/* 안전관리자 검토 배너 (필요 시) */}
                          {message.response?.needsSafetyOfficerReview && (
                            <SafetyOfficerBanner
                              reason={message.response.abstainReason}
                              isEmergency={message.response.answer.includes("119")}
                            />
                          )}

                          {/* 답변 텍스트 (마크다운 볼드, 목록, 인라인 코드, 복사 버튼 서식 렌더러 적용) */}
                          {message.role === "assistant" ? (
                            <ChatMessageRenderer
                              content={message.content}
                              isAssistant={true}
                            />
                          ) : (
                            <div className="whitespace-pre-wrap leading-relaxed">
                              {message.content}
                            </div>
                          )}

                          {/* 검증된 법령 인용 카드 목록 */}
                          {message.response?.citations &&
                            message.response.citations.length > 0 && (
                              <div className="mt-4 space-y-2.5 pt-3.5 border-t border-border/60">
                                <div className="text-xs font-bold text-foreground/85 flex items-center gap-1.5">
                                  <ShieldCheck className="h-4 w-4 text-primary" />
                                  <span>검증된 법령 근거 ({message.response.citations.length}건)</span>
                                </div>
                                <div className="space-y-2.5">
                                  {message.response.citations.map((citation, cIdx) => (
                                    <CitationCard
                                      key={`${message.id}-citation-${citation.chunkId || "chunk"}-${cIdx}`}
                                      citation={citation}
                                      index={cIdx}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}

                          {/* 관련 조문 목록 */}
                          {message.response?.relatedArticles &&
                            message.response.relatedArticles.length > 0 && (
                              <RelatedArticleList
                                articles={message.response.relatedArticles}
                                title={
                                  message.response.answered
                                    ? "참고 가능한 관련 법령"
                                    : "검색된 관련 조문 (직접 확인)"
                                }
                              />
                            )}

                          {/* 면책 고지 */}
                          {message.role === "assistant" && message.response?.disclaimer && (
                            <div className="mt-3.5 pt-2.5 text-[11px] text-muted-foreground border-t border-border/40 flex items-center gap-1.5">
                              <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                              <span>{message.response.disclaimer}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* 초기 상태(환영 화면) 시 추천 질문 카드 그리드 */}
              {isInitialState && (
                <div className="pt-2 pb-4 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>자주 묻는 현장 안전 질문 예시:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {QUICK_PROMPTS.map((prompt, idx) => {
                      const Icon = prompt.icon;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSend(prompt.text)}
                          disabled={isLoading}
                          className="group relative flex flex-col items-start gap-1.5 p-3.5 rounded-xl border border-border/80 bg-card/80 hover:bg-card hover:border-primary/40 text-left transition-all duration-200 shadow-xs hover:shadow-sm"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                              <Icon className="h-3 w-3" />
                              <span>{prompt.category}</span>
                            </span>
                            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                          </div>
                          <p className="text-xs text-foreground/90 font-medium leading-snug pt-0.5 group-hover:text-foreground">
                            {prompt.text}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 하단 입력 영역 (Modern Floating Prompt Bar) */}
          <div className="border-t border-border/70 bg-card/80 p-3.5 sm:p-4 backdrop-blur-md shrink-0">
            <div className="mx-auto max-w-4xl space-y-2.5">
              {/* 대화 진행 중일 때 간단한 추천 질문 칩 */}
              {!isInitialState && messages.length <= 4 && (
                <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mr-1">
                    <HelpCircle className="h-3 w-3" /> 빠른 질문:
                  </span>
                  {QUICK_PROMPTS.slice(0, 2).map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSend(prompt.text)}
                      disabled={isLoading}
                      className="rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-foreground text-left shadow-2xs"
                    >
                      {prompt.text}
                    </button>
                  ))}
                </div>
              )}

              {/* 플로팅 입력 컨테이너 */}
              <div className="relative flex items-end gap-2 rounded-2xl border border-input/80 bg-background/90 p-2 focus-within:border-primary/80 focus-within:ring-2 focus-within:ring-primary/20 shadow-sm transition-all">
                <Textarea
                  ref={textareaRef}
                  value={inputQuestion}
                  onChange={(e) => setInputQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="산업안전보건 법령이나 현장 안전 기준에 대해 질문하세요... (Enter로 전송, Shift+Enter로 줄바꿈)"
                  disabled={isLoading}
                  rows={1}
                  className="min-h-[44px] max-h-32 resize-none border-0 bg-transparent py-2.5 px-3 text-xs sm:text-sm focus-visible:ring-0 placeholder:text-muted-foreground/70 leading-relaxed"
                />
                <Button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!inputQuestion.trim() || isLoading}
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-xl bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-40 transition-all"
                  aria-label="질문 전송"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {/* 하단 면책 고지 및 키보드 단축키 안내 */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                <span className="truncate">
                  AI 답변은 공식 법령 조문 인용 및 안전 실무 가이드를 제공합니다.
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5 shrink-0 text-[10.5px] opacity-75">
                  <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> 전송
                  <span className="opacity-40">|</span>
                  <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]">Shift+Enter</kbd> 줄바꿈
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 커스텀 대화 삭제 확인 모달 */}
      <ChatDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        session={sessionToDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeletingSession}
      />

      {/* 커스텀 대화 초기화 확인 모달 */}
      <ChatResetDialog
        open={isResetDialogOpen}
        onOpenChange={setIsResetDialogOpen}
        onConfirm={handleConfirmReset}
      />
    </DashboardShell>
  );
};

export default SafetyQa;
