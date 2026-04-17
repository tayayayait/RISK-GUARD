import { invokeBackend } from "@/services/edgeFunctionClient";
import type {
  AccidentReportData,
  RiskAssessmentRow,
  RiskRowValidationEvent,
  RiskRowValidationSummary,
} from "@/types/formTemplate";

const SCOPE_STORAGE_KEY = "risk-guard:form-history:scope-key:v1";
const SCOPE_KEY_LENGTH = 32;

export type FormHistoryFormType = "risk-assessment" | "accident-report";

export interface FormHistorySummary {
  id: string;
  formType: FormHistoryFormType;
  taskName: string;
  siteName: string;
  workDate: string;
  createdAt: string;
  expiresAt: string;
  rowCount: number;
}

export interface FormHistoryDetail extends FormHistorySummary {
  contextText: string;
  riskRows: RiskAssessmentRow[];
  accidentData: AccidentReportData | null;
  validationSummary?: RiskRowValidationSummary;
  validationEvents?: RiskRowValidationEvent[];
}

export interface RiskHistoryDetail extends FormHistoryDetail {
  formType: "risk-assessment";
  accidentData: null;
}

interface BaseCreatePayload {
  taskName: string;
  siteName?: string;
  workDate?: string;
  contextText?: string;
  validationSummary?: RiskRowValidationSummary;
  validationEvents?: RiskRowValidationEvent[];
}

interface RiskHistoryCreatePayload extends BaseCreatePayload {
  formType: "risk-assessment";
  riskRows: RiskAssessmentRow[];
}

interface AccidentHistoryCreatePayload extends BaseCreatePayload {
  formType: "accident-report";
  accidentData: AccidentReportData;
}

type FormHistoryCreatePayload = RiskHistoryCreatePayload | AccidentHistoryCreatePayload;

interface FormHistoryResponse {
  item?: FormHistorySummary | FormHistoryDetail;
  items?: FormHistorySummary[];
  ok?: boolean;
}

function randomString(length: number) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return result;
}

