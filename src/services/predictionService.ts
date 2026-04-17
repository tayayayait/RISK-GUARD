import { generateGeminiTextWithFallback } from "@/services/geminiTextModelFallback";
import { recognizePredictionContext } from "@/services/predictionContextService";
import type { PredictionRecognizedContext } from "@/services/predictionContextService";

export type { PredictionRecognizedContext } from "@/services/predictionContextService";

export interface PredictionScenario {
  id: string;
  accidentType: string;
  riskLocation: string;
  reason: string;
  immediateAction: string;
  detail: string;
}

interface ScenarioCore {
  accidentType: string;
  riskLocation: string;
  reason: string;
  immediateAction: string;
  detail: string;
}

export interface PredictionResult {
  scenarios: PredictionScenario[];
  machineContext?: string;
  rawResponseText?: string;
  recognizedContext?: PredictionRecognizedContext;
}

export type ScenarioImageQualityStatus = "pass" | "soft_fail";

export interface ScenarioImageGenerationResult {
  imageUrl: string;
  qualityStatus: ScenarioImageQualityStatus;
  qualityReasons: string[];
}

export interface GeminiInlineDataPart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export interface GeminiTextPart {
  text: string;
}

export type GeminiContentPart = GeminiTextPart | GeminiInlineDataPart;

type HeuristicQualityDecision = ScenarioImageQualityStatus | "ambiguous";

interface HeuristicQualityResult {
  decision: HeuristicQualityDecision;
  score: number;
  reasons: string[];
  hasHazardSource: boolean;
  hasExposurePath: boolean;
  hasAccidentDirection: boolean;
  hasImmediateActionCue: boolean;
  hasInjuryBodyPartCue: boolean;
}

interface ScenarioImageQualityAssessment {
  qualityStatus: ScenarioImageQualityStatus;
  qualityReasons: string[];
  score: number;
  maxScore: number;
  criterionFlags?: ScenarioImageQualityCriterionFlags;
}

interface ScenarioImageQualityCriterionFlags {
  hazardSourceVisible?: boolean | null;
  workerExposurePathVisible?: boolean | null;
  accidentDirectionVisible?: boolean | null;
  immediateActionCueVisible?: boolean | null;
  injuryBodyPartVisible?: boolean | null;
  preIncidentMomentVisible?: boolean | null;
  noReadableText?: boolean | null;
  scaleConsistencyVisible?: boolean | null;
  equipmentContextAligned?: boolean | null;
  mechanismSalienceVisible?: boolean | null;
  typeDiscriminatorVisible?: boolean | null;
  hazardHotspotSalienceVisible?: boolean | null;
  injuryBodyPartEmphasisVisible?: boolean | null;
  trajectoryVectorVisible?: boolean | null;
  immediateActionPointVisible?: boolean | null;
}

interface EvaluateScenarioImageQualityInput {
  scenario: PredictionScenario;
  recognizedContext: PredictionRecognizedContext;
  judgeImageQuality?: () => Promise<ScenarioImageQualityAssessment | null>;
}

const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const FALLBACK_GEMINI_IMAGE_MODELS = [
  "gemini-3.1-flash-image-preview",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
];
const MAX_IMAGE_MODEL_CANDIDATES = 2;
const MAX_SCENARIO_IMAGE_ATTEMPTS = 3;
type HardQualityFlagKey =
  | "equipmentContextAligned"
  | "mechanismSalienceVisible"
  | "typeDiscriminatorVisible"
  | "hazardHotspotSalienceVisible"
  | "injuryBodyPartEmphasisVisible"
  | "trajectoryVectorVisible"
  | "immediateActionPointVisible";

const DEFAULT_SCENARIO_COUNT = 3;

export type AccidentTypeKey =
  | "caughtIn"
  | "pinch"
  | "cutting"
  | "laceration"
  | "puncture"
  | "collision"
  | "struckAgainst"
  | "struckBy"
  | "fallingFlyingObject"
  | "fallFromHeight"
  | "slipTrip"
  | "electricShock"
  | "burn"
  | "explosion"
  | "fire"
  | "buried"
  | "crushing"
  | "collapse";

interface AccidentTypeRule {
  key: AccidentTypeKey;
  koLabel: string;
  mechanismKey: string;
  aliases: string[];
  mustHave: string[];
  mustNotHave: string[];
  salience: string[];
}

const ACCIDENT_TYPE_RULES: Record<AccidentTypeKey, AccidentTypeRule> = {
  caughtIn: {
    key: "caughtIn",
    koLabel: "끼임",
    mechanismKey: "entanglement",
    aliases: ["끼임", "말림", "entanglement", "caught in", "caught-in", "entangled"],
    mustHave: [
      "narrowing entry gap near rotating/translating machine parts",
      "worker body part entering entanglement envelope",
    ],
    mustNotHave: [
      "wide-distance shot where entry gap geometry is unreadable",
      "scene dominated by falling-object trajectory without entanglement cue",
    ],
    salience: ["show entry gap and limb approach in one frame"],
  },
  pinch: {
    key: "pinch",
    koLabel: "협착",
    mechanismKey: "pinch-compression",
    aliases: ["협착", "pinch", "pinched", "pinch point", "squeeze", "between objects"],
    mustHave: [
      "converging surfaces compressing toward a body part",
      "insufficient clearance between moving and fixed components",
    ],
    mustNotHave: [
      "sharp-edge cutting as the primary mechanism",
      "impact-only scene without compression geometry",
    ],
    salience: ["make compression direction and clearance loss explicit"],
  },
  cutting: {
    key: "cutting",
    koLabel: "절단",
    mechanismKey: "blade-sever",
    aliases: ["절단", "절상", "amputation", "sever", "severed", "cut-off"],
    mustHave: [
      "active blade/cutting edge contact zone",
      "imminent severing path toward exposed body part",
    ],
    mustNotHave: [
      "generic collision without blade-edge evidence",
      "burn/arc as dominant hazard source",
    ],
    salience: ["keep blade edge, contact zone, and threatened limb simultaneously visible"],
  },
  laceration: {
    key: "laceration",
    koLabel: "베임",
    mechanismKey: "sharp-edge",
    aliases: ["베임", "열상", "laceration", "slash", "slice", "sharp edge cut"],
    mustHave: [
      "sharp edge exposure at worker touch path",
      "glove/protection gap or direct skin-contact risk near edge",
    ],
    mustNotHave: [
      "high-force compression as primary cue",
      "falling-object strike dominating scene",
    ],
    salience: ["emphasize edge orientation and hand travel path"],
  },
  puncture: {
    key: "puncture",
    koLabel: "찔림",
    mechanismKey: "penetration",
    aliases: ["찔림", "자상", "puncture", "pierce", "stab", "impale", "nail puncture"],
    mustHave: [
      "pointed object aligned toward body-part penetration path",
      "short-distance thrust or inadvertent contact trajectory",
    ],
    mustNotHave: [
      "flat-surface collision without pointed-object cue",
      "thermal/electrical cues as dominant mechanism",
    ],
    salience: ["keep tip direction and body-part line-of-contact clear"],
  },
  collision: {
    key: "collision",
    koLabel: "충돌",
    mechanismKey: "path-intersection",
    aliases: ["충돌", "collision", "crash", "equipment collision", "path crossing", "intersecting path"],
    mustHave: [
      "intersecting motion paths of worker and moving equipment/load",
      "insufficient stopping margin before contact",
    ],
    mustNotHave: [
      "single static object impact without crossing trajectories",
      "pinch-gap compression as dominant cue",
    ],
    salience: ["show path crossing vectors with imminent overlap"],
  },
  struckAgainst: {
    key: "struckAgainst",
    koLabel: "부딪힘",
    mechanismKey: "fixed-object-impact",
    aliases: ["부딪힘", "struck against", "hit against", "bump", "contact with fixed object"],
    mustHave: [
      "worker motion toward fixed obstacle/structure edge",
      "body posture indicating imminent impact with static object",
    ],
    mustNotHave: [
      "flying-object strike as primary cue",
      "moving-machine collision path as dominant cue",
    ],
    salience: ["keep fixed obstacle edge and worker trajectory aligned"],
  },
  struckBy: {
    key: "struckBy",
    koLabel: "맞음",
    mechanismKey: "object-strike",
    aliases: ["맞음", "struck by flying object", "struck by", "hit by", "impacted by", "object strike"],
    mustHave: [
      "moving object trajectory toward worker impact zone",
      "worker defensive posture before impact",
    ],
    mustNotHave: [
      "worker moving into fixed object as primary cue",
      "pure pinch/cutting geometry without incoming object vector",
    ],
    salience: ["make incoming object vector unmistakable"],
  },
  fallingFlyingObject: {
    key: "fallingFlyingObject",
    koLabel: "낙하·비래",
    mechanismKey: "falling-flying-path",
    aliases: ["낙하", "비래", "낙하물", "비래물", "falling object", "flying object", "debris"],
    mustHave: [
      "object ejection/drop origin and trajectory line",
      "worker exposure zone directly under or in front of trajectory",
    ],
    mustNotHave: [
      "object already landed/impact completed aftermath",
      "no clear origin point for moving debris",
    ],
    salience: ["show origin, flight/drop path, and worker location in one frame"],
  },
  fallFromHeight: {
    key: "fallFromHeight",
    koLabel: "추락",
    mechanismKey: "vertical-fall",
    aliases: ["추락", "fall from height", "high-place fall", "falling from platform", "drop from height"],
    mustHave: [
      "edge/height context with visible loss-of-support posture",
      "vertical drop risk path from worker center-of-gravity",
    ],
    mustNotHave: [
      "same-level slip without height differential",
      "object-strike cues dominating over fall risk",
    ],
    salience: ["show edge, void space, and unstable balance at once"],
  },
  slipTrip: {
    key: "slipTrip",
    koLabel: "넘어짐",
    mechanismKey: "same-level-fall",
    aliases: ["넘어짐", "전도", "미끄러짐", "걸려 넘어짐", "slip", "trip", "stumble", "same-level fall"],
    mustHave: [
      "surface hazard (oil, cable, obstacle) on travel path",
      "loss-of-balance posture with recovery failure cues",
    ],
    mustNotHave: [
      "height-edge fall as primary cue",
      "incoming-object impact as dominant cue",
    ],
    salience: ["show foot placement error and floor hazard contact"],
  },
  electricShock: {
    key: "electricShock",
    koLabel: "감전",
    mechanismKey: "electrical-contact",
    aliases: ["감전", "electric shock", "electrocution", "live wire", "arc shock", "통전"],
    mustHave: [
      "exposed energized source with worker proximity/contact route",
      "arc/spark or energized-contact visual cue",
    ],
    mustNotHave: [
      "mechanical impact-only scene without electrical source",
      "flame spread as primary mechanism",
    ],
    salience: ["bind energized source and worker contact path in one view"],
  },
  burn: {
    key: "burn",
    koLabel: "화상",
    mechanismKey: "thermal-contact",
    aliases: ["화상", "burn", "thermal burn", "scald", "hot surface", "hot splash"],
    mustHave: [
      "hot surface/splash source with heat transfer direction",
      "exposed body part or PPE gap near thermal source",
    ],
    mustNotHave: [
      "blast-pressure cues as dominant signature",
      "electrical source as primary mechanism",
    ],
    salience: ["show heat source and imminent thermal contact trajectory"],
  },
  explosion: {
    key: "explosion",
    koLabel: "폭발",
    mechanismKey: "blast-overpressure",
    aliases: ["폭발", "explosion", "blast", "detonation", "overpressure"],
    mustHave: [
      "pressurized/flammable source plus ignition trigger proximity",
      "early blast propagation direction before full aftermath",
    ],
    mustNotHave: [
      "small localized flame-only scene without blast context",
      "pure collision/cutting cues as dominant mechanism",
    ],
    salience: ["show ignition and pressure source linkage before escalation"],
  },
  fire: {
    key: "fire",
    koLabel: "화재",
    mechanismKey: "flame-propagation",
    aliases: ["화재", "fire", "ignition", "combustion", "flame spread"],
    mustHave: [
      "ignition source near combustible medium",
      "flame/smoke spread direction indicating escalation path",
    ],
    mustNotHave: [
      "blast overpressure signature dominating frame",
      "mechanical-only hazard with no ignition cue",
    ],
    salience: ["keep ignition point and spread path visible together"],
  },
  buried: {
    key: "buried",
    koLabel: "깔림",
    mechanismKey: "burial-under-load",
    aliases: ["깔림", "매몰", "buried", "engulfed", "covered by load", "trapped under"],
    mustHave: [
      "heavy load/material descending or settling onto worker zone",
      "worker escape path blocked by load footprint",
    ],
    mustNotHave: [
      "sharp-edge cut or puncture as primary cue",
      "lightweight debris-only impact without entrapment weight",
    ],
    salience: ["show load footprint and worker entrapment area clearly"],
  },
  crushing: {
    key: "crushing",
    koLabel: "압궤",
    mechanismKey: "high-force-crush",
    aliases: ["압궤", "압착", "crushing", "crushed", "squash", "compressed"],
    mustHave: [
      "high-force compression source (press/load/machine) toward body zone",
      "deforming clearance or force direction indicating severe crush risk",
    ],
    mustNotHave: [
      "low-force bump/contact without compression geometry",
      "fall-only posture with no compressive source",
    ],
    salience: ["prioritize force direction and compression envelope visibility"],
  },
  collapse: {
    key: "collapse",
    koLabel: "붕괴",
    mechanismKey: "structural-instability",
    aliases: ["붕괴", "collapse", "cave-in", "caving", "structural failure", "topple"],
    mustHave: [
      "structural instability cue (leaning, cracking, support failure)",
      "worker located within predicted collapse path",
    ],
    mustNotHave: [
      "single-object strike without structure failure context",
      "stable structure with unrelated hazard emphasis",
    ],
    salience: ["show failing support path and worker exposure corridor"],
  },
};

