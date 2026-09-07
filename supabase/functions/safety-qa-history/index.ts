import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import {
  errorResponse,
  handlePreflight,
  jsonResponse,
  parseJsonBody,
  sanitizeText,
  withErrorBoundary,
} from "../_shared/http.ts";
import { readEnv } from "../_shared/runtime-env.ts";

const TABLE_NAME = "safety_qa_history";
const MIN_SCOPE_KEY_LENGTH = 16;
const MAX_SCOPE_KEY_LENGTH = 256;
const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGES_COUNT = 100;

type ActionType = "list" | "get" | "save" | "delete";
type AnswerMode = "grounded" | "guidance" | "escalation";

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  response?: Record<string, unknown>;
}

interface SavePayload {
  sessionId: string;
  title?: string;
  messages: MessageItem[];
  lastAnswerMode?: AnswerMode;
}

interface RequestBody {
  action: ActionType;
  scopeKey: string;
  sessionId?: string;
  payload?: SavePayload;
}

interface HistoryRow {
  id: string;
  scope_hash: string;
  session_id: string;
  title: string;
  messages: MessageItem[];
  last_answer_mode: AnswerMode;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

function createSupabaseServerClient() {
  const url = readEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        "x-client-info": "risk-guard-safety-qa-history",
      },
    },
  });
}

function normalizeScopeKey(rawScopeKey: string) {
  const scopeKey = sanitizeText(rawScopeKey);
  if (
    scopeKey.length < MIN_SCOPE_KEY_LENGTH ||
    scopeKey.length > MAX_SCOPE_KEY_LENGTH
  ) {
    throw new Error("VALIDATION_ERROR:scopeKey length is invalid.");
  }
  return scopeKey;
}

async function hashScopeKey(scopeKey: string) {
  const bytes = new TextEncoder().encode(scopeKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashBytes = new Uint8Array(hashBuffer);
  return [...hashBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toSummary(row: HistoryRow) {
  const messages = Array.isArray(row.messages) ? row.messages : [];
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title || "안전 상담",
    lastAnswerMode: row.last_answer_mode || "guidance",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: messages.length,
  };
}

function toDetail(row: HistoryRow) {
  return {
    ...toSummary(row),
    messages: Array.isArray(row.messages) ? row.messages : [],
  };
}

export async function handleSafetyQaHistory(req: Request): Promise<Response> {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST method is allowed.");
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return errorResponse(503, "MISSING_SECRET", "Supabase server credentials are not configured.");
  }

  const body = await parseJsonBody<RequestBody>(req);
  if (!body) {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  if (!body.action || !["list", "get", "save", "delete"].includes(body.action)) {
    return errorResponse(400, "VALIDATION_ERROR", "action must be one of list/get/save/delete.");
  }

  const normalizedScopeKey = normalizeScopeKey(body.scopeKey);
  const scopeHash = await hashScopeKey(normalizedScopeKey);

  // 1) 세션 목록 조회 (list)
  if (body.action === "list") {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("id, scope_hash, session_id, title, messages, last_answer_mode, created_at, updated_at, expires_at")
      .eq("scope_hash", scopeHash)
      .gt("expires_at", nowIso)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`LIST_FAILED:${error.message}`);
    }

    const items = (data ?? []).map((row) => toSummary(row as HistoryRow));
    return jsonResponse({ items });
  }

  // 2) 세션 저장/업데이트 (save)
  if (body.action === "save") {
    const payload = body.payload;
    if (!payload || !payload.sessionId) {
      return errorResponse(400, "VALIDATION_ERROR", "sessionId and payload are required for save.");
    }

    const sessionId = sanitizeText(payload.sessionId);
    const title = sanitizeText(payload.title || "새 안전 상담").slice(0, MAX_TITLE_LENGTH);
    const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
    const messages = rawMessages.slice(-MAX_MESSAGES_COUNT);
    const lastAnswerMode = payload.lastAnswerMode || "guidance";
    const nowIso = new Date().toISOString();

    // 기존 세션 존재 여부 확인
    const { data: existing } = await supabase
      .from(TABLE_NAME)
      .select("id")
      .eq("scope_hash", scopeHash)
      .eq("session_id", sessionId)
      .limit(1);

    if (existing && existing.length > 0) {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update({
          title,
          messages,
          last_answer_mode: lastAnswerMode,
          updated_at: nowIso,
        })
        .eq("scope_hash", scopeHash)
        .eq("session_id", sessionId)
        .select()
        .single();

      if (error || !data) {
        throw new Error(`UPDATE_FAILED:${error?.message ?? "No row returned"}`);
      }

      return jsonResponse({ item: toDetail(data as HistoryRow) });
    } else {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert({
          scope_hash: scopeHash,
          session_id: sessionId,
          title,
          messages,
          last_answer_mode: lastAnswerMode,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(`INSERT_FAILED:${error?.message ?? "No row returned"}`);
      }

      return jsonResponse({ item: toDetail(data as HistoryRow) });
    }
  }

  // 3) 단일 세션 조회 (get)
  const sessionId = sanitizeText(body.sessionId || body.payload?.sessionId);
  if (!sessionId) {
    return errorResponse(400, "VALIDATION_ERROR", "sessionId is required for get/delete action.");
  }

  if (body.action === "get") {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("id, scope_hash, session_id, title, messages, last_answer_mode, created_at, updated_at, expires_at")
      .eq("scope_hash", scopeHash)
      .eq("session_id", sessionId)
      .gt("expires_at", nowIso)
      .limit(1);

    if (error) {
      throw new Error(`GET_FAILED:${error.message}`);
    }

    const row = (data ?? [])[0] as HistoryRow | undefined;
    if (!row) {
      return errorResponse(404, "NOT_FOUND", "Session record not found.");
    }

    return jsonResponse({ item: toDetail(row) });
  }

  // 4) 세션 삭제 (delete)
  if (body.action === "delete") {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq("scope_hash", scopeHash)
      .eq("session_id", sessionId)
      .select("id");

    if (error) {
      throw new Error(`DELETE_FAILED:${error.message}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      return errorResponse(404, "NOT_FOUND", "Session record not found.");
    }

    return jsonResponse({ ok: true });
  }

  return errorResponse(400, "INVALID_ACTION", "Unknown action.");
}

type DenoServeGlobal = {
  serve?: (handler: (req: Request) => Promise<Response> | Response) => unknown;
};
const denoRuntime = (globalThis as { Deno?: DenoServeGlobal }).Deno;
if (denoRuntime?.serve && readEnv("SAFETY_QA_HISTORY_DISABLE_SERVE") !== "1") {
  denoRuntime.serve(withErrorBoundary(handleSafetyQaHistory, "safety-qa-history"));
}
