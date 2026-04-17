import { invokeBackend } from "@/services/edgeFunctionClient";
import type { EvidenceFetchStatus, LawActionItem, WorkProfile } from "@/types/assessment";

interface ActionPlanRequestPayload {
  taskName: string;
  profile: WorkProfile;
  taskDescription?: string;
  analysisScenario?: string;
}

interface ErrorShape {
  error?: {
    code?: string;
  };
}

interface ActionPlanResponse {
  actionItems?: LawActionItem[];
  stageCounts?: {
    immediate?: number;
    same_day?: number;
    pre_resume?: number;
    improvement?: number;
  };
}

const ACTION_PLAN_TIMEOUT_MS = 120000;

export interface ActionPlanFetchResult {
  items: LawActionItem[];
  status: EvidenceFetchStatus;
  errorCode?: string;
  stageCounts?: {
    immediate: number;
    same_day: number;
    pre_resume: number;
    improvement: number;
  };
}

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

function toStageCounts(items: LawActionItem[], upstream?: ActionPlanResponse["stageCounts"]) {
  if (upstream) {
    return {
      immediate: Number.isFinite(upstream.immediate) ? Number(upstream.immediate) : items.filter((item) => item.stage === "immediate").length,
      same_day: Number.isFinite(upstream.same_day) ? Number(upstream.same_day) : items.filter((item) => item.stage === "same_day").length,
      pre_resume: Number.isFinite(upstream.pre_resume) ? Number(upstream.pre_resume) : items.filter((item) => item.stage === "pre_resume").length,
      improvement: Number.isFinite(upstream.improvement) ? Number(upstream.improvement) : items.filter((item) => item.stage === "improvement").length,
    };
  }

  return {
    immediate: items.filter((item) => item.stage === "immediate").length,
    same_day: items.filter((item) => item.stage === "same_day").length,
    pre_resume: items.filter((item) => item.stage === "pre_resume").length,
    improvement: items.filter((item) => item.stage === "improvement").length,
  };
}

function toActionPlanResult(payload: ActionPlanResponse | null, errorCode?: string): ActionPlanFetchResult {
  if (errorCode) {
    return { items: [], status: "error", errorCode };
  }

  if (!payload) {
    return { items: [], status: "error", errorCode: "BACKEND_UNAVAILABLE" };
  }

  const items = Array.isArray(payload.actionItems) ? payload.actionItems : [];
  const stageCounts = toStageCounts(items, payload.stageCounts);

  if (items.length === 0) {
    return { items, stageCounts, status: "empty" };
  }

  return { items, stageCounts, status: "success" };
}

export const ActionPlanService = {
  async generateLawActions(
    taskName: string,
    profile: WorkProfile,
    options?: {
      taskDescription?: string;
      analysisScenario?: string;
    },
  ): Promise<ActionPlanFetchResult> {
    const payload: ActionPlanRequestPayload = {
      taskName,
      profile,
      ...(options?.taskDescription?.trim() ? { taskDescription: options.taskDescription.trim() } : {}),
      ...(options?.analysisScenario?.trim() ? { analysisScenario: options.analysisScenario.trim() } : {}),
    };

    try {
      const response = await invokeBackend<ActionPlanResponse>({
        supabaseFunction: "analysis-action-plan",
        legacyPath: "/analysis/action-plan",
        payload,
        timeoutMs: ACTION_PLAN_TIMEOUT_MS,
      });
      return toActionPlanResult(response);
    } catch (error) {
      return toActionPlanResult(null, parseErrorCode(error, "ACTION_PLAN_FETCH_FAILED"));
    }
  },
};
