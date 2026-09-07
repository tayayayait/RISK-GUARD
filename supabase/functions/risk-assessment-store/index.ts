import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText } from "../_shared/http.ts";
import { requireAuthenticatedUserId } from "../_shared/auth-user.ts";

// Durable store for the main risk-assessment flow.
//
// Deliberately different from `form-history`:
//   - rows live in their own table so improvement follow-up can be patched per row
//   - there is NO purge/expiry. Records are retained (법 제36조제5항 / 시행규칙 제37조의4제2항)
//     and records are owned by the authenticated Supabase user.

const ASSESSMENT_TABLE = "risk_assessments";
const ROW_TABLE = "risk_assessment_rows";
const PARTICIPANT_TABLE = "risk_assessment_participants";
const SHARE_TABLE = "risk_assessment_shares";

const MAX_TASK_NAME_LENGTH = 120;
const MAX_SITE_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_RISK_ROWS = 200;
const MAX_PARTICIPANTS = 100;
const MAX_SHARE_RECORDS = 50;
const MAX_ANALYSIS_SNAPSHOT_LENGTH = 1000000;
const MAX_LIST_ITEMS = 100;

type ActionType =
  | "upsert"
  | "patchRow"
  | "get"
  | "list"
  | "addParticipant"
  | "removeParticipant"
  | "addShare"
  | "removeShare"
  | "delete";

const ACTIONS: ActionType[] = [
  "upsert",
  "patchRow",
  "get",
  "list",
  "addParticipant",
  "removeParticipant",
  "addShare",
  "removeShare",
  "delete",
];

const ACCEPTABILITY_VALUES = ["acceptable", "not_acceptable"];
const IMPROVEMENT_STATUS_VALUES = ["planned", "in_progress", "done", "deferred"];
const VALIDATION_STATUS_VALUES = ["ok", "review_required"];
const ASSESSMENT_STATUS_VALUES = ["draft", "confirmed", "archived"];
const REFERENCE_LEVEL_VALUES = ["critical", "high", "medium", "low"];
const PARTICIPANT_ROLE_VALUES = ["worker", "worker_representative", "manager", "supervisor"];
const PARTICIPATION_METHOD_VALUES = ["site_patrol", "survey", "interview", "other"];
const SHARE_PHASE_VALUES = ["before", "after"];
const SHARE_METHOD_VALUES = ["education", "briefing", "posting", "written", "electronic"];

const ASSESSMENT_COLUMNS =
  "id, task_name, task_description, site_name, work_date, industry, work_location, evaluator, reference_score, reference_level, analysis_snapshot, status, created_at, updated_at, retain_until";
const ROW_COLUMNS =
  "id, row_index, work_process, category, cause, hazard_factor, legal_basis, current_measure, frequency, severity, risk_level, acceptability, acceptability_basis, reduction_measure, post_frequency, post_severity, post_risk_level, post_acceptability, responsible_person, improvement_date, completion_date, improvement_status, completion_note, control_intent, validation_status, review_meta";
const PARTICIPANT_COLUMNS = "id, name, role, affiliation, method, participated_at, note, created_at";
const SHARE_COLUMNS = "id, phase, method, shared_at, audience_note, content, recorded_by, created_at";

interface RequestBody {
  action: ActionType;
  assessmentId?: string;
  rowIndex?: number;
  recordId?: string;
  payload?: Record<string, unknown>;
  limit?: number;
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
        "x-client-info": "risk-guard-risk-assessment-store",
      },
    },
  });
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

function toRiskScale(value: unknown, fallback: number) {
  return Math.min(5, Math.max(1, Math.round(toSafeNumber(value, fallback))));
}

