import { buildCsvEnhancementTokens } from "./csv-catalog.ts";
import { normalizeHazardType, normalizeHazardTypeList } from "./hazard-taxonomy.ts";
import type { LawActionItem } from "./law-actions.ts";

export type IncidentAnchorDomain =
  | "accident_type"
  | "hazard_factor"
  | "work_action"
  | "equipment"
  | "place";

export interface IncidentAnchorHazard {
  name: string;
  type?: string;
  weight?: number;
}

export interface IncidentAnchorProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: IncidentAnchorHazard[];
}

export interface IncidentAnchorContextInput {
  taskName: string;
  taskDescription?: string;
  analysisScenario?: string;
  profile: IncidentAnchorProfile;
}

export interface IncidentAnchorSet {
  accident_type: Set<string>;
  hazard_factor: Set<string>;
  work_action: Set<string>;
  equipment: Set<string>;
  place: Set<string>;
}

export interface IncidentLawAnchorGateResult {
  incidentAnchors: IncidentAnchorSet;
  lawAnchors: IncidentAnchorSet;
  matched: Record<IncidentAnchorDomain, string[]>;
  hasAccidentHazardMatch: boolean;
  hasOperationalMatch: boolean;
}

interface CanonicalRule {
  canonical: string;
  patterns: RegExp[];
}

const DOMAIN_STOPWORDS = new Set([
  "the",
  "and",
  "with",
  "for",
  "from",
  "work",
  "task",
  "process",
  "safety",
  "site",
  "zone",
  "작업",
  "현장",
  "상태",
  "기준",
  "요구",
  "사항",
  "관련",
  "위한",
  "통한",
  "해당",
  "이행",
  "확인",
  "관리",
]);

const KOREAN_PARTICLE_SUFFIX = /(으로써|으로서|에서의|까지의|부터의|에게서|으로|에서|까지|부터|에게|보다|처럼|마다|라도|조차|만|도|과|와|의|은|는|이|가|을|를|에)$/u;
const KOREAN_VERB_SUFFIX = /(하였다|했습니다|하십시오|하도록|하도록|하여야|해야|했다|한다|하는|하며|하고|하라|해라|됨|되는|되다|된|시킨|시키|한다면|중인|중)$/u;

const ACTION_TOKEN_HINT = /(중지|정지|중단|차단|통제|격리|점검|검사|검증|측정|감시|기록|보고|작성|설치|배치|유지|정비|보수|수리|교체|허가|승인|교육|훈련|브리핑|전파|개선|보완|lockout|tagout|inspect|check|verify|measure|monitor|record|report|install|repair|replace|permit|approve|train|brief)/iu;
const EQUIPMENT_TOKEN_HINT = /(장비|설비|기계|기구|보호구|안전모|안전대|난간|방호|차단기|배전반|검지기|센서|환풍기|송풍기|소화기|지게차|크레인|고소작업대|forklift|crane|lift|sensor|detector|panel|breaker|fan|blower|extinguisher|harness|guardrail)/iu;
const PLACE_TOKEN_HINT = /(장소|구역|구간|통로|출입|작업장|현장|맨홀|탱크|비계|발판|옥상|사다리|계단|라인|공정|야드|적재|하역|dock|yard|line|zone|area|platform|scaffold|roof|pit|vessel|confined)/iu;

const HAZARD_FACTOR_RULES: CanonicalRule[] = [
  { canonical: "fall", patterns: [/추락|떨어|고소|고공|난간|비계|발판|edge|fall|height/iu] },
  { canonical: "collapse", patterns: [/붕괴|무너|도괴|collapse/iu] },
  { canonical: "asphyxiation", patterns: [/질식|산소결핍|가스중독|confined|asphyxiation|suffocat/iu] },
  { canonical: "explosion_fire", patterns: [/폭발|화재|인화|점화|발화|flammable|fire|explosion|spark/iu] },
  { canonical: "electrical", patterns: [/감전|누전|전기|충전부|electr|arc|short/iu] },
  { canonical: "entanglement", patterns: [/끼임|말림|협착|회전체|roller|entangl|pinch|caught/iu] },
  { canonical: "cut", patterns: [/절단|절상|베임|날|cut|blade|shear/iu] },
  { canonical: "falling_object", patterns: [/낙하물|비래|낙하|떨어진 물체|flying object|falling object|dropped object/iu] },
  { canonical: "vehicle_collision", patterns: [/차량|이동장비|지게차|충돌|협착|forklift|vehicle|collision|struck by/iu] },
  { canonical: "chemical", patterns: [/화학|유해물질|증기|가스|누출|msds|chemical|toxic|vapor|fume/iu] },
  { canonical: "noise_dust_repeat", patterns: [/소음|분진|반복작업|진동|dust|noise|repetitive/iu] },
];