const ACCIDENT_TYPE_PRIORITY: AccidentTypeKey[] = [
  "explosion",
  "fire",
  "electricShock",
  "collapse",
  "crushing",
  "buried",
  "fallFromHeight",
  "fallingFlyingObject",
  "collision",
  "struckBy",
  "struckAgainst",
  "caughtIn",
  "pinch",
  "cutting",
  "laceration",
  "puncture",
  "burn",
  "slipTrip",
];

const HARD_QUALITY_FLAG_REASON_LABELS: Record<HardQualityFlagKey, string> = {
  equipmentContextAligned: "equipment context alignment",
  mechanismSalienceVisible: "mechanism salience",
  typeDiscriminatorVisible: "accident-type discriminator",
  hazardHotspotSalienceVisible: "hazard hotspot salience",
  injuryBodyPartEmphasisVisible: "injury-body-part emphasis",
  trajectoryVectorVisible: "trajectory vector clarity",
  immediateActionPointVisible: "immediate-action point visibility",
};

const HARD_QUALITY_FLAG_HINTS: Record<HardQualityFlagKey, string> = {
  equipmentContextAligned: "Lock recognized equipment identity, hazard parts, and operation context as fixed anchors in one frame.",
  mechanismSalienceVisible: "Strengthen mechanism visibility: source -> worker exposure -> imminent trajectory must be traceable at first glance.",
  typeDiscriminatorVisible: "Increase accident-type discriminator cues and remove conflicting visual signals from other accident types.",
  hazardHotspotSalienceVisible: "Make the exact hazard hotspot pop with contrast and boundary clarity so it dominates first glance.",
  injuryBodyPartEmphasisVisible: "Emphasize the injury-prone body part with clear posture/exposure relation to the hazard source.",
  trajectoryVectorVisible: "Reinforce a single dominant trajectory vector from hazard source toward worker exposure zone.",
  immediateActionPointVisible: "Place an actionable emergency response point (e-stop/isolation/escape route) in immediate reachable context.",
};

const HARD_QUALITY_FLAG_KEYS: HardQualityFlagKey[] = [
  "equipmentContextAligned",
  "mechanismSalienceVisible",
  "typeDiscriminatorVisible",
  "hazardHotspotSalienceVisible",
  "injuryBodyPartEmphasisVisible",
  "trajectoryVectorVisible",
  "immediateActionPointVisible",
];

const DEFAULT_RECOGNIZED_CONTEXT: PredictionRecognizedContext = {
  canonicalEquipment: "기계·설비 미상",
  operationContext: "기계·설비 취급 작업",
  hazardParts: ["moving parts", "worker approach path", "worker stance area"],
  sceneConstraints: [
    "설비 종류와 구조를 입력 맥락과 일치하게 유지하고 무관한 설비로 전환하지 않는다.",
    "위험 지점과 작업자 행동이 같은 프레임에서 인과관계로 보이도록 구성한다.",
    "사고유형은 보조 단서로만 반영하고 장면 구성 우선순위를 바꾸지 않는다.",
  ],
  confidence: "low",
  catalogEvidence: {
    primary: null,
    alternatives: [],
  },
};

const DEFAULT_FALLBACK_SCENARIOS: Array<Omit<PredictionScenario, "id">> = [
  {
    accidentType: "끼임/말림 사고",
    riskLocation: "설비 가동부 주변",
    reason: "가동 중인 설비 가까이에서 작업자 신체가 협착·말림 구간에 접근하면 끼임 위험이 높아집니다.",
    immediateAction: "설비를 즉시 정지하고 인터록과 방호장치 상태를 확인합니다.",
    detail: "설비 정지 및 전원 차단 후 위험구간 접근을 금지하고 방호장치를 먼저 복구합니다.",
  },
  {
    accidentType: "미끄러짐/넘어짐 사고",
    riskLocation: "통로 바닥 및 작업 발판",
    reason: "바닥 오염이나 정리되지 않은 자재로 발이 걸리거나 미끄러져 넘어질 위험이 있습니다.",
    immediateAction: "통로 장애물을 치우고 미끄럼 위험 구간을 즉시 통제합니다.",
    detail: "통로 정리와 바닥 청소를 먼저 완료한 뒤 작업을 재개합니다.",
  },
  {
    accidentType: "낙하물 충돌 사고",
    riskLocation: "상·하부 작업 구간 사이",
    reason: "상부에서 공구나 자재가 떨어지면 하부 작업자와 충돌할 위험이 크게 증가합니다.",
    immediateAction: "하부 접근을 즉시 차단하고 낙하물 방지 조치를 보강합니다.",
    detail: "작업 반경 통제와 자재·공구 고정 상태를 사전 점검합니다.",
  },
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function ensureShortSentence(value: string, maxLength = 90): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
}

function toScenarioField(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = ensureShortSentence(value);
  return normalized || fallback;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function stripCodeFence(rawText: string): string {
  return rawText
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
}

function findJsonSlice(text: string): string | null {
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1);
  }

  return null;
}

function readStringValue(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && normalizeWhitespace(value)) {
      return value;
    }
  }
  return undefined;
}

function getRawScenarioList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const candidates = ["scenarios", "scenarioList", "items", "data", "결과", "시나리오"];
    for (const key of candidates) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  return [];
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function buildAccidentTypeCueText(parts: string[]): string {
  return normalizeWhitespace(parts.join(" ")).toLowerCase();
}

export function normalizeAccidentTypeKey(parts: string[]): AccidentTypeKey | null {
  const pickBestKey = (cueText: string): AccidentTypeKey | null => {
    if (!cueText) {
      return null;
    }

    let bestMatch:
      | {
          key: AccidentTypeKey;
          score: number;
          longestAlias: number;
        }
      | null = null;

    for (const key of ACCIDENT_TYPE_PRIORITY) {
      const rule = ACCIDENT_TYPE_RULES[key];
      const matchedAliases = rule.aliases.filter((alias) => cueText.includes(alias.toLowerCase()));
      if (matchedAliases.length === 0) {
        continue;
      }
      const longestAlias = matchedAliases.reduce((longest, alias) => Math.max(longest, alias.length), 0);
      const score = matchedAliases.length;

      if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && longestAlias > bestMatch.longestAlias)) {
        bestMatch = { key, score, longestAlias };
      }
    }

    return bestMatch?.key ?? null;
  };

  const primaryText = buildAccidentTypeCueText([parts[0] ?? ""]);
  const primaryKey = pickBestKey(primaryText);
  if (primaryKey) {
    return primaryKey;
  }

  const fullCueText = buildAccidentTypeCueText(parts);
  return pickBestKey(fullCueText);
}

function resolveScenarioAccidentTypeRule(scenario: ScenarioCore): AccidentTypeRule | null {
  const key = normalizeAccidentTypeKey([
    scenario.accidentType,
    scenario.riskLocation,
    scenario.reason,
    scenario.detail,
  ]);
  return key ? ACCIDENT_TYPE_RULES[key] : null;
}

function getScenarioMechanismKey(scenario: ScenarioCore): string {
  const rule = resolveScenarioAccidentTypeRule(scenario);
  return rule?.mechanismKey ?? "generic";
}

function buildScenarioContactKey(scenario: ScenarioCore): string {
  return normalizeWhitespace(scenario.riskLocation)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 48);
}

function buildScenarioMechanismSignature(scenario: ScenarioCore): string {
  const rule = resolveScenarioAccidentTypeRule(scenario);
  const typeKey = rule?.key ?? "unknown";
  return `${typeKey}|${getScenarioMechanismKey(scenario)}|${buildScenarioContactKey(scenario)}`;
}

const HAZARD_SOURCE_KEYWORDS = [
  "blade",
  "cutting point",
  "cut point",
  "chip",
  "fragment",
  "chain",
  "hook",
  "pulley",
  "roller",
  "switch",
  "cable",
  "panel",
  "arc",
  "spark",
  "pinch point",
  "contact point",
  "live terminal",
  "energized part",
  "절단날",
  "회전체",
  "체인",
  "훅",
  "롤러",
  "전선",
  "활선",
  "협착점",
  "끼임점",
  "점화원",
  "가연물",
  "균열",
  "지지대",
];

const EXPOSURE_PATH_KEYWORDS = [
  "worker",
  "hand",
  "hands",
  "foot",
  "feet",
  "body",
  "posture",
  "exposure",
  "contact",
  "approach path",
  "stance",
  "reach",
  "leaning",
  "작업자",
  "접근",
  "노출",
  "자세",
  "상체",
  "하체",
  "손",
  "발",
  "팔",
  "다리",
];

const ACCIDENT_DIRECTION_KEYWORDS = [
  "trajectory",
  "kickback",
  "sliding",
  "moving toward",
  "toward worker",
  "impact path",
  "swing",
  "collision",
  "direction",
  "path",
  "travel path",
  "falling direction",
  "궤적",
  "비산",
  "낙하 방향",
  "충돌 경로",
  "회전 방향",
  "이동 경로",
  "진행 방향",
  "튐",
  "반발",
];

const IMMEDIATE_ACTION_CUE_KEYWORDS = [
  "emergency stop",
  "e-stop",
  "stop button",
  "power off",
  "isolate",
  "lockout",
  "tagout",
  "evacuate",
  "evacuation",
  "barrier",
  "safety rail",
  "harness",
  "ppe",
  "rescue",
  "shutdown",
  "switch off",
  "pressing",
  "press",
  "warning sign",
  "safe zone",
  "비상정지",
  "비상 정지",
  "전원 차단",
  "차단기",
  "격리",
  "대피",
  "안전구역",
  "후퇴",
  "이탈",
  "구조",
  "경고",
];

const INJURY_BODY_PART_KEYWORDS = [
  "hand",
  "finger",
  "arm",
  "forearm",
  "elbow",
  "shoulder",
  "head",
  "face",
  "eye",
  "neck",
  "chest",
  "torso",
  "waist",
  "back",
  "leg",
  "knee",
  "ankle",
  "foot",
  "toe",
  "body part",
  "vulnerable body part",
  "injury-prone body part",
  "손",
  "손가락",
  "팔",
  "전완",
  "머리",
  "얼굴",
  "눈",
  "목",
  "가슴",
  "몸통",
  "허리",
  "등",
  "다리",
  "무릎",
  "발목",
  "발",
  "신체",
  "부상 부위",
  "신체 부위",
];
function toQualityReason(label: string, satisfied: boolean): string {
  return satisfied ? `${label} signal confirmed` : `${label} signal missing`;
}

