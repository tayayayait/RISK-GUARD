import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText } from "../_shared/http.ts";

const TABLE_NAME = "company_profile_defaults";
const BUSINESS_NUMBER_DIGITS = 10;
const MAX_BUSINESS_NUMBER_LENGTH = 12;
const MAX_MANAGEMENT_NUMBER_LENGTH = 60;
const MAX_BUSINESS_NAME_LENGTH = 160;
const MAX_INDUSTRY_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 240;

type ActionType = "get" | "upsert";

interface CompanyProfileRow {
  business_number: string;
  management_number: string;
  business_name: string;
  industry: string;
  headquarters_address: string;
  updated_at: string;
}

interface UpsertPayload {
  businessNumber: string;
  managementNumber: string;
  businessName: string;
  industry: string;
  headquartersAddress: string;
}

interface CompanyProfileRequestBody {
  action: ActionType;
  businessNumber?: string;
  payload?: UpsertPayload;
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
        "x-client-info": "risk-guard-company-profile",
      },
    },
  });
}

function normalizeBusinessNumber(rawBusinessNumber: string) {
  const digits = sanitizeText(rawBusinessNumber).replace(/\D/g, "");
  if (digits.length !== BUSINESS_NUMBER_DIGITS) {
    throw new Error("VALIDATION_ERROR:businessNumber must contain exactly 10 digits.");
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function toRequiredText(value: unknown, fieldName: string, maxLength: number) {
  const normalized = sanitizeText(typeof value === "string" ? value : "");
  if (!normalized) {
    throw new Error(`VALIDATION_ERROR:${fieldName} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`VALIDATION_ERROR:${fieldName} exceeds max length (${maxLength}).`);
  }
  return normalized;
}

function toProfileItem(row: CompanyProfileRow) {
  return {
    businessNumber: row.business_number,
    managementNumber: row.management_number,
    businessName: row.business_name,
    industry: row.industry,
    headquartersAddress: row.headquarters_address,
    updatedAt: row.updated_at,
  };
}

function validateGetBusinessNumber(rawBusinessNumber: unknown) {
  const raw = typeof rawBusinessNumber === "string" ? rawBusinessNumber : "";
  return normalizeBusinessNumber(raw);
}

function validateUpsertPayload(payload: UpsertPayload | undefined) {
  if (!payload || typeof payload !== "object") {
    throw new Error("VALIDATION_ERROR:payload is required for upsert action.");
  }

  const businessNumber = normalizeBusinessNumber(payload.businessNumber);
  const managementNumber = toRequiredText(
    payload.managementNumber,
    "managementNumber",
    MAX_MANAGEMENT_NUMBER_LENGTH,
  );
  const businessName = toRequiredText(payload.businessName, "businessName", MAX_BUSINESS_NAME_LENGTH);
  const industry = toRequiredText(payload.industry, "industry", MAX_INDUSTRY_LENGTH);
  const headquartersAddress = toRequiredText(
    payload.headquartersAddress,
    "headquartersAddress",
    MAX_ADDRESS_LENGTH,
  );

  return {
    businessNumber,
    managementNumber,
    businessName,
    industry,
    headquartersAddress,
  };
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

    const body = await parseJsonBody<CompanyProfileRequestBody>(req);
    if (!body) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    if (!body.action || !["get", "upsert"].includes(body.action)) {
      return errorResponse(400, "VALIDATION_ERROR", "action must be one of get/upsert.");
    }

    if (body.action === "get") {
      const businessNumber = validateGetBusinessNumber(body.businessNumber);
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select("business_number, management_number, business_name, industry, headquarters_address, updated_at")
        .eq("business_number", businessNumber)
        .limit(1);

      if (error) {
        throw new Error(`GET_FAILED:${error.message}`);
      }

      const row = (data ?? [])[0] as CompanyProfileRow | undefined;
      return jsonResponse({ item: row ? toProfileItem(row) : null });
    }

    const payload = validateUpsertPayload(body.payload);
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .upsert({
        business_number: payload.businessNumber,
        management_number: payload.managementNumber,
        business_name: payload.businessName,
        industry: payload.industry,
        headquarters_address: payload.headquartersAddress,
      }, {
        onConflict: "business_number",
      })
      .select("business_number, management_number, business_name, industry, headquarters_address, updated_at")
      .single();

    if (error || !data) {
      throw new Error(`UPSERT_FAILED:${error?.message ?? "No row returned"}`);
    }

    return jsonResponse({ item: toProfileItem(data as CompanyProfileRow) });
  } catch (error) {
    console.error("[company-profile] Unhandled error", error);

    if (error instanceof Error && error.message.startsWith("VALIDATION_ERROR:")) {
      return errorResponse(400, "VALIDATION_ERROR", error.message.replace("VALIDATION_ERROR:", ""));
    }

    if (error instanceof Error && error.message.startsWith("GET_FAILED:")) {
      return errorResponse(500, "GET_FAILED", error.message.replace("GET_FAILED:", ""));
    }

    if (error instanceof Error && error.message.startsWith("UPSERT_FAILED:")) {
      return errorResponse(500, "UPSERT_FAILED", error.message.replace("UPSERT_FAILED:", ""));
    }

    return errorResponse(500, "INTERNAL_ERROR", "Unexpected error during company profile handling.");
  }
});

