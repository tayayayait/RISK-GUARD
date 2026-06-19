export const RISK_CONTROL_INTENTS = [
  "access_control",
  "supervision",
  "traffic_operation",
  "operating_procedure",
  "equipment_guard",
  "energy_isolation",
  "inspection_maintenance",
  "ventilation_detection",
  "ppe",
  "structural_support",
  "emergency_response",
  "general_control",
] as const;

export type RiskControlIntent = (typeof RISK_CONTROL_INTENTS)[number];

export function isRiskControlIntent(value: unknown): value is RiskControlIntent {
  return typeof value === "string" && RISK_CONTROL_INTENTS.includes(value as RiskControlIntent);
}

export const RISK_CONTROL_INTENT_SEARCH_TERMS: Record<RiskControlIntent, readonly string[]> = {
  access_control: ["출입 통제", "동선 분리", "접촉 방지", "작업반경 출입금지"],
  supervision: ["유도자 배치", "신호수 배치", "작업지휘자", "감시인 배치"],
  traffic_operation: ["제한속도", "후진 경보", "전조등", "제동장치"],
  operating_procedure: ["작업계획서", "작업절차", "작업허가", "사전 교육"],
  equipment_guard: ["방호장치", "덮개 설치", "안전장치", "접촉 방지"],
  energy_isolation: ["전원 차단", "잠금표지", "에너지 격리", "잔류에너지 제거"],
  inspection_maintenance: ["정기점검", "이상 유무", "정비 작업", "사용 전 점검"],
  ventilation_detection: ["환기", "농도 측정", "가스 검지", "산소농도 확인"],
  ppe: ["보호구 착용", "안전대", "안전모", "호흡용 보호구"],
  structural_support: ["지지대 보강", "하중 검토", "동바리", "붕괴 방지"],
  emergency_response: ["비상대피", "구조장비", "구급조치", "비상연락"],
  general_control: ["위험성평가", "안전조치", "작업 전 확인"],
};

export function getRiskControlIntentSearchTerms(intent: unknown): string[] {
  const normalizedIntent = isRiskControlIntent(intent) ? intent : "general_control";
  return [...RISK_CONTROL_INTENT_SEARCH_TERMS[normalizedIntent]];
}

const CONTROL_INTENT_RULES: Array<{ intent: RiskControlIntent; pattern: RegExp }> = [
  { intent: "supervision", pattern: /(유도자|신호수|감시자|감시인|작업지휘|관리감독|감독자)/i },
  { intent: "traffic_operation", pattern: /(후진\s*(?:신호|경보)|속도\s*(?:제한|통제)|주행\s*(?:신호|규칙)|경광등|후방\s*(?:카메라|경보기))/i },
  { intent: "access_control", pattern: /(동선|출입|접근|근접|작업반경|통로|분리|격리구역)/i },
  { intent: "energy_isolation", pattern: /(전원|활선|통전|충전부|잠금표지|잠금·표지|lockout|tagout|잔류압|에너지\s*차단|점화원)/i },
  { intent: "ventilation_detection", pattern: /(환기|산소\s*농도|가스\s*농도|농도\s*(?:측정|확인)|검지기|측정기)/i },
  { intent: "ppe", pattern: /(보호구|안전대|안전모|보안경|마스크|호흡용\s*보호구|장갑\s*착용)/i },
  { intent: "equipment_guard", pattern: /(방호|인터록|덮개|커버|차폐|난간|발판|절연)/i },
  { intent: "structural_support", pattern: /(지지|보강|하중|흙막이|동바리|버팀)/i },
  { intent: "inspection_maintenance", pattern: /(점검|검사|정비|보수|고정상태|체결|변형|손상|불량|적치)/i },
  { intent: "operating_procedure", pattern: /(작업계획|작업절차|작업허가|교육|TBM|체크리스트|준수|기록)/i },
  { intent: "emergency_response", pattern: /(비상|구조|대피|구급|응급)/i },
];

const HAZARD_DEFAULT_INTENTS: Record<string, RiskControlIntent> = {
  추락: "equipment_guard",
  감전: "energy_isolation",
  "끼임/말림": "equipment_guard",
  절단: "equipment_guard",
  "차량/이동장비 충돌": "traffic_operation",
  "낙하물/비래": "equipment_guard",
  "폭발/화재": "energy_isolation",
  화학노출: "ventilation_detection",
  붕괴: "structural_support",
  질식: "ventilation_detection",
};

export function resolveRiskControlIntent(text: string, hazardType = ""): RiskControlIntent {
  const normalized = `${text ?? ""}`.replace(/\s+/g, " ").trim();
  const matched = CONTROL_INTENT_RULES.find((rule) => rule.pattern.test(normalized));
  return matched?.intent ?? HAZARD_DEFAULT_INTENTS[hazardType] ?? "general_control";
}
