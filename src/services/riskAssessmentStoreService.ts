import { invokeBackend } from "@/services/edgeFunctionClient";
import type {
  AssessmentParticipant,
  AssessmentShareRecord,
  ParticipantRole,
  ParticipationMethod,
  RiskLevel,
  ShareMethod,
  SharePhase,
} from "@/types/assessment";
import type {
  ImprovementStatus,
  RiskAcceptability,
  RiskAssessmentRow,
  RiskValidationField,
  RiskValidationStatus,
} from "@/types/formTemplate";

/**
 * Durable store for the main risk-assessment flow (`risk-assessment-store` edge function).
 *
 * Distinct from FormHistoryService, which writes Form Center *snapshots* into
 * `risk_assessment_history` (30-day expiry, no update path). This service owns the
 * living document: rows stay patchable after the assessment is confirmed so that
 * improvement follow-up can be recorded over the following weeks.
 */

export type AssessmentRecordStatus = "draft" | "confirmed" | "archived";

export interface RiskAssessmentSummary {
  id: string;
  taskName: string;
  siteName: string;
  workDate: string;
  industry: string;
  workLocation: string;
  evaluator: string;
  referenceScore: number | null;
  referenceLevel: RiskLevel | null;
  status: AssessmentRecordStatus;
  createdAt: string;
  updatedAt: string;
  retainUntil: string;
}

export interface RiskAssessmentDetail extends RiskAssessmentSummary {
  taskDescription: string;
  analysisSnapshot: Record<string, unknown>;
  riskRows: RiskAssessmentRow[];
  participants: AssessmentParticipant[];
  shareRecords: AssessmentShareRecord[];
}

export interface RiskAssessmentUpsertPayload {
  taskName: string;
  taskDescription?: string;
  siteName?: string;
  workDate?: string;
  industry?: string;
  workLocation?: string;
  evaluator?: string;
  referenceScore?: number | null;
  referenceLevel?: RiskLevel | null;
  analysisSnapshot?: Record<string, unknown>;
  status?: AssessmentRecordStatus;
  riskRows: RiskAssessmentRow[];
}

export type RiskRowPatch = Partial<
  Pick<
    RiskAssessmentRow,
    | "workProcess"
    | "category"
    | "cause"
    | "hazardFactor"
    | "legalBasis"
    | "currentMeasure"
    | "frequency"
    | "severity"
    | "riskLevel"
    | "acceptability"
    | "acceptabilityBasis"
    | "reductionMeasure"
    | "postFrequency"
    | "postSeverity"
    | "postRiskLevel"
    | "postAcceptability"
    | "responsiblePerson"
    | "improvementDate"
    | "completionDate"
    | "improvementStatus"
    | "completionNote"
    | "validationStatus"
    | "controlIntent"
  >
>;

export interface ParticipantInput {
  name: string;
  role: ParticipantRole;
  affiliation?: string;
  method: ParticipationMethod;
  participatedAt?: string;
  note?: string;
}

export interface ShareInput {
  phase: SharePhase;
  method: ShareMethod;
  sharedAt?: string;
  audienceNote?: string;
  content: string;
  recordedBy?: string;
}

interface StoreResponse {
  item?: unknown;
  items?: unknown[];
  ok?: boolean;
}

const ACCEPTABILITY_VALUES: RiskAcceptability[] = ["acceptable", "not_acceptable"];
const IMPROVEMENT_STATUS_VALUES: ImprovementStatus[] = ["planned", "in_progress", "done", "deferred"];
const VALIDATION_STATUS_VALUES: RiskValidationStatus[] = ["ok", "review_required"];
const RECORD_STATUS_VALUES: AssessmentRecordStatus[] = ["draft", "confirmed", "archived"];
const RISK_LEVEL_VALUES: RiskLevel[] = ["critical", "high", "medium", "low"];
const PARTICIPANT_ROLE_VALUES: ParticipantRole[] = [
  "worker",
  "worker_representative",
  "manager",
  "supervisor",
];
const PARTICIPATION_METHOD_VALUES: ParticipationMethod[] = [
  "site_patrol",
  "survey",
  "interview",
  "other",
];
const SHARE_PHASE_VALUES: SharePhase[] = ["before", "after"];
const SHARE_METHOD_VALUES: ShareMethod[] = [
  "education",
  "briefing",
  "posting",
  "written",
  "electronic",
];

