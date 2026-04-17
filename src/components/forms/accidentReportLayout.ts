export const ACCIDENT_FORM_PAGE_WIDTH = 594.88;
export const ACCIDENT_FORM_PAGE_HEIGHT = 841;

export interface AccidentFieldLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  lineHeight?: number;
  paddingX?: number;
  paddingY?: number;
  letterSpacing?: number;
  textAlign?: "left" | "center" | "right";
  fontFamily?: string;
}

export interface AccidentCheckboxLayout {
  x: number;
  y: number;
  size: number;
}

function rect(left: number, bottom: number, right: number, top: number, overrides: Partial<AccidentFieldLayout> = {}): AccidentFieldLayout {
  return {
    x: left,
    y: ACCIDENT_FORM_PAGE_HEIGHT - top,
    width: right - left,
    height: top - bottom,
    paddingX: 2,
    paddingY: 1,
    fontSize: 10,
    lineHeight: 1.2,
    ...overrides,
  };
}

function box(x: number, y: number, size = 10): AccidentCheckboxLayout {
  return { x, y, size };
}

export type AccidentFieldLayoutMap = {
  receiptNumber: AccidentFieldLayout;
  receiptDate: AccidentFieldLayout;
  processingDate: AccidentFieldLayout;
  processingPeriodDays: AccidentFieldLayout;
  managementNumber: AccidentFieldLayout;
  businessNumber: AccidentFieldLayout;
  businessName: AccidentFieldLayout;
  workersCount: AccidentFieldLayout;
  industry: AccidentFieldLayout;
  address: AccidentFieldLayout;
  subcontractBusinessName: AccidentFieldLayout;
  subcontractManagementNumber: AccidentFieldLayout;
  dispatchedBusinessName: AccidentFieldLayout;
  dispatchedManagementNumber: AccidentFieldLayout;
  principalBusinessName: AccidentFieldLayout;
  principalManagementNumber: AccidentFieldLayout;
  constructionSiteName: AccidentFieldLayout;
  constructionType: AccidentFieldLayout;
  progressRate: AccidentFieldLayout;
  constructionAmount: AccidentFieldLayout;
  victimName: AccidentFieldLayout;
  residentNumber: AccidentFieldLayout;
  victimAddress: AccidentFieldLayout;
  victimPhone: AccidentFieldLayout;
  nationalityText: AccidentFieldLayout;
  visaType: AccidentFieldLayout;
  hireDate: AccidentFieldLayout;
  jobTitle: AccidentFieldLayout;
  experienceYears: AccidentFieldLayout;
  experienceMonths: AccidentFieldLayout;
  injuryType: AccidentFieldLayout;
  injuryPart: AccidentFieldLayout;
  expectedRestDays: AccidentFieldLayout;
  occurredDate: AccidentFieldLayout;
  location: AccidentFieldLayout;
  workType: AccidentFieldLayout;
  situation: AccidentFieldLayout;
  cause: AccidentFieldLayout;
  preventionPlan: AccidentFieldLayout;
  writerName: AccidentFieldLayout;
  writerPhone: AccidentFieldLayout;
  writtenDateBlock: AccidentFieldLayout;
  employerName: AccidentFieldLayout;
  workerRepresentativeName: AccidentFieldLayout;
  laborOfficeName: AccidentFieldLayout;
};

export type AccidentOccurredDateSegmentLayoutMap = {
  year: AccidentFieldLayout;
  month: AccidentFieldLayout;
  day: AccidentFieldLayout;
  dayOfWeek: AccidentFieldLayout;
  hour: AccidentFieldLayout;
  minute: AccidentFieldLayout;
};

export type AccidentResidentNumberCellLayoutMap = {
  front: AccidentFieldLayout[];
  backFirst: AccidentFieldLayout;
};

