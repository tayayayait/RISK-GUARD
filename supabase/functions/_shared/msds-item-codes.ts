/**
 * KOSHA MSDS 공통 항목 코드 상수 정의
 */

export const MSDS_ITEM_CODES = {
  // 섹션 02: 유해성·위험성
  HAZARD: {
    CLASSIFICATION: "B02",
    LABEL_PARENT: "B04",
    PICTOGRAMS: "B0402",
    SIGNAL_WORD: "B0404",
    H_CODES: "B0406",
    P_PARENT: "B0408",
    P_PREVENTION: "B040802",
    P_RESPONSE: "B040804",
    P_STORAGE: "B040806",
    P_DISPOSAL: "B040808",
    NFPA: "B06",
  },

  // 섹션 04: 응급조치요령
  FIRST_AID: {
    EYE: "D02",
    SKIN: "D04",
    INHALATION: "D06",
    INGESTION: "D08",
    PHYSICIAN_NOTE: "D10",
  },

  // 섹션 08: 노출방지 및 개인보호구
  PPE: {
    EXPOSURE_PARENT: "H02",
    EXPOSURE_DOMESTIC: "H0202",
    EXPOSURE_ACGIH: "H0204",
    EXPOSURE_BIO: "H0206",
    EXPOSURE_OTHER: "H0208",
    ENGINEERING_CONTROL: "H04",
    PPE_PARENT: "H06",
    RESPIRATORY: "H0602",
    EYE: "H0604",
    HAND: "H0606",
    BODY: "H0608",
  },

  // 섹션 15: 법적 규제현황
  REGULATION: {
    OSH_ACT: "O02",              // 산업안전보건법
    CHEMICAL_CONTROL_ACT: "O04", // 화학물질관리법
    HAZMAT_ACT: "O06",           // 위험물안전관리법
    WASTE_ACT: "O08",            // 폐기물관리법
    OTHER_DOMESTIC: "O10",
    OTHER_FOREIGN: "O1004",
    REACH_KOREA: "O12",          // 화평법
  },
} as const;
