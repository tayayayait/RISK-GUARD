import { MsdsSectionItem } from "./msds-api.ts";
import { MSDS_ITEM_CODES } from "./msds-item-codes.ts";

export type PpePart = "respiratory" | "eye" | "hand" | "body";

export type GhsPictogramCode =
  | "GHS01"
  | "GHS02"
  | "GHS03"
  | "GHS04"
  | "GHS05"
  | "GHS06"
  | "GHS07"
  | "GHS08"
  | "GHS09";

export interface CodeTextPair {
  code: string;
  text: string;
}

export interface HazardSection {
  classifications: string[];
  pictograms: GhsPictogramCode[];
  signalWord: "위험" | "경고" | null;
  hCodes: CodeTextPair[];
  pCodes: {
    prevention: CodeTextPair[];
    response: CodeTextPair[];
    storage: CodeTextPair[];
    disposal: CodeTextPair[];
  };
  nfpa: { health: number; fire: number; reactivity: number } | null;
}

export interface FirstAidSection {
  eye: string[];
  skin: string[];
  inhalation: string[];
  ingestion: string[];
  physicianNote: string[];
}

export interface PpeSection {
  exposureLimits: {
    domestic: string | null;
    acgih: string | null;
    biological: string | null;
  };
  engineeringControl: string[];
  ppe: Record<PpePart, string[]>;
}

export interface RegulationSection {
  oshAct: string[];
  chemicalControlAct: string[];
  hazmatAct: string[];
  wasteAct: string[];
  reachKorea: string[];
  others: Array<{ label: string; value: string }>;
}

export interface MsdsTreeNode {
  code: string;
  parentCode: string | null;
  name: string;
  detail: string[];
  lev: number;
  children: MsdsTreeNode[];
}

export interface MsdsSectionTree {
  sectionNo: number;
  nodes: MsdsTreeNode[];
}

export interface NormalizeOptions {
  warnings?: string[];
}

const SENTINEL_VALUES = new Set(["자료없음", "해당없음", "-", "없음", "데이터없음", "정보없음"]);

/**
 * 파이프(|) 구분자를 분해하고 선행/후행 공백 및 센티널 값을 정규화
 */
export function splitPipeValues(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !SENTINEL_VALUES.has(item));
}

/**
 * 센티널 또는 빈 문자열을 null로 정규화
 */
