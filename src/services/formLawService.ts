import type { EvidenceFetchResult, WorkProfile } from "@/types/assessment";
import { searchLawGuidesByRoute, type LawGuidesRoute, type LawSearchOptions } from "@/services/koshaService";

const FORM_LAW_BACKEND_FLAG = (import.meta.env.VITE_USE_FORM_LAW_BACKEND ?? "").toString().trim().toLowerCase();

function resolveFormLawRoute(): LawGuidesRoute {
  // strict form backend is default; explicit "false" keeps legacy route for backward compatibility.
  return FORM_LAW_BACKEND_FLAG === "false" ? "/kosha/law-guides" : "/kosha/law-guides-form";
}

export const FormLawService = {
  async searchLaws(
    taskName: string,
    profile: WorkProfile,
    options?: LawSearchOptions,
  ): Promise<EvidenceFetchResult> {
    return searchLawGuidesByRoute(resolveFormLawRoute(), taskName, profile, options);
  },
};
