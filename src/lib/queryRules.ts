import type { WorkProfile } from "@/types/assessment";

export interface KoshaQuerySets {
  domesticCase: string[];
  fatalityCase: string[];
  lawGuide: string[];
  materials: {
    industry: string;
    hazardType: string;
    language: "한국어";
  };
}

export interface QueryItemWithKey {
  title: string;
  date?: string;
  url?: string;
}

function compactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function tokenize(value: string) {
  return compactText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function unique(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(item);
  }

  return result;
}

export function buildKoshaQueries(taskName: string, profile: WorkProfile): KoshaQuerySets {
  const primaryHazards = profile.hazards
    .slice()
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 3)
    .map((hazard) => hazard.name);

  const topHazard = primaryHazards[0] ?? "재해";
  const secondHazard = primaryHazards[1] ?? primaryHazards[0] ?? "위험";
  const equipment = profile.equipment[0] ?? "작업장비";
  const locationTokens = tokenize(profile.workLocation);
  const locationToken = locationTokens[0] ?? "작업장";
  const taskToken = tokenize(taskName)[0] ?? "작업";

  const domesticCase = unique([
    `${profile.industry} ${topHazard} ${equipment}`,
    `${profile.industry} ${secondHazard} ${equipment}`,
    `${profile.industry} ${topHazard} ${locationToken}`,
    `${taskToken} ${topHazard} ${equipment}`,
  ]).slice(0, 4);

  const fatalityCase = unique([
    `${topHazard} ${profile.workLocation} ${equipment}`,
    `${profile.industry} ${topHazard} 사망사고`,
  ]).slice(0, 2);

  const lawGuide = unique([
    `${taskName} ${topHazard} 조치`,
    `${profile.industry} ${topHazard} 안전보건`,
    `${taskName} ${equipment} 작업 기준`,
  ]).slice(0, 3);

  return {
    domesticCase,
    fatalityCase,
    lawGuide,
    materials: {
      industry: profile.industry,
      hazardType: topHazard,
      language: "한국어",
    },
  };
}

export function deduplicateByTitleDateOrUrl<T extends QueryItemWithKey>(items: T[]) {
  const seen = new Set<string>();
  const deduplicated: T[] = [];

  for (const item of items) {
    const keyByDate = `${item.title.toLowerCase()}|${item.date ?? ""}`;
    const keyByUrl = `${item.title.toLowerCase()}|${item.url ?? ""}`;
    const key = item.url ? keyByUrl : keyByDate;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(item);
  }

  return deduplicated;
}

export function sortByRelevanceAndLatest<T extends { relevance: number; date?: string }>(items: T[]) {
  return items.slice().sort((left, right) => {
    if (right.relevance !== left.relevance) {
      return right.relevance - left.relevance;
    }

    const leftDate = left.date ? new Date(left.date).getTime() : 0;
    const rightDate = right.date ? new Date(right.date).getTime() : 0;
    return rightDate - leftDate;
  });
}