export function cleanSentinelString(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || SENTINEL_VALUES.has(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * H 및 P 코드 파싱 (예: "H225 : 고인화성 액체 및 증기", "P301+P310 : 삼켰다면...")
 */
export function parseCodeTextPairs(raw: string | undefined | null): CodeTextPair[] {
  const items = splitPipeValues(raw);
  const results: CodeTextPair[] = [];

  const codeRegex = /^([HP][0-9A-Z+]+)\s*:\s*(.*)$/;

  for (const item of items) {
    const match = item.match(codeRegex);
    if (match) {
      results.push({
        code: match[1].trim(),
        text: match[2].trim(),
      });
    } else {
      // 코드가 접두어로 없는 일반 텍스트인 경우
      results.push({
        code: "",
        text: item,
      });
    }
  }

  return results;
}

/**
 * 그림문자 파싱: GHS02.gif|GHS07.gif -> ["GHS02", "GHS07"]
 */
export function parsePictograms(
  raw: string | undefined | null,
  warnings?: string[]
): GhsPictogramCode[] {
  const items = splitPipeValues(raw);
  const pictograms: GhsPictogramCode[] = [];

  const validGhsRegex = /^GHS0[1-9]$/;

  for (const item of items) {
    const cleaned = item.replace(/\.gif$/i, "").trim().toUpperCase();
    if (validGhsRegex.test(cleaned)) {
      pictograms.push(cleaned as GhsPictogramCode);
    } else if (cleaned) {
      warnings?.push(`Ignored invalid GHS pictogram code: ${item}`);
    }
  }

  return pictograms;
}

/**
 * 신호어 파싱 ("위험" | "경고" | null)
 */
export function parseSignalWord(
  raw: string | undefined | null,
  warnings?: string[]
): "위험" | "경고" | null {
  const cleaned = cleanSentinelString(raw);
  if (!cleaned) return null;

  if (cleaned.includes("위험")) return "위험";
  if (cleaned.includes("경고")) return "경고";

  warnings?.push(`Unrecognized signal word: ${cleaned}`);
  return null;
}

/**
 * NFPA 파싱: health, fire, reactivity
 */
export function parseNfpa(raw: string | undefined | null): { health: number; fire: number; reactivity: number } | null {
  const cleaned = cleanSentinelString(raw);
  if (!cleaned) return null;

  // e.g. "보건=2, 화재=3, 반응성=0" 또는 "2/3/0"
  const healthMatch = cleaned.match(/(?:보건|health)\s*[:=]\s*(\d+)/i);
  const fireMatch = cleaned.match(/(?:화재|fire)\s*[:=]\s*(\d+)/i);
  const reactMatch = cleaned.match(/(?:반응성|reactivity)\s*[:=]\s*(\d+)/i);

  if (healthMatch && fireMatch && reactMatch) {
    return {
      health: Number(healthMatch[1]),
      fire: Number(fireMatch[1]),
      reactivity: Number(reactMatch[1]),
    };
  }

  return null;
}

/**
 * 섹션 02 (유해성·위험성) 정규화
 */
export function normalizeHazardSection(
  items: MsdsSectionItem[],
  options: NormalizeOptions = {}
): HazardSection {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.msdsItemCode) {
      map.set(item.msdsItemCode, item.itemDetail ?? "");
    }
  }

  const classifications = splitPipeValues(map.get(MSDS_ITEM_CODES.HAZARD.CLASSIFICATION));
  const pictograms = parsePictograms(map.get(MSDS_ITEM_CODES.HAZARD.PICTOGRAMS), options.warnings);
  const signalWord = parseSignalWord(map.get(MSDS_ITEM_CODES.HAZARD.SIGNAL_WORD), options.warnings);
  const hCodes = parseCodeTextPairs(map.get(MSDS_ITEM_CODES.HAZARD.H_CODES));

  const pCodes = {
    prevention: parseCodeTextPairs(map.get(MSDS_ITEM_CODES.HAZARD.P_PREVENTION)),
    response: parseCodeTextPairs(map.get(MSDS_ITEM_CODES.HAZARD.P_RESPONSE)),
    storage: parseCodeTextPairs(map.get(MSDS_ITEM_CODES.HAZARD.P_STORAGE)),
    disposal: parseCodeTextPairs(map.get(MSDS_ITEM_CODES.HAZARD.P_DISPOSAL)),
  };

  const nfpa = parseNfpa(map.get(MSDS_ITEM_CODES.HAZARD.NFPA));

  return {
    classifications,
    pictograms,
    signalWord,
    hCodes,
    pCodes,
    nfpa,
  };
}

/**
 * 섹션 04 (응급조치요령) 정규화
 */
export function normalizeFirstAidSection(items: MsdsSectionItem[]): FirstAidSection {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.msdsItemCode) {
      map.set(item.msdsItemCode, item.itemDetail ?? "");
    }
  }

  return {
    eye: splitPipeValues(map.get(MSDS_ITEM_CODES.FIRST_AID.EYE)),
    skin: splitPipeValues(map.get(MSDS_ITEM_CODES.FIRST_AID.SKIN)),
    inhalation: splitPipeValues(map.get(MSDS_ITEM_CODES.FIRST_AID.INHALATION)),
    ingestion: splitPipeValues(map.get(MSDS_ITEM_CODES.FIRST_AID.INGESTION)),
    physicianNote: splitPipeValues(map.get(MSDS_ITEM_CODES.FIRST_AID.PHYSICIAN_NOTE)),
  };
}

/**
 * 섹션 08 (노출방지 및 개인보호구) 정규화
 */
