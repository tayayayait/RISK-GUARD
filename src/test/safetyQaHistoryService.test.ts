import { describe, expect, it, vi, beforeEach } from "vitest";
import { SafetyQaHistoryService, getScopeKey } from "@/services/safetyQaHistoryService";
import { invokeBackend } from "@/services/edgeFunctionClient";
import type { ChatMessage, SafetyQaSessionSummary, SafetyQaSessionDetail } from "@/types/safetyQa";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
}));

describe("SafetyQaHistoryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("scopeKey를 생성하고 localStorage에 영구 보존한다", () => {
    const key1 = getScopeKey();
    expect(key1).toBeDefined();
    expect(key1.length).toBeGreaterThanOrEqual(16);

    const key2 = getScopeKey();
    expect(key2).toBe(key1);
  });

  it("listSessions가 Supabase 백엔드를 호출하고 세션 목록을 반환한다", async () => {
    const mockItems: SafetyQaSessionSummary[] = [
      {
        id: "id-1",
        sessionId: "session-1",
        title: "달비계 작업 안전 질문",
        lastAnswerMode: "grounded",
        createdAt: "2026-08-19T10:00:00Z",
        updatedAt: "2026-08-19T10:05:00Z",
        messageCount: 3,
      },
    ];

    vi.mocked(invokeBackend).mockResolvedValue({ items: mockItems });

    const result = await SafetyQaHistoryService.listSessions();

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "safety-qa-history",
        payload: {
          action: "list",
          scopeKey: expect.any(String),
        },
      })
    );
    expect(result).toEqual(mockItems);
  });

  it("getSession이 특정 세션의 상세 메시지를 불러온다", async () => {
    const mockDetail: SafetyQaSessionDetail = {
      id: "id-1",
      sessionId: "session-1",
      title: "반도체 공정 안전",
      lastAnswerMode: "guidance",
      createdAt: "2026-08-19T10:00:00Z",
      updatedAt: "2026-08-19T10:05:00Z",
      messageCount: 2,
      messages: [
        {
          id: "m1",
          role: "user",
          content: "반도체 작업 준비사항은?",
          timestamp: "2026-08-19T10:00:00Z",
        },
        {
          id: "m2",
          role: "assistant",
          content: "환기 장치 점검이 필수입니다.",
          timestamp: "2026-08-19T10:01:00Z",
        },
      ],
    };

    vi.mocked(invokeBackend).mockResolvedValue({ item: mockDetail });

    const result = await SafetyQaHistoryService.getSession("session-1");

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "safety-qa-history",
        payload: {
          action: "get",
          scopeKey: expect.any(String),
          sessionId: "session-1",
        },
      })
    );
    expect(result).toEqual(mockDetail);
  });

  it("saveSession이 세션을 백엔드 및 로컬 캐시에 저장한다", async () => {
    const mockMessages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        content: "용접 작업 화재예방 기준",
        timestamp: new Date("2026-08-19T11:00:00Z"),
      },
      {
        id: "a1",
        role: "assistant",
        content: "소화기를 5m 이내에 비치하십시오.",
        timestamp: new Date("2026-08-19T11:00:05Z"),
        response: {
          answered: true,
          answerMode: "guidance",
          answer: "소화기를 5m 이내에 비치하십시오.",
          citations: [],
          confidence: "medium",
          needsSafetyOfficerReview: false,
          relatedArticles: [],
          disclaimer: "면책",
          meta: { retrieved: 0, grounded: 0, threshold: 0.3, elapsedMs: 100 },
        },
      },
    ];

    vi.mocked(invokeBackend).mockResolvedValue({
      item: {
        id: "session-weld",
        sessionId: "session-weld",
        title: "용접 작업 화재예방 기준",
        lastAnswerMode: "guidance",
        createdAt: "2026-08-19T11:00:00Z",
        updatedAt: "2026-08-19T11:00:05Z",
        messageCount: 2,
        messages: [],
      },
    });

    const result = await SafetyQaHistoryService.saveSession("session-weld", mockMessages);

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "safety-qa-history",
        payload: {
          action: "save",
          scopeKey: expect.any(String),
          payload: {
            sessionId: "session-weld",
            title: "용접 작업 화재예방 기준",
            messages: expect.any(Array),
            lastAnswerMode: "guidance",
          },
        },
      })
    );
    expect(result?.sessionId).toBe("session-weld");

    const active = SafetyQaHistoryService.loadActiveSession();
    expect(active?.sessionId).toBe("session-weld");
    expect(active?.messages).toHaveLength(2);
  });

  it("deleteSession이 백엔드와 로컬 스토리지에서 세션을 삭제한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({ ok: true });

    SafetyQaHistoryService.saveActiveSession(
      [
        {
          id: "m1",
          role: "user",
          content: "질문",
          timestamp: new Date(),
        },
      ],
      "session-to-del"
    );

    const deleted = await SafetyQaHistoryService.deleteSession("session-to-del");

    expect(deleted).toBe(true);
    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "safety-qa-history",
        payload: {
          action: "delete",
          scopeKey: expect.any(String),
          sessionId: "session-to-del",
        },
      })
    );

    const activeAfter = SafetyQaHistoryService.loadActiveSession();
    expect(activeAfter).toBeNull();
  });
});
