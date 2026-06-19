export const STANDARD_HAZARD_TYPES = [
  "추락",
  "붕괴",
  "질식",
  "폭발/화재",
  "감전",
  "끼임/말림",
  "절단",
  "낙하물/비래",
  "차량/이동장비 충돌",
  "화학노출",
  "소음/분진/반복작업",
] as const;

export type StandardHazardType = (typeof STANDARD_HAZARD_TYPES)[number];

const STANDARD_TYPE_SET = new Set<string>(STANDARD_HAZARD_TYPES);

const ALIAS_TO_STANDARD: Record<string, StandardHazardType> = {
  추락위험: "추락",
  붕락: "붕괴",
  매몰: "붕괴",
  산소결핍: "질식",
  밀폐공간: "질식",
  폭발: "폭발/화재",
  화재: "폭발/화재",
  인화: "폭발/화재",
  발화: "폭발/화재",
  가연: "폭발/화재",
  감전사고: "감전",
  협착: "끼임/말림",
  끼임: "끼임/말림",
  말림: "끼임/말림",
  베임: "절단",
  절삭: "절단",
  낙하물: "낙하물/비래",
  비래: "낙하물/비래",
  비산: "낙하물/비래",
  차량충돌: "차량/이동장비 충돌",
  이동장비충돌: "차량/이동장비 충돌",
  지게차충돌: "차량/이동장비 충돌",
  화학물질누출: "화학노출",
  화학물질노출: "화학노출",
  유해가스노출: "화학노출",
  비계고정불량: "추락",
  발판고정불량: "추락",
  비계불안정: "추락",
  발판불안정: "추락",
  분진노출: "소음/분진/반복작업",
  반복작업: "소음/분진/반복작업",
  근골격: "소음/분진/반복작업",
};

const PATTERN_RULES: Array<{ type: StandardHazardType; patterns: RegExp[] }> = [
  { type: "추락", patterns: [/추락/, /떨어지/, /고소작업/, /전도/, /넘어지/, /미끄러/, /비계/, /발판/, /고정\s*불량/] },
  { type: "붕괴", patterns: [/붕괴/, /붕락/, /무너지/, /매몰/, /토사/] },
  { type: "질식", patterns: [/질식/, /산소결핍/, /밀폐공간/, /환기부족/] },
  { type: "폭발/화재", patterns: [/폭발/, /화재/, /인화/, /발화/, /점화/, /가연/] },
  { type: "감전", patterns: [/감전/, /충전부/, /누전/, /접지/] },
  { type: "끼임/말림", patterns: [/끼임/, /말림/, /협착/, /회전축/, /롤러/] },
  { type: "절단", patterns: [/절단/, /절삭/, /베임/, /절단기/, /날부/, /찔림/, /찔리/] },
  { type: "낙하물/비래", patterns: [/낙하물/, /낙하/, /비래/, /비산/, /날아올/, /가격/, /맞음/, /맞아/] },
  { type: "차량/이동장비 충돌", patterns: [/지게차/, /차량/, /이동장비/, /충돌/, /운반기계/, /크레인/, /부딪/, /치임/] },
  { type: "화학노출", patterns: [/화학/, /유해물질/, /msds/i, /독성/, /용제/, /노출/] },
  { type: "소음/분진/반복작업", patterns: [/소음/, /분진/, /진동/, /반복작업/, /근골격/] },
];

function sanitizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[./·ㆍ()_\-]/g, "");
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}

export function isStandardHazardType(value: string): value is StandardHazardType {
  return STANDARD_TYPE_SET.has(value);
}

export function normalizeHazardType(type?: string, fallbackText?: string) {
  const candidates = [type, fallbackText]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (isStandardHazardType(candidate)) {
      return candidate;
    }

    const alias = ALIAS_TO_STANDARD[sanitizeKey(candidate)];
    if (alias) {
      return alias;
    }

    const matched = PATTERN_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(candidate)));
    if (matched) {
      return matched.type;
    }
  }

  return "";
}

export function resolveLegalContextHazardType(
  sourceText: string,
  aiHazardType: string,
  aiContext = "",
) {
  const normalizedSource = (sourceText ?? "").trim();
  const hasVehicleEquipment = /(지게차|차량|이동장비|운반기계|구내운반차)/.test(normalizedSource);
  const hasVehicleOperation = /(충돌|접촉|후진|주행|운반|이송|유도자|신호수)/.test(normalizedSource);
  if (hasVehicleEquipment && hasVehicleOperation) {
    return "차량/이동장비 충돌" as const;
  }

  const sourceHazardType = normalizeHazardType(normalizedSource, normalizedSource);
  if (sourceHazardType) {
    return sourceHazardType;
  }

  return normalizeHazardType(aiHazardType, aiContext);
}

export function normalizeHazardTypeList(values: string[]) {
  const normalized = values
    .map((value) => normalizeHazardType(value, value))
    .filter(Boolean);
  return unique(normalized) as StandardHazardType[];
}