async function invokeStore(payload: Record<string, unknown>) {
  const response = await invokeBackend<StoreResponse>({
    supabaseFunction: "risk-assessment-store",
    legacyPath: "/risk-assessment-store",
    payload,
    timeoutMs: 30000,
  });

  if (!response) {
    throw new Error("RISK_ASSESSMENT_STORE_BACKEND_UNAVAILABLE");
  }

  return response;
}

function toStringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toEnumValue<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function toOptionalEnumValue<T extends string>(value: unknown, allowed: T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function toOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toRiskRow(value: unknown): RiskAssessmentRow {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    workProcess: toStringValue(row.workProcess),
    category: toStringValue(row.category),
    cause: toStringValue(row.cause),
    hazardFactor: toStringValue(row.hazardFactor),
    legalBasis: toStringValue(row.legalBasis),
    currentMeasure: toStringValue(row.currentMeasure),
    frequency: toOptionalNumber(row.frequency) ?? 1,
    severity: toOptionalNumber(row.severity) ?? 1,
    riskLevel: toStringValue(row.riskLevel),
    reductionMeasure: toStringValue(row.reductionMeasure),
    acceptability: toEnumValue(row.acceptability, ACCEPTABILITY_VALUES, "not_acceptable"),
    acceptabilityBasis: toStringValue(row.acceptabilityBasis),
    postFrequency: toOptionalNumber(row.postFrequency),
    postSeverity: toOptionalNumber(row.postSeverity),
    postRiskLevel: toStringValue(row.postRiskLevel),
    postAcceptability: toOptionalEnumValue(row.postAcceptability, ACCEPTABILITY_VALUES),
    responsiblePerson: toStringValue(row.responsiblePerson),
    improvementDate: toStringValue(row.improvementDate),
    completionDate: toStringValue(row.completionDate),
    improvementStatus: toEnumValue(row.improvementStatus, IMPROVEMENT_STATUS_VALUES, "planned"),
    completionNote: toStringValue(row.completionNote),
    controlIntent: row.controlIntent as RiskAssessmentRow["controlIntent"],
    validationStatus: toEnumValue(row.validationStatus, VALIDATION_STATUS_VALUES, "ok"),
    reviewRequiredFields: Array.isArray(row.reviewRequiredFields)
      ? (row.reviewRequiredFields as RiskValidationField[])
      : [],
    reviewReasonCodes: Array.isArray(row.reviewReasonCodes)
      ? row.reviewReasonCodes.map((code) => toStringValue(code)).filter(Boolean)
      : [],
    expectedHazardType: toStringValue(row.expectedHazardType),
    detectedHazardType: toStringValue(row.detectedHazardType),
  };
}

function toParticipant(value: unknown): AssessmentParticipant | null {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = toStringValue(row.id);
  if (!id) {
    return null;
  }

  return {
    id,
    name: toStringValue(row.name),
    role: toEnumValue(row.role, PARTICIPANT_ROLE_VALUES, "worker"),
    affiliation: toStringValue(row.affiliation),
    method: toEnumValue(row.method, PARTICIPATION_METHOD_VALUES, "site_patrol"),
    participatedAt: toStringValue(row.participatedAt),
    note: toStringValue(row.note),
  };
}

function toShareRecord(value: unknown): AssessmentShareRecord | null {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = toStringValue(row.id);
  if (!id) {
    return null;
  }

  return {
    id,
    phase: toEnumValue(row.phase, SHARE_PHASE_VALUES, "after"),
    method: toEnumValue(row.method, SHARE_METHOD_VALUES, "posting"),
    sharedAt: toStringValue(row.sharedAt),
    audienceNote: toStringValue(row.audienceNote),
    content: toStringValue(row.content),
    recordedBy: toStringValue(row.recordedBy),
  };
}

