import { invokeBackend } from "@/services/edgeFunctionClient";
import type {
  ChatMessage,
  AnswerMode,
  SafetyQaSessionSummary,
  SafetyQaSessionDetail,
} from "@/types/safetyQa";

const ACTIVE_CHAT_KEY = "risk-guard:safety-qa:active-session:v1";
const SESSIONS_INDEX_KEY = "risk-guard:safety-qa:sessions-cache:v1";
const SCOPE_STORAGE_KEY = "risk-guard:safety-qa:scope-key:v1";
const SCOPE_KEY_LENGTH = 32;

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

function createScopeKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(SCOPE_KEY_LENGTH / 2);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `safety-scope-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getScopeKey(): string {
  const storage = getStorage();
  if (!storage) return "default-safety-qa-scope-device-01";

  const existing = storage.getItem(SCOPE_STORAGE_KEY);
  if (existing && existing.trim().length >= 16) {
    return existing.trim();
  }

  const generated = createScopeKey();
  storage.setItem(SCOPE_STORAGE_KEY, generated);
  return generated;
}

export interface StoredChatSession {
  sessionId: string;
  title: string;
  updatedAt: string;
  lastAnswerMode?: AnswerMode;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    response?: any;
  }>;
}

interface HistoryBackendResponse {
  items?: SafetyQaSessionSummary[];
  item?: SafetyQaSessionDetail;
  ok?: boolean;
  error?: { code: string; message: string };
}

export const SafetyQaHistoryService = {
  getScopeKey,

  /**
   * 세션 목록 조회 (Supabase 원격 조회 + 로컬 캐시 폴백)
   */
  async listSessions(): Promise<SafetyQaSessionSummary[]> {
    const scopeKey = getScopeKey();

    try {
      const response = await invokeBackend<HistoryBackendResponse>({
        supabaseFunction: "safety-qa-history",
        legacyPath: "/safety-qa-history",
        payload: {
          action: "list",
          scopeKey,
        },
        timeoutMs: 15000,
      });

      if (response && Array.isArray(response.items)) {
        // 로컬 캐시 갱신
        const storage = getStorage();
        if (storage) {
          storage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(response.items));
        }
        return response.items;
      }
    } catch (err) {
      console.warn("[SafetyQaHistory] Backend list failed, using local cache:", err);
    }

    // 로컬 폴백
    const storage = getStorage();
    if (storage) {
      const cached = storage.getItem(SESSIONS_INDEX_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          // ignore parse error
        }
      }
    }

    return [];
  },

  /**
   * 특정 세션 상세 불러오기 (Supabase 원격 조회 + 로컬 폴백)
   */
  async getSession(sessionId: string): Promise<SafetyQaSessionDetail | null> {
    if (!sessionId) return null;
    const scopeKey = getScopeKey();

    try {
      const response = await invokeBackend<HistoryBackendResponse>({
        supabaseFunction: "safety-qa-history",
        legacyPath: "/safety-qa-history",
        payload: {
          action: "get",
          scopeKey,
          sessionId,
        },
        timeoutMs: 15000,
      });

      if (response && response.item) {
        return response.item;
      }
    } catch (err) {
      console.warn("[SafetyQaHistory] Backend get failed, checking active cache:", err);
    }

    // 로컬 활성 세션과 일치하는 경우 폴백
    const active = this.loadActiveSessionRaw();
    if (active && active.sessionId === sessionId) {
      return {
        id: active.sessionId,
        sessionId: active.sessionId,
        title: active.title,
        lastAnswerMode: active.lastAnswerMode || "guidance",
        createdAt: active.updatedAt,
        updatedAt: active.updatedAt,
        messageCount: active.messages.length,
        messages: active.messages,
      };
    }

    return null;
  },

  /**
   * 세션 저장/업데이트 (Supabase 영구 저장 + 로컬 동기화)
   */
  async saveSession(
    sessionId: string,
    messages: ChatMessage[],
    customTitle?: string
  ): Promise<SafetyQaSessionDetail | null> {
    if (!sessionId || messages.length === 0) return null;

    const firstUserMsg = messages.find((m) => m.role === "user");
    const autoTitle = firstUserMsg ? firstUserMsg.content.slice(0, 30) : "안전 상담";
    const title = customTitle || autoTitle;
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant" && m.response);
    const lastAnswerMode: AnswerMode = lastAssistantMsg?.response?.answerMode ?? "guidance";
    const scopeKey = getScopeKey();

    const formattedMessages = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp).toISOString(),
      response: m.response,
    }));

    // 1) 로컬 활성 세션 캐시 및 세션 목록 캐시 즉시 반영
    this.saveActiveSession(messages, sessionId, title);
    const storage = getStorage();
    if (storage) {
      try {
        const cached = storage.getItem(SESSIONS_INDEX_KEY);
        const list: SafetyQaSessionSummary[] = cached ? JSON.parse(cached) : [];
        const existingIdx = list.findIndex((s) => s.sessionId === sessionId);
        const summaryItem: SafetyQaSessionSummary = {
          id: sessionId,
          sessionId,
          title,
          lastAnswerMode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: formattedMessages.length,
        };
        if (existingIdx >= 0) {
          list[existingIdx] = summaryItem;
        } else {
          list.unshift(summaryItem);
        }
        storage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(list));
      } catch {
        // ignore
      }
    }

    // 2) Supabase 백엔드 저장
    try {
      const response = await invokeBackend<HistoryBackendResponse>({
        supabaseFunction: "safety-qa-history",
        legacyPath: "/safety-qa-history",
        payload: {
          action: "save",
          scopeKey,
          payload: {
            sessionId,
            title,
            messages: formattedMessages,
            lastAnswerMode,
          },
        },
        timeoutMs: 15000,
      });

      if (response?.item) {
        return response.item;
      }
    } catch (err) {
      console.warn("[SafetyQaHistory] Backend save failed, stored locally:", err);
    }

    return {
      id: sessionId,
      sessionId,
      title,
      lastAnswerMode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: formattedMessages.length,
      messages: formattedMessages,
    };
  },

  /**
   * 세션 삭제 (Supabase 삭제 + 로컬 캐시 삭제)
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    if (!sessionId) return false;
    const scopeKey = getScopeKey();

    // 로컬 활성 세션이 이 세션이면 로컬도 삭제
    const active = this.loadActiveSessionRaw();
    if (active && active.sessionId === sessionId) {
      this.clearActiveSession();
    }

    // 로컬 인덱스 캐시에서도 제거
    const storage = getStorage();
    if (storage) {
      const cached = storage.getItem(SESSIONS_INDEX_KEY);
      if (cached) {
        try {
          const list: SafetyQaSessionSummary[] = JSON.parse(cached);
          const filtered = list.filter((s) => s.sessionId !== sessionId);
          storage.setItem(SESSIONS_INDEX_KEY, JSON.stringify(filtered));
        } catch {
          // ignore
        }
      }
    }

    try {
      const response = await invokeBackend<HistoryBackendResponse>({
        supabaseFunction: "safety-qa-history",
        legacyPath: "/safety-qa-history",
        payload: {
          action: "delete",
          scopeKey,
          sessionId,
        },
        timeoutMs: 15000,
      });

      return Boolean(response?.ok);
    } catch (err) {
      console.warn("[SafetyQaHistory] Backend delete failed:", err);
      return true; // 로컬은 이미 삭제됨
    }
  },

  /**
   * 활성 대화 세션 불러오기 (Raw)
   */
  loadActiveSessionRaw(): StoredChatSession | null {
    try {
      const storage = getStorage();
      if (!storage) return null;
      const raw = storage.getItem(ACTIVE_CHAT_KEY);
      if (!raw) return null;
      const parsed: StoredChatSession = JSON.parse(raw);
      if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) return null;
      return parsed;
    } catch {
      return null;
    }
  },

  /**
   * 활성 대화 세션 불러오기 (ChatMessage[] 변환)
   */
  loadActiveSession(): { sessionId: string; title: string; messages: ChatMessage[] } | null {
    const raw = this.loadActiveSessionRaw();
    if (!raw) return null;

    return {
      sessionId: raw.sessionId,
      title: raw.title,
      messages: raw.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
        response: m.response,
      })),
    };
  },

  /**
   * 활성 대화 세션 로컬 저장
   */
  saveActiveSession(messages: ChatMessage[], sessionId?: string, customTitle?: string) {
    try {
      const storage = getStorage();
      if (!storage || messages.length === 0) return;

      const firstUserMsg = messages.find((m) => m.role === "user");
      const title = customTitle || (firstUserMsg ? firstUserMsg.content.slice(0, 30) : "안전 상담");
      const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant" && m.response);

      const sessionData: StoredChatSession = {
        sessionId: sessionId || "default-session",
        title,
        updatedAt: new Date().toISOString(),
        lastAnswerMode: lastAssistantMsg?.response?.answerMode ?? "guidance",
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp).toISOString(),
          response: m.response,
        })),
      };

      storage.setItem(ACTIVE_CHAT_KEY, JSON.stringify(sessionData));
    } catch (err) {
      console.warn("[SafetyQaHistory] Failed to save active session locally:", err);
    }
  },

  /**
   * 활성 대화 초기화
   */
  clearActiveSession() {
    try {
      const storage = getStorage();
      if (!storage) return;
      storage.removeItem(ACTIVE_CHAT_KEY);
    } catch (err) {
      console.warn("[SafetyQaHistory] Failed to clear active session:", err);
    }
  },
};