export const ACCIDENT_FIELD_LAYOUT: AccidentFieldLayoutMap = {
  receiptNumber: rect(118.017, 723.289, 177.984, 743.187),
  receiptDate: rect(238.072, 723.289, 298.04, 743.187),
  processingDate: rect(358.007, 723.289, 417.975, 743.187),
  processingPeriodDays: rect(478.063, 723.289, 538.031, 743.187),

  managementNumber: rect(171.268, 684.811, 286.286, 710.703),
  businessNumber: rect(356.328, 684.811, 538.031, 710.703),
  businessName: rect(171.268, 671.146, 286.286, 684.811),
  workersCount: rect(356.328, 671.146, 538.031, 684.811),
  industry: rect(171.268, 657.481, 286.286, 671.146),
  address: rect(356.328, 657.481, 538.031, 671.146),

  subcontractBusinessName: rect(171.268, 631.709, 327.784, 657.481),
  subcontractManagementNumber: rect(171.268, 605.937, 327.784, 631.709),
  dispatchedBusinessName: rect(414.617, 631.709, 538.031, 657.481),
  dispatchedManagementNumber: rect(414.617, 605.937, 538.031, 631.709),

  principalBusinessName: rect(248.266, 578.607, 327.784, 592.272),
  principalManagementNumber: rect(248.266, 552.835, 327.784, 578.607),
  constructionSiteName: rect(408.98, 552.835, 538.031, 592.272),
  constructionType: rect(327.784, 539.05, 408.98, 552.835),
  progressRate: rect(408.98, 539.05, 451.797, 552.835),
  constructionAmount: rect(451.797, 539.05, 538.031, 552.835),

  victimName: rect(149.68, 501.531, 221.761, 526.464),
  residentNumber: rect(338.2, 501.531, 410.8, 526.464, {
    fontSize: 10,
    lineHeight: 1.1,
    paddingX: 0,
    paddingY: 3,
    letterSpacing: 4.8,
  }),
  victimAddress: rect(149.68, 488.226, 406.102, 501.531),
  victimPhone: rect(451.677, 488.226, 538.031, 501.531),
  nationalityText: rect(220, 475.04, 330, 488.226),
  visaType: rect(451.677, 475.04, 538.031, 488.226),
  hireDate: rect(149.68, 450.108, 309.074, 475.04),
  jobTitle: rect(309.074, 450.108, 406.102, 475.04),
  experienceYears: rect(406.102, 450.108, 470, 475.04),
  experienceMonths: rect(470, 450.108, 538.031, 475.04),

  injuryType: rect(149.68, 385.498, 253.184, 423.617),
  injuryPart: rect(309.074, 385.498, 403.583, 423.617),
  expectedRestDays: rect(457.434, 398.684, 538.031, 423.617),

  occurredDate: rect(224.639, 371.833, 538.031, 385.498),
  location: rect(224.639, 358.168, 538.031, 371.833),
  workType: rect(224.639, 344.503, 538.031, 358.168),
  situation: rect(224.639, 330.718, 538.031, 344.503, { lineHeight: 1.25, paddingY: 2 }),
  cause: rect(224.639, 317.053, 538.031, 330.718, { lineHeight: 1.25, paddingY: 2 }),

  preventionPlan: rect(100.026, 267.427, 538.031, 317.053, { lineHeight: 1.3, paddingX: 3, paddingY: 3 }),

  writerName: rect(152.678, 181.961, 291.563, 194.188),
  writerPhone: rect(291.563, 181.961, 538.031, 194.188),
  writtenDateBlock: rect(152.678, 169.734, 291.563, 181.961),
  employerName: rect(356.328, 155.949, 538.031, 169.734),
  workerRepresentativeName: rect(356.328, 142.284, 538.031, 155.949),
  laborOfficeName: rect(90, 126.5, 188, 141.5, { fontSize: 24, lineHeight: 1, paddingX: 0, paddingY: 0 }),
};

export const ACCIDENT_OCCURRED_DATE_SEGMENT_LAYOUT: AccidentOccurredDateSegmentLayoutMap = {
  year: rect(228.5, 371.833, 257.0, 385.498, { paddingX: 0, textAlign: "center" }),
  month: rect(276.0, 371.833, 295.8, 385.498, { paddingX: 0, textAlign: "center" }),
  day: rect(314.8, 371.833, 334.7, 385.498, { paddingX: 0, textAlign: "center" }),
  dayOfWeek: rect(353.6, 371.833, 373.6, 385.498, { paddingX: 0, textAlign: "center" }),
  hour: rect(401.0, 371.833, 421.0, 385.498, { paddingX: 0, textAlign: "center" }),
  minute: rect(440.0, 371.833, 460.0, 385.498, { paddingX: 0, textAlign: "center" }),
};

export const ACCIDENT_RESIDENT_NUMBER_CELL_LAYOUT: AccidentResidentNumberCellLayoutMap = {
  front: [
    rect(332.9, 501.531, 343.3, 526.464, { paddingX: 0, textAlign: "center" }),
    rect(343.3, 501.531, 353.7, 526.464, { paddingX: 0, textAlign: "center" }),
    rect(353.7, 501.531, 364.1, 526.464, { paddingX: 0, textAlign: "center" }),
    rect(364.1, 501.531, 374.5, 526.464, { paddingX: 0, textAlign: "center" }),
    rect(374.5, 501.531, 384.9, 526.464, { paddingX: 0, textAlign: "center" }),
    rect(384.9, 501.531, 395.3, 526.464, { paddingX: 0, textAlign: "center" }),
    rect(395.3, 501.531, 405.7, 526.464, { paddingX: 0, textAlign: "center" }),
  ],
  backFirst: rect(429.8, 501.531, 442.3, 526.464, { paddingX: 0, textAlign: "center" }),
};

export const ACCIDENT_CHECKBOX_LAYOUT = {
  ordererPrivate: box(332.8, 240.8, 9),
  ordererNational: box(375.5, 240.8, 9),
  ordererPublic: box(478.2, 240.8, 9),

  nationalityDomestic: box(154.6, 358.0, 9),
  nationalityForeign: box(205.9, 358.0, 9),

  employmentRegular: box(154.4, 394.0, 9),
  employmentTemporary: box(195.9, 394.0, 9),
  employmentDaily: box(237.4, 394.0, 9),
  employmentUnpaidFamily: box(278.9, 394.0, 9),
  employmentSelfEmployed: box(361.9, 394.0, 9),
  employmentOther: box(419.9, 394.0, 9),

  workRegular: box(154.6, 407.3, 9),
  workShift2: box(197.4, 407.3, 9),
  workShift3: box(245.2, 407.3, 9),
  workShift4: box(292.9, 407.3, 9),
  workPartTime: box(340.7, 407.3, 9),
  workOther: box(392.0, 407.3, 9),

  dead: box(462.5, 444.6, 9),
  requestTechnicalSupport: box(513.4, 587.6, 9),
  consentPersonalData: box(521.0, 630.2, 9),
};
