import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText } from "../_shared/http.ts";

const TABLE_NAME = "risk_assessment_history";
const MAX_TASK_NAME_LENGTH = 120;
const MAX_SITE_NAME_LENGTH = 120;
const MAX_CONTEXT_LENGTH = 4000;
const MAX_RISK_ROWS = 200;
const MAX_ACCIDENT_DATA_LENGTH = 60000;
const MAX_VALIDATION_EVENTS = 800;
const MAX_VALIDATION_HAZARD_BUCKETS = 64;
const MIN_SCOPE_KEY_LENGTH = 16;
const MAX_SCOPE_KEY_LENGTH = 256;

type ActionType = "create" | "list" | "get" | "delete";
type FormType = "risk-assessment" | "accident-report";

interface CreatePayload {
  formType?: FormType;
  taskName: string;
  siteName?: string;
  workDate?: string;
  contextText?: string;
  riskRows?: unknown[];
  accidentData?: unknown;
  validationSummary?: unknown;
  validationEvents?: unknown[];
}

interface FormHistoryRequestBody {
  action: ActionType;
  scopeKey: string;
  payload?: CreatePayload;
  recordId?: string;
  formType?: FormType;
}

interface HistoryRow {
  id: string;
  form_type: FormType;
  task_name: string;
  site_name: string;
  work_date: string | null;
  context_text: string;
  risk_rows: unknown[];
  accident_data: Record<string, unknown>;
  validation_summary: Record<string, unknown>;
  validation_events: unknown[];
  created_at: string;
  expires_at: string;
}

function createSupabaseServerClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");

  if (!url || !key) {
    return null;
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        "x-client-info": "risk-guard-form-history",
      },
    },
  });
}

function normalizeScopeKey(rawScopeKey: string) {
  const scopeKey = sanitizeText(rawScopeKey);
  if (
    scopeKey.length < MIN_SCOPE_KEY_LENGTH
    || scopeKey.length > MAX_SCOPE_KEY_LENGTH
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

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toSafeString(value: unknown, maxLength: number) {
  return sanitizeText(typeof value === "string" ? value : "").slice(0, maxLength);
}

function toSafeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function parseFormType(value: unknown): FormType | null {
  if (value === "risk-assessment" || value === "accident-report") {
    return value;
  }
  return null;
}

function normalizeFormType(value: unknown): FormType {
  return parseFormType(value) ?? "risk-assessment";
}

function sanitizeRiskRows(rawRows: unknown[]) {
  if (rawRows.length === 0) {
    throw new Error("VALIDATION_ERROR:riskRows must not be empty.");
  }

  if (rawRows.length > MAX_RISK_ROWS) {
    throw new Error("VALIDATION_ERROR:riskRows is too large.");
  }

  return rawRows.map((rawRow) => {
    const row = rawRow && typeof rawRow === "object" ? rawRow as Record<string, unknown> : {};
    const frequency = Math.min(5, Math.max(1, Math.round(toSafeNumber(row.frequency, 1))));
    const severity = Math.min(5, Math.max(1, Math.round(toSafeNumber(row.severity, 1))));

    return {
      workProcess: toSafeString(row.workProcess, 300),
      category: toSafeString(row.category, 120),
      cause: toSafeString(row.cause, 600),
      hazardFactor: toSafeString(row.hazardFactor, 300),
      legalBasis: toSafeString(row.legalBasis, 300),
      currentMeasure: toSafeString(row.currentMeasure, 800),
      frequency,
      severity,
      riskLevel: toSafeString(row.riskLevel, 40),
      reductionMeasure: toSafeString(row.reductionMeasure, 800),
      postRiskLevel: toSafeString(row.postRiskLevel, 40),
      improvementDate: toSafeString(row.improvementDate, 20),
      completionDate: toSafeString(row.completionDate, 20),
      responsiblePerson: toSafeString(row.responsiblePerson, 80),
    };
  });
}

function sanitizeAccidentData(rawData: unknown) {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
    throw new Error("VALIDATION_ERROR:accidentData must be an object.");
  }

  let encoded = "";
  try {
    encoded = JSON.stringify(rawData);
  } catch {
    throw new Error("VALIDATION_ERROR:accidentData must be JSON-serializable.");
  }

  if (!encoded) {
    throw new Error("VALIDATION_ERROR:accidentData must not be empty.");
  }

  if (encoded.length > MAX_ACCIDENT_DATA_LENGTH) {
    throw new Error("VALIDATION_ERROR:accidentData is too large.");
  }

  const parsed = JSON.parse(encoded);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("VALIDATION_ERROR:accidentData must be an object.");
  }

  return parsed as Record<string, unknown>;
}

