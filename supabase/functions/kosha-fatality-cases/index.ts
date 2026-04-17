import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody, sanitizeText } from "../_shared/http.ts";
import { rankCandidatesHybrid, type MatchCandidate, type MatchContext, type MatchProfile } from "../_shared/matching.ts";

interface WorkProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: Array<{ name: string; type: string; weight?: number }>;
}

interface RequestBody {
  taskName: string;
  profile: WorkProfile;
}

const ENDPOINT = "https://apis.data.go.kr/B552468/news_api02/getNews_api02";
const CALL_API_ID = "1040";
const MAX_PAGE_NO = 5;
const DATE_KEYS = [
  "date",
  "regDate",
  "regdate",
  "newsDate",
  "newsDt",
  "occurDate",
  "occurDt",
  "eventDate",
  "frstRegistPnttm",
  "createDate",
  "writeDate",
  "pubDate",
];

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") return [value as T];
  return [];
}

function pickString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function stripHtml(text: string) {
  return text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function parseItems(payload: unknown) {
  const root = payload as { body?: { items?: { item?: unknown } } };
  return asArray<Record<string, unknown>>(root?.body?.items?.item);
}

function parseUpstreamHeader(payload: unknown) {
  const root = payload as { header?: { resultCode?: unknown; resultMsg?: unknown } };
  return {
    resultCode: typeof root?.header?.resultCode === "string" ? root.header.resultCode : "",
    resultMsg: typeof root?.header?.resultMsg === "string" ? root.header.resultMsg : "",
  };
}

function toSummaryBullets(content: string) {
  const bullets = content
    .split(/\n|•|·/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (bullets.length > 0) {
    return bullets;
  }

  if (!content.trim()) {
    return ["요약 정보 없음"];
  }

  return [content.slice(0, 180)];
}

function pickBusiness(industry: string) {
  if (industry.includes("건설")) return "건설업";
  if (industry.includes("제조")) return "제조업";
  if (industry.includes("서비스")) return "서비스업";
  return "공통업종";
}

function normalizedKeyword(taskName: string) {
  const cleaned = taskName
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, 80);
}

function toIsoDate(yearRaw: string, monthRaw: string, dayRaw: string) {
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || year < 1900 || year > 2100) return "";
  if (!Number.isInteger(month) || month < 1 || month > 12) return "";
  if (!Number.isInteger(day) || day < 1 || day > 31) return "";

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeDateWithYear(raw: string) {
  const normalized = raw.trim();
  if (!normalized) {
    return "";
  }

  const dashed = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dashed) {
    return toIsoDate(dashed[1], dashed[2], dashed[3]);
  }

  const dotted = normalized.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})$/);
  if (dotted) {
    return toIsoDate(dotted[1], dotted[2], dotted[3]);
  }

  const korean = normalized.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일?$/);
  if (korean) {
    return toIsoDate(korean[1], korean[2], korean[3]);
  }

  const compact = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return toIsoDate(compact[1], compact[2], compact[3]);
  }

  return "";
}

