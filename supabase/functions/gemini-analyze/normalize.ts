import { normalizeHazardType, STANDARD_HAZARD_TYPES } from "../_shared/hazard-taxonomy.ts";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface GeminiHazard {
  id: string;
  name: string;
  type: string;
  weight: number;
  confidence: ConfidenceLevel;
  reason: string;
}

export interface GeminiProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: GeminiHazard[];
}

export interface GeminiProfileConfidence {
  industry: ConfidenceLevel;
  workLocation: ConfidenceLevel;
  equipment: ConfidenceLevel;
  hazards: ConfidenceLevel;
}

export interface GeminiImmediateAction {
  id: string;
  action: string;
  priority: number;
}

export interface GeminiImprovement {
  id: string;
  action: string;
  category: string;
}

export interface GeminiAnalyzeResultPayload {
  profile: GeminiProfile;
  profileConfidence: GeminiProfileConfidence;
  scenario: string;
  immediateActions: GeminiImmediateAction[];
  improvements: GeminiImprovement[];
  briefingDraft: string;
}

export const HAZARD_REASON_FALLBACK = "입력 정보만으로 위험요인 발생 근거를 충분히 특정하지 못했습니다.";

const HANGUL_PATTERN = /[가-힣]/;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function hasHangul(value: string): boolean {
  return HANGUL_PATTERN.test(value);
}

function normalizeConfidence(raw: string, fallback: ConfidenceLevel = "low"): ConfidenceLevel {
  if (raw === "high" || raw === "medium" || raw === "low") {
    return raw;
  }
  return fallback;
}

function normalizeWeight(value: unknown): number | null {
  let numeric = Number.NaN;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string" && value.trim()) {
    numeric = Number(value);
  }

  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(1, Math.min(40, Math.round(numeric)));
}

function normalizeHazardName(rawName: string, resolvedType: string): string {
  if (rawName && hasHangul(rawName)) {
    return rawName;
  }

  if (resolvedType.endsWith("위험")) {
    return resolvedType;
  }

  return `${resolvedType} 위험`;
}

function normalizeHazardReason(rawReason: string): string {
  if (rawReason && hasHangul(rawReason)) {
    return rawReason;
  }
  return HAZARD_REASON_FALLBACK;
}

function buildScenarioFallback(profile: GeminiProfile): string {
  const workLocation = profile.workLocation || "작업현장";
  const equipmentSummary = profile.equipment
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 2)
    .join("·");
  const hazardSummary = profile.hazards
    .map((hazard) => normalizeText(hazard.type) || normalizeText(hazard.name))
    .filter(Boolean)
    .slice(0, 2)
    .join(" 및 ");

  const hazardPhrase = hazardSummary ? `${hazardSummary} 위험` : "잠재 위험";
  const equipmentPhrase = equipmentSummary ? `${equipmentSummary} 사용 과정에서 ` : "";
  return `${workLocation}에서 ${equipmentPhrase}${hazardPhrase}이 확인되어 즉시 안전조치가 필요합니다.`;
}

function normalizeScenario(rawScenario: unknown, profile: GeminiProfile): string {
  const scenario = normalizeText(rawScenario);
  if (scenario && hasHangul(scenario)) {
    return scenario;
  }

  return buildScenarioFallback(profile);
}

function normalizeHazardFromText(rawText: string, index: number): GeminiHazard | null {
  const text = normalizeText(rawText);
  if (!text) {
    return null;
  }

  const resolvedType = normalizeHazardType("", text) || STANDARD_HAZARD_TYPES[0];
  return {
    id: `hazard-${index + 1}`,
    name: normalizeHazardName(text, resolvedType),
    type: resolvedType,
    weight: 20,
    confidence: "low",
    reason: normalizeHazardReason(text),
  };
}

function normalizeHazard(value: unknown, index: number): GeminiHazard | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return normalizeHazardFromText(String(value), index);
  }

  const row = asRecord(value);
  if (!row) {
    return null;
  }

  const rawName = normalizeText(row.name);
  const rawReason = normalizeText(row.reason);
  const resolvedType = normalizeHazardType(normalizeText(row.type), rawName || rawReason) || STANDARD_HAZARD_TYPES[0];
  const id = normalizeText(row.id) || `hazard-${index + 1}`;
  const name = normalizeHazardName(rawName, resolvedType);
  const weight = normalizeWeight(row.weight) ?? 20;
  const confidence = normalizeConfidence(normalizeText(row.confidence).toLowerCase(), "low");
  const reason = normalizeHazardReason(rawReason || rawName);

  if (!id || !name || !resolvedType) {
    return null;
  }

  return {
    id,
    name,
    type: resolvedType,
    weight,
    confidence,
    reason,
  };
}

function normalizeProfile(value: unknown): GeminiProfile | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }

  const industry = normalizeText(row.industry) || "기타";
  const workLocation = normalizeText(row.workLocation) || "작업현장";

  const equipment = Array.isArray(row.equipment)
    ? row.equipment.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  const rawHazards = Array.isArray(row.hazards) ? row.hazards : [];
  const hazards = rawHazards
    .map((entry, index) => normalizeHazard(entry, index))
    .filter((item): item is GeminiHazard => Boolean(item));

  if (hazards.length === 0) {
    return null;
  }

  return {
    industry,
    workLocation,
    equipment,
    hazards,
  };
}

function normalizeProfileConfidence(value: unknown): GeminiProfileConfidence {
  const row = asRecord(value);
  const industry = normalizeConfidence(normalizeText(row?.industry).toLowerCase(), "low");
  const workLocation = normalizeConfidence(normalizeText(row?.workLocation).toLowerCase(), "low");
  const equipment = normalizeConfidence(normalizeText(row?.equipment).toLowerCase(), "low");
  const hazards = normalizeConfidence(normalizeText(row?.hazards).toLowerCase(), "low");

  return {
    industry,
    workLocation,
    equipment,
    hazards,
  };
}

function normalizeImmediateActions(value: unknown): GeminiImmediateAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      const row = asRecord(entry);
      if (!row) {
        return null;
      }

      const action = normalizeText(row.action);
      if (!action) {
        return null;
      }

      const priority = Number.isFinite(Number(row.priority))
        ? Math.max(1, Math.min(3, Math.round(Number(row.priority))))
        : 3;

      return {
        id: normalizeText(row.id) || `action-${index + 1}`,
        action,
        priority,
      };
    })
    .filter((item): item is GeminiImmediateAction => Boolean(item));
}

function normalizeImprovements(value: unknown): GeminiImprovement[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      const row = asRecord(entry);
      if (!row) {
        return null;
      }

      const action = normalizeText(row.action);
      if (!action) {
        return null;
      }

      return {
        id: normalizeText(row.id) || `improvement-${index + 1}`,
        action,
        category: normalizeText(row.category) || "관리",
      };
    })
    .filter((item): item is GeminiImprovement => Boolean(item));
}

export function normalizeGeminiAnalyzeResponse(value: unknown): GeminiAnalyzeResultPayload | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }

  const profile = normalizeProfile(row.profile);
  if (!profile) {
    return null;
  }

  return {
    profile,
    profileConfidence: normalizeProfileConfidence(row.profileConfidence),
    scenario: normalizeScenario(row.scenario, profile),
    immediateActions: normalizeImmediateActions(row.immediateActions),
    improvements: normalizeImprovements(row.improvements),
    briefingDraft: normalizeText(row.briefingDraft),
  };
}
