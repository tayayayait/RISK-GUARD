import type { RiskControlIntent } from "@/types/riskControlIntent";

export type RiskValidationStatus = "ok" | "review_required";

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