function toOptionalRiskScale(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

function toEnum(value: unknown, allowed: string[], fallback: string) {
  const normalized = toSafeString(value, 40);
  return allowed.includes(normalized) ? normalized : fallback;
}

function toOptionalEnum(value: unknown, allowed: string[]) {
  const normalized = toSafeString(value, 40);
  return allowed.includes(normalized) ? normalized : null;
}

function toOptionalDate(value: unknown) {
  const normalized = toSafeString(value, 20);
  if (!normalized) {
    return null;
  }
  if (!isIsoDate(normalized)) {
    throw new Error("VALIDATION_ERROR:date fields must be YYYY-MM-DD.");
  }
  return normalized;
}

function toJsonObject(value: unknown, maxLength: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  let encoded = "";
  try {
    encoded = JSON.stringify(value);
  } catch {
    return {};
  }

  if (encoded.length > maxLength) {
    throw new Error("VALIDATION_ERROR:JSON payload is too large.");
  }

  return JSON.parse(encoded) as Record<string, unknown>;
}

function normalizeUuid(rawId: unknown, label: string) {
  const value = toSafeString(rawId, 64);
  if (!/^[0-9a-fA-F-]{36}$/.test(value)) {
    throw new Error(`VALIDATION_ERROR:${label} must be a UUID.`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

function sanitizeRiskRow(rawRow: unknown, rowIndex: number) {
  const row = rawRow && typeof rawRow === "object" ? rawRow as Record<string, unknown> : {};

  return {
    row_index: rowIndex,
    work_process: toSafeString(row.workProcess, 300),
    category: toSafeString(row.category, 120),
    cause: toSafeString(row.cause, 600),
    hazard_factor: toSafeString(row.hazardFactor, 300),
    legal_basis: toSafeString(row.legalBasis, 300),
    current_measure: toSafeString(row.currentMeasure, 800),
    frequency: toRiskScale(row.frequency, 1),
    severity: toRiskScale(row.severity, 1),
    risk_level: toSafeString(row.riskLevel, 40),
    acceptability: toEnum(row.acceptability, ACCEPTABILITY_VALUES, "not_acceptable"),
    acceptability_basis: toSafeString(row.acceptabilityBasis, 400),
    reduction_measure: toSafeString(row.reductionMeasure, 800),
    post_frequency: toOptionalRiskScale(row.postFrequency),
    post_severity: toOptionalRiskScale(row.postSeverity),
    post_risk_level: toSafeString(row.postRiskLevel, 40),
    post_acceptability: toOptionalEnum(row.postAcceptability, ACCEPTABILITY_VALUES),
    responsible_person: toSafeString(row.responsiblePerson, 80),
    improvement_date: toOptionalDate(row.improvementDate),
    completion_date: toOptionalDate(row.completionDate),
    improvement_status: toEnum(row.improvementStatus, IMPROVEMENT_STATUS_VALUES, "planned"),
    completion_note: toSafeString(row.completionNote, 600),
    control_intent: toSafeString(row.controlIntent, 60) || null,
    validation_status: toEnum(row.validationStatus, VALIDATION_STATUS_VALUES, "ok"),
    review_meta: toJsonObject(
      {
        reviewRequiredFields: Array.isArray(row.reviewRequiredFields)
          ? row.reviewRequiredFields.slice(0, 12).map((field) => toSafeString(field, 40)).filter(Boolean)
          : [],
        reviewReasonCodes: Array.isArray(row.reviewReasonCodes)
          ? row.reviewReasonCodes.slice(0, 12).map((code) => toSafeString(code, 80)).filter(Boolean)
          : [],
        expectedHazardType: toSafeString(row.expectedHazardType, 80),
        detectedHazardType: toSafeString(row.detectedHazardType, 80),
      },
      8000,
    ),
  };
}

function sanitizeRiskRows(rawRows: unknown) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  if (rows.length > MAX_RISK_ROWS) {
    throw new Error("VALIDATION_ERROR:riskRows is too large.");
  }
  return rows.map((row, index) => sanitizeRiskRow(row, index));
}

function sanitizeRowPatch(rawPatch: unknown) {
  const patch = rawPatch && typeof rawPatch === "object" ? rawPatch as Record<string, unknown> : {};
  const result: Record<string, unknown> = {};

  const stringFields: Array<[string, string, number]> = [
    ["workProcess", "work_process", 300],
    ["category", "category", 120],
    ["cause", "cause", 600],
    ["hazardFactor", "hazard_factor", 300],
    ["legalBasis", "legal_basis", 300],
    ["currentMeasure", "current_measure", 800],
    ["riskLevel", "risk_level", 40],
    ["acceptabilityBasis", "acceptability_basis", 400],
    ["reductionMeasure", "reduction_measure", 800],
    ["postRiskLevel", "post_risk_level", 40],
    ["responsiblePerson", "responsible_person", 80],
    ["completionNote", "completion_note", 600],
  ];

  for (const [camel, snake, maxLength] of stringFields) {
    if (camel in patch) {
      result[snake] = toSafeString(patch[camel], maxLength);
    }
  }

  if ("frequency" in patch) result.frequency = toRiskScale(patch.frequency, 1);
  if ("severity" in patch) result.severity = toRiskScale(patch.severity, 1);
  if ("postFrequency" in patch) result.post_frequency = toOptionalRiskScale(patch.postFrequency);
  if ("postSeverity" in patch) result.post_severity = toOptionalRiskScale(patch.postSeverity);
  if ("improvementDate" in patch) result.improvement_date = toOptionalDate(patch.improvementDate);
  if ("completionDate" in patch) result.completion_date = toOptionalDate(patch.completionDate);

  if ("acceptability" in patch) {
    result.acceptability = toEnum(patch.acceptability, ACCEPTABILITY_VALUES, "not_acceptable");
  }
  if ("postAcceptability" in patch) {
    result.post_acceptability = toOptionalEnum(patch.postAcceptability, ACCEPTABILITY_VALUES);
  }
  if ("improvementStatus" in patch) {
    result.improvement_status = toEnum(patch.improvementStatus, IMPROVEMENT_STATUS_VALUES, "planned");
  }
  if ("validationStatus" in patch) {
    result.validation_status = toEnum(patch.validationStatus, VALIDATION_STATUS_VALUES, "ok");
  }
  if ("controlIntent" in patch) {
    result.control_intent = toSafeString(patch.controlIntent, 60) || null;
  }

  if (Object.keys(result).length === 0) {
    throw new Error("VALIDATION_ERROR:patch must contain at least one known field.");
  }

  return result;
}

function sanitizeAssessmentHeader(rawPayload: unknown) {
  const payload = rawPayload && typeof rawPayload === "object"
    ? rawPayload as Record<string, unknown>
    : {};

  const taskName = toSafeString(payload.taskName, MAX_TASK_NAME_LENGTH);
  if (!taskName) {
    throw new Error("VALIDATION_ERROR:taskName is required.");
  }

  const referenceScoreRaw = payload.referenceScore;
  const referenceScore = referenceScoreRaw === null || referenceScoreRaw === undefined
    ? null
    : Math.min(100, Math.max(0, Math.round(toSafeNumber(referenceScoreRaw, 0))));

  return {
    task_name: taskName,
    task_description: toSafeString(payload.taskDescription, MAX_DESCRIPTION_LENGTH),
    site_name: toSafeString(payload.siteName, MAX_SITE_NAME_LENGTH),
    work_date: toOptionalDate(payload.workDate),
    industry: toSafeString(payload.industry, 80),
    work_location: toSafeString(payload.workLocation, 160),
    evaluator: toSafeString(payload.evaluator, 80),
    reference_score: referenceScore,
    reference_level: toOptionalEnum(payload.referenceLevel, REFERENCE_LEVEL_VALUES),
    analysis_snapshot: toJsonObject(payload.analysisSnapshot, MAX_ANALYSIS_SNAPSHOT_LENGTH),
    status: toEnum(payload.status, ASSESSMENT_STATUS_VALUES, "draft"),
  };
}

function sanitizeParticipant(rawPayload: unknown) {
  const payload = rawPayload && typeof rawPayload === "object"
    ? rawPayload as Record<string, unknown>
    : {};

  const name = toSafeString(payload.name, 80);
  if (!name) {
    throw new Error("VALIDATION_ERROR:participant name is required.");
  }

  return {
    name,
    role: toEnum(payload.role, PARTICIPANT_ROLE_VALUES, "worker"),
    affiliation: toSafeString(payload.affiliation, 120),
    method: toEnum(payload.method, PARTICIPATION_METHOD_VALUES, "site_patrol"),
    participated_at: toOptionalDate(payload.participatedAt),
    note: toSafeString(payload.note, 400),
  };
}

function sanitizeShare(rawPayload: unknown) {
  const payload = rawPayload && typeof rawPayload === "object"
    ? rawPayload as Record<string, unknown>
    : {};

  const content = toSafeString(payload.content, 2000);
  if (!content) {
    throw new Error("VALIDATION_ERROR:share content is required.");
  }

  const sharedAtRaw = toSafeString(payload.sharedAt, 40);
  const sharedAt = sharedAtRaw && !Number.isNaN(Date.parse(sharedAtRaw))
    ? new Date(sharedAtRaw).toISOString()
    : new Date().toISOString();

  return {
    phase: toEnum(payload.phase, SHARE_PHASE_VALUES, "after"),
    method: toEnum(payload.method, SHARE_METHOD_VALUES, "posting"),
    shared_at: sharedAt,
    audience_note: toSafeString(payload.audienceNote, 200),
    content,
    recorded_by: toSafeString(payload.recordedBy, 80),
  };
}

// ---------------------------------------------------------------------------
// Response shaping (snake_case -> camelCase)
// ---------------------------------------------------------------------------

function toAssessmentSummary(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    taskName: (row.task_name as string) ?? "",
    siteName: (row.site_name as string) ?? "",
    workDate: (row.work_date as string) ?? "",
    industry: (row.industry as string) ?? "",
    workLocation: (row.work_location as string) ?? "",
    evaluator: (row.evaluator as string) ?? "",
    referenceScore: typeof row.reference_score === "number" ? row.reference_score : null,
    referenceLevel: (row.reference_level as string) ?? null,
    status: (row.status as string) ?? "draft",
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
    retainUntil: (row.retain_until as string) ?? "",
  };
}

function toRiskRow(row: Record<string, unknown>) {
  const reviewMeta = row.review_meta && typeof row.review_meta === "object"
    ? row.review_meta as Record<string, unknown>
    : {};

  return {
    workProcess: (row.work_process as string) ?? "",
    category: (row.category as string) ?? "",
    cause: (row.cause as string) ?? "",
    hazardFactor: (row.hazard_factor as string) ?? "",
    legalBasis: (row.legal_basis as string) ?? "",
    currentMeasure: (row.current_measure as string) ?? "",
    frequency: typeof row.frequency === "number" ? row.frequency : 1,
    severity: typeof row.severity === "number" ? row.severity : 1,
    riskLevel: (row.risk_level as string) ?? "",
    acceptability: (row.acceptability as string) ?? "not_acceptable",
    acceptabilityBasis: (row.acceptability_basis as string) ?? "",
    reductionMeasure: (row.reduction_measure as string) ?? "",
    postFrequency: typeof row.post_frequency === "number" ? row.post_frequency : undefined,
    postSeverity: typeof row.post_severity === "number" ? row.post_severity : undefined,
    postRiskLevel: (row.post_risk_level as string) ?? "",
    postAcceptability: (row.post_acceptability as string) ?? undefined,
    responsiblePerson: (row.responsible_person as string) ?? "",
    improvementDate: (row.improvement_date as string) ?? "",
    completionDate: (row.completion_date as string) ?? "",
    improvementStatus: (row.improvement_status as string) ?? "planned",
    completionNote: (row.completion_note as string) ?? "",
    controlIntent: (row.control_intent as string) ?? undefined,
    validationStatus: (row.validation_status as string) ?? "ok",
    reviewRequiredFields: Array.isArray(reviewMeta.reviewRequiredFields)
      ? reviewMeta.reviewRequiredFields
      : [],
    reviewReasonCodes: Array.isArray(reviewMeta.reviewReasonCodes) ? reviewMeta.reviewReasonCodes : [],
    expectedHazardType: (reviewMeta.expectedHazardType as string) ?? "",
    detectedHazardType: (reviewMeta.detectedHazardType as string) ?? "",
  };
}

function toParticipant(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    role: (row.role as string) ?? "worker",
    affiliation: (row.affiliation as string) ?? "",
    method: (row.method as string) ?? "site_patrol",
    participatedAt: (row.participated_at as string) ?? "",
    note: (row.note as string) ?? "",
  };
}

function toShareRecord(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    phase: (row.phase as string) ?? "after",
    method: (row.method as string) ?? "posting",
    sharedAt: (row.shared_at as string) ?? "",
    audienceNote: (row.audience_note as string) ?? "",
    content: (row.content as string) ?? "",
    recordedBy: (row.recorded_by as string) ?? "",
  };
}