function normalizeIncidentDate(raw: string) {
  const withYear = normalizeDateWithYear(raw);
  if (withYear) {
    return withYear;
  }

  const normalized = raw.trim();
  if (!normalized) {
    return "";
  }

  const mmdd = normalized.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!mmdd) {
    return "";
  }

  const now = new Date();
  const month = mmdd[1].padStart(2, "0");
  const day = mmdd[2].padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function extractDateFromText(text: string) {
  if (!text.trim()) return "";

  const ymd = text.match(/(19\d{2}|20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/);
  if (ymd) {
    return toIsoDate(ymd[1], ymd[2], ymd[3]);
  }

  const compact = text.match(/(19\d{2}|20\d{2})(\d{2})(\d{2})/);
  if (compact) {
    return toIsoDate(compact[1], compact[2], compact[3]);
  }

  return "";
}

function parseDateAndPlace(title: string) {
  const bracket = title.match(/\[(.*?)\]/);
  if (!bracket) {
    return { incidentDate: "", place: "" };
  }

  const [dateRaw = "", ...placeParts] = bracket[1].split(",").map((value) => value.trim());
  return {
    incidentDate: normalizeIncidentDate(dateRaw),
    place: placeParts.join(", "),
  };
}

function parseCasualtyScale(content: string) {
  const death = content.match(/사망\s*(\d+)\s*명/);
  const injury = content.match(/부상\s*(\d+)\s*명/);

  const parts: string[] = [];
  if (death) {
    parts.push(`사망 ${death[1]}명`);
  }
  if (injury) {
    parts.push(`부상 ${injury[1]}명`);
  }

  return parts.join(" / ");
}

function toMatchContext(taskName: string, profile: WorkProfile): MatchContext {
  const normalizedProfile: MatchProfile = {
    industry: sanitizeText(profile.industry),
    workLocation: sanitizeText(profile.workLocation),
    equipment: Array.isArray(profile.equipment) ? profile.equipment.map((item) => sanitizeText(item)).filter(Boolean) : [],
    hazards: Array.isArray(profile.hazards)
      ? profile.hazards
        .map((hazard) => ({
          name: sanitizeText(hazard.name),
          type: sanitizeText(hazard.type),
          weight: hazard.weight ?? 0,
        }))
        .filter((hazard) => hazard.name)
      : [],
  };

  return {
    taskName,
    profile: normalizedProfile,
  };
}

function dedupeCandidates(candidates: MatchCandidate[]) {
  const map = new Map<string, MatchCandidate>();
  for (const candidate of candidates) {
    const hasStableId = Boolean(candidate.id) && !candidate.id.startsWith("fatality-");
    const key = hasStableId
      ? `id:${candidate.id}`
      : `meta:${candidate.title.toLowerCase()}|${candidate.date ?? ""}|${candidate.url ?? ""}`;

    if (!map.has(key)) {
      map.set(key, candidate);
    }
  }
  return Array.from(map.values());
}

function parseCandidateDate(row: Record<string, unknown>, title: string, content: string) {
  for (const key of DATE_KEYS) {
    const raw = pickString(row, [key]);
    if (!raw) continue;
    const normalized = normalizeDateWithYear(raw);
    if (normalized) return normalized;
  }

  return extractDateFromText(`${title} ${content}`);
}

function toCandidate(row: Record<string, unknown>, index: number): MatchCandidate {
  const title = pickString(row, ["keyword", "title", "subject", "sj"]) || `사고사망사례 ${index + 1}`;
  const content = stripHtml(pickString(row, ["contents", "content", "summary"]));
  const id = pickString(row, ["arno", "boardno", "newsno"]) || `fatality-${index + 1}`;
  const date = parseCandidateDate(row, title, content);

  return {
    id,
    title,
    content,
    keywords: [pickString(row, ["keyword"])].filter(Boolean),
    url: pickString(row, ["url", "link", "filepath"]),
    date,
  };
}

function pickAccidentType(content: string, hazards: Array<{ name: string }>) {
  for (const hazard of hazards) {
    const name = sanitizeText(hazard.name);
    if (name && content.includes(name)) {
      return name;
    }
  }

  return sanitizeText(hazards[0]?.name ?? "");
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
  if (!taskName || !body.profile) {
    return errorResponse(400, "VALIDATION_ERROR", "taskName and profile are required.");
  }

  const serviceKey = Deno.env.get("DATA_GO_KR_API_KEY");
  if (!serviceKey) {
    return errorResponse(503, "MISSING_SECRET", "DATA_GO_KR_API_KEY is not configured.");
  }

  const context = toMatchContext(taskName, body.profile);
  const business = pickBusiness(context.profile.industry);
  const keyword = normalizedKeyword(taskName);
  const variantParams: Array<Record<string, string>> = [
    keyword ? { business, keyword } : { business },
    keyword ? { keyword } : {},
    {},
  ];

  const rows: Record<string, unknown>[] = [];
  let lastFailure = "UNKNOWN_ERROR";
  let hasSuccessfulResponse = false;

  for (const variant of variantParams) {
    for (let pageNo = 1; pageNo <= MAX_PAGE_NO; pageNo += 1) {
      const params = new URLSearchParams({
        ServiceKey: serviceKey,
        callApiId: CALL_API_ID,
        numOfRows: "50",
        pageNo: String(pageNo),
        _type: "json",
        ...variant,
      });

      try {
        const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          const text = await response.text();
          lastFailure = `HTTP_${response.status}:${text}`;
          continue;
        }

        const data = await response.json();
        const { resultCode, resultMsg } = parseUpstreamHeader(data);
        if (resultCode && resultCode !== "00") {
          lastFailure = `${resultCode}:${resultMsg || "UNKNOWN_RESULT_MSG"}`;
          continue;
        }

        hasSuccessfulResponse = true;
        const pageItems = parseItems(data);
        if (pageItems.length === 0) {
          break;
        }
        rows.push(...pageItems);
      } catch (error) {
        lastFailure = String(error);
      }
    }
  }

  if (!hasSuccessfulResponse && lastFailure !== "UNKNOWN_ERROR") {
    return errorResponse(502, "UPSTREAM_ERROR", "KOSHA fatality API failed for all pages.", lastFailure);
  }

  if (rows.length === 0) {
    return jsonResponse([], 200, { "x-risk-guard-source": "kosha-fatality-cases" });
  }

  const candidates = dedupeCandidates(rows.map((row, index) => toCandidate(row, index)));

  const ranked = await rankCandidatesHybrid(context, candidates, {
    threshold: 70,
    maxResults: 5,
    semanticTopK: 15,
    semanticEnabled: (Deno.env.get("ENABLE_GEMINI_RERANK") ?? "true").toLowerCase() !== "false",
    semanticTimeoutMs: 1500,
    geminiApiKey: Deno.env.get("GEMINI_API_KEY") ?? undefined,
    geminiModel: Deno.env.get("GEMINI_RERANK_MODEL") ?? "gemini-3-flash-preview",
  });

  const mapped = ranked.map((item, index) => {
    const { incidentDate, place } = parseDateAndPlace(item.title);
    const casualtyScale = parseCasualtyScale(item.content);

    return {
      id: `fatality-${index + 1}`,
      type: "fatality",
      sourceBadge: "사고사망",
      title: item.title,
      relevanceScore: Math.round(item.finalScore),
      summaryBullets: toSummaryBullets(item.content),
      keywords: (item.keywords ?? []).slice(0, 8),
      matchedKeywords: item.matchedKeywords,
      ruleScore: item.ruleScore,
      semanticScore: item.semanticScore,
      matchReason: item.matchReason,
      incidentDate,
      place,
      casualtyScale,
      standardAccidentType: pickAccidentType(item.content, body.profile.hazards),
      similarity: Math.round((item.finalScore / 100) * 100) / 100,
      url: item.url,
      excluded: false,
    };
  });

  return jsonResponse(mapped, 200, { "x-risk-guard-source": "kosha-fatality-cases" });
});
