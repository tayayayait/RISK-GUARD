/**
 * GHS01 ~ GHS09 픽토그램 정적 매핑 및 메타데이터
 */

export interface GhsPictogramMeta {
  code: string;
  ko: string;
  en: string;
  symbol: string;
  description: string;
}

export const GHS_PICTOGRAMS: Record<string, GhsPictogramMeta> = {
  GHS01: {
    code: "GHS01",
    ko: "폭발성",
    en: "Explosive",
    symbol: "폭탄 폭발",
    description: "불안정한 폭발물, 자기반응성 물질, 유기과산화물",
  },
  GHS02: {
    code: "GHS02",
    ko: "인화성",
    en: "Flammable",
    symbol: "불꽃",
    description: "인화성 가스/액체/고체, 자기발화성, 물반응성",
  },
  GHS03: {
    code: "GHS03",
    ko: "산화성",
    en: "Oxidizing",
    symbol: "원 위의 불꽃",
    description: "산화성 가스/액체/고체",
  },
  GHS04: {
    code: "GHS04",
    ko: "고압가스",
    en: "Compressed Gas",
    symbol: "가스실린더",
    description: "압축가스, 액화가스, 냉동액화가스, 용해가스",
  },
  GHS05: {
    code: "GHS05",
    ko: "부식성",
    en: "Corrosive",
    symbol: "부식",
    description: "금속부식성, 피부부식성, 심한 눈 손상",
  },
  GHS06: {
    code: "GHS06",
    ko: "급성독성",
    en: "Acute Toxicity",
    symbol: "해골과 X자 뼈",
    description: "급성 독성 (경구, 경피, 흡입 구분 1~3)",
  },
  GHS07: {
    code: "GHS07",
    ko: "경고(자극성)",
    en: "Warning",
    symbol: "느낌표",
    description: "피부/눈 자극성, 피부과민성, 특정표적장기 독성(1회)",
  },
  GHS08: {
    code: "GHS08",
    ko: "건강유해성",
    en: "Health Hazard",
    symbol: "인체",
    description: "호흡기과민성, 생식세포변이원성, 발암성, 생식독성, 흡인유해성",
  },
  GHS09: {
    code: "GHS09",
    ko: "수생환경 유해성",
    en: "Environmental",
    symbol: "환경",
    description: "수생환경유해성 (급성/만성)",
  },
} as const;