function createScopeKey() {
  const seed = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${randomString(12)}`;
  return `rg_scope_${seed.replace(/[^a-zA-Z0-9_-]/g, "")}_${randomString(SCOPE_KEY_LENGTH)}`;
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

async function getScopeKey() {
  const storage = getStorage();
  if (!storage) {
    throw new Error("FORM_HISTORY_SCOPE_UNAVAILABLE");
  }

  const existing = storage.getItem(SCOPE_STORAGE_KEY);
  if (existing && existing.trim().length >= 16) {
    return existing.trim();
  }

  const generated = createScopeKey();
  storage.setItem(SCOPE_STORAGE_KEY, generated);
  return generated;
}

async function invokeFormHistory(payload: Record<string, unknown>) {
  const response = await invokeBackend<FormHistoryResponse>({
    supabaseFunction: "form-history",
    legacyPath: "/form-history",
    payload,
    timeoutMs: 30000,
  });

  if (!response) {
    if (payload.action === "delete") {
      throw new Error("FORM_HISTORY_DELETE_BACKEND_UNAVAILABLE");
    }
    throw new Error("FORM_HISTORY_BACKEND_UNAVAILABLE");
  }

  return response;
}

function parseFormType(value: unknown): FormHistoryFormType {
  return value === "accident-report" ? "accident-report" : "risk-assessment";
}

function toSummary(item: unknown): FormHistorySummary | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) {
    return null;
  }

  const formType = parseFormType(row.formType);
  return {
    id,
    formType,
    taskName: typeof row.taskName === "string" ? row.taskName : "",
    siteName: typeof row.siteName === "string" ? row.siteName : "",
    workDate: typeof row.workDate === "string" ? row.workDate : "",
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    expiresAt: typeof row.expiresAt === "string" ? row.expiresAt : "",
    rowCount: formType === "risk-assessment" && typeof row.rowCount === "number" ? row.rowCount : 0,
  };
}

function toAccidentData(value: unknown): AccidentReportData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as AccidentReportData;
}

function toDetail(item: unknown): FormHistoryDetail | null {
  const summary = toSummary(item);
  if (!summary) {
    return null;
  }

  const row = item as Record<string, unknown>;
  const rawRows = Array.isArray(row.riskRows) ? row.riskRows : [];
  const riskRows = rawRows.filter((value): value is RiskAssessmentRow => Boolean(value && typeof value === "object"));

  return {
    ...summary,
    contextText: typeof row.contextText === "string" ? row.contextText : "",
    riskRows,
    accidentData: summary.formType === "accident-report" ? toAccidentData(row.accidentData) : null,
    validationSummary:
      row.validationSummary && typeof row.validationSummary === "object" && !Array.isArray(row.validationSummary)
        ? row.validationSummary as RiskRowValidationSummary
        : undefined,
    validationEvents:
      Array.isArray(row.validationEvents)
        ? row.validationEvents.filter(
          (event): event is RiskRowValidationEvent => Boolean(event && typeof event === "object"),
        )
        : undefined,
  };
}

function normalizeRecordId(recordId: string) {
  const normalizedRecordId = recordId.trim();
  if (!normalizedRecordId) {
    throw new Error("FORM_HISTORY_INVALID_RECORD_ID");
  }
  return normalizedRecordId;
}

export const FormHistoryService = {
  async createHistoryRecord(payload: FormHistoryCreatePayload) {
    if (payload.formType === "risk-assessment") {
      if (!Array.isArray(payload.riskRows) || payload.riskRows.length === 0) {
        throw new Error("FORM_HISTORY_EMPTY_ROWS");
      }
    } else if (!payload.accidentData || typeof payload.accidentData !== "object") {
      throw new Error("FORM_HISTORY_EMPTY_ACCIDENT_DATA");
    }

    const scopeKey = await getScopeKey();
    const response = await invokeFormHistory({
      action: "create",
      scopeKey,
      payload,
    });

    const summary = toSummary(response.item);
    if (!summary) {
      throw new Error("FORM_HISTORY_INVALID_CREATE_RESPONSE");
    }

    return summary;
  },

  async createRiskHistoryRecord(payload: Omit<RiskHistoryCreatePayload, "formType">) {
    return this.createHistoryRecord({
      formType: "risk-assessment",
      ...payload,
    });
  },

  async createAccidentHistoryRecord(payload: Omit<AccidentHistoryCreatePayload, "formType">) {
    return this.createHistoryRecord({
      formType: "accident-report",
      ...payload,
    });
  },

  async listHistoryRecords(formType?: FormHistoryFormType) {
    const scopeKey = await getScopeKey();
    const response = await invokeFormHistory({
      action: "list",
      scopeKey,
      ...(formType ? { formType } : {}),
    });

    const items = Array.isArray(response.items)
      ? response.items.map((item) => toSummary(item)).filter((item): item is FormHistorySummary => Boolean(item))
      : [];

    return items;
  },

  async listRiskHistoryRecords() {
    return this.listHistoryRecords("risk-assessment");
  },

  async listAccidentHistoryRecords() {
    return this.listHistoryRecords("accident-report");
  },

  async getHistoryRecord(recordId: string) {
    const normalizedRecordId = normalizeRecordId(recordId);
    const scopeKey = await getScopeKey();
    const response = await invokeFormHistory({
      action: "get",
      scopeKey,
      recordId: normalizedRecordId,
    });

    const detail = toDetail(response.item);
    if (!detail) {
      throw new Error("FORM_HISTORY_INVALID_GET_RESPONSE");
    }

    return detail;
  },

  async getRiskHistoryRecord(recordId: string) {
    const detail = await this.getHistoryRecord(recordId);
    if (detail.formType !== "risk-assessment") {
      throw new Error("FORM_HISTORY_TYPE_MISMATCH");
    }
    return detail as RiskHistoryDetail;
  },

  async deleteHistoryRecord(recordId: string) {
    const normalizedRecordId = normalizeRecordId(recordId);
    const scopeKey = await getScopeKey();
    const response = await invokeFormHistory({
      action: "delete",
      scopeKey,
      recordId: normalizedRecordId,
    });

    if (response.ok !== true) {
      throw new Error("FORM_HISTORY_INVALID_DELETE_RESPONSE");
    }
  },

  async deleteRiskHistoryRecord(recordId: string) {
    await this.deleteHistoryRecord(recordId);
  },
};
