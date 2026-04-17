import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { buildLawGuidesPayload, type LawGuideRequestBody } from "../_shared/law-guides-core.ts";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody } from "../_shared/http.ts";

type LawActionStage = "immediate" | "same_day" | "pre_resume" | "improvement";

interface LawActionItem {
  id: string;
  stage: LawActionStage;
  actionText: string;
  articleNumbers: string[];
  articleTitle?: string;
  legalBasis?: string;
  lawName?: string;
  lawCategory?: "1" | "2" | "3" | "4";
  clausePreview?: string;
  legalRequirement?: string;
  relevanceReason?: string;
  actionNeedReason?: string;
  applicabilityReason?: string;
  keyExcerpt?: string;
  summaryArticle?: string;
  generationType?: "direct" | "derived";
  lawFitStatus?: "verified" | "review_required" | "unknown";
  lawFitReason?: string;
  lawFitScore?: number;
  lawFitGateFailureCode?: "INCIDENT_ANCHOR_MISMATCH";
}

const ARTICLE_PATTERN = /제?\s*\d+\s*조(?:의?\s*\d+)?/;

function normalizeSpace(text?: string) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function extractArticleNumber(text?: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }
  const match = normalized.match(ARTICLE_PATTERN);
  return match?.[0] ?? "";
}

function normalizeArticleNumbers(item: LawActionItem) {
  const deduped = Array.from(
    new Set(
      (item.articleNumbers ?? [])
        .map((value) => normalizeSpace(value))
        .filter(Boolean),
    ),
  ).slice(0, 1);

  if (deduped.length > 0) {
    return deduped;
  }

  const inferred = extractArticleNumber(`${item.legalBasis ?? ""} ${item.lawName ?? ""}`);
  return inferred ? [inferred] : [];
}

function normalizeActionItem(item: LawActionItem): LawActionItem {
  return {
    ...item,
    articleNumbers: normalizeArticleNumbers(item),
  };
}

function hasArticleNumbers(item: LawActionItem) {
  return Array.isArray(item.articleNumbers)
    && item.articleNumbers.some((articleNumber) => typeof articleNumber === "string" && articleNumber.trim().length > 0);
}

function buildStageCounts(actionItems: LawActionItem[]) {
  return {
    immediate: actionItems.filter((item) => item.stage === "immediate").length,
    same_day: actionItems.filter((item) => item.stage === "same_day").length,
    pre_resume: actionItems.filter((item) => item.stage === "pre_resume").length,
    improvement: actionItems.filter((item) => item.stage === "improvement").length,
  };
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST is supported.");
    }

    const body = await parseJsonBody<LawGuideRequestBody>(req);
    if (!body) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const payload = await buildLawGuidesPayload(body);
    const actionItems = (payload.actionItems ?? []).map(normalizeActionItem).filter(hasArticleNumbers);

    return jsonResponse(
      {
        actionItems,
        stageCounts: buildStageCounts(actionItems),
      },
      200,
      {
        "x-risk-guard-source": "analysis-action-plan",
        "x-risk-guard-upstream": "law-guides-core",
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("VALIDATION_ERROR:")) {
      return errorResponse(400, "VALIDATION_ERROR", error.message.replace("VALIDATION_ERROR:", ""));
    }

    console.error("[analysis-action-plan] Unhandled error", error);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to build action plan.");
  }
});