function sanitizeValidationSummary(rawSummary: unknown) {
  if (!rawSummary || typeof rawSummary !== "object" || Array.isArray(rawSummary)) {
    return {
      totalRows: 0,
      reviewRequiredRows: 0,
      okRows: 0,
      hazardTypeCounts: {},
    };
  }

  const summary = rawSummary as Record<string, unknown>;
  const totalRows = Math.max(0, Math.round(toSafeNumber(summary.totalRows, 0)));
  const reviewRequiredRows = Math.max(0, Math.round(toSafeNumber(summary.reviewRequiredRows, 0)));
  const okRows = Math.max(0, Math.round(toSafeNumber(summary.okRows, Math.max(0, totalRows - reviewRequiredRows))));

  const hazardTypeCountsRaw = summary.hazardTypeCounts;
  const hazardTypeCounts: Record<string, number> = {};
  if (hazardTypeCountsRaw && typeof hazardTypeCountsRaw === "object" && !Array.isArray(hazardTypeCountsRaw)) {
    const entries = Object.entries(hazardTypeCountsRaw as Record<string, unknown>)
      .slice(0, MAX_VALIDATION_HAZARD_BUCKETS);
    for (const [key, value] of entries) {
      const normalizedKey = toSafeString(key, 80);
      if (!normalizedKey) {
        continue;
      }
      hazardTypeCounts[normalizedKey] = Math.max(0, Math.round(toSafeNumber(value, 0)));
    }
  }

  return {
    totalRows,
    reviewRequiredRows,
    okRows,
    hazardTypeCounts,
  };
}

function sanitizeValidationEvents(rawEvents: unknown[]) {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return [] as Array<Record<string, unknown>>;
  }

  if (rawEvents.length > MAX_VALIDATION_EVENTS) {
    throw new Error("VALIDATION_ERROR:validationEvents is too large.");
  }

  return rawEvents.map((entry) => {
    const event = entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : {};

    const rowIndex = Math.max(0, Math.round(toSafeNumber(event.rowIndex, 0)));
    return {
      timestamp: toSafeString(event.timestamp, 64),
      siteName: toSafeString(event.siteName, 120),
      formType: toSafeString(event.formType, 40),
      rowIndex,
      expectedHazardType: toSafeString(event.expectedHazardType, 80),
      detectedHazardType: toSafeString(event.detectedHazardType, 80),
      field: toSafeString(event.field, 40),
      reasonCode: toSafeString(event.reasonCode, 80),
      rewritten: Boolean(event.rewritten),
      finalStatus: toSafeString(event.finalStatus, 40),
    };
  });
}

function validateCreatePayload(payload: CreatePayload | undefined) {
  if (!payload || typeof payload !== "object") {
    throw new Error("VALIDATION_ERROR:payload is required for create action.");
  }

  const formType = normalizeFormType(payload.formType);
  const taskName = toSafeString(payload.taskName, MAX_TASK_NAME_LENGTH);
  if (!taskName) {
    throw new Error("VALIDATION_ERROR:taskName is required.");
  }

  const siteName = toSafeString(payload.siteName, MAX_SITE_NAME_LENGTH);
  const contextText = toSafeString(payload.contextText, MAX_CONTEXT_LENGTH);
  const workDateRaw = sanitizeText(payload.workDate);
  if (workDateRaw && !isIsoDate(workDateRaw)) {
    throw new Error("VALIDATION_ERROR:workDate must be YYYY-MM-DD.");
  }

  const rawRiskRows = Array.isArray(payload.riskRows) ? payload.riskRows : [];
  const riskRows = formType === "risk-assessment" ? sanitizeRiskRows(rawRiskRows) : [];
  const accidentData = formType === "accident-report"
    ? sanitizeAccidentData(payload.accidentData)
    : {};
  const validationSummary = formType === "risk-assessment"
    ? sanitizeValidationSummary(payload.validationSummary)
    : {
      totalRows: 0,
      reviewRequiredRows: 0,
      okRows: 0,
      hazardTypeCounts: {},
    };
  const validationEvents = formType === "risk-assessment"
    ? sanitizeValidationEvents(Array.isArray(payload.validationEvents) ? payload.validationEvents : [])
    : [];

  return {
    formType,
    taskName,
    siteName,
    contextText,
    workDate: workDateRaw || null,
    riskRows,
    accidentData,
    validationSummary,
    validationEvents,
  };
}

function toSummary(row: HistoryRow) {
  const formType = normalizeFormType(row.form_type);
  return {
    id: row.id,
    formType,
    taskName: row.task_name,
    siteName: row.site_name,
    workDate: row.work_date ?? "",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    rowCount: formType === "risk-assessment" && Array.isArray(row.risk_rows) ? row.risk_rows.length : 0,
  };
}

function toDetail(row: HistoryRow) {
  const formType = normalizeFormType(row.form_type);
  return {
    ...toSummary(row),
    contextText: row.context_text,
    riskRows: Array.isArray(row.risk_rows) ? row.risk_rows : [],
    accidentData: formType === "accident-report"
      ? (row.accident_data && typeof row.accident_data === "object" ? row.accident_data : {})
      : null,
    validationSummary: row.validation_summary && typeof row.validation_summary === "object"
      ? row.validation_summary
      : {
        totalRows: 0,
        reviewRequiredRows: 0,
        okRows: 0,
        hazardTypeCounts: {},
      },
    validationEvents: Array.isArray(row.validation_events) ? row.validation_events : [],
  };
}