const WORK_ACTION_RULES: CanonicalRule[] = [
  { canonical: "isolate_control", patterns: [/중지|정지|중단|차단|통제|격리|출입금지|shutdown|isolat|lockout|tagout/iu] },
  { canonical: "inspect_verify", patterns: [/점검|검사|검증|확인|체크|진단|inspect|check|verify|audit|review/iu] },
  { canonical: "measure_monitor", patterns: [/측정|계측|모니터|감시|농도측정|monitor|measure|detect|sampling/iu] },
  { canonical: "record_report", patterns: [/기록|보고|작성|신고|공유|document|record|report|log/iu] },
  { canonical: "install_setup", patterns: [/설치|배치|세팅|구성|setup|install|mount|place/iu] },
  { canonical: "repair_replace", patterns: [/정비|보수|수리|교체|repair|mainten|replace|overhaul/iu] },
  { canonical: "permit_approval", patterns: [/허가|승인|작업허가|재개허용|permit|approve|authorization/iu] },
  { canonical: "training_briefing", patterns: [/교육|훈련|브리핑|전파|drill|training|briefing|coaching/iu] },
  { canonical: "improve_prevent", patterns: [/개선|보완|개정|재발방지|prevent|improve|enhance|mitigate/iu] },
];

const EQUIPMENT_RULES: CanonicalRule[] = [
  { canonical: "ppe", patterns: [/보호구|안전모|보안경|안전대|호흡보호구|마스크|장갑|helmet|goggle|ppe|respirator|harness/iu] },
  { canonical: "guard_barrier", patterns: [/안전난간|난간|방호망|방호울|차단막|울타리|guardrail|barrier|guard|fence/iu] },
  { canonical: "gas_detector", patterns: [/가스검지기|검지기|센서|detector|sensor|gas monitor/iu] },
  { canonical: "ventilation", patterns: [/환기|환풍기|송풍기|배기|ventilat|blower|fan|exhaust/iu] },
  { canonical: "vehicle_lift", patterns: [/지게차|크레인|호이스트|리프트|고소작업대|forklift|crane|hoist|boom lift|scissor lift/iu] },
  { canonical: "electrical_panel", patterns: [/차단기|배전반|스위치기어|절연장치|breaker|panel|switchgear/iu] },
  { canonical: "fire_control", patterns: [/소화기|소화설비|소화전|extinguisher|sprinkler|hydrant/iu] },
];

const PLACE_RULES: CanonicalRule[] = [
  { canonical: "confined_space", patterns: [/밀폐|한정공간|협소공간|맨홀|탱크|pit|silo|vessel|confined/iu] },
  { canonical: "height_area", patterns: [/고소|고공|옥상|비계|발판|사다리|edge|height|roof|scaffold|platform/iu] },
  { canonical: "access_passage", patterns: [/출입구|출입|통로|비상구|계단|entrance|exit|egress|access|passage/iu] },
  { canonical: "machine_zone", patterns: [/기계실|설비실|라인|공정구간|작업구역|machine room|line|bay|zone/iu] },
  { canonical: "logistics_yard", patterns: [/적재|하역|물류|야드|도크|loading|unloading|yard|dock/iu] },
];

function normalizeSpace(text?: string) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCompact(text?: string) {
  return normalizeSpace(text).toLowerCase().replace(/\s+/g, "");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function stemToken(token: string) {
  const cleaned = normalizeSpace(token);
  if (!cleaned) {
    return "";
  }

  let next = cleaned;
  next = next.replace(KOREAN_PARTICLE_SUFFIX, "");
  next = next.replace(KOREAN_VERB_SUFFIX, "");
  return next.trim();
}

function tokenize(text?: string) {
  return normalizeSpace(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(" ")
    .map((token) => stemToken(token))
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !DOMAIN_STOPWORDS.has(token));
}

function toPhraseCandidates(rawTokens: string[]) {
  const tokens = unique(rawTokens.map((token) => token.trim()).filter(Boolean));
  const candidates = [...tokens];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    candidates.push(`${tokens[index]} ${tokens[index + 1]}`.trim());
  }
  return unique(candidates);
}

