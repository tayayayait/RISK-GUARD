import type {
  EvidenceFetchResult,
  EvidenceItem,
  LawGuideMeta,
  LawActionItem,
  MaterialFetchResult,
  MaterialItem,
  MaterialSearchFilters,
  WorkProfile,
} from "@/types/assessment";
import { invokeBackend } from "@/services/edgeFunctionClient";

interface KoshaProxyPayload {
  taskName: string;
  profile: WorkProfile;
  filters?: MaterialSearchFilters;
  taskDescription?: string;
  analysisScenario?: string;
}

export interface LawSearchOptions {
  taskDescription?: string;
  analysisScenario?: string;
}

export type LawGuidesRoute =
  | "/kosha/law-evidence"
  | "/kosha/law-guides"
  | "/kosha/law-guides-form"
  | "/kosha/law-guides-assessment";

interface ErrorShape {
  error?: {
    code?: string;
  };
}

interface LawGuideResponse {
  items?: EvidenceItem[];
  lawItems?: EvidenceItem[];
  guideItems?: EvidenceItem[];
  mediaItems?: EvidenceItem[];
  actionItems?: LawActionItem[];
  meta?: LawGuideMeta;
}

const LAW_GUIDE_TIMEOUT_MS = 120000;

function parseErrorCode(error: unknown, fallback = "UNKNOWN_ERROR") {
  if (error && typeof error === "object") {
    const maybe = error as ErrorShape;
    if (typeof maybe.error?.code === "string" && maybe.error.code.trim()) {
      return maybe.error.code.trim();
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallback;
}

async function fetchProxy<T>(path: string, payload: KoshaProxyPayload): Promise<T | null> {
  const functionMap: Record<string, { name: string; timeoutMs?: number }> = {
    "/kosha/disaster-cases": { name: "kosha-disaster-cases" },
    "/kosha/fatality-cases": { name: "kosha-fatality-cases" },
    "/kosha/law-evidence": { name: "kosha-law-evidence", timeoutMs: LAW_GUIDE_TIMEOUT_MS },
    "/kosha/law-guides": { name: "kosha-law-guides", timeoutMs: LAW_GUIDE_TIMEOUT_MS },
    "/kosha/law-guides-form": { name: "kosha-law-guides-form", timeoutMs: LAW_GUIDE_TIMEOUT_MS },
    "/kosha/law-guides-assessment": { name: "kosha-law-guides-assessment", timeoutMs: LAW_GUIDE_TIMEOUT_MS },
    "/kosha/materials": { name: "kosha-materials" },
  };

  const functionConfig = functionMap[path];
  if (!functionConfig) {
    return null;
  }

  const primaryResult = await invokeBackend<T>({
    supabaseFunction: functionConfig.name,
    legacyPath: path,
    payload,
    timeoutMs: functionConfig.timeoutMs,
  });

  const shouldFallbackToLegacy = path === "/kosha/law-guides-assessment";

  if (shouldFallbackToLegacy && !primaryResult) {
    console.warn(
      "[KoshaService] assessment endpoint unavailable. Falling back to legacy kosha-law-guides.",
    );
    return invokeBackend<T>({
      supabaseFunction: "kosha-law-guides",
      legacyPath: "/kosha/law-guides",
      payload,
      timeoutMs: LAW_GUIDE_TIMEOUT_MS,
    });
  }

  return primaryResult;
}

function toEvidenceResult(items: EvidenceItem[] | null, errorCode?: string): EvidenceFetchResult {
  if (errorCode) {
    return { items: [], status: "error", errorCode };
  }

  if (!items) {
    return { items: [], status: "error", errorCode: "BACKEND_UNAVAILABLE" };
  }

  if (items.length === 0) {
    return { items, status: "empty" };
  }

  return { items, status: "success" };
}

function toLawEvidenceResult(payload: EvidenceItem[] | LawGuideResponse | null, errorCode?: string): EvidenceFetchResult {
  if (errorCode) {
    return { items: [], lawItems: [], guideItems: [], mediaItems: [], lawActionItems: [], status: "error", errorCode };
  }

  if (!payload) {
    return { items: [], lawItems: [], guideItems: [], mediaItems: [], lawActionItems: [], status: "error", errorCode: "BACKEND_UNAVAILABLE" };
  }

  const lawItems = Array.isArray(payload)
    ? payload.filter((item) => item.type === "law" && item.sourceBadge !== "Guide" && item.sourceBadge !== "미디어")
    : payload.lawItems ?? [];
  const guideItems = Array.isArray(payload) ? [] : payload.guideItems ?? [];
  const mediaItems = Array.isArray(payload) ? [] : payload.mediaItems ?? [];
  const items = Array.isArray(payload) ? payload : payload.items ?? [...lawItems, ...guideItems, ...mediaItems];
  const lawActionItems = Array.isArray(payload) ? [] : payload.actionItems ?? [];
  const rawMeta = Array.isArray(payload) ? undefined : payload.meta;
  const trackStatus = rawMeta?.trackStatus ?? {
    law: lawItems.length > 0 ? "success" as const : "empty" as const,
    guide: guideItems.length > 0 ? "success" as const : "empty" as const,
    media: mediaItems.length > 0 ? "success" as const : "empty" as const,
  };
  const lawGuideMeta = rawMeta ? { ...rawMeta, trackStatus } : undefined;

  const hasTrackError = Object.values(trackStatus).some((status) => status === "error");
  const hasData = items.length > 0 || lawActionItems.length > 0;

  if (hasTrackError && hasData) {
    return { items, lawItems, guideItems, mediaItems, lawActionItems, lawGuideMeta, status: "partial" };
  }

  if (hasTrackError) {
    return { items, lawItems, guideItems, mediaItems, lawActionItems, lawGuideMeta, status: "error" };
  }

  if (!hasData) {
    return { items, lawItems, guideItems, mediaItems, lawActionItems, lawGuideMeta, status: "empty" };
  }

  return { items, lawItems, guideItems, mediaItems, lawActionItems, lawGuideMeta, status: "success" };
}

function toMaterialResult(items: MaterialItem[] | null, errorCode?: string): MaterialFetchResult {
  if (errorCode) {
    return { items: [], status: "error", errorCode };
  }

  if (!items) {
    return { items: [], status: "error", errorCode: "BACKEND_UNAVAILABLE" };
  }

  if (items.length === 0) {
    return { items, status: "empty" };
  }

  return { items, status: "success" };
}

function createLawSearchPayload(taskName: string, profile: WorkProfile, options?: LawSearchOptions): KoshaProxyPayload {
  return {
    taskName,
    profile,
    ...(options?.taskDescription?.trim() ? { taskDescription: options.taskDescription.trim() } : {}),
    ...(options?.analysisScenario?.trim() ? { analysisScenario: options.analysisScenario.trim() } : {}),
  };
}

export async function searchLawGuidesByRoute(
  route: LawGuidesRoute,
  taskName: string,
  profile: WorkProfile,
  options?: LawSearchOptions,
): Promise<EvidenceFetchResult> {
  const payload = createLawSearchPayload(taskName, profile, options);

  try {
    const response = await fetchProxy<EvidenceItem[] | LawGuideResponse>(route, payload);
    return toLawEvidenceResult(response);
  } catch (error) {
    return toLawEvidenceResult(null, parseErrorCode(error, "LAW_GUIDE_FETCH_FAILED"));
  }
}

export const KoshaService = {
  async searchDisasterCases(taskName: string, profile: WorkProfile): Promise<EvidenceFetchResult> {
    try {
      const response = await fetchProxy<EvidenceItem[]>("/kosha/disaster-cases", { taskName, profile });
      return toEvidenceResult(response);
    } catch (error) {
      return toEvidenceResult(null, parseErrorCode(error, "DISASTER_FETCH_FAILED"));
    }
  },

  async queryFatalities(taskName: string, profile: WorkProfile): Promise<EvidenceFetchResult> {
    try {
      const response = await fetchProxy<EvidenceItem[]>("/kosha/fatality-cases", { taskName, profile });
      return toEvidenceResult(response);
    } catch (error) {
      return toEvidenceResult(null, parseErrorCode(error, "FATALITY_FETCH_FAILED"));
    }
  },

  async searchLaws(
    taskName: string,
    profile: WorkProfile,
    options?: LawSearchOptions,
  ): Promise<EvidenceFetchResult> {
    return searchLawGuidesByRoute("/kosha/law-guides", taskName, profile, options);
  },

  async recommendMaterials(
    taskName: string,
    profile: WorkProfile,
    filters?: MaterialSearchFilters,
  ): Promise<MaterialFetchResult> {
    try {
      const response = await fetchProxy<MaterialItem[]>("/kosha/materials", { taskName, profile, filters });
      return toMaterialResult(response);
    } catch (error) {
      return toMaterialResult(null, parseErrorCode(error, "MATERIAL_FETCH_FAILED"));
    }
  },
};