function mapHeuristicDecision(score: number): HeuristicQualityDecision {
  if (score >= 5) {
    return "pass";
  }
  if (score <= 2) {
    return "soft_fail";
  }
  return "ambiguous";
}

function getHardGateFailures(flags?: ScenarioImageQualityCriterionFlags): HardQualityFlagKey[] {
  if (!flags) {
    return [];
  }
  return HARD_QUALITY_FLAG_KEYS.filter((key) => flags[key] === false);
}

function applyHardQualityGate(quality: ScenarioImageQualityAssessment): ScenarioImageQualityAssessment {
  const hardGateFailures = getHardGateFailures(quality.criterionFlags);
  if (hardGateFailures.length === 0) {
    return quality;
  }

  const hardGateReasons = hardGateFailures.map((key) => `Hard gate failed: ${HARD_QUALITY_FLAG_REASON_LABELS[key]}.`);
  const existingReasons = quality.qualityReasons.map((reason) => normalizeWhitespace(reason)).filter(Boolean);
  const mergedReasons: string[] = [];
  for (const reason of [...existingReasons, ...hardGateReasons]) {
    if (mergedReasons.some((existing) => existing.toLowerCase() === reason.toLowerCase())) {
      continue;
    }
    mergedReasons.push(reason);
  }

  return {
    ...quality,
    qualityStatus: "soft_fail",
    qualityReasons: mergedReasons,
  };
}

function buildQualityCueText(
  scenario: PredictionScenario,
  recognizedContext: PredictionRecognizedContext,
): string {
  return normalizeWhitespace(
    [
      scenario.accidentType,
      scenario.riskLocation,
      scenario.reason,
      scenario.detail,
      recognizedContext.canonicalEquipment,
      recognizedContext.operationContext,
      recognizedContext.hazardParts.join(" "),
      recognizedContext.sceneConstraints.join(" "),
    ].join(" "),
  ).toLowerCase();
}

export function evaluateHazardVisibilityHeuristic(
  scenario: PredictionScenario,
  recognizedContext: PredictionRecognizedContext,
): HeuristicQualityResult {
  const cueText = buildQualityCueText(scenario, recognizedContext);
  const hasHazardSource = containsAny(cueText, HAZARD_SOURCE_KEYWORDS);
  const hasExposurePath = containsAny(cueText, EXPOSURE_PATH_KEYWORDS);
  const hasAccidentDirection = containsAny(cueText, ACCIDENT_DIRECTION_KEYWORDS);
  const hasImmediateActionCue = containsAny(cueText, IMMEDIATE_ACTION_CUE_KEYWORDS);
  const hasInjuryBodyPartCue = containsAny(cueText, INJURY_BODY_PART_KEYWORDS);

  const score = [
    hasHazardSource,
    hasExposurePath,
    hasAccidentDirection,
    hasImmediateActionCue,
    hasInjuryBodyPartCue,
  ].filter(Boolean).length;
  return {
    decision: mapHeuristicDecision(score),
    score,
    reasons: [
      toQualityReason("hazard source", hasHazardSource),
      toQualityReason("worker exposure path", hasExposurePath),
      toQualityReason("accident direction", hasAccidentDirection),
      toQualityReason("immediate action cue", hasImmediateActionCue),
      toQualityReason("injury-prone body part cue", hasInjuryBodyPartCue),
    ],
    hasHazardSource,
    hasExposurePath,
    hasAccidentDirection,
    hasImmediateActionCue,
    hasInjuryBodyPartCue,
  };
}

export async function evaluateScenarioImageQuality({
  scenario,
  recognizedContext,
  judgeImageQuality,
}: EvaluateScenarioImageQualityInput): Promise<ScenarioImageQualityAssessment> {
  const heuristic = evaluateHazardVisibilityHeuristic(scenario, recognizedContext);
  const resolvedAccidentType = normalizeAccidentTypeKey([
    scenario.accidentType,
    scenario.riskLocation,
    scenario.reason,
    scenario.detail,
  ]);
  const equipmentContextAligned =
    normalizeWhitespace(recognizedContext.canonicalEquipment).length > 0
    && normalizeWhitespace(recognizedContext.operationContext).length > 0;
  const mechanismSalienceVisible = heuristic.hasHazardSource && heuristic.hasExposurePath && heuristic.hasAccidentDirection;
  const typeDiscriminatorVisible = resolvedAccidentType !== null;
  const heuristicCriterionFlags: ScenarioImageQualityCriterionFlags = {
    hazardSourceVisible: heuristic.hasHazardSource,
    workerExposurePathVisible: heuristic.hasExposurePath,
    accidentDirectionVisible: heuristic.hasAccidentDirection,
    immediateActionCueVisible: heuristic.hasImmediateActionCue,
    injuryBodyPartVisible: heuristic.hasInjuryBodyPartCue,
    equipmentContextAligned,
    mechanismSalienceVisible,
    typeDiscriminatorVisible,
    hazardHotspotSalienceVisible: heuristic.hasHazardSource,
    injuryBodyPartEmphasisVisible: heuristic.hasInjuryBodyPartCue,
    trajectoryVectorVisible: heuristic.hasAccidentDirection,
    immediateActionPointVisible: heuristic.hasImmediateActionCue,
  };

  if (judgeImageQuality) {
    try {
      const judged = await judgeImageQuality();
      if (judged) {
        return applyHardQualityGate(judged);
      }
    } catch (error: unknown) {
      console.warn("[predictionService] Hybrid quality gate judge failed. Falling back to heuristic decision.", error);
    }
  }

  if (heuristic.decision === "pass" || heuristic.decision === "soft_fail") {
    return applyHardQualityGate({
      qualityStatus: heuristic.decision,
      qualityReasons: heuristic.reasons,
      score: heuristic.score,
      maxScore: 5,
      criterionFlags: heuristicCriterionFlags,
    });
  }

  return applyHardQualityGate({
    qualityStatus: "soft_fail",
    qualityReasons: ["Heuristic boundary-case fallback triggered: injury-body-part visibility requires strict re-evaluation."],
    score: heuristic.score,
    maxScore: 5,
    criterionFlags: heuristicCriterionFlags,
  });
}
function buildHazardEventVisualDirectives(
  scenario: PredictionScenario,
  recognizedContext: PredictionRecognizedContext,
): string[] {
  const cueText = normalizeWhitespace(
    [
      scenario.accidentType,
      scenario.riskLocation,
      scenario.reason,
      scenario.detail,
      recognizedContext.operationContext,
      recognizedContext.hazardParts.join(" "),
    ].join(" "),
  ).toLowerCase();

  const directives = new Set<string>([
    "- Do not stop at a static working pose; make the imminent hazard mechanism visually explicit.",
    "- Show hazard source, worker posture, and impact path in one frame.",
    "- Avoid symbolic warning-only depictions; include physically plausible motion cues.",
  ]);

    const cuttingKeywords = [
    "cut",
    "cutter",
    "saw",
    "blade",
    "chip",
    "fragment",
    "kickback",
    "cutting",
  ];

  const craneKeywords = [
    "crane",
    "hoist",
    "chain block",
    "manual crane",
    "chain",
    "hook",
    "lifting",
  ];

  const electricalKeywords = [
    "arc",
    "spark",
    "switch",
    "cable",
    "electrical",
    "live wire",
    "panel",
  ];

  if (containsAny(cueText, cuttingKeywords)) {
    directives.add("- Render flying chips or blade fragments with visible trajectories originating from the cutting point.");
    directives.add("- Show the workpiece sliding or kicking back from rotational force at the same moment.");
    directives.add("- Keep the blade edge, contact point, and worker exposure path unobstructed.");
  }

  if (containsAny(cueText, craneKeywords)) {
    directives.add("- Keep chain, hook, and load all visible and show tension or swing direction as imminent impact risk.");
  }

  if (containsAny(cueText, electricalKeywords)) {
    directives.add("- Depict arc/spark discharge path and the worker contact route in the same frame.");
  }

  return [...directives].slice(0, 8);
}

function buildAccidentTypeRiskSalienceDirectives(scenario: PredictionScenario): string[] {
  const directives = new Set<string>([
    "- Keep risk intensity realistic and immediate, but avoid exaggerated or graphic injury depiction.",
  ]);

  const typeRule = resolveScenarioAccidentTypeRule(scenario);
  if (typeRule) {
    directives.add(`- Target accident-type anchor: ${typeRule.koLabel}.`);
    for (const salience of typeRule.salience) {
      directives.add(`- ${salience}.`);
    }
  }

  return [...directives].slice(0, 6);
}

function dedupeScenarioPool(scenarios: Array<Omit<PredictionScenario, "id">>): Array<Omit<PredictionScenario, "id">> {
  const deduped: Array<Omit<PredictionScenario, "id">> = [];
  for (const scenario of scenarios) {
    const signature = buildScenarioMechanismSignature(scenario);
    if (deduped.some((item) => buildScenarioMechanismSignature(item) === signature)) {
      continue;
    }
    deduped.push(scenario);
  }
  return deduped;
}

function buildCraneFallbackScenarios(equipmentLabel: string): Array<Omit<PredictionScenario, "id">> {
  return [
    {
      accidentType: "끼임 사고",
      riskLocation: "chain, hook, and worker approach gap",
      reason: `${equipmentLabel} 조작 중 체인 인장 구간에 신체가 들어가면 끼임 위험이 즉시 발생할 수 있습니다.`,
      immediateAction: "인양 동작을 즉시 중단하고 체인 체결·긴장 상태와 접근거리를 확인합니다.",
      detail: "체인블록 본체와 체인 이동부가 같은 작업면에서 보이도록 통제하고, 비정상 인장 상태를 먼저 해소합니다.",
    },
    {
      accidentType: "낙하물 충돌 사고",
      riskLocation: "인양 하중 하부 작업반경",
      reason: "체결 불량 또는 편하중 상태에서 하중이 흔들리거나 이탈하면 하부 작업자와 충돌할 수 있습니다.",
      immediateAction: "하중 하부 접근을 즉시 차단하고 체결 상태와 균형 상태를 재조정합니다.",
      detail: "신호수 확인 전에는 인양 재개를 금지하고, 하중 흔들림이 멈출 때까지 대기합니다.",
    },
    {
      accidentType: "충돌 사고",
      riskLocation: "인양물 이동 경로와 작업자 동선 교차 구간",
      reason: "하중 이동 경로에서 작업자 동선이 겹치면 인양물 측면 충돌 위험이 커집니다.",
      immediateAction: "동선을 즉시 분리하고 이동 경로 유도자를 배치해 일방통행으로 통행시킵니다.",
      detail: "막연한 관찰이 아닌 근거리에서 하중·작업자 위치를 동시 확인하는 구도로 작업을 통제합니다.",
    },
  ];
}

function buildCuttingFallbackScenarios(equipmentLabel: string): Array<Omit<PredictionScenario, "id">> {
  return [
    {
      accidentType: "절단/베임 사고",
      riskLocation: "절단날과 재료 투입구 주변",
      reason: `${equipmentLabel} 사용 중 재료를 밀어 넣는 동작에서 손이 절단 위험구역에 접근할 수 있습니다.`,
      immediateAction: "비상정지 스위치 사용 여부와 손·재료 접근거리를 즉시 확인합니다.",
      detail: "절단부 정지 확인 전에는 칩 제거·자재 정렬 동작을 금지합니다.",
    },
    {
      accidentType: "비래물 충돌 사고",
      riskLocation: "절단부 전면 배출구 정면 높이",
      reason: "고정이 불안정한 재료를 절단하면 파편이 고속으로 튀어 신체를 직접 타격할 수 있습니다.",
      immediateAction: "안면보호구 착용 상태를 확인하고 배출 정면 접근을 즉시 제한합니다.",
      detail: "재료 고정 상태가 확인될 때까지 절단 동작을 재개하지 않습니다.",
    },
    {
      accidentType: "끼임/말림 사고",
      riskLocation: "구동 롤러 인입부",
      reason: "회전 가동부 인입부에 소매나 장갑이 말려들면 연속된 신체 끌림으로 이어질 수 있습니다.",
      immediateAction: "전원을 차단하고 방호덮개 및 인터록 체결 상태를 즉시 확인합니다.",
      detail: "잠금표시 해제 완료 전에는 인입부 접근 작업을 허용하지 않습니다.",
    },
  ];
}