function matchCanonicalRule(text: string, rules: CanonicalRule[]) {
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.canonical;
    }
  }
  return "";
}

function collectHazardTypeAnchors(texts: string[]) {
  const anchors = new Set<string>();
  for (const text of texts) {
    const normalizedType = normalizeHazardType(text, text);
    if (normalizedType) {
      anchors.add(`type:${normalizeCompact(normalizedType)}`);
    }
  }
  return anchors;
}

function collectHazardFactorAnchors(texts: string[]) {
  const anchors = new Set<string>();
  const tokens = toPhraseCandidates(texts.flatMap((text) => tokenize(text)));
  for (const token of tokens) {
    const fromType = normalizeHazardType(token, token);
    if (fromType) {
      anchors.add(`factor:${normalizeCompact(fromType)}`);
      continue;
    }

    const canonical = matchCanonicalRule(token, HAZARD_FACTOR_RULES);
    if (canonical) {
      anchors.add(`factor:${canonical}`);
    }
  }
  return anchors;
}

function collectDomainAnchors(
  texts: string[],
  rules: CanonicalRule[],
  looseGuard: RegExp,
  prefix: string,
) {
  const anchors = new Set<string>();
  const tokens = toPhraseCandidates(texts.flatMap((text) => tokenize(text)));

  for (const token of tokens) {
    const canonical = matchCanonicalRule(token, rules);
    if (canonical) {
      anchors.add(`${prefix}:${canonical}`);
      continue;
    }

    if (token.length >= 3 && looseGuard.test(token)) {
      anchors.add(`${prefix}:${normalizeCompact(token)}`);
    }
  }

  // Fallback: if domain-specific hints fail, keep lexical anchors so
  // semantically equivalent expressions can still be matched by token overlap.
  if (anchors.size === 0) {
    for (const token of tokens) {
      const compact = normalizeCompact(token);
      if (compact.length < 3) {
        continue;
      }
      anchors.add(`${prefix}:${compact}`);
      if (anchors.size >= 12) {
        break;
      }
    }
  }

  return anchors;
}

function buildEmptyAnchorSet(): IncidentAnchorSet {
  return {
    accident_type: new Set<string>(),
    hazard_factor: new Set<string>(),
    work_action: new Set<string>(),
    equipment: new Set<string>(),
    place: new Set<string>(),
  };
}

function mergeAnchorSets(target: Set<string>, values: Set<string>) {
  for (const value of values) {
    target.add(value);
  }
}

export function buildIncidentAnchorSet(input: IncidentAnchorContextInput): IncidentAnchorSet {
  const anchors = buildEmptyAnchorSet();
  const csvTokens = buildCsvEnhancementTokens({
    taskName: normalizeSpace(input.taskName),
    profile: {
      industry: normalizeSpace(input.profile.industry),
      workLocation: normalizeSpace(input.profile.workLocation),
      equipment: (input.profile.equipment ?? []).map((item) => normalizeSpace(item)).filter(Boolean),
      hazards: (input.profile.hazards ?? []).map((hazard) => ({
        name: normalizeSpace(hazard.name),
        weight: hazard.weight ?? 0,
      })),
    },
  });

  const baseTexts = [
    normalizeSpace(input.taskName),
    normalizeSpace(input.taskDescription),
    normalizeSpace(input.analysisScenario),
    normalizeSpace(input.profile.industry),
    normalizeSpace(input.profile.workLocation),
  ].filter(Boolean);

  const hazardTexts = unique([
    ...baseTexts,
    ...(input.profile.hazards ?? []).flatMap((hazard) => [normalizeSpace(hazard.name), normalizeSpace(hazard.type)]),
  ]);
  const hazardTypeFromProfile = normalizeHazardTypeList(
    (input.profile.hazards ?? []).flatMap((hazard) => [normalizeSpace(hazard.name), normalizeSpace(hazard.type)]),
  );
  for (const hazardType of hazardTypeFromProfile) {
    anchors.accident_type.add(`type:${normalizeCompact(hazardType)}`);
    anchors.hazard_factor.add(`factor:${normalizeCompact(hazardType)}`);
  }

  mergeAnchorSets(anchors.accident_type, collectHazardTypeAnchors(hazardTexts));
  mergeAnchorSets(anchors.hazard_factor, collectHazardFactorAnchors(hazardTexts));

  const workActionTexts = unique([
    ...baseTexts,
    ...csvTokens.processTokens,
    ...csvTokens.processReasons,
  ]);
  mergeAnchorSets(
    anchors.work_action,
    collectDomainAnchors(workActionTexts, WORK_ACTION_RULES, ACTION_TOKEN_HINT, "work"),
  );

  const equipmentTexts = unique([
    ...baseTexts,
    ...(input.profile.equipment ?? []).map((item) => normalizeSpace(item)),
    ...csvTokens.equipmentTokens,
    ...csvTokens.equipmentReasons,
  ]);
  mergeAnchorSets(
    anchors.equipment,
    collectDomainAnchors(equipmentTexts, EQUIPMENT_RULES, EQUIPMENT_TOKEN_HINT, "equip"),
  );

  const placeTexts = unique([
    ...baseTexts,
    normalizeSpace(input.profile.workLocation),
    ...csvTokens.processTokens,
    ...csvTokens.industryHintTokens,
  ]);
  mergeAnchorSets(
    anchors.place,
    collectDomainAnchors(placeTexts, PLACE_RULES, PLACE_TOKEN_HINT, "place"),
  );

  return anchors;
}

