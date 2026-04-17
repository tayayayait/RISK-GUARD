import { type LawActionItem } from "./law-actions.ts";
import { buildLawGuidesPayload, type LawGuideRequestBody } from "./law-guides-core.ts";

export interface ActionPlanPayload {
  actionItems: LawActionItem[];
  stageCounts: {
    immediate: number;
    same_day: number;
    pre_resume: number;
    improvement: number;
  };
}

function asActionItems(value: unknown): LawActionItem[] {
  return Array.isArray(value) ? (value as LawActionItem[]) : [];
}

export async function buildActionPlanPayload(body: LawGuideRequestBody): Promise<ActionPlanPayload> {
  const payload = await buildLawGuidesPayload(body);
  const actionItems = asActionItems(payload.actionItems);

  return {
    actionItems,
    stageCounts: {
      immediate: actionItems.filter((item) => item.stage === "immediate").length,
      same_day: actionItems.filter((item) => item.stage === "same_day").length,
      pre_resume: actionItems.filter((item) => item.stage === "pre_resume").length,
      improvement: actionItems.filter((item) => item.stage === "improvement").length,
    },
  };
}