function buildElectricalFallbackScenarios(equipmentLabel: string): Array<Omit<PredictionScenario, "id">> {
  return [
    {
      accidentType: "감전 사고",
      riskLocation: "충전부 노출 배선과 단자 주변",
      reason: `${equipmentLabel} 조작 중 절연 손상 구간에 접촉하면 감전 위험이 즉시 발생할 수 있습니다.`,
      immediateAction: "메인 차단 및 무전압 확인과 절연장갑 착용 상태를 즉시 점검합니다.",
      detail: "무전압 확인 전에는 커버 분해·배선 접촉 작업을 진행하지 않습니다.",
    },
    {
      accidentType: "아크/화재 사고",
      riskLocation: "차단기 접속부와 열화 흔적 구간",
      reason: "접속 불량 상태에서 아크가 발생하면 국부 과열로 화재 위험이 급격히 증가합니다.",
      immediateAction: "전원을 차단하고 접속부 체결 상태와 열화 흔적을 즉시 점검합니다.",
      detail: "열화 부품 교체 전까지 전원 투입을 금지합니다.",
    },
    {
      accidentType: "미끄러짐/넘어짐 사고",
      riskLocation: "전기실 누수 바닥 구간",
      reason: "젖은 바닥에서 균형을 잃으면 2차로 충전부 접촉 위험이 커집니다.",
      immediateAction: "누수 구역을 통제하고 절연 매트 배치 및 건조 상태를 확인합니다.",
      detail: "바닥 건조와 접근 통제가 완료될 때까지 전기 조작 작업을 중지합니다.",
    },
  ];
}

function buildGenericFallbackScenarios(context: PredictionRecognizedContext): Array<Omit<PredictionScenario, "id">> {
  const equipmentLabel = context.canonicalEquipment || "기계·설비";
  const hazardA = context.hazardParts[0] ?? "moving parts";
  const hazardB = context.hazardParts[1] ?? "작업자 접근 위치";
  const hazardC = context.hazardParts[2] ?? "작업자 발판 위치";

  return [
    {
      accidentType: "접촉 사고",
      riskLocation: hazardA,
      reason: `${equipmentLabel} 작업 중 ${hazardA} 근처에서 작업자 신체가 직접 접촉할 위험이 있습니다.`,
      immediateAction: "작업을 멈추고 보호장치와 접근 통제 상태를 즉시 확인합니다.",
      detail: "위험부 접근 동작을 분리하고 안전거리 기준을 충족한 뒤 작업을 재개합니다.",
    },
    {
      accidentType: "끼임/협착 사고",
      riskLocation: hazardB,
      reason: `${hazardB} 구간에서 비정상 동작이 발생하면 협착 위험이 급격히 증가합니다.`,
      immediateAction: "동작을 중단하고 비상정지 장치와 인터록 상태를 즉시 점검합니다.",
      detail: "복구 완료 전에는 반복 동작을 재개하지 않고 접근 인원을 최소화합니다.",
    },
    {
      accidentType: "넘어짐·충돌 사고",
      riskLocation: hazardC,
      reason: `${hazardC} 부근에서 이동 동선이 겹치면 넘어지거나 설비와 충돌할 위험이 커집니다.`,
      immediateAction: "동선을 분리하고 작업반경 통제구역과 안내표지를 즉시 보강합니다.",
      detail: "작업자 위치와 설비 동작 범위를 동시에 확인 가능한 구도로 작업을 통제합니다.",
    },
  ];
}

function buildContextDrivenFallbackScenarios(
  recognizedContext: PredictionRecognizedContext,
  machineContext: string,
): Array<Omit<PredictionScenario, "id">> {
  const contextText = normalizeWhitespace(
    `${recognizedContext.canonicalEquipment} ${recognizedContext.operationContext} ${recognizedContext.hazardParts.join(" ")} ${machineContext}`,
  ).toLowerCase();

  if (containsAny(contextText, ["manual crane", "체인블록", "chain block", "hoist", "crane", "lifting"])) {
    return buildCraneFallbackScenarios(recognizedContext.canonicalEquipment || machineContext || "manual crane");
  }

  if (containsAny(contextText, ["saw", "cutter", "blade", "cutting", "cut point"])) {
    return buildCuttingFallbackScenarios(recognizedContext.canonicalEquipment || machineContext || "cutting equipment");
  }

  if (containsAny(contextText, ["switch", "cable", "electrical", "panel", "arc", "spark"])) {
    return buildElectricalFallbackScenarios(recognizedContext.canonicalEquipment || machineContext || "electrical equipment");
  }

  return buildGenericFallbackScenarios(recognizedContext);
}

function buildFallbackScenarioPool(
  machineContext: string,
  rawText: string,
  recognizedContext: PredictionRecognizedContext,
): Array<Omit<PredictionScenario, "id">> {
  const contextDriven = buildContextDrivenFallbackScenarios(recognizedContext, machineContext);
  const textFallback = containsAny(rawText.toLowerCase(), ["manual crane", "체인블록", "chain block"])
    ? buildCraneFallbackScenarios(recognizedContext.canonicalEquipment || machineContext || "manual crane")
    : [];
  return dedupeScenarioPool([...contextDriven, ...textFallback, ...DEFAULT_FALLBACK_SCENARIOS]);
}

function normalizeScenario(
  source: unknown,
  index: number,
  fallbackPool: Array<Omit<PredictionScenario, "id">>,
): PredictionScenario {
  const fallback = fallbackPool[index] ?? DEFAULT_FALLBACK_SCENARIOS[index % DEFAULT_FALLBACK_SCENARIOS.length];
  const record = source && typeof source === "object"
    ? source as Record<string, unknown>
    : {};

  const accidentType = toScenarioField(
    readStringValue(record, ["accidentType", "accident_type", "type", "사고유형", "사고 유형"]),
    fallback.accidentType,
  );
  const riskLocation = toScenarioField(
    readStringValue(record, ["riskLocation", "risk_location", "location", "위험위치", "위험 위치"]),
    fallback.riskLocation,
  );
  const reason = toScenarioField(
    readStringValue(record, ["reason", "cause", "발생이유", "발생 이유"]),
    fallback.reason,
  );
  const immediateAction = toScenarioField(
    readStringValue(record, ["immediateAction", "immediate_action", "action", "즉시조치", "즉시 조치"]),
    fallback.immediateAction,
  );
  const detailSeed = readStringValue(record, ["detail", "summary", "description", "설명", "요약"]);
  const detailFallback = `${reason} ${immediateAction}`;
  const detail = toScenarioField(detailSeed, detailFallback);

  return {
    id: `scenario-${index + 1}`,
    accidentType,
    riskLocation,
    reason,
    immediateAction,
    detail,
  };
}

function ensureScenarioMechanismDiversity(
  scenarios: PredictionScenario[],
  fallbackPool: Array<Omit<PredictionScenario, "id">>,
): PredictionScenario[] {
  if (scenarios.length < 2) {
    return scenarios;
  }

  const existingMechanisms = new Set(scenarios.map((scenario) => getScenarioMechanismKey(scenario)));
  if (existingMechanisms.size >= 2) {
    return scenarios;
  }

  const updated = [...scenarios];
  for (const fallback of fallbackPool) {
    const mechanism = getScenarioMechanismKey(fallback);
    if (existingMechanisms.has(mechanism)) {
      continue;
    }
    const signature = buildScenarioMechanismSignature(fallback);
    if (updated.some((item) => buildScenarioMechanismSignature(item) === signature)) {
      continue;
    }
    const replacementIndex = Math.max(updated.length - 1, 0);
    updated[replacementIndex] = {
      ...fallback,
      id: updated[replacementIndex]?.id ?? `scenario-${replacementIndex + 1}`,
    };
    return updated;
  }

  return scenarios;
}

function fillToScenarioCount(
  scenarios: PredictionScenario[],
  fallbackPool: Array<Omit<PredictionScenario, "id">>,
): PredictionScenario[] {
  const normalized: PredictionScenario[] = [];

  for (const scenario of scenarios) {
    const signature = buildScenarioMechanismSignature(scenario);
    if (normalized.some((item) => buildScenarioMechanismSignature(item) === signature)) {
      continue;
    }
    normalized.push({
      ...scenario,
      id: `scenario-${normalized.length + 1}`,
    });
    if (normalized.length >= DEFAULT_SCENARIO_COUNT) {
      return ensureScenarioMechanismDiversity(normalized, fallbackPool);
    }
  }

  for (const fallback of fallbackPool) {
    const signature = buildScenarioMechanismSignature(fallback);
    if (normalized.some((item) => buildScenarioMechanismSignature(item) === signature)) {
      continue;
    }
    normalized.push({
      ...fallback,
      id: `scenario-${normalized.length + 1}`,
    });
    if (normalized.length >= DEFAULT_SCENARIO_COUNT) {
      return ensureScenarioMechanismDiversity(normalized, fallbackPool);
    }
  }

  while (normalized.length < DEFAULT_SCENARIO_COUNT) {
    const fallback = DEFAULT_FALLBACK_SCENARIOS[normalized.length % DEFAULT_FALLBACK_SCENARIOS.length];
    normalized.push({
      ...fallback,
      id: `scenario-${normalized.length + 1}`,
    });
  }

  return ensureScenarioMechanismDiversity(normalized, fallbackPool);
}

export function parsePredictionScenarios(
  rawText: string,
  machineContext = "",
  recognizedContext: PredictionRecognizedContext = DEFAULT_RECOGNIZED_CONTEXT,
): PredictionScenario[] {
  const cleaned = stripCodeFence(rawText);
  const directParsed = safeJsonParse<unknown>(cleaned);
  const sliced = directParsed ? null : findJsonSlice(cleaned);
  const parsed = directParsed ?? (sliced ? safeJsonParse<unknown>(sliced) : null);
  const rawScenarioList = getRawScenarioList(parsed);
  const fallbackPool = buildFallbackScenarioPool(machineContext, rawText, recognizedContext);

  const normalizedScenarios = rawScenarioList.map((item, index) => normalizeScenario(item, index, fallbackPool));
  return fillToScenarioCount(normalizedScenarios, fallbackPool);
}

