import type { RiskControlIntent } from "@/types/riskControlIntent";

export type RiskValidationStatus = "ok" | "review_required";

/** 시행규칙 제37조제1항제2호: 위험성 크기가 허용 가능한 수준인지 결정 */
export type RiskAcceptability = "acceptable" | "not_acceptable";

/** 개선대책 이행 상태 */
export type ImprovementStatus = "planned" | "in_progress" | "done" | "deferred";

export const RISK_ACCEPTABILITY_VALUES: RiskAcceptability[] = ["acceptable", "not_acceptable"];

export const IMPROVEMENT_STATUS_VALUES: ImprovementStatus[] = [
  "planned",
  "in_progress",
  "done",
  "deferred",
];

export const RISK_ACCEPTABILITY_LABELS: Record<RiskAcceptability, string> = {
  acceptable: "허용 가능",
  not_acceptable: "허용 불가",
};

export const IMPROVEMENT_STATUS_LABELS: Record<ImprovementStatus, string> = {
  planned: "계획",
  in_progress: "진행중",
  done: "완료",
  deferred: "보류",
};

export type RiskValidationField =
  | "category"
  | "cause"
  | "hazardFactor"
  | "currentMeasure"
  | "reductionMeasure"
  | "legalBasis";

export interface RiskRowValidationEvent {
  timestamp: string;
  siteName: string;
  formType: "risk-assessment";
  rowIndex: number;
  expectedHazardType: string;
  detectedHazardType: string;
  field: RiskValidationField;
  reasonCode: string;
  rewritten: boolean;
  finalStatus: RiskValidationStatus;
}

export interface RiskRowValidationSummary {
  totalRows: number;
  reviewRequiredRows: number;
  okRows: number;
  hazardTypeCounts: Record<string, number>;
}

export interface RiskAssessmentRow {
  workProcess: string;
  category: string;
  cause: string;
  hazardFactor: string;
  legalBasis: string;
  currentMeasure: string;
  frequency: number;
  severity: number;
  riskLevel: string;
  reductionMeasure: string;
  postRiskLevel?: string;
  improvementDate?: string;
  completionDate?: string;
  responsiblePerson?: string;
  validationStatus?: RiskValidationStatus;
  reviewRequiredFields?: RiskValidationField[];
  reviewReasonCodes?: string[];
  expectedHazardType?: string;
  detectedHazardType?: string;
  controlIntent?: RiskControlIntent;

  /** 현재 위험성이 허용 가능한 수준인지 (시행규칙 제37조제1항제2호) */
  acceptability?: RiskAcceptability;
  /** 허용 여부 판단 근거 */
  acceptabilityBasis?: string;
  /** 개선 후 가능성(빈도) 1~5 */
  postFrequency?: number;
  /** 개선 후 중대성(강도) 1~5 */
  postSeverity?: number;
  /** 개선 후 재판정 결과 */
  postAcceptability?: RiskAcceptability;
  /** 개선대책 이행 상태 */
  improvementStatus?: ImprovementStatus;
  /** 완료 확인 메모 */
  completionNote?: string;
}

export interface AccidentBusinessInfo {
  businessName: string;
  businessNumber: string;
  managementNumber: string;
  workersCount: string;
  industry: string;
  address: string;
  subcontractorInfo: {
    businessName: string;
    managementNumber: string;
  };
  dispatchedInfo: {
    businessName: string;
    managementNumber: string;
  };
  constructionInfo: {
    orderer: "private" | "national" | "public_institution" | "";
    principalBusinessName: string;
    principalManagementNumber: string;
    constructionSiteName: string;
    constructionType: string;
    progressRate: string;
    constructionAmount: string;
  };
}

export interface AccidentVictimInfo {
  name: string;
  residentNumber: string;
  address: string;
  phone: string;
  nationality: string;
  nationalityType: "domestic" | "foreign" | "";
  visaType: string;
  jobTitle: string;
  hireDate: string;
  experienceYears: string;
  experienceMonths: string;
  employmentType: "regular" | "temporary" | "daily" | "unpaid_family" | "self_employed" | "other" | "";
  workType: "regular" | "shift_2" | "shift_3" | "shift_4" | "part_time" | "other" | "";
  injuryType: string;
  injuryPart: string;
  expectedRestDays: string;
  isDead: boolean;
}

export interface AccidentDetails {
  occurredDate: {
    year: string;
    month: string;
    day: string;
    dayOfWeek: string;
    hour: string;
    minute: string;
  };
  location: string;
  workType: string;
  workTiming: "during_work" | "before_after_work" | "other" | "";
  situation: string;
  cause: string[];
}

export interface AccidentPreventionPlan {
  plan: string;
  requestTechnicalSupport: boolean;
  consentPersonalData: boolean;
}

export interface AccidentAdministrativeInfo {
  receiptNumber: string;
  receiptDate: string;
  processingDate: string;
  processingPeriodDays: string;
  writerName: string;
  writerPhone: string;
  writtenYear: string;
  writtenMonth: string;
  writtenDay: string;
  employerName: string;
  workerRepresentativeName: string;
  laborOfficeName: string;
}

export interface AccidentReportData {
  administrativeInfo: AccidentAdministrativeInfo;
  businessInfo: AccidentBusinessInfo;
  victimInfo: AccidentVictimInfo;
  accidentDetails: AccidentDetails;
  preventionPlan: AccidentPreventionPlan;
  legalViolations?: string[];
}