export function normalizePpeSection(items: MsdsSectionItem[]): PpeSection {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.msdsItemCode) {
      map.set(item.msdsItemCode, item.itemDetail ?? "");
    }
  }

  const domesticValues = splitPipeValues(map.get(MSDS_ITEM_CODES.PPE.EXPOSURE_DOMESTIC));
  const acgihValues = splitPipeValues(map.get(MSDS_ITEM_CODES.PPE.EXPOSURE_ACGIH));
  const bioValues = splitPipeValues(map.get(MSDS_ITEM_CODES.PPE.EXPOSURE_BIO));

  return {
    exposureLimits: {
      domestic: domesticValues.length > 0 ? domesticValues.join(" | ") : null,
      acgih: acgihValues.length > 0 ? acgihValues.join(" | ") : null,
      biological: bioValues.length > 0 ? bioValues.join(" | ") : null,
    },
    engineeringControl: splitPipeValues(map.get(MSDS_ITEM_CODES.PPE.ENGINEERING_CONTROL)),
    ppe: {
      respiratory: splitPipeValues(map.get(MSDS_ITEM_CODES.PPE.RESPIRATORY)),
      eye: splitPipeValues(map.get(MSDS_ITEM_CODES.PPE.EYE)),
      hand: splitPipeValues(map.get(MSDS_ITEM_CODES.PPE.HAND)),
      body: splitPipeValues(map.get(MSDS_ITEM_CODES.PPE.BODY)),
    },
  };
}

/**
 * 섹션 15 (법적 규제현황) 정규화
 */
export function normalizeRegulationSection(items: MsdsSectionItem[]): RegulationSection {
  const map = new Map<string, string>();
  const others: Array<{ label: string; value: string }> = [];

  for (const item of items) {
    if (item.msdsItemCode) {
      map.set(item.msdsItemCode, item.itemDetail ?? "");
      // 주요 법령 외의 항목들은 others로 수집 (부모 노드 제외)
      if (
        !([
          MSDS_ITEM_CODES.REGULATION.OSH_ACT,
          MSDS_ITEM_CODES.REGULATION.CHEMICAL_CONTROL_ACT,
          MSDS_ITEM_CODES.REGULATION.HAZMAT_ACT,
          MSDS_ITEM_CODES.REGULATION.WASTE_ACT,
          MSDS_ITEM_CODES.REGULATION.REACH_KOREA,
        ] as readonly string[]).includes(item.msdsItemCode) &&
        item.itemDetail &&
        !SENTINEL_VALUES.has(item.itemDetail.trim())
      ) {
        others.push({
          label: item.msdsItemNameKor || item.msdsItemCode,
          value: item.itemDetail.trim(),
        });
      }
    }
  }

  return {
    oshAct: splitPipeValues(map.get(MSDS_ITEM_CODES.REGULATION.OSH_ACT)),
    chemicalControlAct: splitPipeValues(map.get(MSDS_ITEM_CODES.REGULATION.CHEMICAL_CONTROL_ACT)),
    hazmatAct: splitPipeValues(map.get(MSDS_ITEM_CODES.REGULATION.HAZMAT_ACT)),
    wasteAct: splitPipeValues(map.get(MSDS_ITEM_CODES.REGULATION.WASTE_ACT)),
    reachKorea: splitPipeValues(map.get(MSDS_ITEM_CODES.REGULATION.REACH_KOREA)),
    others,
  };
}

/**
 * 평면 MsdsSectionItem[]을 계층 트리 MsdsSectionTree로 복원
 */
export function buildMsdsSectionTree(sectionNo: number, items: MsdsSectionItem[]): MsdsSectionTree {
  const nodeMap = new Map<string, MsdsTreeNode>();
  const rootNodes: MsdsTreeNode[] = [];

  // 1) 모든 노드 인스턴스 생성
  for (const item of items) {
    if (!item.msdsItemCode) continue;
    const node: MsdsTreeNode = {
      code: item.msdsItemCode,
      parentCode: item.upMsdsItemCode || null,
      name: item.msdsItemNameKor || item.msdsItemCode,
      detail: splitPipeValues(item.itemDetail),
      lev: Number(item.lev || 1),
      children: [],
    };
    nodeMap.set(node.code, node);
  }

  // 2) 부모-자식 연결
  for (const node of nodeMap.values()) {
    if (node.parentCode && nodeMap.has(node.parentCode)) {
      nodeMap.get(node.parentCode)!.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  return {
    sectionNo,
    nodes: rootNodes,
  };
}