async function fileToGenerativePart(file: File): Promise<GeminiInlineDataPart> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(",")[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildScenarioExtractionPrompt(
  inputStr: string,
  hasReferenceImage: boolean,
  recognizedContext: PredictionRecognizedContext,
): string {
  const contextLine = inputStr.trim()
    ? `- 사용자 입력 문장: ${inputStr.trim()}`
    : "- 사용자 입력 문장: 정보 없음";

  const imageLine = hasReferenceImage
    ? "- 업로드 사진: 있음 (사진에서 확인된 설비/배치/작업조건을 최우선 기준으로 고정)"
    : "- 업로드 사진: 없음";

  const evidencePrimary = recognizedContext.catalogEvidence.primary
    ? `${recognizedContext.catalogEvidence.primary.machineNameKorean} (점수 ${recognizedContext.catalogEvidence.primary.score})`
    : "없음";

  const evidenceAlternatives = recognizedContext.catalogEvidence.alternatives.length > 0
    ? recognizedContext.catalogEvidence.alternatives.map((item) => item.machineNameKorean).join(", ")
    : "없음";

  return [
    "당신은 산업안전보건 사고 시나리오 분석 전문가입니다.",
    "아래 인식 결과를 고정 입력으로 사용해 예측 사고 시나리오 3개를 추출하세요.",
    "출력은 반드시 JSON 하나만 반환하세요. 마크다운, 설명 문장, 코드블록 금지.",
    "",
    "[입력]",
    contextLine,
    imageLine,
    "",
    "[자동 인식 결과]",
    `- canonicalEquipment: ${recognizedContext.canonicalEquipment}`,
    `- operationContext: ${recognizedContext.operationContext}`,
    `- hazardParts: ${recognizedContext.hazardParts.join(", ") || "정보 없음"}`,
    `- sceneConstraints: ${recognizedContext.sceneConstraints.join(" | ") || "정보 없음"}`,
    `- recognitionConfidence: ${recognizedContext.confidence}`,
    `- catalogPrimary: ${evidencePrimary}`,
    `- catalogAlternatives: ${evidenceAlternatives}`,
    "",
    "[해석 우선순위]",
    "1) 업로드 사진의 실제 설비/배치/작업환경",
    "2) 자동 인식된 설비명과 작업상황",
    "3) 자동 인식된 hazardParts",
    "4) 사고유형은 보조 단서",
    "",
    "[출력 규칙]",
    "1) scenarios 배열은 정확히 3개 항목으로 구성한다.",
    "2) 인식된 설비/작업 맥락을 벗어나는 임의 전환, 배경 전환, 설비 전환을 금지한다.",
    "3) 사고유형 단서와 충돌하면 맥락을 우선하고 사고유형은 구체화한다.",
    "4) 각 항목은 아래 필드를 모두 포함한다.",
    "- accidentType: 사고 유형 (짧고 명확한 보조 단서)",
    "- riskLocation: 위험 위치 (인식된 위험부위를 반영한 명사구)",
    "- reason: 발생 이유 (1문장, 구체 원인)",
    "- immediateAction: 즉시 조치 (1문장, 실행 중심)",
    "- detail: 카드 클릭 시 보여줄 설명 (1문장, 구체 원인)",
    "5) 과장, 공포 연출, 비현실 묘사 금지.",
    "",
    "[반환 형식]",
    "{",
    '  "scenarios": [',
    "    {",
    '      "accidentType": "",',
    '      "riskLocation": "",',
    '      "reason": "",',
    '      "immediateAction": "",',
    '      "detail": ""',
    "    },",
    "    {},",
    "    {}",
    "  ]",
    "}",
  ].join("\n");
}

interface BuildScenarioImagePromptOptions {
  inputStr: string;
  scenario: PredictionScenario;
  hasReferenceImage: boolean;
  recognizedContext?: PredictionRecognizedContext;
  qualityBoostMode?: "default" | "strict";
  qualityFocusHints?: string[];
}

function buildPreIncidentSpecificRules(scenario: PredictionScenario): string[] {
  const cueText = normalizeWhitespace(
    `${scenario.accidentType} ${scenario.riskLocation} ${scenario.reason} ${scenario.detail}`,
  ).toLowerCase();
  const normalizedType = normalizeAccidentTypeKey([
    scenario.accidentType,
    scenario.riskLocation,
    scenario.reason,
    scenario.detail,
  ]);

  if (
    normalizedType === "fallFromHeight"
    || normalizedType === "slipTrip"
    || normalizedType === "fallingFlyingObject"
    || containsAny(cueText, ["fall", "slip", "trip", "drop", "suspended", "hanging", "load", "hoist", "crane"])
  ) {
    return [
      "- For suspended-load/fall risks, keep load in air with unstable tilt or slipping signs, but not fully detached impact aftermath.",
    ];
  }

  return [];
}

function buildScaleConsistencyDirectives(
  scenario: PredictionScenario,
  recognizedContext: PredictionRecognizedContext,
): string[] {
  const cueText = normalizeWhitespace(
    [
      scenario.accidentType,
      scenario.riskLocation,
      scenario.reason,
      scenario.detail,
      recognizedContext.canonicalEquipment,
      recognizedContext.operationContext,
      recognizedContext.hazardParts.join(" "),
    ].join(" "),
  ).toLowerCase();

  const directives = new Set<string>([
    "- Enforce realistic anthropometric baseline: standing worker height roughly 1.6m to 1.9m.",
    "- Keep worker, machine, structure, and workpiece proportions physically plausible within one shared scale.",
    "- Keep distance cues coherent: floor-contact shadows, overlap, and relative sharpness must match actual spacing.",
    "- Maintain perspective consistency along rails, beams, and floor lines; avoid forced-perspective size distortion.",
    "- Use natural lens perspective (about 28mm to 50mm full-frame equivalent), avoid fisheye or ultra-wide exaggeration.",
  ]);

  if (containsAny(cueText, ["crane", "hoist", "suspended", "load", "hook", "chain"])) {
    directives.add(
      "- For crane/hoist scenes, hook block and sling components should stay proportionate to worker torso/arms; avoid oversized rigging that dwarfs humans unnaturally.",
    );
    directives.add("- Keep suspended load dimensions plausible relative to bay width, rail spacing, and worker clearance path.");
  }

  if (containsAny(cueText, ["press", "cutter", "saw", "roller", "conveyor", "forklift"])) {
    directives.add("- Keep local machine component scale realistic so nearby human hands and tools fit naturally at contact points.");
  }

  return [...directives].slice(0, 8);
}

function buildEquipmentGroundingDirectives(recognizedContext: PredictionRecognizedContext): string[] {
  const directives = new Set<string>([
    "- Keep the recognized equipment identity as the primary scene anchor. Do not replace it with a different machine family.",
    "- Ensure at least two recognized hazard parts are clearly visible in the same frame as worker action.",
    "- Keep operation context physically consistent with the equipment setup, controls, and workpiece flow.",
  ]);

  if (recognizedContext.sceneConstraints.length > 0) {
    directives.add("- Respect recognized scene constraints first, then adjust only for hazard clarity.");
  }

  return [...directives].slice(0, 5);
}

function buildMechanismSalienceDirectives(
  scenario: PredictionScenario,
  recognizedContext: PredictionRecognizedContext,
): string[] {
  const cueText = normalizeWhitespace(
    [
      scenario.riskLocation,
      scenario.reason,
      scenario.detail,
      recognizedContext.operationContext,
      recognizedContext.hazardParts.join(" "),
    ].join(" "),
  ).toLowerCase();

  const directives = new Set<string>([
    "- Make causal chain explicit in one frame: hazard source -> worker exposure path -> imminent impact/contact trajectory.",
    "- Ensure trajectory direction is traceable from source to worker proximity zone without ambiguity.",
    "- Keep risk location visually dominant and directly tied to unsafe behavior.",
  ]);

  if (containsAny(cueText, ["gas", "leak", "hose", "spark", "ignite", "flammable"])) {
    directives.add("- For gas-related scenes, show leak source point and ignition trigger in explicit spatial relation.");
  }
  if (containsAny(cueText, ["cut", "cutter", "blade", "chip", "debris", "kickback"])) {
    directives.add("- For cutting scenes, keep blade/contact point and ejection or kickback trajectory simultaneously visible.");
  }
  if (containsAny(cueText, ["chain", "hook", "load", "hoist", "swing"])) {
    directives.add("- For lifting scenes, keep hook/chain/load tension direction visible and tied to worker exposure path.");
  }

  return [...directives].slice(0, 6);
}

function buildTypeDiscriminatorDirectives(scenario: PredictionScenario): string[] {
  const directives = new Set<string>([
    "- Accident-type discriminator must be visible at first glance without relying on text labels.",
    "- Keep discriminator grounded in physical evidence rather than symbolic warning-only cues.",
  ]);

  const typeRule = resolveScenarioAccidentTypeRule(scenario);
  if (typeRule) {
    directives.add(`- Normalized accident type: ${typeRule.koLabel} (${typeRule.key}).`);
    for (const mustHave of typeRule.mustHave) {
      directives.add(`- MUST HAVE: ${mustHave}.`);
    }
    for (const mustNotHave of typeRule.mustNotHave) {
      directives.add(`- MUST NOT HAVE: ${mustNotHave}.`);
    }
  } else {
    directives.add("- MUST HAVE: one dominant mechanism cue with clear source -> exposure -> trajectory chain.");
    directives.add("- MUST NOT HAVE: mixed mechanism signals that make accident type ambiguous.");
  }

  return [...directives].slice(0, 12);
}

function buildImminenceAndReactionDirectives(
  scenario: PredictionScenario,
  recognizedContext: PredictionRecognizedContext,
): string[] {
  const cueText = normalizeWhitespace(
    [
      scenario.accidentType,
      scenario.riskLocation,
      scenario.reason,
      scenario.detail,
      recognizedContext.operationContext,
      recognizedContext.hazardParts.join(" "),
    ].join(" "),
  ).toLowerCase();

  const directives = new Set<string>([
    "- Freeze the split-second before incident onset; the scene should feel 1-2 seconds away from impact/contact.",
    "- Keep worker face and upper-body posture readable with alarmed expression and defensive tension.",
    "- Show active reaction in progress (hand withdrawal, step-back, torso twist, or warning gesture), not neutral posing.",
    "- Keep hazard source, threatened body part, and imminent contact trajectory visible in one frame without occlusion.",
  ]);

  if (containsAny(cueText, ["fall", "slip", "trip", "추락", "미끄러"])) {
    directives.add("- For fall/slip scenes, show unstable center-of-gravity cues (heel lift, bent knee, off-axis torso).");
  }

  if (containsAny(cueText, ["caught", "crush", "pinch", "cut", "blade", "끼임", "협착", "절단"])) {
    directives.add("- For caught-in/cutting scenes, show micro-withdrawal of the threatened hand/arm while it remains inside the danger envelope.");
  }

  if (containsAny(cueText, ["electric", "shock", "arc", "spark", "감전"])) {
    directives.add("- For electric-shock scenes, synchronize startle reaction with visible arc/spark path and contact proximity.");
  }

  return [...directives].slice(0, 7);
}

function buildDistanceRelationshipDirectives(
  scenario: PredictionScenario,
  recognizedContext: PredictionRecognizedContext,
): string[] {
  const cueText = normalizeWhitespace(
    [
      scenario.accidentType,
      scenario.riskLocation,
      scenario.reason,
      scenario.detail,
      recognizedContext.operationContext,
      recognizedContext.hazardParts.join(" "),
    ].join(" "),
  ).toLowerCase();

  const directives = new Set<string>([
    "- Keep equipment, worker, and hazardous material in one shared depth field so distance is immediately readable.",
    "- Make dangerous spacing explicit: hazard zone in immediate reach, safe route visibly farther away.",
    "- Use floor marks, rails, edges, or structural references to communicate relative distance and orientation.",
    "- Show worker stance (feet/hips) and hazard point together so exposure geometry is obvious.",
  ]);

  if (containsAny(cueText, ["chain", "hook", "load", "hoist", "crane", "lifting"])) {
    directives.add("- For lifting scenes, keep load swing path and worker route intersecting with visibly short clearance.");
  }

  if (containsAny(cueText, ["press", "cutter", "blade", "roller", "pinch", "절단", "끼임"])) {
    directives.add("- For machine-contact scenes, keep threatened body part within close reach of pinch/cutting zone and show entry gap.");
  }

  return [...directives].slice(0, 7);
}

function buildScenarioSignalLinkingDirectives(scenario: PredictionScenario): string[] {
  const cueText = normalizeWhitespace(
    `${scenario.accidentType} ${scenario.riskLocation} ${scenario.reason} ${scenario.immediateAction} ${scenario.detail}`,
  ).toLowerCase();

  const directives = new Set<string>([
    "- Accident type must be supported by one dominant mechanism cue that matches the scenario label.",
    "- Visualize the stated cause as one unsafe condition plus one unsafe action inside the same risk location.",
    "- Immediate action must appear as an in-progress response linked to that exact hazard source.",
    "- Keep accident type, cause, and immediate action anchored to one coherent hotspot; avoid disconnected storytelling.",
  ]);

  if (containsAny(cueText, ["stop", "e-stop", "shutdown", "전원 차단", "중지"])) {
    directives.add("- If immediate action is stop/shutdown, show hand reach toward stop control within visible reaction distance.");
  }

  if (containsAny(cueText, ["evacuate", "step back", "safe zone", "대피", "이탈"])) {
    directives.add("- If immediate action is evacuation/retreat, show body direction changing toward a clearly readable safe path.");
  }

  return [...directives].slice(0, 7);
}

function buildQualityFocusHintDirectives(hints: string[]): string[] {
  const normalizedHints = hints
    .map((hint) => normalizeWhitespace(hint))
    .filter(Boolean)
    .slice(0, 7);

  if (normalizedHints.length === 0) {
    return [];
  }

  return [
    "=== RETRY FOCUS HINTS (MANDATORY) ===",
    ...normalizedHints.map((hint) => `- ${hint}`),
  ];
}

function buildRetryFocusHintsFromQualityReasons(reasons: string[]): string[] {
  const reasonText = normalizeWhitespace(reasons.join(" ")).toLowerCase();
  const hints: string[] = [];

  if (containsAny(reasonText, ["hazard source", "source missing"])) {
    hints.push("Make hazard source boundary and origin point unambiguous.");
  }
  if (containsAny(reasonText, ["exposure path", "worker exposure"])) {
    hints.push("Show worker exposure path from current posture to hazard point in one frame.");
  }
  if (containsAny(reasonText, ["direction", "trajectory", "impact path"])) {
    hints.push("Strengthen motion/trajectory cue with clear direction toward worker proximity zone.");
  }
  if (containsAny(reasonText, ["immediate action", "action cue"])) {
    hints.push("Include visible immediate-response action happening in-frame.");
  }
  if (containsAny(reasonText, ["injury", "body part", "vulnerable body", "injury-prone body part", "신체", "부상 부위"])) {
    hints.push("Make the injury-prone body part explicit and keep hazard-to-body trajectory visible in one frame.");
  }
  if (containsAny(reasonText, ["pre-incident", "aftermath", "post-incident"])) {
    hints.push("Keep pre-incident timing only; remove completed impact/aftermath evidence.");
  }
  if (containsAny(reasonText, ["text", "label", "watermark", "readable"])) {
    hints.push("Remove every readable character, label, or watermark from the scene.");
  }
  if (containsAny(reasonText, ["scale", "proportion", "giant", "miniature"])) {
    hints.push("Correct worker/equipment/structure proportions to realistic industrial scale.");
  }
  if (containsAny(reasonText, ["equipment alignment", "equipment context", "canonical equipment"])) {
    hints.push("Reinforce recognized equipment identity and hazard parts as primary visual anchors.");
  }
  if (containsAny(reasonText, ["mechanism", "causal chain"])) {
    hints.push("Make causal chain explicit: source -> exposure -> imminent incident trajectory.");
  }
  if (containsAny(reasonText, ["type discriminator", "accident type"])) {
    hints.push("Add stronger accident-type discriminator cues and remove conflicting signals.");
  }
  if (containsAny(reasonText, ["hazard hotspot", "hotspot salience", "hotspot"])) {
    hints.push("Strengthen hotspot salience with contrast, edge clarity, and focal priority at the exact danger zone.");
  }
  if (containsAny(reasonText, ["injury-body-part emphasis", "injury body part emphasis", "injury emphasis"])) {
    hints.push("Make the injury-prone body part visually dominant with immediate proximity to hazard source.");
  }
  if (containsAny(reasonText, ["trajectory vector", "vector clarity", "single vector"])) {
    hints.push("Render a single dominant trajectory vector from source to exposure without competing directions.");
  }
  if (containsAny(reasonText, ["immediate-action point", "immediate action point", "action point visibility"])) {
    hints.push("Expose at least one immediate action point (e-stop/isolation/escape) within direct reach context.");
  }

  if (hints.length === 0) {
    hints.push("Increase equipment-grounded hazard clarity and accident-type discriminator visibility.");
  }

  return hints.slice(0, 7);
}

function readCriterionFlag(
  quality: ScenarioImageQualityAssessment,
  key: HardQualityFlagKey,
): boolean | null {
  const value = quality.criterionFlags?.[key];
  return typeof value === "boolean" ? value : null;
}

function buildCriticalVisibilityFocusHints(quality: ScenarioImageQualityAssessment): string[] {
  const hints: string[] = [];

  for (const key of HARD_QUALITY_FLAG_KEYS) {
    if (readCriterionFlag(quality, key) === false) {
      hints.push(HARD_QUALITY_FLAG_HINTS[key]);
    }
  }

  return hints;
}

function buildRetryFocusHintsFromQualityAssessment(quality: ScenarioImageQualityAssessment): string[] {
  const mergedHints = [
    ...buildCriticalVisibilityFocusHints(quality),
    ...buildRetryFocusHintsFromQualityReasons(quality.qualityReasons),
  ];

  const deduped: string[] = [];
  for (const hint of mergedHints) {
    const normalized = normalizeWhitespace(hint);
    if (!normalized) {
      continue;
    }
    if (deduped.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
      continue;
    }
    deduped.push(normalized);
  }

  if (deduped.length === 0) {
    return ["Increase equipment-grounded hazard clarity and accident-type discriminator visibility."];
  }

  return deduped.slice(0, 7);
}

export function buildScenarioImagePrompt({
  inputStr,
  scenario,
  hasReferenceImage,
  recognizedContext,
  qualityBoostMode = "default",
  qualityFocusHints = [],
}: BuildScenarioImagePromptOptions): string {
  const resolvedContext = recognizedContext ?? {
    ...DEFAULT_RECOGNIZED_CONTEXT,
    canonicalEquipment: normalizeWhitespace(inputStr) || DEFAULT_RECOGNIZED_CONTEXT.canonicalEquipment,
    operationContext: normalizeWhitespace(inputStr) || DEFAULT_RECOGNIZED_CONTEXT.operationContext,
  };

  const anchorLine = inputStr.trim()
    ? `Equipment and site anchor: ${inputStr.trim()}`
    : "Equipment and site anchor: industrial workplace safety analysis";
  const recognizedEquipmentLine = `Recognized equipment: ${resolvedContext.canonicalEquipment}`;
  const operationContextLine = `Recognized operation context: ${resolvedContext.operationContext}`;
  const hazardPartsLine = `Recognized hazard parts: ${resolvedContext.hazardParts.join(", ")}`;
  const riskPointLine = `Risk point anchor: ${scenario.riskLocation}`;
  const reasonLine = `Unsafe action cue: ${scenario.reason}`;
  const actionLine = `Immediate response cue: ${scenario.immediateAction}`;
  const accidentTypeLine = `Secondary accident label: ${scenario.accidentType}`;
  const normalizedAccidentTypeKey = normalizeAccidentTypeKey([
    scenario.accidentType,
    scenario.riskLocation,
    scenario.reason,
    scenario.detail,
  ]);
  const normalizedAccidentTypeLine = normalizedAccidentTypeKey
    ? `Normalized accident type key: ${normalizedAccidentTypeKey}`
    : "Normalized accident type key: unresolved";
  const hazardEventDirectives = buildHazardEventVisualDirectives(scenario, resolvedContext);
  const accidentLabelSalienceDirectives = buildAccidentTypeRiskSalienceDirectives(scenario);
  const preIncidentSpecificRules = buildPreIncidentSpecificRules(scenario);
  const imminenceAndReactionDirectives = buildImminenceAndReactionDirectives(scenario, resolvedContext);
  const distanceRelationshipDirectives = buildDistanceRelationshipDirectives(scenario, resolvedContext);
  const scenarioSignalLinkingDirectives = buildScenarioSignalLinkingDirectives(scenario);
  const equipmentGroundingDirectives = buildEquipmentGroundingDirectives(resolvedContext);
  const mechanismSalienceDirectives = buildMechanismSalienceDirectives(scenario, resolvedContext);
  const typeDiscriminatorDirectives = buildTypeDiscriminatorDirectives(scenario);
  const scaleConsistencyDirectives = buildScaleConsistencyDirectives(scenario, resolvedContext);
  const qualityFocusDirectives = buildQualityFocusHintDirectives(qualityFocusHints);
  const strictVisibilityRules = qualityBoostMode === "strict"
    ? [
        "Strict visibility reinforcement:",
        "- Ensure hazard source shape and boundary are sharply visible at the point of danger.",
        "- Ensure worker exposure path is not occluded by camera angle or objects.",
        "- Ensure motion direction (debris/kickback/collision path) is visually traceable in-frame.",
        "- Reject giant-miniature mismatch: worker, equipment, and structures must remain in realistic relative scale.",
        "- Prioritize equipment-context alignment, mechanism salience, accident-type discriminator, hazard hotspot salience, injury-body-part emphasis, trajectory vector, and immediate-action point visibility before style polish.",
        "- Keep a single-scene composition only; reject split-screen, diptych, or multi-panel layouts.",
        "- Do not render readable text, letters, numbers, labels, or watermarks anywhere in the image.",
      ]
    : [];

  const referenceGuidance = hasReferenceImage
    ? [
        "Use the uploaded image ONLY as a reference for background environment and equipment characteristics.",
        "Do not strictly preserve the original photo's exact state. Instead, dynamically reconstruct the scene to vividly show a plausible, imminent accident situation.",
        "Prioritize conveying a naturally occurring hazard and accident mechanism over exact visual reproduction of the photo.",
      ]
    : [
        "Build one realistic industrial scene that matches the recognized equipment and operation context.",
        "Do not introduce unrelated machinery, industries, or backgrounds.",
      ];

  return [
    "Generate one semi-realistic industrial safety training illustration.",
    "Use a text-free semi-realistic illustration style suitable for industrial safety education materials.",
    "Render one single-scene frame capturing the pre-incident moment (1-2 seconds before accident).",
    "Primary interpretation priority (highest to lowest): clear depiction of plausible accident situation > site background/equipment style (from reference) > recognized context > risk point > accident label.",
    ...referenceGuidance,
    "Hard constraints:",
    "- Keep equipment identity, scale, and operation context consistent with recognized context.",
    "- The risk point and recognized hazard parts must be visible in the same frame as worker action.",
    "- If the secondary accident label conflicts with recognized context, keep recognized context and reinterpret the label.",
    "- The secondary accident label must not dominate or override the scene context.",
    "- Keep every machine panel/sign/display/readout textless. If signboards or displays appear, render them as unreadable blank shapes.",
    "Focus on near-miss risk signals, not graphic injuries or gore.",
    "Preserve realistic industrial scene grounding (equipment geometry, scale, lighting, and spatial layout) while rendering in a semi-realistic illustration style.",
    "This image will be posted at site entrance and machinery zones as a high-alert safety warning visual.",
    "Do not generate a generic static workplace photo.",
    "",
    "=== PRE-INCIDENT SINGLE SCENE (MANDATORY) ===",
    "- Use one continuous scene only. Do not split the frame into left/right, before/after, or any multi-panel format.",
    "- Depict the unsafe condition and worker exposure build-up right before incident onset (1-2 seconds prior).",
    "- Keep danger tension high with clearly visible hazard source, exposure path, and imminent trajectory.",
    "- Do not depict completed impact/contact state: no object already dropped to floor, no collision already completed, no worker already struck.",
    ...preIncidentSpecificRules,
    "- Do not render panel labels, captions, timestamps, arrows, or any text inside the image.",
    "- Do not render the words BEFORE/AFTER or any other readable characters.",
    "",
    "=== IMMINENCE AND WORKER REACTION (MANDATORY) ===",
    ...imminenceAndReactionDirectives,
    "",
    "=== DISTANCE AND POSITION CLARITY (MANDATORY) ===",
    ...distanceRelationshipDirectives,
    "",
    "=== SCENARIO SIGNAL LINKING (MANDATORY) ===",
    ...scenarioSignalLinkingDirectives,
    "",
    "=== EQUIPMENT GROUNDING (MANDATORY) ===",
    ...equipmentGroundingDirectives,
    "",
    "=== MECHANISM SALIENCE (MANDATORY) ===",
    ...mechanismSalienceDirectives,
    "",
    "=== ACCIDENT TYPE DISCRIMINATOR (MANDATORY) ===",
    ...typeDiscriminatorDirectives,
    "",
    "=== SCALE AND PERSPECTIVE CONSISTENCY (MANDATORY) ===",
    ...scaleConsistencyDirectives,
    "",
    "=== CORE SIGNAL VISUALIZATION (MANDATORY) ===",
    "- Hazard hotspot salience: isolate one primary danger hotspot using contrast, edge sharpness, and focal framing.",
    "- Injury-body-part emphasis: clearly expose the body part at immediate risk and its unsafe posture relative to hazard source.",
    "- Trajectory vector clarity: show one dominant directional vector (falling/ejection/rotation/collision) from source toward exposure.",
    "- Immediate-action point visibility: include at least one concrete action point (e-stop/isolation switch/escape path) and show response readiness.",
    ...(qualityFocusDirectives.length > 0 ? ["", ...qualityFocusDirectives] : []),
    "",
    "=== VISUAL INFORMATION DENSITY RULES (CRITICAL) ===",
    "The single image MUST instantly communicate five elements WITHOUT any text overlay:",
    "Do not render any captions, labels, UI badges, callout boxes, arrows, or warning text inside the image.",
    "1) ACCIDENT TYPE - What kind of accident is imminent?",
    "2) RISK LOCATION - Where exactly is the danger?",
    "3) ACCIDENT CAUSE - Why is the accident about to happen?",
    "4) INJURY-PRONE BODY PART - Which body part is at immediate risk?",
    "5) IMMEDIATE ACTION - What safety response is needed?",
    "",
    "ACCIDENT TYPE visual encoding:",
    "- Use accident-specific physical signals (pinch gap, arc source, falling-object path, slip edge) that distinguish this type from nearby types.",
    "- Keep accident-type evidence visible in the same frame as hazard source and worker movement.",
    "- Avoid conflicting cues that make the scene read as another accident type.",
    "",
    "RISK LOCATION visual encoding:",
    "- Use dramatic directional lighting (warm spotlight or volumetric light shaft) to isolate the exact hazard zone.",
    "- Create strong luminance contrast: hazard zone brightly lit, surrounding area in comparative shadow.",
    "- Place the hazard zone at the visual power point (rule-of-thirds intersection) for instant eye-tracking.",
    "- Use depth-of-field: sharp focus on the danger zone, slight bokeh on non-critical background.",
    "",
    "ACCIDENT CAUSE visual encoding:",
    "- Show the complete causal chain in one frame: unsafe condition -> worker exposure -> imminent contact.",
    "- Use motion blur or action freeze to show the dynamic mechanism (rotation, falling, sliding, arcing).",
    "- Worker body posture must show the exact unsafe behavior causing the risk (leaning in, reaching over, stepping on).",
    "- Environmental cues must reinforce causation: oil on floor, missing guard, frayed wire, unstable load.",
    "- Color temperature contrast: warm/red tones near danger source, cool tones in safe zones.",
    "",
    "INJURY-PRONE BODY PART visual encoding:",
    "- Clearly show the body part at immediate risk (hand, forearm, head, torso, leg, or foot) in close spatial relation to the hazard source.",
    "- Keep imminent contact or impact trajectory between hazard source and body part traceable in one frame.",
    "- Prioritize educational clarity over shock value; do not depict gore, dismemberment, or graphic injury.",
    "",
    "IMMEDIATE ACTION visual encoding:",
    "- Include visible safety response elements in the scene: emergency stop button, safety rail, PPE nearby, warning sign.",
    "- Show at least one action-ready cue: an accessible e-stop, a safety harness anchor point, an escape route.",
    "- Depict the immediate action as actively happening in-frame (for example: hand pressing e-stop, worker stepping back to safe zone, supervisor pulling worker away).",
    "- If applicable, show a second worker or supervisor observing/reacting with alert body language.",
    "- The spatial relationship between worker, hazard, and safety equipment must be immediately clear.",
    "",
    "Critical hazard-event visibility rules:",
    ...hazardEventDirectives,
    "Accident-label salience rules (secondary, context-anchored):",
    ...accidentLabelSalienceDirectives,
    ...strictVisibilityRules,
    "The image must communicate equipment context, hazard point, and imminent incident situation at first glance.",
    "Show one dangerous action, one hazard source, and one imminent impact trajectory in explicit causal relation.",
    "Depict the pre-incident moment (1-2 seconds before accident), not post-incident aftermath.",
    "Worker facial expression and body posture must convey immediate danger recognition and strong tension.",
    "Worker hands, feet, hazard source, and body balance state must be clearly visible in the same frame.",
    "Avoid neutral standing posture. Show unstable balance or unsafe movement that can trigger accident immediately.",
    "",
    "COMPOSITION AND FRAMING:",
    "- Use a medium close-up angle (worker waist to head visible) to maximize hazard detail visibility.",
    "- Camera angle: slightly elevated (15-20°) to show spatial relationship between worker, equipment, and hazard zone.",
    "- Ensure the frame includes: hazard source (left/center), worker body (center/right), safety equipment or escape route (edge).",
    "- Use leading lines (equipment edges, pipes, railings) to guide the viewer's eye from hazard -> worker -> safety response.",
    ...resolvedContext.sceneConstraints.map((constraint) => `Context constraint: ${constraint}`),
    anchorLine,
    recognizedEquipmentLine,
    operationContextLine,
    hazardPartsLine,
    riskPointLine,
    reasonLine,
    actionLine,
    accidentTypeLine,
    normalizedAccidentTypeLine,
    "Return image output only.",
  ].join("\n");
}

export function buildImageGenerationParts(prompt: string, referenceImagePart?: GeminiInlineDataPart): GeminiContentPart[] {
  const parts: GeminiContentPart[] = [{ text: prompt }];
  if (referenceImagePart) {
    parts.push(referenceImagePart);
  }
  return parts;
}

export function getGeminiImageModelCandidates(configuredModel?: string): string[] {
  const explicitModel = configuredModel?.trim();
  const ordered = [
    explicitModel || DEFAULT_GEMINI_IMAGE_MODEL,
    ...FALLBACK_GEMINI_IMAGE_MODELS,
  ];

  return ordered
    .filter((value, index) => Boolean(value) && ordered.indexOf(value) === index)
    .slice(0, MAX_IMAGE_MODEL_CANDIDATES);
}

export function extractInlineGeneratedImage(payload: unknown): { data: string; mimeType: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const typedPayload = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            data?: string;
            mimeType?: string;
          };
        }>;
      };
    }>;
  };

  const parts = typedPayload.candidates?.flatMap((candidate) => candidate.content?.parts ?? []);
  const imagePart = parts?.find((part) => typeof part.inlineData?.data === "string");

  if (!imagePart?.inlineData?.data) {
    return null;
  }

  return {
    data: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

interface GeneratedImageCandidate {
  imageUrl: string;
  imagePart: GeminiInlineDataPart;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? normalizeWhitespace(item) : ""))
    .filter(Boolean);
}

function toBooleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();
    if (["true", "yes", "1", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0", "n"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function buildImageQualityJudgePrompt(
  scenario: PredictionScenario,
  recognizedContext: PredictionRecognizedContext,
): string {
  return [
    "You are validating an industrial safety near-miss visualization.",
    "Evaluate whether the image clearly satisfies all fifteen required elements in one frame:",
    "1) hazard source, 2) worker exposure path, 3) accident direction (trajectory/kickback/collision path), 4) immediate action cue, 5) injury-prone body part visibility (body part at immediate risk and traceable hazard-to-body trajectory), 6) pre-incident moment only (no completed impact/contact/aftermath), 7) no readable text overlays, 8) realistic scale consistency between worker, equipment, structures, and workpiece, 9) equipment context alignment with recognized equipment/hazard parts, 10) mechanism salience (source->exposure->trajectory causal chain visibility), 11) accident-type discriminator visibility (type-distinct evidence without conflicting signals), 12) hazard hotspot salience visibility (danger hotspot visually dominant at first glance), 13) injury-body-part emphasis visibility, 14) trajectory vector visibility (one dominant vector toward exposure), 15) immediate-action point visibility (e-stop/isolation/escape point clearly actionable).",
    "Fail if the image shows post-incident state (object already hit ground/person, completed collision, or aftermath).",
    "Fail if any readable letters/numbers/words/watermarks are visible (including BEFORE/AFTER labels).",
    "Fail if injury-prone body part is unclear, occluded, or spatially disconnected from the hazard trajectory.",
    "Fail if worker/equipment/structure size ratio appears physically implausible (giant machine part with tiny worker, or miniature machine with oversized worker).",
    "Fail if equipment identity does not match recognized equipment context.",
    "Fail if accident type cannot be distinguished from other nearby types due to missing or conflicting visual evidence.",
    "Return JSON only.",
    "",
    "[Scenario anchors]",
    `- equipment: ${recognizedContext.canonicalEquipment}`,
    `- operationContext: ${recognizedContext.operationContext}`,
    `- hazardParts: ${recognizedContext.hazardParts.join(", ")}`,
    `- riskLocation: ${scenario.riskLocation}`,
    `- reason: ${scenario.reason}`,
    `- immediateAction: ${scenario.immediateAction}`,
    "",
    "[Output format]",
    "{",
    '  "hazardSourceVisible": true,',
    '  "workerExposurePathVisible": true,',
    '  "accidentDirectionVisible": true,',
    '  "immediateActionCueVisible": true,',
    '  "injuryBodyPartVisible": true,',
    '  "preIncidentMomentVisible": true,',
    '  "noReadableText": true,',
    '  "scaleConsistencyVisible": true,',
    '  "equipmentContextAligned": true,',
    '  "mechanismSalienceVisible": true,',
    '  "typeDiscriminatorVisible": true,',
    '  "hazardHotspotSalienceVisible": true,',
    '  "injuryBodyPartEmphasisVisible": true,',
    '  "trajectoryVectorVisible": true,',
    '  "immediateActionPointVisible": true,',
    '  "qualityStatus": "pass",',
    '  "reasons": [""]',
    "}",
  ].join("\n");
}

function parseImageQualityJudgeResponse(rawText: string): ScenarioImageQualityAssessment | null {
  const cleaned = stripCodeFence(rawText);
  const directParsed = safeJsonParse<Record<string, unknown>>(cleaned);
  const sliced = directParsed ? null : findJsonSlice(cleaned);
  const parsed = directParsed ?? (sliced ? safeJsonParse<Record<string, unknown>>(sliced) : null);
  if (!parsed) {
    return null;
  }

  const hazardSourceVisible = toBooleanValue(parsed.hazardSourceVisible ?? parsed.hazard_source_visible);
  const workerExposurePathVisible = toBooleanValue(
    parsed.workerExposurePathVisible ?? parsed.worker_exposure_path_visible ?? parsed.exposurePathVisible,
  );
  const accidentDirectionVisible = toBooleanValue(
    parsed.accidentDirectionVisible ?? parsed.accident_direction_visible ?? parsed.directionVisible,
  );
  const immediateActionCueVisible = toBooleanValue(
    parsed.immediateActionCueVisible
      ?? parsed.immediate_action_cue_visible
      ?? parsed.actionCueVisible
      ?? parsed.action_cue_visible,
  );
  const injuryBodyPartVisible = toBooleanValue(
    parsed.injuryBodyPartVisible
      ?? parsed.injury_body_part_visible
      ?? parsed.vulnerableBodyPartVisible
      ?? parsed.vulnerable_body_part_visible
      ?? parsed.bodyPartRiskVisible
      ?? parsed.body_part_risk_visible,
  );
  const preIncidentMomentVisible = toBooleanValue(
    parsed.preIncidentMomentVisible
      ?? parsed.pre_incident_moment_visible
      ?? parsed.preIncidentOnly
      ?? parsed.pre_incident_only,
  );
  const noReadableText = toBooleanValue(
    parsed.noReadableText
      ?? parsed.no_readable_text
      ?? parsed.noTextOverlay
      ?? parsed.no_text_overlay,
  );
  const scaleConsistencyVisible = toBooleanValue(
    parsed.scaleConsistencyVisible
      ?? parsed.scale_consistency_visible
      ?? parsed.realisticScale
      ?? parsed.realistic_scale,
  );
  const equipmentContextAligned = toBooleanValue(
    parsed.equipmentContextAligned
      ?? parsed.equipment_context_aligned
      ?? parsed.equipmentAlignmentVisible
      ?? parsed.equipment_alignment_visible,
  );
  const mechanismSalienceVisible = toBooleanValue(
    parsed.mechanismSalienceVisible
      ?? parsed.mechanism_salience_visible
      ?? parsed.causalChainVisible
      ?? parsed.causal_chain_visible,
  );
  const typeDiscriminatorVisible = toBooleanValue(
    parsed.typeDiscriminatorVisible
      ?? parsed.type_discriminator_visible
      ?? parsed.accidentTypeDiscriminatorVisible
      ?? parsed.accident_type_discriminator_visible,
  );
  const hazardHotspotSalienceVisible = toBooleanValue(
    parsed.hazardHotspotSalienceVisible
      ?? parsed.hazard_hotspot_salience_visible
      ?? parsed.hazardSpotSalienceVisible
      ?? parsed.hazard_spot_salience_visible,
  );
  const injuryBodyPartEmphasisVisible = toBooleanValue(
    parsed.injuryBodyPartEmphasisVisible
      ?? parsed.injury_body_part_emphasis_visible
      ?? parsed.bodyPartEmphasisVisible
      ?? parsed.body_part_emphasis_visible,
  );
  const trajectoryVectorVisible = toBooleanValue(
    parsed.trajectoryVectorVisible
      ?? parsed.trajectory_vector_visible
      ?? parsed.vectorDirectionVisible
      ?? parsed.vector_direction_visible,
  );
  const immediateActionPointVisible = toBooleanValue(
    parsed.immediateActionPointVisible
      ?? parsed.immediate_action_point_visible
      ?? parsed.actionPointVisible
      ?? parsed.action_point_visible,
  );

  const criterionFlags: ScenarioImageQualityCriterionFlags = {
    hazardSourceVisible,
    workerExposurePathVisible,
    accidentDirectionVisible,
    immediateActionCueVisible,
    injuryBodyPartVisible,
    preIncidentMomentVisible,
    noReadableText,
    scaleConsistencyVisible,
    equipmentContextAligned,
    mechanismSalienceVisible,
    typeDiscriminatorVisible,
    hazardHotspotSalienceVisible,
    injuryBodyPartEmphasisVisible,
    trajectoryVectorVisible,
    immediateActionPointVisible,
  };

  const flags = [
    hazardSourceVisible,
    workerExposurePathVisible,
    accidentDirectionVisible,
    immediateActionCueVisible,
    injuryBodyPartVisible,
    preIncidentMomentVisible,
    noReadableText,
    scaleConsistencyVisible,
    equipmentContextAligned,
    mechanismSalienceVisible,
    typeDiscriminatorVisible,
    hazardHotspotSalienceVisible,
    injuryBodyPartEmphasisVisible,
    trajectoryVectorVisible,
    immediateActionPointVisible,
  ];
  const knownFlags = flags.filter((value) => value !== null);
  const score = flags.filter((value) => value === true).length;
  const hardGateFailures = getHardGateFailures(criterionFlags);

  const statusRaw = typeof parsed.qualityStatus === "string"
    ? parsed.qualityStatus
    : typeof parsed.decision === "string"
      ? parsed.decision
      : "";
  const normalizedStatus = statusRaw.toLowerCase().trim();

  const inferredStatus: ScenarioImageQualityStatus =
    hardGateFailures.length > 0 || (knownFlags.length > 0 && knownFlags.some((value) => value === false))
      ? "soft_fail"
      : "pass";
  const qualityStatus = normalizedStatus === "soft_fail" || normalizedStatus === "fail" || inferredStatus === "soft_fail"
    ? "soft_fail"
    : "pass";
  const reasons = readStringArray(parsed.reasons);

  return {
    qualityStatus,
    qualityReasons: reasons.length > 0 ? reasons : [`Gemini quality gate score: ${score}/${flags.length}`],
    score,
    maxScore: flags.length,
    criterionFlags,
  };
}

async function judgeScenarioImageQualityWithGemini({
  apiKey,
  configuredModel,
  scenario,
  recognizedContext,
  imagePart,
}: {
  apiKey: string;
  configuredModel?: string;
  scenario: PredictionScenario;
  recognizedContext: PredictionRecognizedContext;
  imagePart: GeminiInlineDataPart;
}): Promise<ScenarioImageQualityAssessment | null> {
  const prompt = buildImageQualityJudgePrompt(scenario, recognizedContext);
  const rawResponse = await generateGeminiTextWithFallback({
    apiKey,
    configuredModel,
    prompt: [prompt, imagePart],
    context: "predictionServiceQualityGate",
  });
  return parseImageQualityJudgeResponse(rawResponse);
}

async function requestScenarioImageCandidate({
  imageApiKey,
  imageModelCandidates,
  imageParts,
}: {
  imageApiKey: string;
  imageModelCandidates: string[];
  imageParts: GeminiContentPart[];
}): Promise<GeneratedImageCandidate | null> {
  for (const modelName of imageModelCandidates) {
    const proxyUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${imageApiKey}`;
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: imageParts,
          },
        ],
      }),
    });

    if (response.ok) {
      const payload = await response.json();
      const imageData = extractInlineGeneratedImage(payload);
      if (!imageData) {
        console.warn(`[predictionService] Image response has no inline image data. model=${modelName}`);
        continue;
      }
      return {
        imageUrl: `data:${imageData.mimeType};base64,${imageData.data}`,
        imagePart: {
          inlineData: {
            data: imageData.data,
            mimeType: imageData.mimeType,
          },
        },
      };
    }

    const errorText = await response.text();
    if (response.status === 404) {
      console.warn(`[predictionService] Gemini image model unavailable: ${modelName}. Trying fallback model.`);
      continue;
    }

    console.warn(`[predictionService] Gemini image generation failed. status=${response.status}, model=${modelName}, body=${errorText}`);
    break;
  }
  return null;
}

export interface GenerateScenarioImageInput {
  machineContext?: string;
  scenario: PredictionScenario;
  imageFile?: File;
  recognizedContext?: PredictionRecognizedContext;
}

async function generateScenarioImage({
  machineContext,
  scenario,
  imageFile,
  recognizedContext,
}: GenerateScenarioImageInput): Promise<ScenarioImageGenerationResult | undefined> {
  const textApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const textModelName = import.meta.env.VITE_GEMINI_TEXT_MODEL;
  const imageApiKey = import.meta.env.VITE_GEMINI_IMAGE_API_KEY || textApiKey;
  const imageModelName = import.meta.env.VITE_GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL;

  if (!imageApiKey) {
    throw new Error("VITE_GEMINI_IMAGE_API_KEY 환경 변수가 설정되지 않았습니다.");
  }

  const resolvedContext = recognizedContext ?? {
    ...DEFAULT_RECOGNIZED_CONTEXT,
    canonicalEquipment: normalizeWhitespace(machineContext || "") || DEFAULT_RECOGNIZED_CONTEXT.canonicalEquipment,
    operationContext: normalizeWhitespace(machineContext || "") || DEFAULT_RECOGNIZED_CONTEXT.operationContext,
  };

  const uploadedImagePart = imageFile
    ? await fileToGenerativePart(imageFile)
    : undefined;
  const imageModelCandidates = getGeminiImageModelCandidates(imageModelName);

  const attemptModes: Array<"default" | "strict"> = Array.from(
    { length: MAX_SCENARIO_IMAGE_ATTEMPTS },
    (_, index) => (index === 0 ? "default" : "strict"),
  );
  const attemptResults: Array<{
    candidate: GeneratedImageCandidate;
    quality: ScenarioImageQualityAssessment;
  }> = [];
  let retryFocusHints: string[] = [];

  for (let attemptIndex = 0; attemptIndex < attemptModes.length; attemptIndex += 1) {
    const imagePrompt = buildScenarioImagePrompt({
      inputStr: machineContext || "",
      scenario,
      hasReferenceImage: Boolean(uploadedImagePart),
      recognizedContext: resolvedContext,
      qualityBoostMode: attemptModes[attemptIndex],
      qualityFocusHints: retryFocusHints,
    });

    const candidate = await requestScenarioImageCandidate({
      imageApiKey,
      imageModelCandidates,
      imageParts: buildImageGenerationParts(imagePrompt, uploadedImagePart),
    });

    if (!candidate) {
      continue;
    }

    const quality = await evaluateScenarioImageQuality({
      scenario,
      recognizedContext: resolvedContext,
      judgeImageQuality: textApiKey
        ? () =>
            judgeScenarioImageQualityWithGemini({
              apiKey: textApiKey,
              configuredModel: textModelName,
              scenario,
              recognizedContext: resolvedContext,
              imagePart: candidate.imagePart,
            })
        : undefined,
    });

    attemptResults.push({ candidate, quality });
    if (quality.qualityStatus === "pass") {
      return {
        imageUrl: candidate.imageUrl,
        qualityStatus: "pass",
        qualityReasons: quality.qualityReasons,
      };
    }

    retryFocusHints = buildRetryFocusHintsFromQualityAssessment(quality);
  }

  if (attemptResults.length === 0) {
    return undefined;
  }

  const sorted = [...attemptResults].sort((a, b) => {
    const aRatio = a.quality.maxScore > 0 ? a.quality.score / a.quality.maxScore : 0;
    const bRatio = b.quality.maxScore > 0 ? b.quality.score / b.quality.maxScore : 0;
    if (bRatio !== aRatio) {
      return bRatio - aRatio;
    }
    if (b.quality.score !== a.quality.score) {
      return b.quality.score - a.quality.score;
    }
    return b.quality.qualityReasons.length - a.quality.qualityReasons.length;
  });

  const selected = sorted[0];
  return {
    imageUrl: selected.candidate.imageUrl,
    qualityStatus: "soft_fail",
    qualityReasons: selected.quality.qualityReasons,
  };
}

function buildFallbackRecognizedContext(inputStr: string): PredictionRecognizedContext {
  const normalizedInput = normalizeWhitespace(inputStr);
  return {
    ...DEFAULT_RECOGNIZED_CONTEXT,
    canonicalEquipment: normalizedInput || DEFAULT_RECOGNIZED_CONTEXT.canonicalEquipment,
    operationContext: normalizedInput ? `${normalizedInput} 취급 작업` : DEFAULT_RECOGNIZED_CONTEXT.operationContext,
  };
}

export const predictionService = {
  async generatePrediction(inputStr: string, imageFile?: File): Promise<PredictionResult> {
    const textApiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const textModelName = import.meta.env.VITE_GEMINI_TEXT_MODEL;

    if (!textApiKey) {
      throw new Error("VITE_GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.");
    }

    const uploadedImagePart = imageFile
      ? await fileToGenerativePart(imageFile)
      : undefined;

    let recognizedContext: PredictionRecognizedContext = buildFallbackRecognizedContext(inputStr);
    try {
      recognizedContext = await recognizePredictionContext({
        inputText: inputStr,
        apiKey: textApiKey,
        configuredModel: textModelName,
        hasReferenceImage: Boolean(uploadedImagePart),
        imagePart: uploadedImagePart,
      });
    } catch (error: unknown) {
      console.warn("[predictionService] Context recognition failed. Using fallback context.", error);
    }

    const prompt = buildScenarioExtractionPrompt(inputStr, Boolean(uploadedImagePart), recognizedContext);
    const promptWithImage = uploadedImagePart
      ? [prompt, uploadedImagePart]
      : prompt;

    let generatedText = "";

    try {
      generatedText = await generateGeminiTextWithFallback({
        apiKey: textApiKey,
        configuredModel: textModelName,
        prompt: promptWithImage,
        context: "predictionService",
      });
    } catch (error: unknown) {
      console.error("Gemini 텍스트 분석 오류:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`텍스트 모델 분석 중 오류가 발생했습니다: ${message}`);
    }

    const scenarios = parsePredictionScenarios(generatedText, inputStr, recognizedContext);
    return {
      scenarios,
      machineContext: recognizedContext.canonicalEquipment || inputStr.trim() || undefined,
      rawResponseText: generatedText,
      recognizedContext,
    };
  },
  generateScenarioImage,
};