function toSummary(value: unknown): RiskAssessmentSummary | null {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const id = toStringValue(row.id);
  if (!id) {
    return null;
  }

  return {
    id,
    taskName: toStringValue(row.taskName),
    siteName: toStringValue(row.siteName),
    workDate: toStringValue(row.workDate),
    industry: toStringValue(row.industry),
    workLocation: toStringValue(row.workLocation),
    evaluator: toStringValue(row.evaluator),
    referenceScore: toOptionalNumber(row.referenceScore) ?? null,
    referenceLevel: toOptionalEnumValue(row.referenceLevel, RISK_LEVEL_VALUES) ?? null,
    status: toEnumValue(row.status, RECORD_STATUS_VALUES, "draft"),
    createdAt: toStringValue(row.createdAt),
    updatedAt: toStringValue(row.updatedAt),
    retainUntil: toStringValue(row.retainUntil),
  };
}

function toDetail(value: unknown): RiskAssessmentDetail | null {
  const summary = toSummary(value);
  if (!summary) {
    return null;
  }

  const row = value as Record<string, unknown>;
  return {
    ...summary,
    taskDescription: toStringValue(row.taskDescription),
    analysisSnapshot:
      row.analysisSnapshot && typeof row.analysisSnapshot === "object" && !Array.isArray(row.analysisSnapshot)
        ? (row.analysisSnapshot as Record<string, unknown>)
        : {},
    riskRows: Array.isArray(row.riskRows) ? row.riskRows.map((item) => toRiskRow(item)) : [],
    participants: Array.isArray(row.participants)
      ? row.participants
        .map((item) => toParticipant(item))
        .filter((item): item is AssessmentParticipant => Boolean(item))
      : [],
    shareRecords: Array.isArray(row.shareRecords)
      ? row.shareRecords
        .map((item) => toShareRecord(item))
        .filter((item): item is AssessmentShareRecord => Boolean(item))
      : [],
  };
}

function normalizeRecordId(recordId: string) {
  const normalized = recordId.trim();
  if (!normalized) {
    throw new Error("RISK_ASSESSMENT_STORE_INVALID_RECORD_ID");
  }
  return normalized;
}

function normalizeMatchKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * 서식센터가 AI를 다시 돌리지 않고 주 흐름에서 저장한 평가를 집어내기 위한 매칭.
 * `list()`는 updated_at 내림차순이므로 같은 작업명 중 첫 항목이 최신이다.
 * 현장명을 입력했다면 같은 현장을 우선한다.
 */
export function pickStoredRiskAssessmentMatch(
  summaries: RiskAssessmentSummary[],
  taskName: string,
  siteName = "",
): RiskAssessmentSummary | null {
  const targetTask = normalizeMatchKey(taskName);
  if (!targetTask) {
    return null;
  }

  const sameTask = summaries.filter((item) => normalizeMatchKey(item.taskName) === targetTask);
  if (sameTask.length === 0) {
    return null;
  }

  const targetSite = normalizeMatchKey(siteName);
  if (targetSite) {
    const sameSite = sameTask.find((item) => normalizeMatchKey(item.siteName) === targetSite);
    if (sameSite) {
      return sameSite;
    }
  }

  return sameTask[0];
}

