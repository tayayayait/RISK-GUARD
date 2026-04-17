import type { EvidenceFetchResult, WorkProfile } from "@/types/assessment";
import { searchLawGuidesByRoute, type LawSearchOptions } from "@/services/koshaService";

const ASSESSMENT_LAW_ROUTE = "/kosha/law-evidence" as const;

export const AssessmentLawService = {
  async searchLaws(
    taskName: string,
    profile: WorkProfile,
    options?: LawSearchOptions,
  ): Promise<EvidenceFetchResult> {
    return searchLawGuidesByRoute(ASSESSMENT_LAW_ROUTE, taskName, profile, options);
  },
};