// ---------------------------------------------------------------------------
// Authenticated account ownership
// ---------------------------------------------------------------------------

type SupabaseServerClient = NonNullable<ReturnType<typeof createSupabaseServerClient>>;

async function assertUserOwnsAssessment(
  supabase: SupabaseServerClient,
  assessmentId: string,
  ownerId: string,
) {
  const { data, error } = await supabase
    .from(ASSESSMENT_TABLE)
    .select("id")
    .eq("id", assessmentId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(`OWNER_CHECK_FAILED:${error.message}`);
  }

  if (!data) {
    throw new Error("NOT_FOUND:assessment does not exist for this user.");
  }
}

async function loadAssessmentDetail(
  supabase: SupabaseServerClient,
  assessmentId: string,
  ownerId: string,
) {
  const { data: header, error: headerError } = await supabase
    .from(ASSESSMENT_TABLE)
    .select(ASSESSMENT_COLUMNS)
    .eq("id", assessmentId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (headerError) {
    throw new Error(`GET_FAILED:${headerError.message}`);
  }

  if (!header) {
    throw new Error("NOT_FOUND:assessment does not exist for this user.");
  }

  const [rowsResult, participantsResult, sharesResult] = await Promise.all([
    supabase.from(ROW_TABLE).select(ROW_COLUMNS).eq("assessment_id", assessmentId).order("row_index", {
      ascending: true,
    }),
    supabase.from(PARTICIPANT_TABLE).select(PARTICIPANT_COLUMNS).eq("assessment_id", assessmentId).order(
      "created_at",
      { ascending: true },
    ),
    supabase.from(SHARE_TABLE).select(SHARE_COLUMNS).eq("assessment_id", assessmentId).order("shared_at", {
      ascending: false,
    }),
  ]);

  if (rowsResult.error) throw new Error(`GET_ROWS_FAILED:${rowsResult.error.message}`);
  if (participantsResult.error) throw new Error(`GET_PARTICIPANTS_FAILED:${participantsResult.error.message}`);
  if (sharesResult.error) throw new Error(`GET_SHARES_FAILED:${sharesResult.error.message}`);

  const headerRow = header as Record<string, unknown>;

  return {
    ...toAssessmentSummary(headerRow),
    taskDescription: (headerRow.task_description as string) ?? "",
    analysisSnapshot: headerRow.analysis_snapshot && typeof headerRow.analysis_snapshot === "object"
      ? headerRow.analysis_snapshot
      : {},
    riskRows: (rowsResult.data ?? []).map((row) => toRiskRow(row as Record<string, unknown>)),
    participants: (participantsResult.data ?? []).map((row) => toParticipant(row as Record<string, unknown>)),
    shareRecords: (sharesResult.data ?? []).map((row) => toShareRecord(row as Record<string, unknown>)),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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

    const body = await parseJsonBody<RequestBody>(req);
    if (!body) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    if (!body.action || !ACTIONS.includes(body.action)) {
      return errorResponse(400, "VALIDATION_ERROR", `action must be one of ${ACTIONS.join("/")}.`);
    }

    const ownerId = await requireAuthenticatedUserId(req, supabase);
    const scopeHash = await hashScopeKey(`user:${ownerId}`);

    if (body.action === "upsert") {
      const header = sanitizeAssessmentHeader(body.payload);
      const rows = sanitizeRiskRows((body.payload as Record<string, unknown> | undefined)?.riskRows);

      let assessmentId = "";

      if (body.assessmentId) {
        assessmentId = normalizeUuid(body.assessmentId, "assessmentId");
        await assertUserOwnsAssessment(supabase, assessmentId, ownerId);

        const { error } = await supabase
          .from(ASSESSMENT_TABLE)
          .update(header)
          .eq("id", assessmentId)
          .eq("owner_id", ownerId);

        if (error) {
          throw new Error(`UPDATE_FAILED:${error.message}`);
        }
      } else {
        const { data, error } = await supabase
          .from(ASSESSMENT_TABLE)
          .insert({ ...header, scope_hash: scopeHash, owner_id: ownerId })
          .select("id")
          .single();

        if (error || !data) {
          throw new Error(`INSERT_FAILED:${error?.message ?? "No row returned"}`);
        }

        assessmentId = (data as Record<string, unknown>).id as string;
      }

      // Replace the row set. Rows are identified by row_index within an assessment.
      const { error: deleteError } = await supabase
        .from(ROW_TABLE)
        .delete()
        .eq("assessment_id", assessmentId);

      if (deleteError) {
        throw new Error(`ROWS_CLEAR_FAILED:${deleteError.message}`);
      }

      if (rows.length > 0) {
        const { error: insertRowsError } = await supabase
          .from(ROW_TABLE)
          .insert(rows.map((row) => ({ ...row, assessment_id: assessmentId })));

        if (insertRowsError) {
          throw new Error(`ROWS_INSERT_FAILED:${insertRowsError.message}`);
        }
      }

      const detail = await loadAssessmentDetail(supabase, assessmentId, ownerId);
      return jsonResponse({ item: detail });
    }

    if (body.action === "patchRow") {
      const assessmentId = normalizeUuid(body.assessmentId, "assessmentId");
      await assertUserOwnsAssessment(supabase, assessmentId, ownerId);

      const rowIndex = Math.round(toSafeNumber(body.rowIndex, -1));
      if (rowIndex < 0) {
        return errorResponse(400, "VALIDATION_ERROR", "rowIndex must be a non-negative integer.");
      }

      const patch = sanitizeRowPatch(body.payload);
      const { data, error } = await supabase
        .from(ROW_TABLE)
        .update(patch)
        .eq("assessment_id", assessmentId)
        .eq("row_index", rowIndex)
        .select(ROW_COLUMNS)
        .maybeSingle();

      if (error) {
        throw new Error(`ROW_PATCH_FAILED:${error.message}`);
      }

      if (!data) {
        return errorResponse(404, "NOT_FOUND", "Row does not exist for this assessment.");
      }

      return jsonResponse({ item: toRiskRow(data as Record<string, unknown>) });
    }

    if (body.action === "get") {
      const assessmentId = normalizeUuid(body.assessmentId, "assessmentId");
      const detail = await loadAssessmentDetail(supabase, assessmentId, ownerId);
      return jsonResponse({ item: detail });
    }

    if (body.action === "list") {
      const limit = Math.min(MAX_LIST_ITEMS, Math.max(1, Math.round(toSafeNumber(body.limit, 30))));
      const { data, error } = await supabase
        .from(ASSESSMENT_TABLE)
        .select(ASSESSMENT_COLUMNS)
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`LIST_FAILED:${error.message}`);
      }

      return jsonResponse({
        items: (data ?? []).map((row) => toAssessmentSummary(row as Record<string, unknown>)),
      });
    }

    if (body.action === "addParticipant") {
      const assessmentId = normalizeUuid(body.assessmentId, "assessmentId");
      await assertUserOwnsAssessment(supabase, assessmentId, ownerId);

      const { count, error: countError } = await supabase
        .from(PARTICIPANT_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("assessment_id", assessmentId);

      if (countError) {
        throw new Error(`PARTICIPANT_COUNT_FAILED:${countError.message}`);
      }

      if ((count ?? 0) >= MAX_PARTICIPANTS) {
        return errorResponse(400, "VALIDATION_ERROR", "Participant limit reached.");
      }

      const participant = sanitizeParticipant(body.payload);
      const { data, error } = await supabase
        .from(PARTICIPANT_TABLE)
        .insert({ ...participant, assessment_id: assessmentId })
        .select(PARTICIPANT_COLUMNS)
        .single();

      if (error || !data) {
        throw new Error(`PARTICIPANT_INSERT_FAILED:${error?.message ?? "No row returned"}`);
      }

      return jsonResponse({ item: toParticipant(data as Record<string, unknown>) });
    }

    if (body.action === "removeParticipant") {
      const assessmentId = normalizeUuid(body.assessmentId, "assessmentId");
      await assertUserOwnsAssessment(supabase, assessmentId, ownerId);

      const recordId = normalizeUuid(body.recordId, "recordId");
      const { error } = await supabase
        .from(PARTICIPANT_TABLE)
        .delete()
        .eq("id", recordId)
        .eq("assessment_id", assessmentId);

      if (error) {
        throw new Error(`PARTICIPANT_DELETE_FAILED:${error.message}`);
      }

      return jsonResponse({ ok: true });
    }

    if (body.action === "addShare") {
      const assessmentId = normalizeUuid(body.assessmentId, "assessmentId");
      await assertUserOwnsAssessment(supabase, assessmentId, ownerId);

      const { count, error: countError } = await supabase
        .from(SHARE_TABLE)
        .select("id", { count: "exact", head: true })
        .eq("assessment_id", assessmentId);

      if (countError) {
        throw new Error(`SHARE_COUNT_FAILED:${countError.message}`);
      }

      if ((count ?? 0) >= MAX_SHARE_RECORDS) {
        return errorResponse(400, "VALIDATION_ERROR", "Share record limit reached.");
      }

      const share = sanitizeShare(body.payload);
      const { data, error } = await supabase
        .from(SHARE_TABLE)
        .insert({ ...share, assessment_id: assessmentId })
        .select(SHARE_COLUMNS)
        .single();

      if (error || !data) {
        throw new Error(`SHARE_INSERT_FAILED:${error?.message ?? "No row returned"}`);
      }

      return jsonResponse({ item: toShareRecord(data as Record<string, unknown>) });
    }

    if (body.action === "removeShare") {
      const assessmentId = normalizeUuid(body.assessmentId, "assessmentId");
      await assertUserOwnsAssessment(supabase, assessmentId, ownerId);

      const recordId = normalizeUuid(body.recordId, "recordId");
      const { error } = await supabase
        .from(SHARE_TABLE)
        .delete()
        .eq("id", recordId)
        .eq("assessment_id", assessmentId);

      if (error) {
        throw new Error(`SHARE_DELETE_FAILED:${error.message}`);
      }

      return jsonResponse({ ok: true });
    }

    // delete: explicit user action only. There is no automatic expiry anywhere in this function.
    const assessmentId = normalizeUuid(body.assessmentId, "assessmentId");
    await assertUserOwnsAssessment(supabase, assessmentId, ownerId);

    const { error: deleteError } = await supabase
      .from(ASSESSMENT_TABLE)
      .delete()
      .eq("id", assessmentId)
      .eq("owner_id", ownerId);

    if (deleteError) {
      throw new Error(`DELETE_FAILED:${deleteError.message}`);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    if (message.startsWith("VALIDATION_ERROR:")) {
      return errorResponse(400, "VALIDATION_ERROR", message.replace("VALIDATION_ERROR:", ""));
    }

    if (message.startsWith("AUTH_REQUIRED:")) {
      return errorResponse(401, "AUTH_REQUIRED", message.replace("AUTH_REQUIRED:", ""));
    }

    if (message.startsWith("NOT_FOUND:")) {
      return errorResponse(404, "NOT_FOUND", message.replace("NOT_FOUND:", ""));
    }

    console.error("[risk-assessment-store] Unhandled error", error);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to process risk assessment store request.");
  }
});