export const RiskAssessmentStoreService = {
  /**
   * Creates the record when `assessmentId` is omitted, otherwise updates it in place.
   * Rows are replaced as a set, keyed by their array position.
   */
  async upsert(payload: RiskAssessmentUpsertPayload, assessmentId?: string) {
    if (!payload.taskName?.trim()) {
      throw new Error("RISK_ASSESSMENT_STORE_TASK_NAME_REQUIRED");
    }

    const response = await invokeStore({
      action: "upsert",
      ...(assessmentId ? { assessmentId } : {}),
      payload,
    });

    const detail = toDetail(response.item);
    if (!detail) {
      throw new Error("RISK_ASSESSMENT_STORE_INVALID_UPSERT_RESPONSE");
    }

    return detail;
  },

  /** Patches a single row in place — used for improvement follow-up. */
  async patchRow(assessmentId: string, rowIndex: number, patch: RiskRowPatch) {
    const normalizedId = normalizeRecordId(assessmentId);
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
      throw new Error("RISK_ASSESSMENT_STORE_INVALID_ROW_INDEX");
    }

    const response = await invokeStore({
      action: "patchRow",
      assessmentId: normalizedId,
      rowIndex,
      payload: patch,
    });

    if (!response.item) {
      throw new Error("RISK_ASSESSMENT_STORE_INVALID_PATCH_RESPONSE");
    }

    return toRiskRow(response.item);
  },

  async get(assessmentId: string) {
    const normalizedId = normalizeRecordId(assessmentId);
    const response = await invokeStore({
      action: "get",
      assessmentId: normalizedId,
    });

    const detail = toDetail(response.item);
    if (!detail) {
      throw new Error("RISK_ASSESSMENT_STORE_INVALID_GET_RESPONSE");
    }

    return detail;
  },

  async list(limit?: number) {
    const response = await invokeStore({
      action: "list",
      ...(typeof limit === "number" ? { limit } : {}),
    });

    return Array.isArray(response.items)
      ? response.items
        .map((item) => toSummary(item))
        .filter((item): item is RiskAssessmentSummary => Boolean(item))
      : [];
  },

  async addParticipant(assessmentId: string, participant: ParticipantInput) {
    const normalizedId = normalizeRecordId(assessmentId);
    if (!participant.name?.trim()) {
      throw new Error("RISK_ASSESSMENT_STORE_PARTICIPANT_NAME_REQUIRED");
    }

    const response = await invokeStore({
      action: "addParticipant",
      assessmentId: normalizedId,
      payload: participant,
    });

    const item = toParticipant(response.item);
    if (!item) {
      throw new Error("RISK_ASSESSMENT_STORE_INVALID_PARTICIPANT_RESPONSE");
    }

    return item;
  },

  async removeParticipant(assessmentId: string, participantId: string) {
    const response = await invokeStore({
      action: "removeParticipant",
      assessmentId: normalizeRecordId(assessmentId),
      recordId: normalizeRecordId(participantId),
    });

    if (response.ok !== true) {
      throw new Error("RISK_ASSESSMENT_STORE_INVALID_DELETE_RESPONSE");
    }
  },

  async addShareRecord(assessmentId: string, share: ShareInput) {
    const normalizedId = normalizeRecordId(assessmentId);
    if (!share.content?.trim()) {
      throw new Error("RISK_ASSESSMENT_STORE_SHARE_CONTENT_REQUIRED");
    }

    const response = await invokeStore({
      action: "addShare",
      assessmentId: normalizedId,
      payload: share,
    });

    const item = toShareRecord(response.item);
    if (!item) {
      throw new Error("RISK_ASSESSMENT_STORE_INVALID_SHARE_RESPONSE");
    }

    return item;
  },

  async removeShareRecord(assessmentId: string, shareId: string) {
    const response = await invokeStore({
      action: "removeShare",
      assessmentId: normalizeRecordId(assessmentId),
      recordId: normalizeRecordId(shareId),
    });

    if (response.ok !== true) {
      throw new Error("RISK_ASSESSMENT_STORE_INVALID_DELETE_RESPONSE");
    }
  },

  /** Explicit user-initiated deletion only. There is no automatic expiry. */
  async remove(assessmentId: string) {
    const response = await invokeStore({
      action: "delete",
      assessmentId: normalizeRecordId(assessmentId),
    });

    if (response.ok !== true) {
      throw new Error("RISK_ASSESSMENT_STORE_INVALID_DELETE_RESPONSE");
    }
  },
};
