import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText } from "../_shared/http.ts";
import { rerankMaterialsWithCsvContext, type MaterialRankingItem } from "../_shared/material-ranking.ts";
import {
  applyKeywordPostFilter,
  dedupeMaterialsByUrlTitle,
  hazardLabelFromCode,
  industryLabelFromCode,
  makeMaterialStableId,
  materialTypeLabelFromCode,
  resolveMaterialQueryPlan,
  sortMaterialsByPriority,
  type MaterialSearchFilters,
} from "../_shared/material-search.ts";

interface WorkProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: Array<{ name: string; type: string; weight?: number }>;
}

interface RequestBody {
  taskName: string;
  profile: WorkProfile;
  filters?: MaterialSearchFilters;
}

const ENDPOINT = "http://apis.data.go.kr/B552468/selectMediaList01/getselectMediaList01";

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && value !== null) return [value as T];
  return [];
}

function pickString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseItems(payload: unknown) {
  const root = payload as { body?: { items?: { item?: unknown } } };
  return asArray<Record<string, unknown>>(root?.body?.items?.item);
}

interface MaterialQueryEntry {
  industryCode: string;
  hazardCode: string;
  industryRank: number;
  hazardRank: number;
  queryRank: number;
}

interface MaterialFetchResult extends MaterialQueryEntry {
  rows: Record<string, unknown>[];
}

function buildParams(
  serviceKey: string,
  industryCode: string,
  hazardCode: string,
  materialTypeCode?: string,
) {
  const params = new URLSearchParams({
    ServiceKey: serviceKey,
    callApiId: "1030",
    pageNo: "1",
    numOfRows: "30",
    ctgr02: industryCode,
    ctgr03: hazardCode,
    _type: "json",
  });

  if (materialTypeCode) {
    params.set("ctgr01", materialTypeCode);
  }

  // v1: Korean-only mode.
  params.set("ctgr04_kr", "Y");

  return params;
}

async function fetchRowsByQuery(
  serviceKey: string,
  query: MaterialQueryEntry,
  materialTypeCode?: string,
): Promise<MaterialFetchResult> {
  const params = buildParams(serviceKey, query.industryCode, query.hazardCode, materialTypeCode);
  const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`UPSTREAM_ERROR:${response.status}:${text.slice(0, 300)}`);
  }

  const payload = await response.json();
  return {
    ...query,
    rows: parseItems(payload),
  };
}

const MAX_CONCURRENT_UPSTREAM_REQUESTS = 8;

function buildQueryEntries(industryCodes: string[], hazardCodes: string[]): MaterialQueryEntry[] {
  const entries: MaterialQueryEntry[] = [];
  industryCodes.forEach((industryCode, industryRank) => {
    hazardCodes.forEach((hazardCode, hazardRank) => {
      entries.push({
        industryCode,
        hazardCode,
        industryRank,
        hazardRank,
        queryRank: industryRank * hazardCodes.length + hazardRank,
      });
    });
  });
  return entries;
}

async function allSettledWithConcurrencyLimit<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput) => Promise<TResult>,
) {
  const cappedLimit = Math.max(1, limit);
  const settled: PromiseSettledResult<TResult>[] = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }

      try {
        const value = await worker(items[index]);
        settled[index] = { status: "fulfilled", value };
      } catch (reason) {
        settled[index] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(cappedLimit, items.length) }, () => consume());
  await Promise.all(workers);
  return settled;
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST is supported.");
  }

  const body = await parseJsonBody<RequestBody>(req);
  if (!body) {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const taskName = sanitizeText(body.taskName);
  const profile = body.profile;
  if (!taskName || !profile) {
    return errorResponse(400, "VALIDATION_ERROR", "taskName and profile are required.");
  }

  const serviceKey = Deno.env.get("DATA_GO_KR_API_KEY");
  if (!serviceKey) {
    return errorResponse(503, "MISSING_SECRET", "DATA_GO_KR_API_KEY is not configured.");
  }

  const queryPlan = resolveMaterialQueryPlan(
    {
      industry: profile.industry,
      hazards: profile.hazards ?? [],
    },
    body.filters,
  );

  try {
    const queryEntries = buildQueryEntries(queryPlan.industryCodes, queryPlan.hazardCodes);
    const settled = await allSettledWithConcurrencyLimit(
      queryEntries,
      MAX_CONCURRENT_UPSTREAM_REQUESTS,
      (entry) => fetchRowsByQuery(serviceKey, entry, queryPlan.materialTypeCode),
    );

    const fulfilled = settled
      .filter((entry): entry is PromiseFulfilledResult<MaterialFetchResult> => entry.status === "fulfilled")
      .map((entry) => entry.value);

    if (fulfilled.length === 0) {
      const rejected = settled.find((entry): entry is PromiseRejectedResult => entry.status === "rejected");
      const details = rejected ? String(rejected.reason) : "Unknown upstream error";
      return errorResponse(502, "UPSTREAM_ERROR", "KOSHA materials API failed for every hazard query.", details);
    }

    const mapped = fulfilled.flatMap((entry) =>
      entry.rows
        .map((row, index) => {
          const typeCode = pickString(row, ["ctgr01", "materialTypeCode"]);
          if (queryPlan.materialTypeCode && typeCode !== queryPlan.materialTypeCode) {
            return null;
          }

          const title = pickString(row, ["MED_SJ_NM", "title", "sj"]) || `안전보건자료 ${index + 1}`;
          const url = pickString(row, ["MED_URL", "filepath", "link", "url"]) || "https://www.kosha.or.kr";
          const type = materialTypeLabelFromCode(typeCode);
          const relevance = Math.max(40, 100 - entry.queryRank * 2 - index * 2);
          const recommendReason = `${industryLabelFromCode(entry.industryCode)} 업종 · ${hazardLabelFromCode(entry.hazardCode)} 기준 추천`;

          const item: MaterialRankingItem = {
            id: makeMaterialStableId(title, url),
            type,
            title,
            url,
            language: "한국어",
            relevance,
            recommendReason,
            selected: false,
            excluded: false,
          };

          return item;
        })
        .filter((item): item is MaterialRankingItem => Boolean(item))
    );

    const deduped = dedupeMaterialsByUrlTitle(mapped);

    const reranked = rerankMaterialsWithCsvContext(deduped, {
      taskName,
      profile: {
        industry: profile.industry,
        workLocation: profile.workLocation,
        equipment: profile.equipment,
        hazards: profile.hazards ?? [],
      },
    });

    const keywordFiltered = applyKeywordPostFilter(reranked, queryPlan.keyword);
    const prioritized = sortMaterialsByPriority(keywordFiltered, queryPlan.priorityMode);

    return jsonResponse(prioritized, 200, { "x-risk-guard-source": "kosha-materials" });
  } catch (error) {
    return errorResponse(502, "UPSTREAM_NETWORK_ERROR", "KOSHA materials API request failed.", String(error));
  }
});

