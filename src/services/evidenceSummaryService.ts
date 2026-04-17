import type { EvidenceItem, WorkProfile } from "@/types/assessment";
import { invokeBackend } from "@/services/edgeFunctionClient";

export interface EvidenceSummaryRequest {
  taskName: string;
  taskDescription: string;
  profile: WorkProfile;
  evidence: {
    title: string;
    sourceBadge: EvidenceItem["sourceBadge"];
    fullContent: string;
    keywords: string[];
    url?: string;
  };
}

export interface EvidenceSummaryResult {
  incidentRelevance: string;
  applicabilityReason: string;
  practicalActions: string[];
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeResponse(payload: unknown): EvidenceSummaryResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const row = payload as {
    incidentRelevance?: unknown;
    applicabilityReason?: unknown;
    practicalActions?: unknown;
    summary?: unknown;
    actions?: { immediate?: unknown; same_day?: unknown; pre_resume?: unknown };
    cautions?: unknown;
  };

  const incidentRelevance = typeof row.incidentRelevance === "string" ? row.incidentRelevance.trim() : "";
  const applicabilityReason = typeof row.applicabilityReason === "string" ? row.applicabilityReason.trim() : "";
  const practicalActions = normalizeList(row.practicalActions);

  if (incidentRelevance && applicabilityReason) {
    return {
      incidentRelevance,
      applicabilityReason,
      practicalActions,
    };
  }

  const summary = typeof row.summary === "string" ? row.summary.trim() : "";
  if (!summary) {
    return null;
  }

  const cautions = normalizeList(row.cautions);
  const practicalActionFallback = [
    ...normalizeList(row.actions?.immediate),
    ...normalizeList(row.actions?.same_day),
    ...normalizeList(row.actions?.pre_resume),
  ].slice(0, 6);

  return {
    incidentRelevance: summary,
    applicabilityReason: cautions[0] ?? "적용 이유 정보 없음",
    practicalActions: practicalActionFallback,
  };
}

export const EvidenceSummaryService = {
  async summarizeEvidence(input: EvidenceSummaryRequest): Promise<EvidenceSummaryResult> {
    const response = await invokeBackend<unknown>({
      supabaseFunction: "gemini-evidence-summary",
      legacyPath: "/gemini/evidence-summary",
      payload: input,
      timeoutMs: 30000,
    });

    const normalized = normalizeResponse(response);
    if (!normalized) {
      throw new Error("EVIDENCE_SUMMARY_INVALID_RESPONSE");
    }

    return normalized;
  },
};
