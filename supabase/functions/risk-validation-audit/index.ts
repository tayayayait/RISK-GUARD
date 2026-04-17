import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText } from "../_shared/http.ts";

const TABLE_NAME = "risk_row_validation_audit";
const MAX_EVENTS_PER_REQUEST = 400;

interface AuditEventInput {
  timestamp?: unknown;
  siteName?: unknown;
  formType?: unknown;
  rowIndex?: unknown;
  expectedHazardType?: unknown;
  detectedHazardType?: unknown;
  field?: unknown;
  reasonCode?: unknown;
  rewritten?: unknown;
  finalStatus?: unknown;
}

interface AuditRequestBody {
  events?: AuditEventInput[];
  source?: unknown;
  metadata?: unknown;
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
        "x-client-info": "risk-guard-validation-audit",
      },
    },
  });
}

function toSafeString(value: unknown, maxLength: number) {
  return sanitizeText(typeof value === "string" ? value : "").slice(0, maxLength);
}

function toSafeBoolean(value: unknown) {
  return Boolean(value);
}

function toSafeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function toSafeTimestamp(value: unknown) {
  const raw = toSafeString(value, 64);
  if (!raw) {
    return null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
}

function sanitizeMetadata(rawMetadata: unknown) {
  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
    return {} as Record<string, unknown>;
  }
  return rawMetadata as Record<string, unknown>;
}

function sanitizeEvents(rawEvents: AuditEventInput[]) {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return [] as Array<Record<string, unknown>>;
  }

  if (rawEvents.length > MAX_EVENTS_PER_REQUEST) {
    throw new Error("VALIDATION_ERROR:events is too large.");
  }

  return rawEvents.map((event) => ({
    event_timestamp: toSafeTimestamp(event.timestamp),
    site_name: toSafeString(event.siteName, 120),
    form_type: toSafeString(event.formType, 40) || "risk-assessment",
    row_index: Math.max(0, Math.round(toSafeNumber(event.rowIndex, 0))),
    expected_hazard_type: toSafeString(event.expectedHazardType, 80),
    detected_hazard_type: toSafeString(event.detectedHazardType, 80),
    field: toSafeString(event.field, 40),
    reason_code: toSafeString(event.reasonCode, 80),
    rewritten: toSafeBoolean(event.rewritten),
    final_status: toSafeString(event.finalStatus, 40) || "ok",
  }));
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

    const body = await parseJsonBody<AuditRequestBody>(req);
    if (!body) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const rows = sanitizeEvents(Array.isArray(body.events) ? body.events : []);
    if (rows.length === 0) {
      return jsonResponse({ inserted: 0 });
    }

    const source = toSafeString(body.source, 80) || "form-editor";
    const metadata = sanitizeMetadata(body.metadata);
    const insertRows = rows.map((row) => ({
      ...row,
      source,
      metadata,
    }));

    const { error } = await supabase
      .from(TABLE_NAME)
      .insert(insertRows);

    if (error) {
      throw new Error(`INSERT_FAILED:${error.message}`);
    }

    return jsonResponse({ inserted: insertRows.length }, 200, { "x-risk-guard-source": "risk-validation-audit" });
  } catch (error) {
    console.error("[risk-validation-audit] Unhandled error", error);

    if (error instanceof Error && error.message.startsWith("VALIDATION_ERROR:")) {
      return errorResponse(400, "VALIDATION_ERROR", error.message.replace("VALIDATION_ERROR:", ""));
    }

    if (error instanceof Error && error.message.startsWith("INSERT_FAILED:")) {
      return errorResponse(500, "INSERT_FAILED", error.message.replace("INSERT_FAILED:", ""));
    }

    return errorResponse(500, "INTERNAL_ERROR", "Unexpected error during risk validation audit handling.");
  }
});