export function buildLawActionAnchorSet(item: LawActionItem): IncidentAnchorSet {
  const anchors = buildEmptyAnchorSet();
  const lawTexts = unique([
    normalizeSpace(item.actionText),
    normalizeSpace(item.legalRequirement),
    normalizeSpace(item.clausePreview),
    normalizeSpace(item.actionNeedReason),
    normalizeSpace(item.applicabilityReason),
    normalizeSpace(item.lawName),
    normalizeSpace(item.legalBasis),
    normalizeSpace(item.articleTitle),
  ]);

  mergeAnchorSets(anchors.accident_type, collectHazardTypeAnchors(lawTexts));
  mergeAnchorSets(anchors.hazard_factor, collectHazardFactorAnchors(lawTexts));
  mergeAnchorSets(
    anchors.work_action,
    collectDomainAnchors(lawTexts, WORK_ACTION_RULES, ACTION_TOKEN_HINT, "work"),
  );
  mergeAnchorSets(
    anchors.equipment,
    collectDomainAnchors(lawTexts, EQUIPMENT_RULES, EQUIPMENT_TOKEN_HINT, "equip"),
  );
  mergeAnchorSets(
    anchors.place,
    collectDomainAnchors(lawTexts, PLACE_RULES, PLACE_TOKEN_HINT, "place"),
  );

  return anchors;
}

function isLooseTokenMatch(left: string, right: string) {
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  if (left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))) {
    return true;
  }
  return false;
}

function matchAnchorsByDomain(left: Set<string>, right: Set<string>) {
  const rightValues = [...right];
  const matched = new Set<string>();

  for (const anchor of left) {
    if (rightValues.some((candidate) => isLooseTokenMatch(anchor, candidate))) {
      matched.add(anchor);
    }
  }

  return [...matched].slice(0, 6);
}

export function evaluateIncidentLawAnchorGate(
  input: IncidentAnchorContextInput,
  item: LawActionItem,
  prebuiltIncidentAnchors?: IncidentAnchorSet,
): IncidentLawAnchorGateResult {
  const incidentAnchors = prebuiltIncidentAnchors ?? buildIncidentAnchorSet(input);
  const lawAnchors = buildLawActionAnchorSet(item);

  const matched: Record<IncidentAnchorDomain, string[]> = {
    accident_type: matchAnchorsByDomain(incidentAnchors.accident_type, lawAnchors.accident_type),
    hazard_factor: matchAnchorsByDomain(incidentAnchors.hazard_factor, lawAnchors.hazard_factor),
    work_action: matchAnchorsByDomain(incidentAnchors.work_action, lawAnchors.work_action),
    equipment: matchAnchorsByDomain(incidentAnchors.equipment, lawAnchors.equipment),
    place: matchAnchorsByDomain(incidentAnchors.place, lawAnchors.place),
  };

  const hasAccidentHazardMatch = matched.accident_type.length > 0 || matched.hazard_factor.length > 0;
  const hasOperationalMatch = matched.work_action.length > 0 || matched.equipment.length > 0 || matched.place.length > 0;

  return {
    incidentAnchors,
    lawAnchors,
    matched,
    hasAccidentHazardMatch,
    hasOperationalMatch,
  };
}