async function purgeExpiredRows(supabase: ReturnType<typeof createClient>) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .lte("expires_at", nowIso);

  if (error) {
    throw new Error(`PURGE_FAILED:${error.message}`);
  }
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST is supported.");
    }

    const supabase = createSupabaseServerClient();
    if (!supabase) {
      return errorResponse(503, "MISSING_SECRET", "Supabase server credentials are not configured.");
    }

    const body = await parseJsonBody<FormHistoryRequestBody>(req);
    if (!body) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    if (!body.action || !["create", "list", "get", "delete"].includes(body.action)) {
      return errorResponse(400, "VALIDATION_ERROR", "action must be one of create/list/get/delete.");
    }

    if (body.formType && !parseFormType(body.formType)) {
      return errorResponse(400, "VALIDATION_ERROR", "formType must be one of risk-assessment/accident-report.");
    }

    const normalizedScopeKey = normalizeScopeKey(body.scopeKey);
    const scopeHash = await hashScopeKey(normalizedScopeKey);

    await purgeExpiredRows(supabase);

    if (body.action === "create") {
      const payload = validateCreatePayload(body.payload);
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert({
          scope_hash: scopeHash,
          form_type: payload.formType,
          task_name: payload.taskName,
          site_name: payload.siteName,
          work_date: payload.workDate,
          context_text: payload.contextText,
          risk_rows: payload.riskRows,
          accident_data: payload.accidentData,
          validation_summary: payload.validationSummary,
          validation_events: payload.validationEvents,
        })
        .select("id, form_type, task_name, site_name, work_date, context_text, risk_rows, accident_data, validation_summary, validation_events, created_at, expires_at")
        .single();

      if (error || !data) {
        throw new Error(`CREATE_FAILED:${error?.message ?? "No row returned"}`);
      }

      return jsonResponse({ item: toSummary(data as HistoryRow) });
    }

    if (body.action === "list") {
      const nowIso = new Date().toISOString();
      const requestedFormType = parseFormType(body.formType);
      let query = supabase
        .from(TABLE_NAME)
        .select("id, form_type, task_name, site_name, work_date, context_text, risk_rows, accident_data, validation_summary, validation_events, created_at, expires_at")
        .eq("scope_hash", scopeHash)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false });

      if (requestedFormType) {
        query = query.eq("form_type", requestedFormType);
      }

      const { data, error } = await query.limit(50);

      if (error) {
        throw new Error(`LIST_FAILED:${error.message}`);
      }

      const items = (data ?? []).map((row) => toSummary(row as HistoryRow));
      return jsonResponse({ items });
    }

    const recordId = sanitizeText(body.recordId);
    if (!recordId) {
      return errorResponse(400, "VALIDATION_ERROR", "recordId is required for get/delete action.");
    }

    if (body.action === "delete") {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq("id", recordId)
        .eq("scope_hash", scopeHash)
        .select("id");

      if (error) {
        throw new Error(`DELETE_FAILED:${error.message}`);
      }

      if (!Array.isArray(data) || data.length === 0) {
        return errorResponse(404, "NOT_FOUND", "History record not found.");
      }

      return jsonResponse({ ok: true });
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("id, form_type, task_name, site_name, work_date, context_text, risk_rows, accident_data, validation_summary, validation_events, created_at, expires_at")
      .eq("id", recordId)
      .eq("scope_hash", scopeHash)
      .gt("expires_at", nowIso)
      .limit(1);

    if (error) {
      throw new Error(`GET_FAILED:${error.message}`);
    }

    const row = (data ?? [])[0] as HistoryRow | undefined;
    if (!row) {
      return errorResponse(404, "NOT_FOUND", "History record not found.");
    }

    return jsonResponse({ item: toDetail(row) });
  } catch (error) {
    console.error("[form-history] Unhandled error", error);

    if (error instanceof Error && error.message.startsWith("VALIDATION_ERROR:")) {
      return errorResponse(400, "VALIDATION_ERROR", error.message.replace("VALIDATION_ERROR:", ""));
    }

    if (error instanceof Error && error.message.startsWith("CREATE_FAILED:")) {
      return errorResponse(500, "CREATE_FAILED", error.message.replace("CREATE_FAILED:", ""));
    }

    if (error instanceof Error && error.message.startsWith("LIST_FAILED:")) {
      return errorResponse(500, "LIST_FAILED", error.message.replace("LIST_FAILED:", ""));
    }

    if (error instanceof Error && error.message.startsWith("GET_FAILED:")) {
      return errorResponse(500, "GET_FAILED", error.message.replace("GET_FAILED:", ""));
    }

    if (error instanceof Error && error.message.startsWith("DELETE_FAILED:")) {
      return errorResponse(500, "DELETE_FAILED", error.message.replace("DELETE_FAILED:", ""));
    }

    if (error instanceof Error && error.message.startsWith("PURGE_FAILED:")) {
      return errorResponse(500, "PURGE_FAILED", error.message.replace("PURGE_FAILED:", ""));
    }

    return errorResponse(500, "INTERNAL_ERROR", "Unexpected error during form history handling.");
  }
});
