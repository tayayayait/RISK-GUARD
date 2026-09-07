import {
  UserWorkHistoryService,
  type UserWorkFeature,
  type UserWorkRecordDetail,
} from "@/services/userWorkHistoryService";
import type {
  AccidentReportData,
  RiskAssessmentRow,
  RiskRowValidationEvent,
  RiskRowValidationSummary,
} from "@/types/formTemplate";

export type FormHistoryFormType = "risk-assessment" | "accident-report";

export interface FormHistorySummary {
  id: string;
  formType: FormHistoryFormType;
  taskName: string;
  siteName: string;
  workDate: string;
  createdAt: string;
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

interface StoredFormInput {
  siteName?: string;
  workDate?: string;
  contextText?: string;
}

interface StoredFormResult {
  riskRows?: RiskAssessmentRow[];
  accidentData?: AccidentReportData;
  validationSummary?: RiskRowValidationSummary;
  validationEvents?: RiskRowValidationEvent[];
}

type StoredFormRecord = UserWorkRecordDetail<StoredFormInput, StoredFormResult>;

const FORM_FEATURES: UserWorkFeature[] = ["form-risk-assessment", "form-accident-report"];

function formTypeToFeature(formType: FormHistoryFormType): UserWorkFeature {
  return formType === "risk-assessment" ? "form-risk-assessment" : "form-accident-report";
}

function featureToFormType(feature: UserWorkFeature): FormHistoryFormType {
  return feature === "form-accident-report" ? "accident-report" : "risk-assessment";
}

function normalizeRecordId(recordId: string) {
  const normalizedRecordId = recordId.trim();
  if (!normalizedRecordId) {
    throw new Error("FORM_HISTORY_INVALID_RECORD_ID");
  }
  return normalizedRecordId;
}

function toSummary(record: StoredFormRecord): FormHistorySummary {
  const formType = featureToFormType(record.feature);
  return {
    id: record.id,
    formType,
    taskName: record.title,
    siteName: typeof record.input.siteName === "string" ? record.input.siteName : "",
    workDate: typeof record.input.workDate === "string" ? record.input.workDate : "",
    createdAt: record.createdAt,
    rowCount: formType === "risk-assessment" && Array.isArray(record.result.riskRows)
      ? record.result.riskRows.length
      : 0,
  };
}

function toDetail(record: StoredFormRecord): FormHistoryDetail {
  const summary = toSummary(record);
  const riskRows = Array.isArray(record.result.riskRows)
    ? record.result.riskRows.filter(
      (row): row is RiskAssessmentRow => Boolean(row && typeof row === "object"),
    )
    : [];

  return {
    ...summary,
    contextText: typeof record.input.contextText === "string" ? record.input.contextText : "",
    riskRows,
    accidentData:
      summary.formType === "accident-report"
      && record.result.accidentData
      && typeof record.result.accidentData === "object"
        ? record.result.accidentData
        : null,
    validationSummary:
      record.result.validationSummary && typeof record.result.validationSummary === "object"
        ? record.result.validationSummary
        : undefined,
    validationEvents: Array.isArray(record.result.validationEvents)
      ? record.result.validationEvents
      : undefined,
  };
}

function buildSubtitle(siteName?: string, workDate?: string) {
  return [siteName?.trim(), workDate?.trim()].filter(Boolean).join(" · ");
}

async function getStoredRecord(recordId: string, features: UserWorkFeature | UserWorkFeature[]) {
  return UserWorkHistoryService.get<StoredFormInput, StoredFormResult>(normalizeRecordId(recordId), features);
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

    const input: StoredFormInput = {
      siteName: payload.siteName,
      workDate: payload.workDate,
      contextText: payload.contextText,
    };
    const result: StoredFormResult = payload.formType === "risk-assessment"
      ? {
          riskRows: payload.riskRows,
          validationSummary: payload.validationSummary,
          validationEvents: payload.validationEvents,
        }
      : { accidentData: payload.accidentData };

    const record = await UserWorkHistoryService.create({
      feature: formTypeToFeature(payload.formType),
      title: payload.taskName,
      subtitle: buildSubtitle(payload.siteName, payload.workDate),
      input,
      result,
    });

    return toSummary(record);
  },

  async createRiskHistoryRecord(payload: Omit<RiskHistoryCreatePayload, "formType">) {
    return this.createHistoryRecord({ formType: "risk-assessment", ...payload });
  },

  async createAccidentHistoryRecord(payload: Omit<AccidentHistoryCreatePayload, "formType">) {
    return this.createHistoryRecord({ formType: "accident-report", ...payload });
  },

  async listHistoryRecords(formType?: FormHistoryFormType) {
    const features = formType ? formTypeToFeature(formType) : FORM_FEATURES;
    const records = await UserWorkHistoryService.list(features);
    return (records as unknown as StoredFormRecord[]).map(toSummary);
  },

  async listRiskHistoryRecords() {
    return this.listHistoryRecords("risk-assessment");
  },

  async listAccidentHistoryRecords() {
    return this.listHistoryRecords("accident-report");
  },

  async getHistoryRecord(recordId: string) {
    return toDetail(await getStoredRecord(recordId, FORM_FEATURES));
  },

  async getRiskHistoryRecord(recordId: string) {
    const detail = toDetail(await getStoredRecord(recordId, "form-risk-assessment"));
    return detail as RiskHistoryDetail;
  },

  async deleteHistoryRecord(recordId: string) {
    await UserWorkHistoryService.remove(normalizeRecordId(recordId), FORM_FEATURES);
  },

  async deleteRiskHistoryRecord(recordId: string) {
    await UserWorkHistoryService.remove(normalizeRecordId(recordId), "form-risk-assessment");
  },
};
